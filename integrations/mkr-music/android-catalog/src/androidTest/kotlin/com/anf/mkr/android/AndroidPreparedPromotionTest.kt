// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.app.ActivityManager
import android.app.NotificationManager
import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.anf.mkr.*
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AndroidPreparedPromotionTest {
    @Suppress("DEPRECATION")
    @Test fun invalidSelectionAndDeniedHandoffCannotPromote() = runBlocking {
        val instrumentation=InstrumentationRegistry.getInstrumentation();val context=instrumentation.context
        assertEquals("com.anf.mkr.catalog.test",context.packageName)
        val activity=instrumentation.startActivitySync(Intent(context,MkrNativeQaActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val resolved=AtomicInteger();val handoffs=AtomicInteger();val decoders=AtomicInteger();val closed=AtomicInteger()
        val backend=object : CatalogBackend {
            override suspend fun search(query: String)=listOf(MkrTrack("abcdefghijk","Denied fixture","AnF QA"))
            override suspend fun streams(videoId: String): List<Pair<Int,String>> {resolved.incrementAndGet();error("Unexpected resolution")}
        }
        val native=DeferredNativePlayback.create{decoders.incrementAndGet();Media3Playback.create(context,muted=true)}
        val controller=AndroidPlaybackController(MkrCatalog(backend),native,{handoffs.incrementAndGet();false},{closed.incrementAndGet()})
        var lease: AndroidMkrPreparedConnection?=null
        try {
            lease=MkrPlaybackService.prepare(activity,controller);lease.search("generated")
            for(id in listOf("unknown-id","abcdefghijk")) {
                try {lease.control("play",id);fail("Unapproved play succeeded")}
                catch(expected: IllegalStateException){ /* Safe native rejection. */ }
            }
            assertEquals("Only the selected track may ask for handoff",1,handoffs.get())
            assertEquals(0,resolved.get());assertEquals(0,decoders.get())
            assertTrue(context.getSystemService(ActivityManager::class.java).getRunningServices(Int.MAX_VALUE).none{it.service.className==MkrPlaybackService::class.java.name&&it.foreground})
            assertTrue(context.getSystemService(NotificationManager::class.java).activeNotifications.none{it.id==MkrPlaybackService.NOTIFICATION})
            lease.close();withTimeout(8000){while(closed.get()!=1)delay(20)}
        } finally {lease?.close();context.stopService(Intent(context,MkrPlaybackService::class.java));controller.close();instrumentation.runOnMainSync{activity.finish()}}
    }
    @Suppress("DEPRECATION")
    @Test fun cancelledResolutionAfterPromotionLeavesNoIdleForegroundOwner() = runBlocking {
        val instrumentation=InstrumentationRegistry.getInstrumentation();val context=instrumentation.context
        assertEquals("com.anf.mkr.catalog.test",context.packageName)
        val activity=instrumentation.startActivitySync(Intent(context,MkrNativeQaActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val entered=CompletableDeferred<Unit>();val decoders=AtomicInteger();val closed=AtomicInteger()
        val backend=object : CatalogBackend {
            override suspend fun search(query: String)=listOf(MkrTrack("abcdefghijk","Cancelled fixture","AnF QA"))
            override suspend fun streams(videoId: String): List<Pair<Int,String>> {entered.complete(Unit);awaitCancellation()}
        }
        val native=DeferredNativePlayback.create{decoders.incrementAndGet();Media3Playback.create(context,muted=true)}
        val controller=AndroidPlaybackController(MkrCatalog(backend),native,{true},{closed.incrementAndGet()})
        var lease: AndroidMkrPreparedConnection?=null
        try {
            val client=MkrPlaybackService.prepare(activity,controller);lease=client;client.search("generated")
            supervisorScope {
                val pending=async{client.control("play","abcdefghijk")}
                try {
                    withTimeout(8000){entered.await()}
                    assertTrue("Resolution must follow native foreground promotion",context.getSystemService(ActivityManager::class.java).getRunningServices(Int.MAX_VALUE).any{it.service.className==MkrPlaybackService::class.java.name&&it.foreground})
                    // NotificationManager enqueues publication after startForeground returns.
                    // Keep resolution suspended while observing the actual system notification.
                    withTimeout(8000){while(context.getSystemService(NotificationManager::class.java).activeNotifications.none{it.id==MkrPlaybackService.NOTIFICATION})delay(20)}
                    assertTrue(context.getSystemService(NotificationManager::class.java).activeNotifications.any{it.id==MkrPlaybackService.NOTIFICATION})
                    assertEquals(0,decoders.get())
                    pending.cancel();client.close();withTimeout(8000){pending.join()}
                    withTimeout(8000){while(closed.get()!=1||context.getSystemService(ActivityManager::class.java).getRunningServices(Int.MAX_VALUE).any{it.service.className==MkrPlaybackService::class.java.name})delay(20)}
                    assertTrue(pending.isCancelled);assertEquals(0,decoders.get())
                    withTimeout(8000){while(context.getSystemService(NotificationManager::class.java).activeNotifications.any{it.id==MkrPlaybackService.NOTIFICATION})delay(20)}
                    assertTrue(context.getSystemService(NotificationManager::class.java).activeNotifications.none{it.id==MkrPlaybackService.NOTIFICATION})
                } finally {pending.cancelAndJoin()}
            }
        } finally {lease?.close();context.stopService(Intent(context,MkrPlaybackService::class.java));controller.close();instrumentation.runOnMainSync{activity.finish()}}
    }
}
