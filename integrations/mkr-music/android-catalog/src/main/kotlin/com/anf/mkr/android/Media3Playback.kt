// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.content.Context
import androidx.media3.common.*
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Created/accessed on the application main looper; owns a single native player. */
internal class Media3Playback private constructor(private val player: ExoPlayer) : NativePlayback {
    private var source: AndroidMediaLease?=null
    private var released=false
    override suspend fun prepare(track: com.anf.mkr.MkrTrack, lease: AndroidMediaLease, positionMs: Long) = onMain {
        check(!released)
        clear()
        lease.checkActive()
        val media=MediaItem.Builder().setMediaId(track.id).setUri(lease.receipt)
            .setMimeType(lease.stream.mimeType)
            .setMediaMetadata(MediaMetadata.Builder().setTitle(track.title).setArtist(track.artist).build()).build()
        val mediaSource=ProgressiveMediaSource.Factory(MkrMediaDataSource.Factory(lease))
            .setLoadErrorHandlingPolicy(DefaultLoadErrorHandlingPolicy(0)).createMediaSource(media)
        source=lease
        player.setMediaSource(mediaSource)
        player.seekTo(positionMs); player.prepare()
    }
    override suspend fun playIfCurrent(permit: () -> Boolean): Boolean = onMain {
        if(released || source==null || !permit()) false
        else { source!!.checkActive(); player.play(); true }
    }
    private fun state() = NativePlaybackState(player.isPlaying,player.currentPosition.coerceAtLeast(0),
        player.duration.takeIf { it!=C.TIME_UNSET && it>0 } ?: 0,player.playerError!=null)
    override suspend fun snapshot(): NativePlaybackState = onMain { check(!released); state() }
    override suspend fun pauseAndRelease(): NativePlaybackState = onMain {
        check(!released)
        val before=state()
        clear()
        check(!player.playWhenReady && !player.isPlaying)
        before.copy(playing=false)
    }
    override suspend fun seek(positionMs: Long) = onMain {
        check(!released); require(positionMs in 0..86_400_000); player.seekTo(positionMs)
    }
    private fun clear() {
        source?.close(); source=null
        player.pause(); player.stop(); player.clearMediaItems()
    }
    override suspend fun release() = onMain {
        if(!released) { clear(); player.release(); released=true }
    }
    private suspend fun <T> onMain(action: () -> T): T = withContext(Dispatchers.Main.immediate) { action() }
    companion object {
        suspend fun create(context: Context, muted: Boolean=false): Media3Playback = withContext(Dispatchers.Main.immediate) {
            val player=ExoPlayer.Builder(context.applicationContext)
                .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),true)
                .setHandleAudioBecomingNoisy(true).build()
            player.volume=if(muted)0f else 1f
            Media3Playback(player)
        }
    }
}
