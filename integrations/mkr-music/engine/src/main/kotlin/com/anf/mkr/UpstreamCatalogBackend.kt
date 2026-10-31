// SPDX-License-Identifier: MIT
package com.anf.mkr

import com.music.innertube.YouTube
import com.music.innertube.models.SongItem
import io.ktor.client.plugins.ResponseException

/** Pinned GPL core adapter. No app/Hilt/lyrics module or fallback credentials. */
class UpstreamCatalogBackend(private val legacyDiagnostic: Boolean = false) : CatalogBackend, AutoCloseable {
    private val primary = lazy { PrimaryStreamResolver() }
    override suspend fun search(query: String): List<MkrTrack> {
        // This prototype has no login/account import path. Do not read cookies,
        // Windows browser profiles, Android private sandboxes or user API keys.
        val page = YouTube.search(query, YouTube.SearchFilter.FILTER_SONG).getOrElse {
            val reason = if (it is ResponseException) "HTTP ${it.response.status.value}" else it.javaClass.simpleName
            throw IllegalStateException("MKR catalog search is unavailable ($reason). No alternate player was opened.")
        }
        return page.items.filterIsInstance<SongItem>().map { song ->
            MkrTrack(song.id, song.title, song.artists.joinToString(", ") { it.name })
        }
    }

    override suspend fun streams(videoId: String): List<Pair<Int, String>> =
        LegacyNewPipeResolver.streams(videoId)

    override suspend fun candidates(videoId: String): List<StreamCandidate> {
        if (legacyDiagnostic) return streams(videoId).map { legacyCandidate(it.first,it.second) }
        return try { primary.value.resolve(videoId) }
        catch (error: UnsatisfiedLinkError) { throw MkrResolutionException(ResolutionReason.NATIVE_ENGINE_UNAVAILABLE) }
    }

    override fun close() { if (primary.isInitialized()) primary.value.close() }
}
