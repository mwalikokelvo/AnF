// SPDX-License-Identifier: MIT
package com.anf.mkr

import kotlin.test.*
import kotlinx.coroutines.runBlocking

class CatalogProbeTest {
    private class Fixture(private val headers: Map<String,String> = mapOf("User-Agent" to "AnF fixture")) : CatalogBackend {
        var attempts = 0
        override suspend fun search(query: String) = emptyList<MkrTrack>()
        override suspend fun streams(videoId: String) = emptyList<Pair<Int,String>>()
        override suspend fun candidates(videoId: String): List<StreamCandidate> {
            attempts++
            return listOf(StreamCandidate("https://r1.googlevideo.com/audio?fixture=1", "audio/mp4", headers,
                requireBoundedRange = true, useRangeChunks = true, contentLengthBytes = 1_000_000,
                expiresAtEpochMs = System.currentTimeMillis() + 60_000))
        }
    }
    @Test fun primaryMetadataProbeRetainsRequirementsSupportedByOwnedLease() = runBlocking {
        val backend=Fixture()
        val stream=resolveProbeMetadata(MkrCatalog(backend),"abcdefghijk",legacy=false)
        assertEquals("audio/mp4",stream.mimeType)
        assertEquals("AnF fixture",stream.headers["User-Agent"])
        assertTrue(stream.requireBoundedRange)
        assertTrue(stream.useRangeChunks)
        assertEquals(1_000_000L,stream.contentLengthBytes)
        assertEquals(1,backend.attempts)
    }
    @Test fun legacyUriProbeStillRefusesHeaderAndRangeRequirements() = runBlocking {
        val backend=Fixture()
        assertEquals(ResolutionReason.UNSUPPORTED_TRANSPORT,
            assertFailsWith<MkrResolutionException> {resolveProbeMetadata(MkrCatalog(backend),"abcdefghijk",legacy=true)}.reason)
        assertEquals(1,backend.attempts)
    }
    @Test fun primaryProbeCannotPromoteForbiddenCredentialsOrRetry() = runBlocking {
        val backend=Fixture(mapOf("Authorization" to "synthetic fixture"))
        assertFailsWith<MkrResolutionException> {resolveProbeMetadata(MkrCatalog(backend),"abcdefghijk",legacy=false)}
        assertEquals(1,backend.attempts)
    }
}
