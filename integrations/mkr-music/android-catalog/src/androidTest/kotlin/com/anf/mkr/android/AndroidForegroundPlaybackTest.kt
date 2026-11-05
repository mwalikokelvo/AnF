// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.app.Notification
import android.app.NotificationManager
import android.app.ActivityManager
import android.content.Intent
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.anf.mkr.*
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Actual Android FGS, notification, MediaSession and muted Media3. Synthetic bytes only. */
@RunWith(AndroidJUnit4::class)
class AndroidForegroundPlaybackTest {
    private suspend fun until(stage: String, predicate: () -> Boolean) {
        try {withTimeout(8000){while(!predicate())delay(20)}}
        catch(error: TimeoutCancellationException){throw AssertionError("Timed out waiting for $stage",error)}
    }
    @Suppress("DEPRECATION")
    @Test fun stoppedBoundOwnerRejectsReplacementUntilUiDetaches() = runBlocking {
        val instrumentation=InstrumentationRegistry.getInstrumentation();val context=instrumentation.context
        assertEquals("com.anf.mkr.catalog.test",context.packageName)
        val activity=instrumentation.startActivitySync(Intent(context,MkrNativeQaActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val backend=object : CatalogBackend {
            override suspend fun search(query: String): List<MkrTrack> = error("Unexpected catalog access")
            override suspend fun streams(videoId: String): List<Pair<Int,String>> = error("Unexpected stream access")
        }
        class Audio : NativePlayback {
            val released=AtomicInteger()
            override suspend fun prepare(track: MkrTrack, lease: AndroidMediaLease, positionMs: Long) {error("Unexpected decode")}
            override suspend fun playIfCurrent(permit: () -> Boolean): Boolean = error("Unexpected play")
            override suspend fun pauseAndRelease()=NativePlaybackState()
            override suspend fun snapshot()=NativePlaybackState()
            override suspend fun seek(positionMs: Long) {error("Unexpected seek")}
            override suspend fun release(){released.incrementAndGet()}
        }
        val audio=Audio();val rejected=Audio();val successor=Audio()
        fun prepared(a: Audio)=AndroidPlaybackController(MkrCatalog(backend),a,{false},{})
        val controller=prepared(audio);val replacement=prepared(rejected);val next=prepared(successor)
        var client: AndroidMkrConnection?=null
        val notifications=context.getSystemService(NotificationManager::class.java)
        val activities=context.getSystemService(ActivityManager::class.java)
        fun stopped()=activities.getRunningServices(Int.MAX_VALUE).none{it.service.className==MkrPlaybackService::class.java.name}
        fun stopFromNotification()=notifications.activeNotifications.first{it.id==MkrPlaybackService.NOTIFICATION}.notification.actions[3].actionIntent.send()
        try {
            val token=MkrPlaybackService.start(activity,controller)
            val first=AndroidMkrConnection.connect(activity,token);client=first
            assertNull(first.status().track)
            stopFromNotification();until("bound owner released"){audio.released.get()==1}
            try {first.status();fail("Stopped Binder remained available")}
            catch(expected: IllegalStateException){assertEquals("Music service unavailable.",expected.message)}
            try {MkrPlaybackService.start(activity,replacement);fail("Replaced still-bound stopped service")}
            catch(expected: IllegalStateException){assertEquals("Music service already owned.",expected.message)}
            assertEquals(1,rejected.released.get())
            first.close();until("bound service destruction"){stopped()}
            val nextToken=MkrPlaybackService.start(activity,next)
            assertNotEquals(token,nextToken)
            val second=AndroidMkrConnection.connect(activity,nextToken);client=second
            assertNull(second.status().track)
            stopFromNotification();until("successor release"){successor.released.get()==1}
            second.close();until("successor destruction"){stopped()}
            assertEquals(1,audio.released.get());assertEquals(1,rejected.released.get());assertEquals(1,successor.released.get())
        } finally {
            client?.close();context.stopService(Intent(context,MkrPlaybackService::class.java))
            controller.close();replacement.close();next.close()
            instrumentation.runOnMainSync{activity.finish()}
        }
    }
    @Test fun generatedPlaybackSurvivesActivityAndStopsFromOwnNotification() = runBlocking {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val context=instrumentation.context
        assertEquals("com.anf.mkr.catalog.test",context.packageName)
        val activity=instrumentation.startActivitySync(Intent(context,MkrNativeQaActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val data=context.assets.open("generated-aac.m4a").use{it.readBytes()}
        assertEquals("801e0e26a6f69c415fd06370b0fed08688802f031ba2da13046e1646aaaafd0a",
            MessageDigest.getInstance("SHA-256").digest(data).joinToString(""){"%02x".format(it)})
        val requests=AtomicInteger();val closed=AtomicInteger();val acknowledged=CompletableDeferred<Boolean>()
        val requested=CompletableDeferred<Unit>()
        val backend=object : CatalogBackend {
            override suspend fun search(query: String)=listOf(MkrTrack("abcdefghijk","Generated service fixture","AnF QA"))
            override suspend fun streams(videoId: String): List<Pair<Int,String>> {
                requests.incrementAndGet();return listOf(140 to "https://r1.googlevideo.com/generated-fixture")
            }
        }
        val cdn=MkrNativePlaybackTest.GeneratedCdn(data)
        val audio=Media3Playback.create(context,muted=true)
        val controller=AndroidPlaybackController(MkrCatalog(backend),audio,
            {requested.complete(Unit);acknowledged.await()},{closed.incrementAndGet()},leaseFactory={stream ->
                AndroidMediaLease(MkrStream(stream.url,stream.mimeType,stream.headers,true,true,65536,
                    data.size.toLong(),System.currentTimeMillis()+120000),connect=cdn::connect)
            })
        val manager=context.getSystemService(NotificationManager::class.java)
        fun notification()=manager.activeNotifications.firstOrNull{it.id==MkrPlaybackService.NOTIFICATION}?.notification
        var remote: MediaController?=null
        var browsing: AndroidMkrConnection?=null
        val destroyed=CompletableDeferred<Unit>()
        val callback=object : MediaController.Callback(){override fun onSessionDestroyed(){destroyed.complete(Unit)}}
        try {
            val token=MkrPlaybackService.start(activity,controller)
            val client=AndroidMkrConnection.connect(activity,token);browsing=client
            assertEquals("Generated service fixture",client.search("generated").single().title)
            assertNull(client.status().track);assertEquals(0,requests.get())
            // A cached native Binder must still reject an unrelated framework token.
            val unrelated=withContext(Dispatchers.Main.immediate){MediaSession(context,"Unrelated QA token")}
            try {
                try {AndroidMkrConnection.connect(activity,unrelated.sessionToken).close();fail("Accepted wrong session token")}
                catch(expected: IllegalStateException){assertEquals("Music service unavailable.",expected.message)}
            } finally {withContext(Dispatchers.Main.immediate){unrelated.release()}}
            val active=MediaController(context,token)
            remote=active
            active.registerCallback(callback,Handler(Looper.getMainLooper()))
            active.transportControls.play();withTimeout(8000){requested.await()}
            assertEquals(0,requests.get());assertTrue(cdn.requests.isEmpty())
            acknowledged.complete(true)
            until("foreground decoded play") {active.playbackState?.state==PlaybackState.STATE_PLAYING &&
                (active.metadata?.getLong(MediaMetadata.METADATA_KEY_DURATION)?:0)>=3500}
            until("media notification") {notification()?.extras?.getString(Notification.EXTRA_TITLE)=="Generated service fixture"}
            val playing=notification()!!
            assertTrue(playing.flags and Notification.FLAG_FOREGROUND_SERVICE !=0)
            assertEquals("android.app.Notification\$MediaStyle",playing.extras.getString(Notification.EXTRA_TEMPLATE))
            @Suppress("DEPRECATION")
            assertEquals(token,playing.extras.getParcelable<MediaSession.Token>(Notification.EXTRA_MEDIA_SESSION))
            assertEquals(4,playing.actions.size)
            assertFalse(playing.extras.toString().contains("googlevideo"))
            // Finish the only Activity, then resume through the actual notification action.
            active.transportControls.pause()
            until("notification paused") {active.playbackState?.state==PlaybackState.STATE_PAUSED && notification()?.actions?.get(1)?.title.toString()=="Play"}
            assertEquals("abcdefghijk",client.status().track?.id)
            client.close()
            try {client.status();fail("Detached browser remained usable")}
            catch(expected: IllegalStateException){assertEquals("Music connection closed.",expected.message)}
            instrumentation.runOnMainSync{activity.finish()}
            val position=active.playbackState!!.position
            notification()!!.actions[1].actionIntent.send()
            until("background notification resume") {active.playbackState?.state==PlaybackState.STATE_PLAYING}
            until("background progress") {(active.playbackState?.position?:0)>position+100}
            context.startService(Intent(context,MkrPlaybackService::class.java).setAction("com.anf.mkr.STOP").putExtra("owner","stale-owner"))
            delay(150);assertFalse(destroyed.isCompleted);assertNotNull(notification())
            notification()!!.actions[3].actionIntent.send()
            withTimeout(8000){destroyed.await()}
            until("notification and controller cleanup") {notification()==null && closed.get()==1}
            val count=requests.get();active.transportControls.play();delay(150)
            assertEquals(count,requests.get());assertEquals(1,closed.get())
            assertTrue(cdn.requests.isNotEmpty())
        } finally {
            browsing?.close()
            context.stopService(Intent(context,MkrPlaybackService::class.java))
            remote?.unregisterCallback(callback)
            controller.close()
            instrumentation.runOnMainSync{activity.finish()}
        }
    }
}
