// SPDX-License-Identifier: MIT
package com.anf.mkr.windows

import com.anf.mkr.*
import java.io.InputStream
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*

@Serializable
internal data class CatalogRequest(
    val protocol: Int, val id: Long, val command: String,
    val nonce: String? = null, val query: String? = null, val trackId: String? = null,
)
@Serializable
internal data class CatalogReply(
    val protocol: Int = 1, val id: Long, val ok: Boolean,
    val result: JsonElement? = null, val error: String? = null,
)

/** One private stdin/stdout session. No shell, arbitrary URL, file or play command.
 * This is a catalog/leased-input sidecar, NOT an AnF native player capability.
 * An owned parent must still implement supervision, native loading and handoff.
 */
internal class WindowsCatalogSession(
    private val backend: CatalogBackend,
    private val expectedNonce: String,
    private val chunkSource: MediaChunkSource? = null,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) : AutoCloseable {
    init { require(Regex("[a-f0-9]{64}").matches(expectedNonce)) { "Invalid owned session nonce." } }
    private val json = Json { ignoreUnknownKeys = false; isLenient = false; encodeDefaults = true; explicitNulls = false }
    private val catalog = MkrCatalog(backend, nowMillis)
    private var authenticated = false
    private var sequence = 0L
    private var lease: WindowsMediaBridge? = null
    private var closed = false

    private fun parseRequest(frame: String): CatalogRequest {
        require(frame.toByteArray(Charsets.UTF_8).size <= MAX_FRAME_BYTES)
        // Flat scalar requests only; bound depth before recursive decoding.
        var depth=0;var quoted=false;var escaped=false
        for (c in frame) {
            if (quoted) { if(escaped) escaped=false else if(c=='\\') escaped=true else if(c=='"') quoted=false }
            else when(c) {
                '"' -> quoted=true
                '[' -> error("Nested request is unsupported.")
                '{' -> { depth++;require(depth==1) }
                '}' -> { depth--;require(depth==0) }
            }
        }
        require(!quoted && depth==0)
        return json.decodeFromString<CatalogRequest>(frame)
    }

    private fun denied(id:Long,code:String)=CatalogReply(id=id,ok=false,error=code)
    private fun capabilities(id:Long)=CatalogReply(id=id,ok=true,result=buildJsonObject {
        put("protocol",1);put("catalog",true);put("leasedInput",true)
        // Catalog handshake must NEVER satisfy the app's native capability.
        put("embedded",false)
    })
    private fun validHandshake(request:CatalogRequest):Boolean {
        val nonce=request.nonce ?: return false
        return request.command=="hello" && nonce.length==64 && request.query==null && request.trackId==null &&
            MessageDigest.isEqual(nonce.toByteArray(Charsets.UTF_8),expectedNonce.toByteArray(Charsets.UTF_8))
    }

    internal suspend fun accept(frame: String): CatalogReply {
        if (closed) return denied(0,"SESSION_CLOSED")
        val request=try { parseRequest(frame) }
        catch (_:Exception) { close();return denied(0,"BAD_FRAME") }
        if(request.protocol!=1 || request.id!=sequence+1 || request.id>9_007_199_254_740_991L) {
            close();return denied(request.id,"PROTOCOL_OR_SEQUENCE")
        }
        sequence=request.id
        if(!authenticated) {
            if(!validHandshake(request)) { close();return denied(request.id,"SESSION_DENIED") }
            authenticated=true
            return capabilities(request.id)
        }
        if(request.nonce!=null) { close();return denied(request.id,"SESSION_DENIED") }
        return try { execute(request) }
        catch(error:MkrResolutionException) { denied(request.id,error.reason.name) }
        catch(_:IllegalArgumentException) { denied(request.id,"INVALID_REQUEST_OR_STREAM") }
        catch(_:Exception) { denied(request.id,"CATALOG_UNAVAILABLE") }
    }

    // Keep parsing, JSON builders and suspend operations in small methods. A
    // monolithic coroutine makes Kotlin's bytecode optimizer needlessly costly.
    private suspend fun execute(request:CatalogRequest):CatalogReply = when(request.command) {
        "search" -> search(request)
        "prepare" -> prepare(request)
        "release","shutdown" -> {
            require(request.query==null && request.trackId==null)
            lease?.close();lease=null
            if(request.command=="shutdown")close()
            CatalogReply(id=request.id,ok=true,result=JsonNull)
        }
        else -> denied(request.id,"UNKNOWN_COMMAND")
    }
    private fun tracksReply(id:Long,tracks:List<MkrTrack>) =
        CatalogReply(id=id,ok=true,result=json.encodeToJsonElement(tracks))
    private suspend fun search(request:CatalogRequest):CatalogReply {
        val query=requireNotNull(request.query)
        require(request.trackId==null)
        return tracksReply(request.id,catalog.search(query))
    }
    private suspend fun prepare(request:CatalogRequest):CatalogReply {
        val track=requireNotNull(request.trackId)
        require(request.query==null)
        // Never revoke a source still owned by a decoder without parent release.
        if(lease!=null)return denied(request.id,"SOURCE_ACTIVE")
        val stream=catalog.resolve(track,NativeStreamCapabilities.m4aRangeLease())
        val next=WindowsMediaBridge(stream,chunkSource,nowMillis)
        lease=next
        return leaseReply(request.id,track,stream,next)
    }
    private fun leaseReply(id:Long,track:String,stream:MkrStream,bridge:WindowsMediaBridge)=
        CatalogReply(id=id,ok=true,result=buildJsonObject {
            put("trackId",track);put("leaseUri",bridge.leaseUri.toString())
            put("contentLengthBytes",requireNotNull(stream.contentLengthBytes))
            put("expiresAtEpochMs",requireNotNull(stream.expiresAtEpochMs))
            put("mimeType",stream.mimeType.substringBefore(';'))
        })

    /** Byte-bounded strict UTF-8 frames; EOF, malformed input and write failure
     * close the lease/backend. No raw input/cause/provider diagnostics are logged.
     */
    internal fun serve(input: InputStream, output: OutputStream) {
        val framed=input.buffered(8192)
        try {
            while (!closed) {
                val frame = readFrame(framed) ?: break
                val reply = runBlocking { accept(frame) }
                val bytes = json.encodeToString(reply).toByteArray(Charsets.UTF_8)
                check(bytes.size <= MAX_REPLY_BYTES) { "Catalog reply exceeded its bound." }
                output.write(bytes);output.write(10);output.flush()
            }
        } finally { close() }
    }
    override fun close() {
        if (!closed) {
            closed=true
            try { lease?.close() } finally {
                lease=null
                (backend as? AutoCloseable)?.close()
            }
        }
    }
    companion object {
        internal const val MAX_FRAME_BYTES=65_536
        internal const val MAX_REPLY_BYTES=1_048_576
        internal fun readFrame(input: InputStream): String? {
            val bytes=java.io.ByteArrayOutputStream()
            while (true) {
                val value=input.read()
                if (value == -1) {
                    check(bytes.size()==0) { "Truncated catalog frame." }
                    return null
                }
                if (value == 10) break
                check(bytes.size() < MAX_FRAME_BYTES) { "Catalog frame exceeded its bound." }
                bytes.write(value)
            }
            return Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes.toByteArray())).toString()
        }
    }
}

/** Production entry point; only an owned parent may launch it with private pipes.
 * Never run from a UI terminal with live tokens or forward its stdout to a log.
 */
fun main() {
    try {
        val nonce = requireNotNull(System.getenv("ANF_MKR_SESSION_NONCE")) { "Owned parent handshake required." }
        WindowsCatalogSession(UpstreamCatalogBackend(),nonce).use { it.serve(System.`in`,System.out) }
        // This is a separate owned child process, not the AnF host JVM. Do not
        // leave it alive waiting for third-party HTTP pool idle timeouts.
        kotlin.system.exitProcess(0)
    } catch (_: Exception) {
        System.err.println("MKR catalog sidecar stopped; no source details retained.")
        kotlin.system.exitProcess(1)
    }
}
