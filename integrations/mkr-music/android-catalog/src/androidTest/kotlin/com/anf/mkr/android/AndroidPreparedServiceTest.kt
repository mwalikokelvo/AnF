// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.app.ActivityManager
import android.app.NotificationManager
import android.content.Intent
import android.media.session.MediaController
import android.media.session.PlaybackState
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.anf.mkr.*
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Actual bound service/Binder/session, no provider, decoder or foreground startup. */
@RunWith(AndroidJUnit4::class)
class AndroidPreparedServiceTest {
    private suspend fun until(condition: () -> Boolean)=withTimeout(8000){while(!condition())delay(20)}
    @Suppress("DEPRECATION")
    @Test fun browsingHasNoForegroundAndLastDetachAllowsColdSuccessor() = runBlocking {
        val instrumentation=InstrumentationRegistry.getInstrumentation();val context=instrumentation.context
        assertEquals("com.anf.mkr.catalog.test",context.packageName)
        val activity=instrumentation.startActivitySync(Intent(context,MkrNativeQaActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val closed=AtomicInteger();val decoders=AtomicInteger();val resolved=AtomicInteger();val handoffs=AtomicInteger()
        val activities=context.getSystemService(ActivityManager::class.java);val notifications=context.getSystemService(NotificationManager::class.java)
        fun services()=activities.getRunningServices(Int.MAX_VALUE).filter{it.service.className==MkrPlaybackService::class.java.name}
        var previous: android.media.session.MediaSession.Token?=null
        try {
            repeat(2){cycle ->
                val backend=object : CatalogBackend {
                    override suspend fun search(query: String)=listOf(MkrTrack("abcdefghijk","Cold fixture","AnF QA"))
                    override suspend fun streams(videoId: String): List<Pair<Int,String>> {resolved.incrementAndGet();error("Unexpected resolution")}
                }
                val native=DeferredNativePlayback.create{decoders.incrementAndGet();Media3Playback.create(context,muted=true)}
                val controller=AndroidPlaybackController(MkrCatalog(backend),native,{handoffs.incrementAndGet();true},{closed.incrementAndGet()})
                var lease: AndroidMkrPreparedConnection?=null
                try {
                    lease=MkrPlaybackService.prepare(activity,controller)
                    assertEquals(1,services().size);assertFalse("Browsing must not start a foreground service",services().single().foreground)
                    assertTrue(notifications.activeNotifications.none{it.id==MkrPlaybackService.NOTIFICATION})
                    assertEquals(1,lease.search("generated").size);assertNull(lease.status().track)
                    assertEquals(0,decoders.get());assertEquals(0,resolved.get())
                    if(previous!=null)assertNotEquals(previous,lease.token);previous=lease.token
                    val remote=MediaController(context,lease.token)
                    remote.transportControls.playFromMediaId("abcdefghijk",null)
                    until{remote.playbackState?.state==PlaybackState.STATE_ERROR}
                    assertEquals("Unpromoted system control must not acknowledge audio",0,handoffs.get())
                    assertEquals(0,resolved.get());assertEquals(0,decoders.get())
                    assertTrue(notifications.activeNotifications.none{it.id==MkrPlaybackService.NOTIFICATION})
                    lease.close();lease.close()
                    until{closed.get()==cycle+1 && services().isEmpty()}
                    try {lease.status();fail("Closed preparation still usable")}
                    catch(expected: IllegalStateException){assertEquals("Music connection closed.",expected.message)}
                } finally {lease?.close();context.stopService(Intent(context,MkrPlaybackService::class.java));controller.close()}
            }
        } finally {instrumentation.runOnMainSync{activity.finish()}}
        assertEquals(2,closed.get());assertEquals(0,decoders.get())
    }
    @Suppress("DEPRECATION")
    @Test fun cancelledPreparedResultDeliveryDetachesAndReleases() = runBlocking {
        val instrumentation=InstrumentationRegistry.getInstrumentation();val context=instrumentation.context
        assertEquals("com.anf.mkr.catalog.test",context.packageName)
        val activity=instrumentation.startActivitySync(Intent(context,MkrNativeQaActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val closed=AtomicInteger()
        val backend=object : CatalogBackend {
            override suspend fun search(query: String): List<MkrTrack> = error("Unexpected search")
            override suspend fun streams(videoId: String): List<Pair<Int,String>> = error("Unexpected resolution")
        }
        val native=Media3Playback.createDeferred(context,muted=true)
        val controller=AndroidPlaybackController(MkrCatalog(backend),native,{false},{closed.incrementAndGet()})
        val delivery=ConcurrentLinkedQueue<Runnable>()
        val dispatcher=object : CoroutineDispatcher(){override fun dispatch(context: CoroutineContext, block: Runnable){delivery.add(block)}}
        val callers=CoroutineScope(SupervisorJob()+dispatcher)
        try {
            val pending=callers.async{MkrPlaybackService.prepare(activity,controller)}
            delivery.remove().run();until{delivery.isNotEmpty()}
            pending.cancel();delivery.remove().run();withTimeout(8000){pending.join()}
            assertTrue(pending.isCancelled)
            until{closed.get()==1 && context.getSystemService(ActivityManager::class.java).getRunningServices(Int.MAX_VALUE).none{it.service.className==MkrPlaybackService::class.java.name}}
            assertTrue(context.getSystemService(NotificationManager::class.java).activeNotifications.none{it.id==MkrPlaybackService.NOTIFICATION})
        } finally {callers.cancel();context.stopService(Intent(context,MkrPlaybackService::class.java));controller.close();instrumentation.runOnMainSync{activity.finish()}}
    }
}
