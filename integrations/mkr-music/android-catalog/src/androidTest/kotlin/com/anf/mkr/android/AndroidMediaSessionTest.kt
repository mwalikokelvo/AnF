// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.anf.mkr.*
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Actual framework MediaSession/MediaController, fake catalog/audio: no provider traffic. */
@RunWith(AndroidJUnit4::class)
class AndroidMediaSessionTest {
    private val context get()=InstrumentationRegistry.getInstrumentation().context
    private val first=MkrTrack("abcdefghijk","Generated first","Fixture")
    private val second=MkrTrack("lmnopqrstuv","Generated second","Fixture")
    private inner class Backend : CatalogBackend {
        val requests=AtomicInteger()
        override suspend fun search(query: String)=listOf(first,second)
        override suspend fun streams(videoId: String): List<Pair<Int,String>> {
            requests.incrementAndGet();return listOf(140 to "https://r1.googlevideo.com/generated-fixture")
        }
    }
    private class Audio : NativePlayback {
        @Volatile var state=NativePlaybackState()
        @Volatile var changed: (() -> Unit)?=null
        val starts=AtomicInteger();val releases=AtomicInteger()
        private var lease: AndroidMediaLease?=null
        override suspend fun prepare(track: MkrTrack, lease: AndroidMediaLease, positionMs: Long) {
            lease.checkActive();this.lease=lease;state=NativePlaybackState(false,positionMs,120000)
        }
        override suspend fun playIfCurrent(permit: () -> Boolean): Boolean {
            if(!permit())return false
            lease!!.checkActive();starts.incrementAndGet();state=state.copy(playing=true);changed?.invoke();return true
        }
        override suspend fun pauseAndRelease(): NativePlaybackState {
            val old=state;lease?.close();lease=null;state=state.copy(playing=false,buffering=false);changed?.invoke();return old.copy(playing=false,buffering=false)
        }
        override suspend fun snapshot()=state
        override suspend fun seek(positionMs: Long) {state=state.copy(positionMs=positionMs);changed?.invoke()}
        override suspend fun setStateListener(listener: (() -> Unit)?) {changed=listener}
        override suspend fun release() {changed=null;pauseAndRelease();releases.incrementAndGet()}
    }
    private suspend fun until(condition: () -> Boolean) {withTimeout(8000){while(!condition())delay(20)}}
    private fun guardSandbox(){assertEquals("com.anf.mkr.catalog.test",context.packageName)}
    @Test fun systemControlsHonorHandoffAndPublishMetadataAndPosition() = runBlocking {
        guardSandbox()
        val backend=Backend();val audio=Audio();val requested=CompletableDeferred<Unit>();val allow=CompletableDeferred<Boolean>()
        val controller=AndroidPlaybackController(MkrCatalog(backend),audio,{requested.complete(Unit);allow.await()},{})
        controller.search("fixture")
        val owner=AndroidMediaSession.create(context,controller)
        try {
            owner.activate();val remote=MediaController(context,owner.token)
            remote.transportControls.play();withTimeout(8000){requested.await()}
            assertEquals(0,backend.requests.get());assertEquals(0,audio.starts.get())
            allow.complete(true)
            until {remote.playbackState?.state==PlaybackState.STATE_PLAYING}
            assertEquals(first.id,remote.metadata.getString(MediaMetadata.METADATA_KEY_MEDIA_ID))
            remote.transportControls.seekTo(4321)
            until {remote.playbackState?.position==4321L}
            remote.transportControls.skipToNext()
            until {remote.metadata?.getString(MediaMetadata.METADATA_KEY_MEDIA_ID)==second.id}
            remote.transportControls.skipToPrevious()
            until {remote.metadata?.getString(MediaMetadata.METADATA_KEY_MEDIA_ID)==first.id}
            remote.transportControls.pause()
            until {remote.playbackState?.state==PlaybackState.STATE_PAUSED}
            val count=backend.requests.get()
            remote.transportControls.playFromMediaId("not-selected",null)
            until {remote.playbackState?.state==PlaybackState.STATE_ERROR}
            assertEquals(count,backend.requests.get())
            remote.transportControls.playFromUri(Uri.parse("https://private.invalid/token"),null)
            delay(200);assertEquals(count,backend.requests.get())
            assertFalse(remote.playbackState.errorMessage.toString().contains("private.invalid"))
        } finally {owner.close()}
        assertEquals(1,audio.releases.get())
    }
    @Test fun deniedHandoffCannotStartAndCancelledOwnerReleasesSession() = runBlocking {
        guardSandbox()
        val backend=Backend();val audio=Audio()
        val controller=AndroidPlaybackController(MkrCatalog(backend),audio,{false},{})
        controller.search("fixture")
        val owner=AndroidMediaSession.create(context,controller)
        val remote=MediaController(context,owner.token);val destroyed=CompletableDeferred<Unit>()
        val callback=object : MediaController.Callback(){override fun onSessionDestroyed(){destroyed.complete(Unit)}}
        remote.registerCallback(callback,Handler(Looper.getMainLooper()))
        try {
            owner.activate();remote.transportControls.play()
            until {remote.playbackState?.state==PlaybackState.STATE_ERROR}
            assertEquals("Music command unavailable.",remote.playbackState.errorMessage.toString())
            assertEquals(0,backend.requests.get());assertEquals(0,audio.starts.get())
            val cleanup=launch(start=CoroutineStart.UNDISPATCHED){try{awaitCancellation()}finally{owner.close()}}
            cleanup.cancelAndJoin();withTimeout(8000){destroyed.await()}
            remote.transportControls.play();delay(200)
            assertEquals(0,backend.requests.get());assertEquals(1,audio.releases.get())
        } finally {owner.close();remote.unregisterCallback(callback)}
    }
    @Test fun decoderEventsPublishBufferingAndFailuresWithoutPolling() = runBlocking {
        guardSandbox()
        val backend=Backend();val audio=Audio()
        val controller=AndroidPlaybackController(MkrCatalog(backend),audio,{true},{})
        controller.search("fixture");val owner=AndroidMediaSession.create(context,controller)
        try {
            owner.activate();val remote=MediaController(context,owner.token)
            remote.transportControls.play();until {remote.playbackState?.state==PlaybackState.STATE_PLAYING}
            audio.state=audio.state.copy(playing=false,buffering=true);audio.changed!!.invoke()
            until {remote.playbackState?.state==PlaybackState.STATE_BUFFERING}
            audio.state=audio.state.copy(playing=true,buffering=false);audio.changed!!.invoke()
            until {remote.playbackState?.state==PlaybackState.STATE_PLAYING}
            audio.state=audio.state.copy(playing=false,failed=true);audio.changed!!.invoke()
            until {remote.playbackState?.state==PlaybackState.STATE_ERROR}
            assertEquals("Music playback unavailable.",remote.playbackState.errorMessage.toString())
        } finally {owner.close()}
        assertNull(audio.changed)
    }
}
