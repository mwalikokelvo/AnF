// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.content.Context
import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.anf.mkr.MkrStream
import com.anf.mkr.MkrTrack
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Actual muted Media3 and generated AAC; never an AnF user sandbox/provider. */
@RunWith(AndroidJUnit4::class)
class DeferredNativePlaybackTest {
    private val track=MkrTrack("abcdefghijk","Deferred generated fixture","AnF QA")
    private suspend fun counted(context: Context, created: AtomicInteger, released: AtomicInteger): NativePlayback {
        val native=Media3Playback.create(context,muted=true);created.incrementAndGet()
        return object : NativePlayback by native {
            override suspend fun release(){released.incrementAndGet();native.release()}
        }
    }
    private fun lease(data: ByteArray, cdn: MkrNativePlaybackTest.GeneratedCdn)=AndroidMediaLease(
        MkrStream("https://r1.googlevideo.com/generated-fixture","audio/mp4",emptyMap(),true,true,65536,
            data.size.toLong(),System.currentTimeMillis()+120000),connect=cdn::connect)
    @Test fun preflightDoesNotConstructDecoderAndRepeatedPrepareReusesIt() = runBlocking {
        val instrumentation=InstrumentationRegistry.getInstrumentation();val context=instrumentation.context
        assertEquals("com.anf.mkr.catalog.test",context.packageName)
        val activity=instrumentation.startActivitySync(Intent(context,MkrNativeQaActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val data=context.assets.open("generated-aac.m4a").use{it.readBytes()};val cdn=MkrNativePlaybackTest.GeneratedCdn(data)
        val created=AtomicInteger();val released=AtomicInteger();val changed=AtomicInteger()
        val native=DeferredNativePlayback.create{counted(context,created,released)}
        val first=lease(data,cdn);val second=lease(data,cdn)
        try {
            native.setStateListener{changed.incrementAndGet()}
            assertEquals(NativePlaybackState(),native.snapshot())
            assertEquals(NativePlaybackState(),native.pauseAndRelease())
            assertFalse(native.playIfCurrent{true})
            assertEquals("Preflight must not allocate a decoder",0,created.get())
            assertEquals(0,changed.get());assertTrue(cdn.requests.isEmpty())
            native.prepare(track,first,0);assertEquals(1,created.get());assertTrue(native.playIfCurrent{true})
            withTimeout(12000){while(true){val state=native.snapshot();assertFalse(state.failed);if(state.playing&&state.durationMs>=3500)break;delay(30)}}
            assertTrue(changed.get()>0);assertTrue(cdn.requests.isNotEmpty())
            assertFalse(native.pauseAndRelease().playing)
            native.prepare(track,second,0);assertFalse(native.playIfCurrent{false})
            assertEquals("A second track must reuse the native owner",1,created.get())
        } finally {native.release();native.release();first.close();second.close();instrumentation.runOnMainSync{activity.finish()}}
        assertEquals(1,released.get())
    }
    @Test fun unusedCloseAndCancelledConstructionDoNotLeakOrRestart() = runBlocking {
        val context=InstrumentationRegistry.getInstrumentation().context
        assertEquals("com.anf.mkr.catalog.test",context.packageName)
        val data=context.assets.open("generated-aac.m4a").use{it.readBytes()};val cdn=MkrNativePlaybackTest.GeneratedCdn(data)
        val created=AtomicInteger();val released=AtomicInteger()
        val unused=DeferredNativePlayback.create{counted(context,created,released)}
        unused.release();unused.release()
        assertEquals("Closing an unused owner must not construct it",0,created.get())
        val source=lease(data,cdn)
        try {
            try {unused.prepare(track,source,0);fail("Closed owner accepted preparation")}
            catch(expected: IllegalStateException){ /* Terminal owner. */ }
            assertEquals(0,created.get())
            val entered=CompletableDeferred<Unit>();val finish=CompletableDeferred<Unit>()
            val pendingOwner=DeferredNativePlayback.create{
                entered.complete(Unit);finish.await();counted(context,created,released)
            }
            val pending=launch(Dispatchers.Default){pendingOwner.prepare(track,source,0)}
            try {
                withTimeout(8000){entered.await()};pending.cancel()
                val closing=async(start=CoroutineStart.UNDISPATCHED){pendingOwner.release()}
                finish.complete(Unit)
                withTimeout(8000){pending.join();closing.await()}
                assertTrue(pending.isCancelled);assertEquals(1,created.get());assertEquals(1,released.get())
                assertTrue("Cancelled initialization must not prepare/decode",cdn.requests.isEmpty())
                pendingOwner.release();assertEquals(1,released.get())
            } finally {finish.complete(Unit);pending.cancelAndJoin();pendingOwner.release()}
        } finally {source.close()}
    }
}
