// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.anf.mkr.MkrTrack
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Platform media controls owned by the approved controller; no raw player/URI bridge.
 * Inactive until activate(). Foreground service/notification and app wiring are separate.
 * This owner closes the supplied controller; callers must not share it with another owner.
 */
internal class AndroidMediaSession private constructor(context: Context,
    private val controller: AndroidPlaybackController,
    private val playbackAllowed: () -> Boolean) {
    private val session=MediaSession(context.applicationContext,"AnF MKR Music")
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
    private val closed=AtomicBoolean()
    private val closeGate=Mutex()
    private var revision=0L
    private var failedRevision: Long?=null
    val token: MediaSession.Token get()=session.sessionToken
    private val actions=PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or
        PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_STOP or
        PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS or PlaybackState.ACTION_SEEK_TO
    private val allowedActions get()=if(playbackAllowed())actions else PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_STOP
    init {
        session.setCallback(object : MediaSession.Callback() {
            override fun onPlay()=command(playback=true) { controller.play() }
            override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?)=command(playback=true) {
                require(!mediaId.isNullOrEmpty() && mediaId.length<=256)
                controller.play(mediaId)
            }
            override fun onPause()=command { controller.pause(); Unit }
            override fun onStop()=command { controller.pause(); Unit }
            override fun onSeekTo(pos: Long)=command { controller.seek(pos) }
            override fun onSkipToNext()=command(playback=true) { controller.step(1) }
            override fun onSkipToPrevious()=command(playback=true) { controller.step(-1) }
            // URI/search/custom actions intentionally have no implementation.
        },Handler(Looper.getMainLooper()))
    }
    private fun command(playback: Boolean=false, action: suspend () -> Unit) {
        if(closed.get() || !session.isActive) return
        scope.launch {
            try { execute(playback,action) }
            catch(error: CancellationException) { throw error }
            catch(error: Exception) { /* execute publishes a safe system error. */ }
        }
    }
    private suspend fun execute(playback: Boolean=false, action: suspend () -> Unit): AndroidPlaybackState = withContext(Dispatchers.Main.immediate) {
        check(!closed.get() && session.isActive){"Music session unavailable."}
        val ticket=++revision
        try {check(!playback || playbackAllowed()){"Music playback is not active."};action();publish(ticket,recover=true);controller.status()}
        catch(error: CancellationException){throw error}
        catch(error: Exception){failure(ticket);throw PlaybackCommandFailure("COMMAND_UNAVAILABLE")}
    }
    /** Shared by native UI and OS callbacks; never bypasses controller policy. */
    suspend fun control(command: String, id: String?=null, positionMs: Long?=null): AndroidPlaybackState = execute(command in setOf("play","previous","next")) {
        when(command) {
            "play" -> {require(id==null || id.isNotEmpty() && id.length<=256);controller.play(id)}
            "pause" -> {controller.pause();Unit}
            "previous" -> controller.step(-1)
            "next" -> controller.step(1)
            "seek" -> {require(positionMs!=null && positionMs>=0);controller.seek(positionMs)}
            else -> throw IllegalArgumentException("Unsupported music command.")
        }
    }
    /** Native prepared-page entry; controller selection and audio acknowledgement still apply. */
    internal suspend fun playPrepared(id: String?): AndroidPlaybackState = execute {
        require(id==null || id.isNotEmpty() && id.length<=256)
        controller.play(id)
    }
    private fun changed() {
        if(closed.get()) return
        scope.launch {
            val ticket=revision // Observe revision on the owning main dispatcher.
            try { publish(ticket) }
            catch(error: CancellationException) { throw error }
            catch(error: Exception) { failure(ticket) }
        }
    }
    private fun failure(ticket: Long) {
        if(closed.get() || ticket!=revision) return
        failedRevision=ticket
        session.setPlaybackState(PlaybackState.Builder().setActions(allowedActions)
            .setState(PlaybackState.STATE_ERROR,0,0f,SystemClock.elapsedRealtime())
            .setErrorMessage("Music command unavailable.").build())
    }
    private suspend fun publish(ticket: Long, recover: Boolean=false) {
        val state=controller.status()
        if(closed.get() || ticket!=revision) return
        if(failedRevision==ticket && !recover) return
        if(recover) failedRevision=null
        val audio=state.audio
        val phase=when {
            audio.failed -> PlaybackState.STATE_ERROR
            audio.buffering -> PlaybackState.STATE_BUFFERING
            audio.playing -> PlaybackState.STATE_PLAYING
            state.track==null -> PlaybackState.STATE_NONE
            audio.durationMs>0 && audio.positionMs>=audio.durationMs -> PlaybackState.STATE_STOPPED
            else -> PlaybackState.STATE_PAUSED
        }
        session.setMetadata(MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_MEDIA_ID,state.track?.id)
            .putString(MediaMetadata.METADATA_KEY_TITLE,state.track?.title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST,state.track?.artist)
            .putLong(MediaMetadata.METADATA_KEY_DURATION,audio.durationMs).build())
        val playback=PlaybackState.Builder().setActions(allowedActions)
            .setState(phase,audio.positionMs,if(audio.playing)1f else 0f,SystemClock.elapsedRealtime())
        if(audio.failed) { failedRevision=ticket; playback.setErrorMessage("Music playback unavailable.") }
        session.setPlaybackState(playback.build())
    }
    suspend fun activate() = withContext(Dispatchers.Main.immediate) {
        check(!closed.get()); publish(revision,recover=true); session.isActive=true
    }
    /** Native app browsing; platform URI/search playback callbacks remain disabled. */
    suspend fun search(query: String): List<MkrTrack> = withContext(Dispatchers.Main.immediate) {
        check(!closed.get() && session.isActive){"Music session unavailable."}
        val tracks=controller.search(query)
        check(!closed.get() && session.isActive){"Music session unavailable."}
        tracks
    }
    suspend fun status(): AndroidPlaybackState = withContext(Dispatchers.Main.immediate) {
        check(!closed.get() && session.isActive){"Music session unavailable."}
        controller.status()
    }
    /** UI callers may refresh after a command; native decoder events refresh automatically. */
    suspend fun refresh() = withContext(Dispatchers.Main.immediate) {
        check(!closed.get()); publish(revision,recover=true)
    }
    suspend fun close() = withContext(NonCancellable) {
        closeGate.withLock {
            if(!closed.compareAndSet(false,true)) return@withLock
            scope.cancel()
            withContext(Dispatchers.Main.immediate) {
                try { controller.close() }
                finally { session.isActive=false; session.setCallback(null); session.release() }
            }
        }
    }
    companion object {
        suspend fun create(context: Context, controller: AndroidPlaybackController, playbackAllowed: () -> Boolean={true}): AndroidMediaSession =
            withContext(Dispatchers.Main.immediate) {
                val owner=AndroidMediaSession(context,controller,playbackAllowed)
                try { controller.setStateListener { owner.changed() }; owner }
                catch(error: Exception) { owner.close(); throw error }
            }
    }
}
