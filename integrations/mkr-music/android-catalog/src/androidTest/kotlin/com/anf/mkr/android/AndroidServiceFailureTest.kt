// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.content.Intent
import android.app.NotificationManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.anf.mkr.*
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AndroidServiceFailureTest {
    @Test fun failedInitializationReleasesOnceAndAllowsSuccessor(): Unit = runBlocking {
        val instrumentation=InstrumentationRegistry.getInstrumentation();val context=instrumentation.context
        assertEquals("com.anf.mkr.catalog.test",context.packageName)
        val activity=instrumentation.startActivitySync(Intent(context,MkrNativeQaActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val backend=object : CatalogBackend {
            override suspend fun search(query: String): List<MkrTrack> = error("Unexpected network")
            override suspend fun streams(videoId: String): List<Pair<Int,String>> = error("Unexpected network")
        }
        val releases=AtomicInteger();val closes=AtomicInteger()
        val audio=object : NativePlayback {
            override suspend fun prepare(track: MkrTrack, lease: AndroidMediaLease, positionMs: Long){error("Unexpected play")}
            override suspend fun playIfCurrent(permit: () -> Boolean): Boolean = error("Unexpected play")
            override suspend fun pauseAndRelease()=NativePlaybackState()
            override suspend fun snapshot()=NativePlaybackState()
            override suspend fun seek(positionMs: Long){error("Unexpected seek")}
            override suspend fun setStateListener(listener: (() -> Unit)?){error("Injected listener setup failure")}
            override suspend fun release(){delay(100);releases.incrementAndGet()}
        }
        val failed=AndroidPlaybackController(MkrCatalog(backend),audio,{false},{closes.incrementAndGet()})
        var next: AndroidPlaybackController?=null
        try {
            try {MkrPlaybackService.start(activity,failed);fail("Accepted failed initialization")}
            catch(expected: IllegalStateException){assertEquals("Music service unavailable.",expected.message)}
            withTimeout(8000){while(releases.get()!=1||closes.get()!=1)delay(20)}
            next=AndroidPlaybackController(MkrCatalog(backend),Media3Playback.create(context,muted=true),{false},{})
            val token=MkrPlaybackService.start(activity,next)
            val connection=AndroidMkrConnection.connect(activity,token)
            try {assertNull(connection.status().track)}finally{connection.close()}
            val notification=context.getSystemService(NotificationManager::class.java).activeNotifications.first{it.id==MkrPlaybackService.NOTIFICATION}
            notification.notification.actions[3].actionIntent.send()
            assertEquals(1,releases.get());assertEquals(1,closes.get())
        } finally {
            context.stopService(Intent(context,MkrPlaybackService::class.java));failed.close();next?.close()
            instrumentation.runOnMainSync{activity.finish()}
        }
    }
}
