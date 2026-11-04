// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import okhttp3.Authenticator
import okhttp3.CookieJar
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Call
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/** No process-global CookieHandler, browser cookies, auth callbacks or disk cache. */
internal class NativeHttpConnection(url: URL) : HttpURLConnection(url) {
    override fun toString() = "NativeHttpConnection(private source)"
    @Volatile private var call: Call? = null
    @Volatile private var response: Response? = null
    @Volatile private var cancelled = false
    private fun response(): Response {
        response?.let { return it }
        if (cancelled) throw NativeInputFailure("CLOSED")
        val request = Request.Builder().url(url).get().apply {
            requestProperties.forEach { (name, values) -> values.forEach { addHeader(name,it) } }
        }.build()
        val pending = client.newCall(request)
        call = pending
        if (cancelled) { pending.cancel(); throw NativeInputFailure("CLOSED") }
        val result = pending.execute()
        if (cancelled) { result.close(); throw NativeInputFailure("CLOSED") }
        response = result
        return result
    }
    override fun connect() { response() }
    override fun getResponseCode() = response().code
    override fun getHeaderField(name: String?): String? {
        if (name == null) return null
        val values = response().headers.values(name)
        return if(values.size<=1) values.firstOrNull() else ""
    }
    override fun getInputStream() = response().body.byteStream()
    override fun usingProxy() = false
    override fun disconnect() { cancelled = true; call?.cancel(); response?.close() }
    companion object {
        internal val client: OkHttpClient = OkHttpClient.Builder()
            .cookieJar(CookieJar.NO_COOKIES)
            .authenticator(Authenticator.NONE).proxyAuthenticator(Authenticator.NONE)
            .cache(null).followRedirects(false).followSslRedirects(false)
            .retryOnConnectionFailure(false)
            .connectTimeout(10,TimeUnit.SECONDS).readTimeout(10,TimeUnit.SECONDS)
            .callTimeout(15,TimeUnit.SECONDS).build()
    }
}
