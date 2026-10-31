// SPDX-License-Identifier: MIT
package com.anf.mkr

import com.anf.mkr.windows.*
import java.net.HttpURLConnection
import java.net.URI
import java.util.concurrent.atomic.AtomicLong
import kotlin.test.*

class WindowsMediaBridgeTest {
    private val size = 2_200_019
    private val now = AtomicLong(10_000)
    private fun stream() = MkrStream("https://r1.googlevideo.com/audio?private-signed-fixture=1",
        "audio/mp4", mapOf("User-Agent" to "fixture-agent"), true, true, 1_048_576, size.toLong(), 20_000)
    private fun bytes(start: Long, end: Long) = ByteArray((end - start + 1).toInt()) { ((start + it) % 251).toByte() }
    private fun request(uri: URI, method: String = "GET", range: String? = null): HttpURLConnection =
        (uri.toURL().openConnection() as HttpURLConnection).apply {
            connectTimeout = 2_000; readTimeout = 2_000; requestMethod = method
            range?.let { setRequestProperty("Range", it) }
        }

    @Test fun byteRangeParserHandlesSeekSuffixAndOverflow() {
        assertEquals(ByteSpan(0,99), requestedSpan(null,100))
        assertEquals(ByteSpan(90,99), requestedSpan("bytes=90-",100))
        assertEquals(ByteSpan(95,99), requestedSpan("bytes=-5",100))
        assertEquals(ByteSpan(0,99), requestedSpan("bytes=-1000",100))
        assertEquals(ByteSpan(12,99), requestedSpan("bytes=12-999",100))
        for (value in listOf("bytes=-", "bytes=-0", "bytes=100-", "bytes=5-4", "bytes=0-1,3-4",
            "bytes=999999999999999999999-", "items=0-1", "bytes=+1-2", "bytes= 1-2")) {
            assertFailsWith<IllegalArgumentException> { requestedSpan(value,100) }
        }
    }

    @Test fun realLoopbackStreamsBoundedChunksAndSeeksWithoutLeakingSource() {
        val spans = java.util.concurrent.CopyOnWriteArrayList<ByteSpan>()
        val input = MediaChunkSource { value, span ->
            assertEquals(mapOf("User-Agent" to "fixture-agent"),value.headers)
            assertTrue(span.length <= 1_048_576)
            synchronized(spans) { spans.add(span) }
            bytes(span.start,span.end)
        }
        WindowsMediaBridge(stream(),input,now::get).use { bridge ->
            assertEquals("127.0.0.1",bridge.leaseUri.host)
            assertFalse(bridge.toString().contains(bridge.leaseUri.rawPath))
            assertFalse(bridge.toString().contains("private-signed"))
            val head = request(bridge.leaseUri,"HEAD")
            try {
                assertEquals(200,head.responseCode)
                assertEquals(size.toString(),head.getHeaderField("Content-Length"))
                assertEquals("no-store",head.getHeaderField("Cache-Control"))
                assertNull(head.getHeaderField("Access-Control-Allow-Origin"))
                assertTrue(spans.isEmpty(),"HEAD must not fetch provider bytes")
            } finally { head.disconnect() }
            val full = request(bridge.leaseUri)
            try {
                assertEquals(200,full.responseCode)
                assertContentEquals(bytes(0,size.toLong()-1),full.inputStream.use { it.readBytes() })
                assertEquals(listOf(ByteSpan(0,1_048_575),ByteSpan(1_048_576,2_097_151),ByteSpan(2_097_152,size.toLong()-1)),spans)
                assertFalse(full.headerFields.toString().contains("private-signed"))
            } finally { full.disconnect() }
            val seek = request(bridge.leaseUri,range="bytes=2100000-2100099")
            try {
                assertEquals(206,seek.responseCode)
                assertEquals("bytes 2100000-2100099/$size",seek.getHeaderField("Content-Range"))
                assertContentEquals(bytes(2_100_000,2_100_099),seek.inputStream.use { it.readBytes() })
            } finally { seek.disconnect() }
        }
    }

    @Test fun tokenPathMethodRangeAndExpiryRejectBeforeAnyProviderCall() {
        var calls = 0
        WindowsMediaBridge(stream(),MediaChunkSource { _, span -> calls++; bytes(span.start,span.end) },now::get).use { bridge ->
            for ((uri,method,range,status) in listOf(
                listOf(bridge.leaseUri.resolve("/audio/wrong-token"),"GET",null,404),
                listOf(URI(bridge.leaseUri.toString()+"?url=https://other.invalid"),"GET",null,404),
                listOf(bridge.leaseUri,"POST",null,405),
                listOf(bridge.leaseUri,"GET","bytes=0-1,4-5",416),
                listOf(bridge.leaseUri,"GET","bytes=$size-",416),
            )) {
                val connection = request(uri as URI,method as String,range as String?)
                try { assertEquals(status,connection.responseCode) } finally { connection.disconnect() }
            }
            now.set(20_000)
            val expired = request(bridge.leaseUri)
            try { assertEquals(410,expired.responseCode) } finally { expired.disconnect() }
            assertEquals(0,calls)
        }
    }

    @Test fun upstreamDenialOrWrongChunkLatchesAndDoesNotRetry() {
        for (deny in listOf(true,false)) {
            var calls = 0
            WindowsMediaBridge(stream(),MediaChunkSource { _, _ ->
                calls++
                if (deny) throw MediaInputException(MediaInputFailure.RATE_LIMITED)
                byteArrayOf(1)
            },now::get).use { bridge ->
                repeat(2) {
                    val connection = request(bridge.leaseUri,range="bytes=0-99")
                    try { assertEquals(502,connection.responseCode) } finally { connection.disconnect() }
                }
                assertEquals(1,calls,"failed lease must not retry provider")
            }
        }
    }

    @Test fun closeRevokesTheLeaseAndMissingLengthOrExpiryNeverStartsTransport() {
        val fixture=stream()
        for (invalid in listOf(
            MkrStream(fixture.url,"audio/mp4",emptyMap(),true,true,65_536,null,20_000),
            MkrStream(fixture.url,"audio/mp4",emptyMap(),true,true,65_536,100,null),
            MkrStream(fixture.url,"audio/mp4",emptyMap(),true,true,65_536,100,10_000),
            MkrStream("file:///private","audio/mp4",emptyMap(),true,true,65_536,100,20_000),
        )) assertFailsWith<IllegalArgumentException> { WindowsMediaBridge(invalid,nowMillis=now::get) }
        val bridge=WindowsMediaBridge(fixture,MediaChunkSource { _,span -> bytes(span.start,span.end) },now::get)
        val uri=bridge.leaseUri
        bridge.close();bridge.close()
        val connection=request(uri)
        try { assertFailsWith<java.io.IOException> { connection.responseCode } }
        finally { connection.disconnect() }
    }
}
