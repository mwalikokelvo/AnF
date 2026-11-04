// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import com.anf.mkr.MkrCatalog
import com.anf.mkr.MkrStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.atomic.AtomicLong

internal class NativeInputFailure(val reason: String) : IOException("Native music input unavailable: $reason")
internal data class AudioChunk(val bytes: ByteArray, val total: Long)

/** Bound a Media3 request before allocating or fetching even its first chunk. */
internal fun mediaChunkEnd(start: Long, total: Long?, requestedLength: Long, chunk: Long): Long {
    require(start in 0 until MkrCatalog.MAX_AUDIO_BYTES)
    require(total==null || total in 1..MkrCatalog.MAX_AUDIO_BYTES && start<total)
    require(requestedLength== -1L || requestedLength>0)
    require(chunk in 65_536..4_194_304)
    val count=minOf(chunk,if(requestedLength== -1L) chunk else requestedLength,
        (total ?: MkrCatalog.MAX_AUDIO_BYTES)-start)
    return start+count-1
}

/** The signed URL never becomes a MediaItem URI, log field or renderer value. */
internal class AndroidMediaLease(
    internal val stream: MkrStream,
    private val now: () -> Long = System::currentTimeMillis,
    private val connect: (String) -> HttpURLConnection = { NativeHttpConnection(URI(it).toURL()) },
) : AutoCloseable {
    val receipt = "anf-mkr://audio/" + UUID.randomUUID()
    private val revoked = AtomicBoolean()
    private val failure = AtomicReference<String?>()
    private val total = AtomicLong(stream.contentLengthBytes ?: -1)
    private val inputs = ConcurrentHashMap.newKeySet<AndroidRangeInput>()
    init {
        require(MkrCatalog.permittedCdn(stream.url) && MkrCatalog.permittedHeaders(stream.headers))
        require(stream.mimeType in setOf("audio/mp4", "audio/webm"))
        require(stream.rangeChunkSizeBytes in 65_536..4_194_304)
        require(stream.contentLengthBytes == null || stream.contentLengthBytes in 1..MkrCatalog.MAX_AUDIO_BYTES)
    }
    fun checkActive() {
        failure.get()?.let { throw NativeInputFailure(it) }
        if (revoked.get()) throw NativeInputFailure("REVOKED")
        if (stream.expiresAtEpochMs?.let { it <= now() } == true) {
            fail("EXPIRED"); throw NativeInputFailure("EXPIRED")
        }
    }
    fun fail(reason: String) { failure.compareAndSet(null,reason) }
    fun acceptTotal(size: Long) {
        total.compareAndSet(-1,size)
        if (total.get() != size) throw NativeInputFailure("INVALID_RANGE")
    }
    fun input(): AndroidRangeInput {
        checkActive()
        val input = AndroidRangeInput(this, connect) { inputs.remove(it) }
        inputs.add(input)
        try { checkActive() } catch (error: IOException) { input.close(); throw error }
        return input
    }
    override fun close() { revoked.set(true); inputs.toList().forEach { it.close() } }
}

/** One exact bounded CDN range per call, with no redirects/retries/credentials. */
internal class AndroidRangeInput(
    private val lease: AndroidMediaLease,
    private val connect: (String) -> HttpURLConnection,
    private val removed: (AndroidRangeInput) -> Unit,
) : AutoCloseable {
    private val closed = AtomicBoolean()
    @Volatile private var connection: HttpURLConnection? = null
    private var failed: String? = null
    private var total: Long? = lease.stream.contentLengthBytes
    private fun active() {
        failed?.let { throw NativeInputFailure(it) }
        if (closed.get()) throw NativeInputFailure("CLOSED")
        lease.checkActive()
    }
    @Synchronized fun read(start: Long, end: Long): AudioChunk {
        active()
        require(start >= 0 && end >= start && end - start < lease.stream.rangeChunkSizeBytes)
        require(end < MkrCatalog.MAX_AUDIO_BYTES)
        val stream = lease.stream
        var request: HttpURLConnection? = null
        try {
            request = connect(stream.url)
            connection = request
            active()
            request.instanceFollowRedirects = false
            request.useCaches = false
            request.connectTimeout = 10_000; request.readTimeout = 10_000
            request.requestMethod = "GET"
            stream.headers.forEach { (name, value) -> request.setRequestProperty(name, value) }
            request.setRequestProperty("Accept-Encoding", "identity")
            request.setRequestProperty("Range", "bytes=$start-$end")
            val code = request.responseCode
            if (code != 206) throw NativeInputFailure(when(code) {
                401,403 -> "DENIED"; 429 -> "RATE_LIMITED"; in 300..399 -> "REDIRECT"; else -> "INVALID_RESPONSE"
            })
            val range = Regex("bytes ([0-9]+)-([0-9]+)/([0-9]+)")
                .matchEntire(request.getHeaderField("Content-Range") ?: "") ?: throw NativeInputFailure("INVALID_RANGE")
            val first = range.groupValues[1].toLongOrNull()
            val last = range.groupValues[2].toLongOrNull()
            val size = range.groupValues[3].toLongOrNull() ?: throw NativeInputFailure("INVALID_RANGE")
            if (size !in 1..MkrCatalog.MAX_AUDIO_BYTES || first != start || last != minOf(end,size-1)
                || start >= size || (total != null && total != size)) throw NativeInputFailure("INVALID_RANGE")
            val expected = (last - start + 1).toInt()
            if (request.getHeaderField("Content-Length")?.toLongOrNull() != expected.toLong()
                || request.getHeaderField("Content-Type")?.substringBefore(';')?.trim() != stream.mimeType
                || request.getHeaderField("Content-Encoding")?.lowercase()?.let { it != "identity" } == true)
                throw NativeInputFailure("INVALID_RESPONSE")
            val result = ByteArray(expected)
            request.inputStream.use { body ->
                var offset = 0
                while (offset < expected) {
                    active()
                    val count = body.read(result, offset, expected-offset)
                    if (count <= 0) throw NativeInputFailure("TRUNCATED")
                    offset += count
                }
                if (body.read() != -1) throw NativeInputFailure("EXCESS_BODY")
            }
            active(); lease.acceptTotal(size); total = size
            return AudioChunk(result, size)
        } catch (error: Exception) {
            val reason = (error as? NativeInputFailure)?.reason ?: if (closed.get()) "CLOSED" else "NETWORK"
            failed = reason
            if (reason != "CLOSED" && reason != "REVOKED") lease.fail(reason)
            // Never retain the transport exception: its message may contain a signed URL.
            throw NativeInputFailure(reason)
        } finally {
            connection = null
            request?.disconnect()
        }
    }
    override fun close() {
        closed.set(true)
        connection?.disconnect()
        removed(this)
    }
}
