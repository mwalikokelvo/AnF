// SPDX-License-Identifier: MIT
package com.anf.mkr

import com.anf.mkr.windows.*
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.URI
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import kotlin.test.*

class WindowsCatalogSessionTest {
    private val nonce="a".repeat(64)
    private val json=Json
    private class Backend:CatalogBackend,AutoCloseable {
        var searches=0;var resolutions=0;var closed=false;var failure=false
        override suspend fun search(query:String):List<MkrTrack> {
            searches++
            if(failure)error("https://private.invalid/account-token")
            return listOf(MkrTrack("abcdefghijk","Generated song","Fixture"))
        }
        override suspend fun streams(videoId:String)=emptyList<Pair<Int,String>>()
        override suspend fun candidates(videoId:String):List<StreamCandidate> {
            resolutions++
            return listOf(StreamCandidate("https://r1.googlevideo.com/audio?private-signed-token=1",
                "audio/mp4",requireBoundedRange=true,contentLengthBytes=100,expiresAtEpochMs=20_000))
        }
        override fun close() { closed=true }
    }
    private fun frame(id:Long,command:String,nonce:String?=null,query:String?=null,track:String?=null)=
        json.encodeToString(CatalogRequest(1,id,command,nonce,query,track))
    private fun session(backend:Backend)=WindowsCatalogSession(backend,nonce,
        MediaChunkSource { _,span -> ByteArray(span.length.toInt()) },nowMillis={10_000})

    @Test fun handshakeSequenceAndUnknownFieldsFailClosedBeforeProviderAccess()=runBlocking {
        for (bad in listOf(frame(1,"search",query="music"),frame(1,"hello",nonce="b".repeat(64)),
            frame(2,"hello",nonce=nonce),"""{"protocol":2,"id":1,"command":"hello"}""",
            """{"protocol":1,"id":1,"command":"hello","extra":"https://private.invalid"}""",
            "[".repeat(300)+"]".repeat(300))) {
            val backend=Backend();val session=session(backend)
            val response=session.accept(bad)
            assertFalse(response.ok);assertTrue(backend.closed)
            assertEquals(0,backend.searches);assertEquals(0,backend.resolutions)
            assertFalse(json.encodeToString(response).contains("private.invalid"))
        }
        val backend=Backend();session(backend).use { session ->
            val hello=session.accept(frame(1,"hello",nonce=nonce))
            assertTrue(hello.ok)
            assertFalse(hello.result!!.jsonObject["embedded"]!!.jsonPrimitive.boolean)
            assertTrue(session.accept(frame(2,"search",query="music")).ok)
            assertFalse(session.accept(frame(2,"search",query="replayed")).ok)
            assertTrue(backend.closed);assertEquals(1,backend.searches)
        }
    }

    @Test fun preparationReturnsOnlyOwnedLeaseAndRequiresExplicitRelease()=runBlocking {
        val backend=Backend();session(backend).use { session ->
            session.accept(frame(1,"hello",nonce=nonce))
            val prepared=session.accept(frame(2,"prepare",track="abcdefghijk"))
            assertTrue(prepared.ok)
            val serialized=json.encodeToString(prepared)
            assertFalse(serialized.contains("googlevideo"));assertFalse(serialized.contains("private-signed"))
            val uri=URI(prepared.result!!.jsonObject["leaseUri"]!!.jsonPrimitive.content)
            assertEquals("127.0.0.1",uri.host)
            assertEquals("SOURCE_ACTIVE",session.accept(frame(3,"prepare",track="abcdefghijk")).error)
            assertEquals(1,backend.resolutions)
            assertTrue(session.accept(frame(4,"release")).ok)
            assertFailsWith<java.io.IOException> { uri.toURL().openConnection().getInputStream() }
            assertTrue(session.accept(frame(5,"shutdown")).ok)
            assertTrue(backend.closed)
        }
    }

    @Test fun malformedPayloadsAndProviderErrorsNeverExposeRawCauseOrRetry()=runBlocking {
        val backend=Backend();session(backend).use { session ->
            session.accept(frame(1,"hello",nonce=nonce))
            assertEquals("INVALID_REQUEST_OR_STREAM",session.accept(frame(2,"search",query="x".repeat(501))).error)
            assertEquals("INVALID_REQUEST_OR_STREAM",session.accept(frame(3,"prepare",track="https://other.invalid")).error)
            assertEquals("UNKNOWN_COMMAND",session.accept(frame(4,"play")).error)
            assertEquals(0,backend.searches);assertEquals(0,backend.resolutions)
            backend.failure=true
            val failure=session.accept(frame(5,"search",query="fixture"))
            assertEquals("CATALOG_UNAVAILABLE",failure.error)
            assertFalse(json.encodeToString(failure).contains("private.invalid"))
            assertEquals(1,backend.searches)
        }
    }

    @Test fun framedEofAndBrokenOutputCloseLeaseAndBackend() {
        val frames=listOf(frame(1,"hello",nonce=nonce),frame(2,"prepare",track="abcdefghijk")).joinToString("\n",postfix="\n")
        val backend=Backend();val output=ByteArrayOutputStream()
        session(backend).serve(ByteArrayInputStream(frames.toByteArray()),output)
        assertTrue(backend.closed)
        val replies=output.toString(Charsets.UTF_8).trim().lines().map { json.decodeFromString<CatalogReply>(it) }
        val uri=URI(replies.last().result!!.jsonObject["leaseUri"]!!.jsonPrimitive.content)
        assertFailsWith<java.io.IOException> { uri.toURL().openConnection().getInputStream() }
        val broken=Backend()
        assertFailsWith<java.io.IOException> {
            session(broken).serve(ByteArrayInputStream(frames.toByteArray()),object:java.io.OutputStream() {
                override fun write(b:Int) { throw java.io.IOException("fixture closed pipe") }
            })
        }
        assertTrue(broken.closed)
    }

    @Test fun frameReaderRejectsTruncationOversizeAndInvalidUtf8() {
        assertNull(WindowsCatalogSession.readFrame(ByteArrayInputStream(byteArrayOf())))
        for(bytes in listOf("unterminated".toByteArray(),ByteArray(65_538){65},byteArrayOf(0xc3.toByte(),0x28,10))) {
            assertFails { WindowsCatalogSession.readFrame(ByteArrayInputStream(bytes)) }
        }
    }
}
