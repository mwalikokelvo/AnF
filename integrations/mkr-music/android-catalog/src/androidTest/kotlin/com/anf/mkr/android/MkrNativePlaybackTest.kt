// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.app.Activity
import android.content.Intent
import androidx.media3.common.C
import androidx.media3.datasource.DataSpec
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.anf.mkr.MkrStream
import com.anf.mkr.MkrTrack
import java.io.ByteArrayInputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Only the disposable library test APK declares this foreground QA activity. */
class MkrNativeQaActivity : Activity()

@RunWith(AndroidJUnit4::class)
class MkrNativePlaybackTest {
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private fun fixture(): ByteArray {
        // Never run these tests in either user's AnF application sandbox.
        assertEquals("com.anf.mkr.catalog.test",instrumentation.context.packageName)
        val data=instrumentation.context.assets.open("generated-aac.m4a").use { it.readBytes() }
        val digest=MessageDigest.getInstance("SHA-256").digest(data).joinToString(""){"%02x".format(it)}
        assertEquals("801e0e26a6f69c415fd06370b0fed08688802f031ba2da13046e1646aaaafd0a",digest)
        return data
    }
    internal class GeneratedCdn(private val data:ByteArray,private val statusCode:Int=206) {
        val requests=CopyOnWriteArrayList<String>()
        fun connect(ignored:String): HttpURLConnection = object : HttpURLConnection(URL("https://r1.googlevideo.com/generated-test")) {
            private fun span(): IntRange {
                val range=getRequestProperty("Range") ?: error("bounded range missing")
                val match=Regex("bytes=([0-9]+)-([0-9]+)").matchEntire(range) ?: error("invalid bounded range")
                return match.groupValues[1].toInt()..minOf(match.groupValues[2].toInt(),data.lastIndex)
            }
            override fun connect() {}
            override fun usingProxy()=false
            override fun disconnect() {}
            override fun getResponseCode():Int {this@GeneratedCdn.requests.add(getRequestProperty("Range"));return this@GeneratedCdn.statusCode}
            override fun getHeaderField(name:String?):String? {
                val span=span()
                return when(name){"Content-Range"->"bytes ${span.first}-${span.last}/${data.size}";"Content-Length"->"${span.last-span.first+1}";"Content-Type"->"audio/mp4";else->null}
            }
            override fun getInputStream()=ByteArrayInputStream(data.copyOfRange(span().first,span().last+1))
        }
    }
    private fun lease(data:ByteArray,cdn:GeneratedCdn)=AndroidMediaLease(
        MkrStream("https://r1.googlevideo.com/generated-fixture?synthetic-signed=1","audio/mp4",emptyMap(),
            true,true,65536,data.size.toLong(),System.currentTimeMillis()+120000),connect=cdn::connect)
    private fun foreground(): Activity = instrumentation.startActivitySync(
        Intent(instrumentation.context,MkrNativeQaActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    private fun finish(activity:Activity) {instrumentation.runOnMainSync{activity.finish()}}
    private suspend fun waitFor(engine:Media3Playback,predicate:(NativePlaybackState)->Boolean):NativePlaybackState = withTimeout(12000) {
        while(true) {
            val state=engine.snapshot()
            check(!state.failed){"Native generated-media decoder failed."}
            if(predicate(state))return@withTimeout state
            delay(40)
        }
        @Suppress("UNREACHABLE_CODE") NativePlaybackState()
    }
    @Test fun frameworkDataSpecHonorsShortRangesEofAndOpaqueUri() {
        val data=fixture();val cdn=GeneratedCdn(data);val lease=lease(data,cdn)
        val source=MkrMediaDataSource(lease)
        try {
            val probe=GeneratedCdn(data).connect("")
            probe.setRequestProperty("Range","bytes=5-14")
            assertEquals(206,probe.responseCode);probe.disconnect()
            val spec=DataSpec.Builder().setUri(lease.receipt).setPosition(5).setLength(10)
                .setHttpRequestHeaders(mapOf("Icy-MetaData" to "1")).build()
            assertEquals(10L,source.open(spec));assertEquals(lease.receipt,source.uri.toString())
            val out=ByteArray(20);assertEquals(10,source.read(out,0,out.size));assertArrayEquals(data.copyOfRange(5,15),out.copyOfRange(0,10))
            assertEquals(C.RESULT_END_OF_INPUT,source.read(out,0,1));assertEquals(listOf("bytes=5-14"),cdn.requests.toList())
            source.close();assertNull(source.uri)
            assertEquals(0L,source.open(DataSpec.Builder().setUri(lease.receipt).setPosition(data.size.toLong()).build()))
            assertEquals(C.RESULT_END_OF_INPUT,source.read(out,0,1));source.close()
            try { source.open(DataSpec.Builder().setUri("https://example.invalid/redirect").build());fail("arbitrary URI accepted") }
            catch(expected:IOException) {assertEquals(1,cdn.requests.size)}
            try { source.open(DataSpec.Builder().setUri(lease.receipt).setHttpRequestHeaders(mapOf("Authorization" to "synthetic-rejected")).build());fail("caller credentials accepted") }
            catch(expected:IOException) {assertEquals(1,cdn.requests.size)}
        } finally {source.close();lease.close()}
    }
    @Test fun realMutedMedia3DecoderAdvancesSeeksStopsAndResumes() = runBlocking {
        val activity=foreground();val data=fixture();val cdn=GeneratedCdn(data)
        val engine=Media3Playback.create(activity,muted=true)
        val first=lease(data,cdn)
        try {
            engine.prepare(MkrTrack("abcdefghijk","Generated AAC","AnF QA"),first,0)
            assertFalse(engine.snapshot().playing)
            assertTrue(engine.playIfCurrent{true})
            waitFor(engine){it.playing && it.durationMs>=3500 && it.positionMs>150}
            val stopped=engine.pauseAndRelease();assertFalse(stopped.playing)
            val hold=engine.snapshot();delay(150)
            assertFalse(engine.snapshot().playing);assertEquals(hold.positionMs,engine.snapshot().positionMs)
            try {first.checkActive();fail("retired lease active")} catch(expected:NativeInputFailure){assertEquals("REVOKED",expected.reason)}
            engine.prepare(MkrTrack("lmnopqrstuv","Generated resume","AnF QA"),lease(data,cdn),1000)
            assertTrue(engine.playIfCurrent{true})
            waitFor(engine){it.playing && it.positionMs>1100}
            engine.seek(2000);waitFor(engine){it.playing && it.positionMs>=2050}
            engine.pauseAndRelease()
            engine.prepare(MkrTrack("abcdefghijk","No late start","AnF QA"),lease(data,cdn),0)
            assertFalse(engine.playIfCurrent{false});delay(150);assertFalse(engine.snapshot().playing)
            assertTrue(cdn.requests.isNotEmpty())
        } finally {engine.release();finish(activity)}
    }
    @Test fun realMedia3DenialFailsOnceWithoutAutomaticNetworkRetry() = runBlocking {
        val activity=foreground();val data=fixture();val cdn=GeneratedCdn(data,403)
        val engine=Media3Playback.create(activity,muted=true);val lease=lease(data,cdn)
        try {
            engine.prepare(MkrTrack("abcdefghijk","Denied generated input","AnF QA"),lease,0)
            // The generated denial may latch before the main-thread play command.
            // Both orderings must still fail closed with one request and a decoder error.
            try {engine.playIfCurrent{true}}
            catch(expected:NativeInputFailure){assertEquals("DENIED",expected.reason)}
            withTimeout(12000){while(!engine.snapshot().failed)delay(40)}
            delay(400);assertEquals(1,cdn.requests.size)
            try{lease.checkActive();fail("denial not latched")}catch(expected:NativeInputFailure){assertEquals("DENIED",expected.reason)}
            engine.pauseAndRelease();assertFalse(engine.snapshot().playing)
        } finally {engine.release();finish(activity)}
    }
}
