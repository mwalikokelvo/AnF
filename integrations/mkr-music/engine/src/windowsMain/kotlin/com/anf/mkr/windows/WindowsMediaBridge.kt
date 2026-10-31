// SPDX-License-Identifier: MIT
package com.anf.mkr.windows

import com.anf.mkr.MkrCatalog
import com.anf.mkr.MkrStream
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.ByteBuffer
import java.time.Duration
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Flow
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.URI
import java.security.SecureRandom
import java.util.HexFormat
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

internal data class ByteSpan(val start: Long, val end: Long) {
    val length: Long get() = end - start + 1
}

/** Strict single HTTP byte range. Never accepts multipart, overflowing or empty ranges. */
internal fun requestedSpan(header: String?, length: Long): ByteSpan {
    require(length in 1..MkrCatalog.MAX_AUDIO_BYTES) { "Invalid audio size." }
    if (header == null) return ByteSpan(0, length - 1)
    require(header.length <= 128 && header.startsWith("bytes=")) { "Invalid audio range." }
    val match = Regex("([0-9]*)-([0-9]*)").matchEntire(header.removePrefix("bytes="))
        ?: throw IllegalArgumentException("Invalid audio range.")
    val (first, last) = match.destructured
    fun number(value: String) = value.toLongOrNull() ?: throw IllegalArgumentException("Invalid audio range.")
    if (first.isEmpty()) {
        val count = number(last)
        require(count > 0) { "Invalid audio range." }
        return ByteSpan((length - count).coerceAtLeast(0), length - 1)
    }
    val start = number(first)
    val end = if (last.isEmpty()) length - 1 else number(last).coerceAtMost(length - 1)
    require(start < length && end >= start) { "Invalid audio range." }
    return ByteSpan(start, end)
}

internal enum class MediaInputFailure { DENIED, RATE_LIMITED, NETWORK, INVALID_RESPONSE }
internal class MediaInputException(val reason: MediaInputFailure) :
    IllegalStateException("Native media input failed: $reason")

internal fun interface MediaChunkSource {
    /** Return exactly the requested bytes, at most one bounded chunk. */
    fun read(stream: MkrStream, span: ByteSpan): ByteArray
}

/** The subscriber never allocates more than one validated <=1MiB chunk. */
internal class BoundedAudioBody(private val size: Int) : HttpResponse.BodySubscriber<ByteArray> {
    init { require(size in 1..CdnChunkSource.MAX_CHUNK.toInt()) { "Invalid media chunk size." } }
    private val result = CompletableFuture<ByteArray>()
    private val bytes = ByteArray(size)
    private var offset = 0
    private var subscription: Flow.Subscription? = null
    override fun getBody() = result
    override fun onSubscribe(value: Flow.Subscription) {
        if (subscription != null || result.isDone) { value.cancel(); return }
        subscription = value
        value.request(1)
    }
    override fun onNext(buffers: List<ByteBuffer>) {
        if (result.isDone) return
        for (buffer in buffers) {
            val count = buffer.remaining()
            if (count > bytes.size - offset) { cancel(); return }
            buffer.get(bytes, offset, count); offset += count
        }
        subscription?.request(1)
    }
    override fun onComplete() {
        if (offset == size) result.complete(bytes) else cancel()
    }
    override fun onError(error: Throwable) { cancel() }
    fun cancel() {
        subscription?.cancel()
        result.completeExceptionally(MediaInputException(MediaInputFailure.INVALID_RESPONSE))
    }
}

internal fun validateMediaResponse(info: HttpResponse.ResponseInfo, span: ByteSpan, total: Long) {
    when (info.statusCode()) {
        401, 403 -> throw MediaInputException(MediaInputFailure.DENIED)
        429 -> throw MediaInputException(MediaInputFailure.RATE_LIMITED)
        206 -> Unit
        else -> throw MediaInputException(MediaInputFailure.INVALID_RESPONSE)
    }
    fun one(name: String): String? {
        val values = info.headers().allValues(name)
        if (values.size > 1) throw MediaInputException(MediaInputFailure.INVALID_RESPONSE)
        return values.singleOrNull()
    }
    val length = one("Content-Length")
    if (one("Content-Range") != "bytes ${span.start}-${span.end}/$total" ||
        one("Content-Encoding")?.let { !it.equals("identity",true) } == true ||
        (length != null && length.toLongOrNull() != span.length)) {
        throw MediaInputException(MediaInputFailure.INVALID_RESPONSE)
    }
}

/** No global CookieHandler/Authenticator, redirect or own provider retry. */
internal class CdnChunkSource : MediaChunkSource, AutoCloseable {
    private val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8))
        .followRedirects(HttpClient.Redirect.NEVER).version(HttpClient.Version.HTTP_1_1).build()
    override fun read(stream: MkrStream, span: ByteSpan): ByteArray {
        require(MkrCatalog.permittedCdn(stream.url) && MkrCatalog.permittedHeaders(stream.headers) && span.length in 1..MAX_CHUNK)
        val total = stream.contentLengthBytes ?: throw MediaInputException(MediaInputFailure.INVALID_RESPONSE)
        require(span.start >= 0 && span.end < total)
        val subscriber = BoundedAudioBody(span.length.toInt())
        var future: CompletableFuture<HttpResponse<ByteArray>>? = null
        try {
            val request = HttpRequest.newBuilder(URI(stream.url)).timeout(Duration.ofSeconds(12))
                .header("Accept-Encoding", "identity").header("Range", "bytes=${span.start}-${span.end}")
                .apply { stream.headers.forEach { (name,value) -> header(name,value) } }.GET().build()
            future = client.sendAsync(request, HttpResponse.BodyHandler { info ->
                validateMediaResponse(info,span,total)
                subscriber
            })
            // An absolute body+headers deadline, not only an idle socket timeout:
            // a slow/dripping source cannot occupy the bridge indefinitely.
            return future.get(12,TimeUnit.SECONDS).body()
        } catch (error: Exception) {
            var cause: Throwable? = error
            repeat(8) {
                if (cause is MediaInputException) throw cause
                cause = cause?.cause
            }
            // JVM errors can contain signed URLs; keep no cause or raw message.
            throw MediaInputException(MediaInputFailure.NETWORK)
        } finally { subscriber.cancel(); future?.cancel(true) }
    }
    override fun close() { client.shutdownNow() }
    companion object { internal const val MAX_CHUNK = 1_048_576L }
}

/**
 * A single-source, revocable lease for an OWNED Windows decoder, not a public
 * proxy or a JavaScript URL loader. This component is not yet registered in AnF.
 * Source URLs/headers stay in the JVM. The ephemeral lease URL is secret IPC
 * data, never saved to history/logs. Android must not include this JDK directory.
 */
internal class WindowsMediaBridge(
    private val stream: MkrStream,
    input: MediaChunkSource? = null,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) : AutoCloseable {
    private val total = requireNotNull(stream.contentLengthBytes) { "Native media size is required." }
        .also { require(it in 1..MkrCatalog.MAX_AUDIO_BYTES) { "Invalid native media size." } }
    private val expires = requireNotNull(stream.expiresAtEpochMs) { "Native media expiry is required." }
        .also { require(it > nowMillis()) { "Native media has expired." } }
    private val chunk = stream.rangeChunkSizeBytes.coerceAtMost(CdnChunkSource.MAX_CHUNK)
        .also { require(it in 65_536..CdnChunkSource.MAX_CHUNK) { "Invalid native media chunk." } }
    init {
        require(MkrCatalog.permittedCdn(stream.url) && MkrCatalog.permittedHeaders(stream.headers)) { "Unsupported native media source." }
        require(stream.mimeType in setOf("audio/mp4","audio/webm") ||
            stream.mimeType.substringBefore(';') in setOf("audio/mp4","audio/webm")) { "Unsupported native audio type." }
    }
    private val input = input ?: CdnChunkSource()
    private val closed = AtomicBoolean(false)
    private val failed = AtomicBoolean(false)
    private val token = HexFormat.of().formatHex(ByteArray(32).also { SecureRandom().nextBytes(it) })
    private val path = "/audio/$token"
    private val executor = ThreadPoolExecutor(2, 2, 0, TimeUnit.MILLISECONDS, ArrayBlockingQueue(2),
        { job -> Thread(job, "anf-mkr-media-input").apply { isDaemon = true } }, ThreadPoolExecutor.AbortPolicy())
    private val server = HttpServer.create(InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 4)
        .apply {
            executor = this@WindowsMediaBridge.executor
            createContext("/", ::serve)
            start()
        }
    internal val leaseUri: URI get() = URI("http://127.0.0.1:${server.address.port}$path")
    override fun toString() = "WindowsMediaBridge(lease=redacted, closed=${closed.get()})"

    private fun serve(exchange: HttpExchange) {
        try {
            val uri = exchange.requestURI
            if (uri.rawPath != path || uri.rawQuery != null || uri.isAbsolute ||
                exchange.requestHeaders["Host"] != listOf("127.0.0.1:${server.address.port}")) {
                reply(exchange, 404); return
            }
            if (exchange.requestMethod !in setOf("GET", "HEAD")) {
                exchange.responseHeaders.set("Allow", "GET, HEAD"); reply(exchange, 405); return
            }
            if (closed.get() || nowMillis() >= expires) { reply(exchange, 410); return }
            if (failed.get()) { reply(exchange, 502); return }
            val rangeHeaders = exchange.requestHeaders["Range"]
            val span = try {
                require(rangeHeaders == null || rangeHeaders.size == 1)
                requestedSpan(rangeHeaders?.single(), total)
            } catch (_: IllegalArgumentException) {
                exchange.responseHeaders.set("Content-Range", "bytes */$total")
                reply(exchange, 416); return
            }
            val head = exchange.requestMethod == "HEAD"
            // First bounded read before headers permits a clean error response
            // on initial denial. A later denial closes the body and latches the
            // lease; it never re-resolves or changes provider/client identity.
            var position = span.start
            var bytes = if (head) null else readChunk(position, span.end)
            if (!head && bytes == null) { reply(exchange, 502); return }
            val headers = exchange.responseHeaders
            headers.set("Accept-Ranges", "bytes")
            headers.set("Content-Type", stream.mimeType.substringBefore(';'))
            headers.set("Content-Length", span.length.toString())
            if (rangeHeaders != null) headers.set("Content-Range", "bytes ${span.start}-${span.end}/$total")
            secureHeaders(exchange)
            exchange.sendResponseHeaders(if (rangeHeaders == null) 200 else 206, if (head) -1 else span.length)
            if (!head) exchange.responseBody.use { output ->
                while (position <= span.end && bytes != null) {
                    // A decoder seek/disconnect affects only this downstream
                    // request; it must not latch a provider failure.
                    output.write(bytes)
                    position += bytes.size
                    bytes = if (position <= span.end) readChunk(position, span.end) else null
                }
            }
        } catch (_: Exception) {
            // No URI, token, header or private path in diagnostics.
        } finally { exchange.close() }
    }

    private fun readChunk(position: Long, end: Long): ByteArray? {
        if (closed.get() || failed.get() || nowMillis() >= expires) return null
        val span = ByteSpan(position, minOf(end, position + chunk - 1))
        return try {
            val bytes = input.read(stream, span).also {
                if (it.size.toLong() != span.length) throw MediaInputException(MediaInputFailure.INVALID_RESPONSE)
            }
            if (closed.get() || failed.get() || nowMillis() >= expires) null else bytes
        } catch (_: Exception) { failed.set(true); null }
    }

    private fun secureHeaders(exchange: HttpExchange) {
        exchange.responseHeaders.set("Cache-Control", "no-store")
        exchange.responseHeaders.set("X-Content-Type-Options", "nosniff")
        exchange.responseHeaders.set("Connection", "close")
    }
    private fun reply(exchange: HttpExchange, status: Int) {
        secureHeaders(exchange)
        exchange.sendResponseHeaders(status, -1)
    }
    override fun close() {
        if (closed.compareAndSet(false, true)) { server.stop(0); executor.shutdownNow(); if (input is CdnChunkSource) input.close() }
    }
}
