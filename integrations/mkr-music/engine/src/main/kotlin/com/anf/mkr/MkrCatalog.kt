// SPDX-License-Identifier: MIT
package com.anf.mkr

import java.net.URI
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.Serializable

@Serializable
data class MkrTrack(val id: String, val title: String, val artist: String)

enum class AudioContainer(val mime: String, val itags: Set<Int>) {
    M4A("audio/mp4", setOf(140, 139, 141)),
    WEBM("audio/webm", setOf(251, 250, 249))
}

// Native-host input only; never display/log the signed CDN URL or export it as
// a saved track. Resolution is repeated for the chosen track when needed.
class MkrStream internal constructor(
    val url: String, val mimeType: String, headers: Map<String,String>,
    val requireBoundedRange: Boolean, val useRangeChunks: Boolean, val rangeChunkSizeBytes: Long,
    val contentLengthBytes: Long?, val expiresAtEpochMs: Long?,
) {
    val headers = headers.toMap()
    override fun toString() = "MkrStream(url=present, headerCount=${headers.size}, boundedRange=$requireBoundedRange, chunks=$useRangeChunks)"
}

enum class StreamTransport { DIRECT, HLS, SABR }
class StreamCandidate(
    val url: String, val mimeType: String, val headers: Map<String,String> = emptyMap(),
    val transport: StreamTransport = StreamTransport.DIRECT,
    val requireBoundedRange: Boolean = false, val useRangeChunks: Boolean = false,
    val rangeChunkSizeBytes: Long = 1_048_576,
    val contentLengthBytes: Long? = null, val expiresAtEpochMs: Long? = null,
) {
    override fun toString() = "StreamCandidate(url=present, headerCount=${headers.size}, transport=$transport)"
}
data class NativeStreamCapabilities(val containers: Set<AudioContainer>, val requestHeaders: Boolean = false, val boundedRange: Boolean = false) {
    companion object {
        // The owned Windows lease forwards reviewed headers and bounded ranges;
        // a bare URI decoder does neither. Other hosts must opt in deliberately.
        fun m4aRangeLease() = NativeStreamCapabilities(setOf(AudioContainer.M4A), requestHeaders = true, boundedRange = true)
    }
}

internal fun legacyCandidate(itag: Int, url: String) = StreamCandidate(url,
    AudioContainer.entries.firstOrNull { itag in it.itags }?.mime ?: "application/octet-stream")

interface CatalogBackend {
    suspend fun search(query: String): List<MkrTrack>
    suspend fun streams(videoId: String): List<Pair<Int, String>>
    suspend fun candidates(videoId: String): List<StreamCandidate> = streams(videoId).map { legacyCandidate(it.first, it.second) }
}

class MkrCatalog(private val backend: CatalogBackend = UpstreamCatalogBackend(), private val nowMillis: () -> Long = System::currentTimeMillis) {
    suspend fun search(query: String): List<MkrTrack> {
        require(query.length <= 500 && query.isNotBlank() && !forbiddenControls.containsMatchIn(query)) {
            "Enter a music search of 1–500 characters."
        }
        val results = withTimeout(20_000) { backend.search(query.trim()) }
        return results.asSequence().filter { videoId.matches(it.id) }.distinctBy { it.id }.take(100)
            .map { MkrTrack(it.id, boundedText(it.title, 1000), boundedText(it.artist, 1000)) }.toList()
    }

    suspend fun resolve(id: String, supported: Set<AudioContainer>): MkrStream = resolve(id, NativeStreamCapabilities(supported))

    suspend fun resolve(id: String, capabilities: NativeStreamCapabilities): MkrStream {
        require(videoId.matches(id)) { "Choose a valid MKR track." }
        require(capabilities.containers.isNotEmpty()) { "The native engine supports no catalog audio container." }
        val candidates = withTimeout(20_000) { withContext(Dispatchers.IO) { backend.candidates(id) } }
        // Only permitted audio MIME/CDN records are eligible. Legacy records
        // derive MIME from known audio itags. Each host declares actual decoder,
        // header and range support; Android capability is not assumed on Windows.
        var unsupportedTransport = false
        for (container in AudioContainer.entries.filter { it in capabilities.containers }) {
            for (candidate in candidates.filter { it.mimeType.substringBefore(';').trim().lowercase() == container.mime && permittedCdn(it.url) }) {
                val ranged = candidate.requireBoundedRange || candidate.useRangeChunks
                val headers = candidate.headers.toMap()
                if (candidate.transport != StreamTransport.DIRECT || candidate.mimeType.length > 256 || candidate.mimeType.any { it.code < 32 || it.code == 127 } ||
                    !permittedHeaders(headers) || (headers.isNotEmpty() && !capabilities.requestHeaders) ||
                    (candidate.contentLengthBytes != null && candidate.contentLengthBytes !in 1..MAX_AUDIO_BYTES) ||
                    (candidate.expiresAtEpochMs != null && candidate.expiresAtEpochMs <= nowMillis()) ||
                    (ranged && (!capabilities.boundedRange || candidate.rangeChunkSizeBytes !in 65_536..4_194_304))) {
                    unsupportedTransport = true; continue
                }
                return MkrStream(candidate.url, candidate.mimeType, headers, candidate.requireBoundedRange, candidate.useRangeChunks, candidate.rangeChunkSizeBytes, candidate.contentLengthBytes, candidate.expiresAtEpochMs)
            }
        }
        if (unsupportedTransport) throw MkrResolutionException(ResolutionReason.UNSUPPORTED_TRANSPORT)
        throw IllegalStateException("No compatible public audio stream is available for this native engine.")
    }

    companion object {
        internal const val MAX_AUDIO_BYTES = 8L * 1024 * 1024 * 1024
        private val videoId = Regex("[A-Za-z0-9_-]{11}")
        private val forbiddenControls = Regex("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]")
        internal fun permittedHeaders(headers: Map<String,String>): Boolean = headers.size <= 16 && headers.all { (key,value) ->
            key.lowercase() in setOf("user-agent","referer","origin","accept") && value.length <= 2048 && value.none { it.code < 32 || it.code == 127 }
        } && headers.entries.sumOf { it.key.length+it.value.length } <= 8192

        internal fun boundedText(value: String, max: Int): String {
            var text = value.replace(forbiddenControls, "").take(max)
            if (text.lastOrNull()?.isHighSurrogate() == true) text = text.dropLast(1)
            return text
        }

        internal fun permittedCdn(value: String): Boolean = runCatching {
            if (value.length > 16_384) return false
            val uri = URI(value)
            uri.scheme.equals("https", true) && uri.host?.lowercase()?.endsWith(".googlevideo.com") == true &&
                uri.rawUserInfo == null && uri.rawFragment == null && (uri.port == -1 || uri.port == 443)
        }.getOrDefault(false)
    }
}
