// SPDX-License-Identifier: MIT
package com.anf.mkr

import com.music.innertube.NewPipeExtractor
import kotlinx.coroutines.CancellationException
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.stream.StreamInfo

/**
 * Diagnostic adapter for MKR's legacy NewPipe helper, NOT its primary player.
 * Unlike the old helper, do not erase verification/network/parser failures into
 * an empty list and then misleadingly describe them as a missing audio codec.
 * No own retry, guest-session rotation, alternate identity or fallback service.
 */
internal object LegacyNewPipeResolver {
    fun streams(videoId: String): List<Pair<Int, String>> {
        try {
            NewPipeExtractor.init()
            val info = StreamInfo.getInfo(NewPipe.getService(0), "https://www.youtube.com/watch?v=$videoId")
            val audio = info.audioStreams.mapNotNull { stream ->
                stream.itagItem?.id?.let { it to stream.content }
            }
            if (audio.isEmpty()) throw MkrResolutionException(ResolutionReason.UNSUPPORTED_AUDIO)
            return audio
        } catch (error: CancellationException) {
            throw error
        } catch (error: MkrResolutionException) {
            throw error
        } catch (error: Exception) {
            throw MkrResolutionException(resolutionReason(error))
        }
    }
}
