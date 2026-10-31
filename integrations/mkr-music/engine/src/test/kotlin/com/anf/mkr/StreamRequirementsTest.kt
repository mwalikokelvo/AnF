// SPDX-License-Identifier: MIT
package com.anf.mkr

import kotlinx.coroutines.runBlocking
import kotlin.test.*

class StreamRequirementsTest {
    private class Fixture(var candidate: StreamCandidate) : CatalogBackend {
        override suspend fun search(query: String) = emptyList<MkrTrack>()
        override suspend fun streams(videoId: String) = emptyList<Pair<Int,String>>()
        override suspend fun candidates(videoId: String) = listOf(candidate)
    }

    @Test fun rangeAndHeadersMustBeImplementedAndAreNeverDiscarded() = runBlocking {
        val backend = Fixture(StreamCandidate("https://r1.googlevideo.com/audio?private-fixture=1", "audio/mp4; codecs=\"mp4a.40.2\"",
            headers = mapOf("User-Agent" to "fixture-agent"), requireBoundedRange = true, useRangeChunks = true, rangeChunkSizeBytes = 1_048_576))
        val catalog = MkrCatalog(backend)
        assertEquals(ResolutionReason.UNSUPPORTED_TRANSPORT, assertFailsWith<MkrResolutionException> { catalog.resolve("abcdefghijk", setOf(AudioContainer.M4A)) }.reason)
        val value = catalog.resolve("abcdefghijk", NativeStreamCapabilities(setOf(AudioContainer.M4A), requestHeaders = true, boundedRange = true))
        assertEquals(backend.candidate.headers, value.headers)
        assertTrue(value.requireBoundedRange); assertTrue(value.useRangeChunks)
        assertEquals(1_048_576L, value.rangeChunkSizeBytes)
        assertFalse(value.toString().contains("private-fixture")); assertFalse(backend.candidate.toString().contains("private-fixture"))
    }

    @Test fun unsafeHeadersAndUnimplementedTransportsFailClosed() = runBlocking {
        val url = "https://r1.googlevideo.com/audio"
        for (candidate in listOf(
            StreamCandidate(url,"audio/mp4",mapOf("Authorization" to "fixture-secret")),
            StreamCandidate(url,"audio/mp4",mapOf("Cookie" to "fixture-secret")),
            StreamCandidate(url,"audio/mp4",mapOf("User-Agent" to "a\r\nb")),
            StreamCandidate(url,"audio/mp4",transport=StreamTransport.HLS),
            StreamCandidate(url,"audio/mp4",transport=StreamTransport.SABR),
            StreamCandidate(url,"audio/mp4",requireBoundedRange=true,rangeChunkSizeBytes=Long.MAX_VALUE),
            StreamCandidate(url,"audio/mp4;\r\nInjected: value"),
        )) {
            val failure = assertFailsWith<MkrResolutionException> { MkrCatalog(Fixture(candidate)).resolve("abcdefghijk",NativeStreamCapabilities(setOf(AudioContainer.M4A),true,true)) }
            assertEquals(ResolutionReason.UNSUPPORTED_TRANSPORT,failure.reason)
            assertFalse(failure.message!!.contains("fixture-secret"))
        }
    }

    @Test fun sizeAndExpiryArePreservedAndInvalidRecordsAreRejected() = runBlocking {
        val url = "https://r1.googlevideo.com/audio"
        val backend = Fixture(StreamCandidate(url,"audio/mp4",contentLengthBytes=123456,expiresAtEpochMs=20_000))
        val catalog = MkrCatalog(backend, nowMillis={10_000})
        val stream = catalog.resolve("abcdefghijk",setOf(AudioContainer.M4A))
        assertEquals(123456L,stream.contentLengthBytes)
        assertEquals(20_000L,stream.expiresAtEpochMs)
        for (bad in listOf(
            StreamCandidate(url,"audio/mp4",contentLengthBytes=0),
            StreamCandidate(url,"audio/mp4",contentLengthBytes=-1),
            StreamCandidate(url,"audio/mp4",contentLengthBytes=Long.MAX_VALUE),
            StreamCandidate(url,"audio/mp4",expiresAtEpochMs=10_000),
            StreamCandidate(url,"audio/mp4",expiresAtEpochMs=9_999),
        )) {
            backend.candidate=bad
            assertEquals(ResolutionReason.UNSUPPORTED_TRANSPORT,
                assertFailsWith<MkrResolutionException> { catalog.resolve("abcdefghijk",setOf(AudioContainer.M4A)) }.reason)
        }
    }
}
