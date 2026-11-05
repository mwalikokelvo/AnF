// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.app.Notification
import android.app.NotificationManager
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
        controller.search("generated")
        val manager=context.getSystemService(NotificationManager::class.java)
        fun notification()=manager.activeNotifications.firstOrNull{it.id==MkrPlaybackService.NOTIFICATION}?.notification
        var remote: MediaController?=null
        val destroyed=CompletableDeferred<Unit>()
        val callback=object : MediaController.Callback(){override fun onSessionDestroyed(){destroyed.complete(Unit)}}
        try {
            val token=MkrPlaybackService.start(activity,controller)
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
            context.stopService(Intent(context,MkrPlaybackService::class.java))
            remote?.unregisterCallback(callback)
            controller.close()
            instrumentation.runOnMainSync{activity.finish()}
        }
    }
}
