// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import com.anf.mkr.MkrStream
import java.io.ByteArrayInputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicLong
import kotlin.test.*

class AndroidRangeInputTest {
    private fun stream(size: Long?=100, url:String="https://r1.googlevideo.com/audio?private-fixture=1") =
        MkrStream(url,"audio/mp4",mapOf("User-Agent" to "fixture-agent"),true,true,65536,size,20000)
    private class Response(val code:Int=206, val body:ByteArray=ByteArray(10){it.toByte()},
        val headers:Map<String,String> = mapOf("Content-Range" to "bytes 10-19/100","Content-Length" to "10","Content-Type" to "audio/mp4")) :
        HttpURLConnection(URL("https://r1.googlevideo.com/fixture")) {
        var disconnected=false
        override fun connect() {}
        override fun disconnect() { disconnected=true }
        override fun usingProxy()=false
        override fun getResponseCode()=code
        override fun getHeaderField(name:String?)=headers[name]
        override fun getInputStream()=ByteArrayInputStream(body)
    }
    @Test fun realNativeRangeContractKeepsSourceAndHeadersInternal() {
        val response=Response();val lease=AndroidMediaLease(stream(),{10000}){response}
        assertFalse(lease.receipt.contains("googlevideo"));assertFalse(lease.receipt.contains("private-fixture"))
        lease.input().use { assertContentEquals(ByteArray(10){it.toByte()},it.read(10,19).bytes) }
        assertEquals("bytes=10-19",response.getRequestProperty("Range"))
        assertEquals("fixture-agent",response.getRequestProperty("User-Agent"))
        assertEquals("identity",response.getRequestProperty("Accept-Encoding"))
        assertFalse(response.instanceFollowRedirects);assertTrue(response.disconnected)
        lease.close()
    }
    @Test fun deniedRateLimitedRedirectAndFailuresLatchAcrossNewInputs() {
        for(code in listOf(401,403,429,302,200,500)) {
            var requests=0;val lease=AndroidMediaLease(stream(),{10000}){requests++;Response(code)}
            val error=assertFailsWith<NativeInputFailure>{lease.input().use { it.read(10,19) }}
            assertFalse(error.toString().contains("private-fixture"));assertNull(error.cause)
            assertFailsWith<NativeInputFailure>{lease.input()};assertEquals(1,requests)
            lease.close()
        }
    }
    @Test fun malformedRangeWrongSizeEncodingAndTruncatedOrExcessBodyFail() {
        val good=mapOf("Content-Range" to "bytes 10-19/100","Content-Length" to "10","Content-Type" to "audio/mp4")
        val headers=listOf(good+mapOf("Content-Range" to "bytes 0-9/100"),
            good+mapOf("Content-Range" to "bytes 10-19/101"),good+mapOf("Content-Length" to "11"),
            good+mapOf("Content-Encoding" to "gzip"),good+mapOf("Content-Type" to "text/html"),
            good+mapOf("Content-Range" to "bytes 10-19/*"))
        for(response in headers.map { Response(headers=it) }+listOf(Response(body=ByteArray(9)),Response(body=ByteArray(11)))) {
            val lease=AndroidMediaLease(stream(),{10000}){response}
            assertFailsWith<NativeInputFailure>{lease.input().use { it.read(10,19) }}
            assertTrue(response.disconnected);assertFailsWith<NativeInputFailure>{lease.input()};lease.close()
        }
    }
    @Test fun unknownSizeIsLearnedAndCannotChangeDuringSeek() {
        var requests=0
        val lease=AndroidMediaLease(stream(null),{10000}) {
            requests++;Response(headers=mapOf("Content-Range" to "bytes 10-19/${if(requests==1)100 else 101}","Content-Length" to "10","Content-Type" to "audio/mp4"))
        }
        lease.input().use { assertEquals(100,it.read(10,19).total) }
        lease.input().use { assertFailsWith<NativeInputFailure>{it.read(10,19)} }
        lease.close()
    }
    @Test fun oversizedOverflowAndNegativeRangesNeverMakeRequests() {
        var requests=0;val lease=AndroidMediaLease(stream(),{10000}){requests++;Response()}
        lease.input().use { input ->
            for(pair in listOf(-1L to 5L, 10L to 9L,0L to 65536L,Long.MAX_VALUE to Long.MAX_VALUE))
                assertFailsWith<IllegalArgumentException>{input.read(pair.first,pair.second)}
        };assertEquals(0,requests);lease.close()
    }
    @Test fun expiryAndRevocationCannotBeUndoneByReopening() {
        val now=AtomicLong(10000);var requests=0
        val lease=AndroidMediaLease(stream(),now::get){requests++;Response()}
        val input=lease.input();now.set(20000)
        assertFailsWith<NativeInputFailure>{input.read(10,19)}
        now.set(10000);assertFailsWith<NativeInputFailure>{lease.input()}
        assertEquals(0,requests);input.close();lease.close()
        val other=AndroidMediaLease(stream(),{10000}){requests++;Response()}
        val opened=other.input();other.close()
        assertFailsWith<NativeInputFailure>{opened.read(10,19)}
        assertFailsWith<NativeInputFailure>{other.input()};assertEquals(0,requests)
    }
    @Test fun unsupportedEndpointsAndCredentialsAreRejectedBeforeConnection() {
        for(url in listOf("http://r1.googlevideo.com/a","https://example.invalid/a","https://user:pw@r1.googlevideo.com/a"))
            assertFailsWith<IllegalArgumentException>{AndroidMediaLease(stream(url=url),{10000}){error("must not connect")}}
        val bad=MkrStream("https://r1.googlevideo.com/a","audio/mp4",mapOf("Authorization" to "fixture"),true,true,65536,100,20000)
        assertFailsWith<IllegalArgumentException>{AndroidMediaLease(bad,{10000}){error("must not connect")}}
    }
    @Test fun transportErrorsNeverRetainSignedUrlOrCause() {
        val lease=AndroidMediaLease(stream(),{10000}){throw IOException("https://r1.googlevideo.com/?private-fixture=1")}
        val error=assertFailsWith<NativeInputFailure>{lease.input().use { it.read(10,19) }}
        assertEquals("NETWORK",error.reason);assertNull(error.cause);assertFalse(error.toString().contains("private-fixture"));lease.close()
    }
    @Test fun nativeHttpCannotInheritCookiesOrAuthenticateOrRetry() {
        val client=NativeHttpConnection.client
        assertSame(okhttp3.CookieJar.NO_COOKIES,client.cookieJar)
        assertSame(okhttp3.Authenticator.NONE,client.authenticator)
        assertSame(okhttp3.Authenticator.NONE,client.proxyAuthenticator)
        assertNull(client.cache);assertFalse(client.followRedirects);assertFalse(client.followSslRedirects)
        assertFalse(client.retryOnConnectionFailure)
    }
    @Test fun closingInputPermitsSeekButRevokedLeaseNeverReopens() {
        var requests=0
        val lease=AndroidMediaLease(stream(),{10000}){requests++;Response()}
        val input=lease.input();input.close()
        assertFailsWith<NativeInputFailure>{input.read(10,19)}
        lease.input().use { assertEquals(100,it.read(10,19).total) }
        assertEquals(1,requests);lease.close()
        assertFailsWith<NativeInputFailure>{lease.input()}
    }
    @Test fun shortAndNearEofRequestsNeverOverfetchOrOverflow() {
        assertEquals(9,mediaChunkEnd(0,1000000,10,1048576))
        assertEquals(999999,mediaChunkEnd(900000,1000000,-1,1048576))
        assertEquals(65535,mediaChunkEnd(0,null,Long.MAX_VALUE,65536))
        val maximum=com.anf.mkr.MkrCatalog.MAX_AUDIO_BYTES
        assertEquals(maximum-1,mediaChunkEnd(maximum-2,null,Long.MAX_VALUE,1048576))
        for(start in listOf(-1L,maximum,Long.MAX_VALUE))
            assertFailsWith<IllegalArgumentException>{mediaChunkEnd(start,null,10,65536)}
        assertFailsWith<IllegalArgumentException>{mediaChunkEnd(100,100,10,65536)}
        assertFailsWith<IllegalArgumentException>{mediaChunkEnd(0,null,0,65536)}
    }
    @Test fun nativeConnectionDebugTextCannotExposeSignedUrl() {
        val connection=NativeHttpConnection(URL("https://r1.googlevideo.com/?signed-private-fixture=1"))
        assertFalse(connection.toString().contains("signed-private"));connection.disconnect()
    }
}
