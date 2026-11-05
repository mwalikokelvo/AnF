// SPDX-License-Identifier: MIT
package com.anf.mkr

import io.ktor.client.engine.HttpClientEngine
import com.metrolist.innertubex.InnerTube
import com.metrolist.innertubex.cipher.PlayerConfigRepository
import com.metrolist.innertubex.cipher.RemotePlayerConfigStore
import com.metrolist.innertubex.cipher.YouTubeCipherService
import com.metrolist.innertubex.extraction.*
import com.metrolist.innertubex.extraction.strategy.*
import com.metrolist.innertubex.models.YouTubeClient
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Sticky, conservative selection: a failure cannot pick another client identity. */
internal class SinglePlaybackClient(private val delegate: ClientFallbackStrategy = ContentAwareFallbackStrategy()) : ClientFallbackStrategy {
    private var chosen: YouTubeClient? = null
    internal fun reset() { chosen = null }
    override fun resolveClients(hints: ContentHints): List<YouTubeClient> {
        val choices = delegate.resolveClients(hints)
        val candidate = chosen ?: choices.firstOrNull()?.also { chosen = it }
        return choices.filter { it == candidate }.take(1)
    }
    override fun selectClients(request: ClientSelectionRequest): ClientSelectionResult {
        if (request.authenticated || request.premium) return ClientSelectionResult(emptyList())
        val choices = delegate.selectClients(request)
        val candidate = chosen ?: choices.candidates.firstOrNull()?.client?.also { chosen = it }
        return ClientSelectionResult(choices.candidates.filter { it.client == candidate }.take(1), choices.rejected)
    }
}

/** The real upstream playback dependency, with no app-level rotation/credentials. */
internal class PrimaryStreamResolver(engine: HttpClientEngine? = null) : AutoCloseable {
    private val mutex = Mutex()
    private val policy = PrimaryRequestPolicy()
    private val http = primaryHttpClient(policy, engine)
    private val inner = InnerTube(http)
    private val strategy = SinglePlaybackClient()
    private val configs = RemotePlayerConfigStore(http, PlayerConfigRepository.disabled())
    private val extractor = InnerTubeExtractor(
        configParser = YtConfigParserImpl(http, inner, configs),
        cipherService = YouTubeCipherService(http, configs),
        innerTube = inner,
        fallbackStrategy = strategy,
        tokenProvider = null,
    )

    suspend fun resolve(videoId: String): List<StreamCandidate> = mutex.withLock {
        policy.reset()
        strategy.reset()
        try {
            val stream = extractor.extract(videoId,
                hints = ContentHints(wantVideo = false).withStreamCapabilities(allowHls = false, allowSabr = false, allowBoundedRange = true),
                audioQuality = AudioQuality.AUTO) ?: throw MkrResolutionException(ResolutionReason.UNSUPPORTED_AUDIO)
            listOf(StreamCandidate(
                url = stream.audioUrl,
                mimeType = stream.mimeType ?: "application/octet-stream",
                headers = stream.headers.toMap(),
                transport = if (stream.sabrBootstrap != null) StreamTransport.SABR else StreamTransport.DIRECT,
                requireBoundedRange = stream.requireBoundedRange,
                useRangeChunks = stream.useRangeChunks,
                rangeChunkSizeBytes = stream.rangeChunkSizeBytes,
                contentLengthBytes = stream.contentLengthBytes,
                expiresAtEpochMs = stream.expiresAt?.toEpochMilliseconds(),
            ))
        } catch (error: ProviderRequestStopped) {
            throw MkrResolutionException(when (error.reason) {
                ProviderStopReason.AUTHENTICATION -> ResolutionReason.AUTHENTICATION_REQUIRED
                ProviderStopReason.DENIED -> ResolutionReason.ACCESS_DENIED
                ProviderStopReason.RATE_LIMIT -> ResolutionReason.RATE_LIMITED
                ProviderStopReason.PLAYABILITY -> ResolutionReason.CONTENT_RESTRICTED
                else -> ResolutionReason.UPSTREAM_FAILURE
            },error.reason,error.diagnostic)
        } catch (error: CancellationException) {
            throw error
        } catch (error: StreamResolveException) {
            throw MkrResolutionException(when (error.reason) {
                StreamResolveException.Reason.AGE_RESTRICTED, StreamResolveException.Reason.UNAVAILABLE -> ResolutionReason.CONTENT_RESTRICTED
                StreamResolveException.Reason.NETWORK -> ResolutionReason.NETWORK
                else -> ResolutionReason.UNSUPPORTED_AUDIO
            })
        }
    }

    override fun close() { inner.close(); http.close() }
}
