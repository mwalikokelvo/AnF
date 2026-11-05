// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.content.Intent
import java.security.MessageDigest
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
            val remote=MediaController(context,owner.token)
            remote.transportControls.play();delay(200)
            assertEquals(0,backend.requests.get());assertEquals(0,audio.starts.get())
            assertFalse(requested.isCompleted)
            owner.activate()
            remote.transportControls.play();withTimeout(8000){requested.await()}
            assertEquals(0,backend.requests.get());assertEquals(0,audio.starts.get())
            allow.complete(true)
            until {remote.playbackState?.state==PlaybackState.STATE_PLAYING}
            assertEquals(first.id,remote.metadata?.getString(MediaMetadata.METADATA_KEY_MEDIA_ID))
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
            assertFalse(remote.playbackState?.errorMessage.toString().contains("private.invalid"))
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
            assertEquals("Music command unavailable.",remote.playbackState?.errorMessage.toString())
            assertEquals(0,backend.requests.get());assertEquals(0,audio.starts.get())
            val cleanup=launch(start=CoroutineStart.UNDISPATCHED){try{awaitCancellation()}finally{owner.close()}}
            cleanup.cancelAndJoin();withTimeout(8000){destroyed.await()}
            remote.transportControls.play();delay(200)
            assertEquals(0,backend.requests.get());assertEquals(1,audio.releases.get())
        } finally {owner.close();remote.unregisterCallback(callback)}
    }
    @Test fun actualMedia3EventsReachSystemControlsUsingOnlyGeneratedAac() = runBlocking {
        guardSandbox()
        val data=context.assets.open("generated-aac.m4a").use{it.readBytes()}
        val hash=MessageDigest.getInstance("SHA-256").digest(data).joinToString(""){"%02x".format(it)}
        assertEquals("801e0e26a6f69c415fd06370b0fed08688802f031ba2da13046e1646aaaafd0a",hash)
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val activity=instrumentation.startActivitySync(Intent(context,MkrNativeQaActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val cdn=MkrNativePlaybackTest.GeneratedCdn(data)
        val audio=Media3Playback.create(activity,muted=true)
        val controller=AndroidPlaybackController(MkrCatalog(Backend()),audio,{true},{},leaseFactory={stream ->
            AndroidMediaLease(MkrStream(stream.url,stream.mimeType,stream.headers,true,true,65536,
                data.size.toLong(),System.currentTimeMillis()+120000),connect=cdn::connect)
        })
        controller.search("fixture")
        val owner=AndroidMediaSession.create(activity,controller)
        try {
            owner.activate();val remote=MediaController(activity,owner.token)
            remote.transportControls.play()
            until {remote.playbackState?.state==PlaybackState.STATE_PLAYING && (remote.metadata?.getLong(MediaMetadata.METADATA_KEY_DURATION)?:0)>=3500}
            assertEquals(first.id,remote.metadata?.getString(MediaMetadata.METADATA_KEY_MEDIA_ID))
            remote.transportControls.seekTo(1000)
            until {(remote.playbackState?.position?:0)>=1000}
            remote.transportControls.pause()
            until {remote.playbackState?.state==PlaybackState.STATE_PAUSED}
            val position=remote.playbackState!!.position
            delay(150);assertEquals(position,remote.playbackState!!.position)
            assertTrue(cdn.requests.isNotEmpty())
        } finally {owner.close();instrumentation.runOnMainSync{activity.finish()}}
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
            assertEquals("Music playback unavailable.",remote.playbackState?.errorMessage.toString())
        } finally {owner.close()}
        assertNull(audio.changed)
    }
}
