// SPDX-License-Identifier: MIT
package com.anf.mkr

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.call.replaceResponse
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpResponseValidator
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.HttpSendPipeline
import io.ktor.client.statement.HttpReceivePipeline
import io.ktor.http.URLBuilder
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import io.ktor.utils.io.*
import kotlinx.io.readByteArray

enum class ProviderStopReason { ENDPOINT, CREDENTIAL, AUTHENTICATION, DENIED, RATE_LIMIT, REDIRECT, REQUEST_BUDGET, PLAYER_RETRY, PLAYABILITY, PLAYER_BODY }

// Cancellation is intentionally propagated by upstream extraction instead of
// being treated as a reason to rotate identities/clients and keep requesting.
class ProviderRequestStopped(val reason: ProviderStopReason, val diagnostic: PrimaryDiagnostic) : CancellationException("MKR provider request stopped ($reason, $diagnostic).")

class PrimaryRequestPolicy(private val maxRequests: Int = 8) {
    private var requests = 0
    private var playerRequested = false
    private var stopped: ProviderStopReason? = null
    private var firstPlayer: PlayerDiagnostic? = null

    @Synchronized internal fun reset() { requests = 0; playerRequested = false; stopped = null; firstPlayer=null }
    @Synchronized internal fun diagnostic() = PrimaryDiagnostic(requests,playerRequested,firstPlayer)
    @Synchronized private fun stop(reason: ProviderStopReason): Nothing {
        stopped = reason
        throw ProviderRequestStopped(reason,diagnostic())
    }
    @Synchronized internal fun before(url: URLBuilder, headers: io.ktor.http.HeadersBuilder) {
        stopped?.let { throw ProviderRequestStopped(it,diagnostic()) }
        val uri = url.build()
        val host = uri.host.lowercase()
        val firstParty = host == "youtubei.googleapis.com" || listOf("youtube.com", "googlevideo.com", "ytimg.com").any { host == it || host.endsWith(".$it") }
        if (uri.protocol.name != "https" || uri.port != 443 || !firstParty || !uri.user.isNullOrEmpty() || !uri.password.isNullOrEmpty() || uri.fragment.isNotEmpty()) stop(ProviderStopReason.ENDPOINT)
        if (headers["Authorization"] != null || headers["Proxy-Authorization"] != null) stop(ProviderStopReason.CREDENTIAL)
        headers["Cookie"]?.let { if (!Regex("PREF=[A-Za-z0-9%&=._-]+").matches(it)) stop(ProviderStopReason.CREDENTIAL) }
        if (requests >= maxRequests) stop(ProviderStopReason.REQUEST_BUDGET)
        if (uri.encodedPath.endsWith("/player")) {
            if (playerRequested) stop(ProviderStopReason.PLAYER_RETRY)
            playerRequested = true
        }
        requests++
    }
    @Synchronized internal fun after(status: Int) {
        when (status) {
            401 -> stop(ProviderStopReason.AUTHENTICATION)
            403 -> stop(ProviderStopReason.DENIED)
            429 -> stop(ProviderStopReason.RATE_LIMIT)
            in 300..399 -> stop(ProviderStopReason.REDIRECT)
        }
    }
    @Synchronized internal fun playerBody(body: ByteArray) {
        val value=playerDiagnostic(body) ?: stop(ProviderStopReason.PLAYER_BODY)
        if(firstPlayer==null)firstPlayer=value
        when(value.disposition) {
            PlayerDisposition.OK -> Unit
            PlayerDisposition.LOGIN_REQUIRED -> stop(ProviderStopReason.AUTHENTICATION)
            PlayerDisposition.AGE_RESTRICTED,PlayerDisposition.UNAVAILABLE -> stop(ProviderStopReason.PLAYABILITY)
            PlayerDisposition.UNKNOWN -> stop(ProviderStopReason.PLAYER_BODY)
        }
    }
    @Synchronized internal fun oversizedPlayerBody(): Nothing = stop(ProviderStopReason.PLAYER_BODY)
}

@OptIn(InternalAPI::class)
internal fun primaryHttpClient(policy: PrimaryRequestPolicy, engine: HttpClientEngine? = null): HttpClient {
    fun HttpClientConfig<*>.configurePrimary() {
        followRedirects = false
        expectSuccess = false
        install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true }) }
        install(HttpTimeout) { requestTimeoutMillis = 20_000; connectTimeoutMillis = 10_000; socketTimeoutMillis = 10_000 }
        HttpResponseValidator { validateResponse { response -> policy.after(response.status.value) } }
    }
    val configured = if (engine == null) HttpClient(OkHttp) { configurePrimary() } else HttpClient(engine) { configurePrimary() }
    // Applies at physical sending, including requests made by library internals.
    configured.sendPipeline.intercept(HttpSendPipeline.Before) {
        policy.before(context.url, context.headers)
        proceed()
    }
    configured.receivePipeline.intercept(HttpReceivePipeline.After) {
        val response=subject
        if(response.call.request.url.encodedPath.endsWith("/player") && response.status.value==200) {
            if((response.headers["Content-Length"]?.toLongOrNull() ?: 0)>MAX_PLAYER_BODY)policy.oversizedPlayerBody()
            val channel=response.rawContent
            val bytes=channel.readRemaining(MAX_PLAYER_BODY.toLong()+1).readByteArray()
            if(bytes.size>MAX_PLAYER_BODY) {channel.cancel();policy.oversizedPlayerBody()}
            policy.playerBody(bytes)
            // Replay the same bounded bytes to the real upstream deserializer.
            // Do not save/log a response body merely to collect diagnostics.
            proceedWith(response.call.replaceResponse { ByteReadChannel(bytes) }.response)
        } else proceed()
    }
    return configured
}
