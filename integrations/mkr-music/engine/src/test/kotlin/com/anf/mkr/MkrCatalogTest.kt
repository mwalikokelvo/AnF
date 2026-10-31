// SPDX-License-Identifier: MIT
package com.anf.mkr

import kotlin.test.*
import kotlinx.coroutines.runBlocking

class MkrCatalogTest {
    private class Fixture : CatalogBackend {
        var queries = mutableListOf<String>()
        var ids = mutableListOf<String>()
        var tracks = listOf(MkrTrack("abcdefghijk", "Title", "Artist"))
        var sources = listOf(140 to "https://r1.googlevideo.com/audio?fixture=1")
        override suspend fun search(query: String): List<MkrTrack> { queries.add(query); return tracks }
        override suspend fun streams(videoId: String): List<Pair<Int, String>> { ids.add(videoId); return sources }
    }

    @Test fun invalidRequestsNeverReachAProvider() = runBlocking {
        val backend = Fixture(); val catalog = MkrCatalog(backend)
        for (query in listOf("", " ", "x".repeat(501), "hello\u0000")) assertFailsWith<IllegalArgumentException> { catalog.search(query) }
        assertFailsWith<IllegalArgumentException> { catalog.resolve("https://example.com", setOf(AudioContainer.M4A)) }
        assertFailsWith<IllegalArgumentException> { catalog.resolve("abcdefghijk", emptySet()) }
        assertTrue(backend.queries.isEmpty()); assertTrue(backend.ids.isEmpty())
    }

    @Test fun searchIsBoundedDeduplicatedAndUnicodeSafe() = runBlocking {
        val backend = Fixture()
        backend.tracks = listOf(MkrTrack("bad", "invalid", ""), MkrTrack("abcdefghijk", "x".repeat(999)+"😀", "a\u0000b"), MkrTrack("abcdefghijk", "duplicate", "")) +
            (0..150).map { MkrTrack(it.toString().padStart(11, '0'), "Song $it", "Artist") }
        val result = MkrCatalog(backend).search("  original question  ")
        assertEquals(listOf("original question"), backend.queries)
        assertEquals(100, result.size); assertEquals(100, result.distinctBy { it.id }.size)
        assertEquals("x".repeat(999), result.first().title); assertEquals("ab", result.first().artist)
    }

    @Test fun onlySupportedAudioContainersAndCdnUrlsAreReturned() = runBlocking {
        val backend = Fixture()
        backend.sources = listOf(18 to "https://r1.googlevideo.com/video", 140 to "http://r1.googlevideo.com/insecure", 140 to "https://r1.googlevideo.com.evil.invalid/audio", 251 to "https://r1.googlevideo.com/opus")
        val catalog = MkrCatalog(backend)
        assertFailsWith<IllegalStateException> { catalog.resolve("abcdefghijk", setOf(AudioContainer.M4A)) }
        val webm = catalog.resolve("abcdefghijk", setOf(AudioContainer.WEBM))
        assertEquals("audio/webm", webm.mimeType)
        backend.sources = listOf(140 to "https://r1.googlevideo.com/aac", 251 to "https://r1.googlevideo.com/opus")
        assertEquals("audio/mp4", catalog.resolve("abcdefghijk", AudioContainer.entries.toSet()).mimeType)
    }

    @Test fun authenticatedLocalAndFragmentUrlsAreRejected() {
        for (url in listOf("file:///private", "https://127.0.0.1/audio", "https://user:password@r1.googlevideo.com/audio", "https://r1.googlevideo.com:8443/audio", "https://r1.googlevideo.com/audio#fragment", "https://evil.invalid/audio")) assertFalse(MkrCatalog.permittedCdn(url))
        assertTrue(MkrCatalog.permittedCdn("https://r1.googlevideo.com:443/audio?fixture=1"))
    }

    @Test fun providerFailureNeverBecomesAnotherPlayerOrServiceFallback() = runBlocking {
        val backend = Fixture(); backend.sources = emptyList()
        assertFailsWith<IllegalStateException> { MkrCatalog(backend).resolve("abcdefghijk", setOf(AudioContainer.M4A)) }
        assertEquals(listOf("abcdefghijk"), backend.ids)
    }
}
