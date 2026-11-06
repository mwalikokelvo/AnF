// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.content.Intent
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.anf.mkr.*
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.*
import kotlin.coroutines.resume
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Real Binder/WebView lifetime tests; never contacts a provider or decoder. */
@RunWith(AndroidJUnit4::class)
class AndroidMkrPageHostTest {
    @Test fun navigationRejectsLateBindingAndClosedHostCannotReconnect() = runBlocking {
        val instrumentation=InstrumentationRegistry.getInstrumentation();val context=instrumentation.context
        assertEquals("com.anf.mkr.catalog.test",context.packageName)
        val activity=instrumentation.startActivitySync(Intent(context,MkrNativeQaActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val released=AtomicInteger();val attempts=AtomicInteger()
        val backend=object : CatalogBackend {
            override suspend fun search(query: String): List<MkrTrack> = error("Unexpected search")
            override suspend fun streams(videoId: String): List<Pair<Int,String>> = error("Unexpected resolution")
        }
        val audio=object : NativePlayback {
            override suspend fun prepare(track: MkrTrack, lease: AndroidMediaLease, positionMs: Long) {error("Unexpected decode")}
            override suspend fun playIfCurrent(permit: () -> Boolean): Boolean = error("Unexpected play")
            override suspend fun pauseAndRelease()=NativePlaybackState()
            override suspend fun snapshot()=NativePlaybackState()
            override suspend fun seek(positionMs: Long) {error("Unexpected seek")}
            override suspend fun release(){released.incrementAndGet()}
        }
        val handoff=AndroidAudioHandoff()
        val controller=AndroidPlaybackController(MkrCatalog(backend),audio,{handoff.requestPause()},{})
        val web=withContext(Dispatchers.Main.immediate){WebView(activity)}
        var host: AndroidMkrPageHost?=null
        var loaded=CompletableDeferred<Unit>()
        val prepared=CompletableDeferred<AndroidMkrConnection>();val deliver=CompletableDeferred<Unit>()
        suspend fun portCount(): Int=withContext(Dispatchers.Main.immediate) {
            suspendCancellableCoroutine { continuation ->
                web.evaluateJavascript("window.portCount||0") {value -> if(continuation.isActive)continuation.resume(value.toInt())}
            }
        }
        suspend fun load(origin: String) {
            withContext(Dispatchers.Main.immediate) {
                loaded=CompletableDeferred()
                web.loadDataWithBaseURL(origin+"/","<script>window.portCount=0;addEventListener('message',e=>{if(e.data==='anf-mkr-port-v1'){window.portCount++;e.ports[0].start();}});</script>","text/html","UTF-8",origin+"/")
            }
            withTimeout(8000){loaded.await()}
        }
        try {
            withContext(Dispatchers.Main.immediate) {
                web.settings.javaScriptEnabled=true;web.settings.blockNetworkLoads=true
                web.webViewClient=object : WebViewClient() {
                    override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?){host?.onPageStarted()}
                    override fun onPageFinished(view: WebView?, url: String?){host?.onPageFinished(url);loaded.complete(Unit)}
                }
                activity.setContentView(web)
            }
            load("https://anf.local")
            val token=MkrPlaybackService.start(activity,controller)
            withContext(Dispatchers.Main.immediate) {
                host=AndroidMkrPageHost(web,"https://anf.local",handoff) {
                    attempts.incrementAndGet()
                    // Model cancellation arriving after a successful native bind but
                    // before its result is delivered to the page owner.
                    withContext(NonCancellable) {
                        val client=AndroidMkrConnection.connect(activity,token)
                        if(!prepared.isCompleted){prepared.complete(client);deliver.await()}
                        client
                    }
                }
                host!!.onPageFinished(web.url)
            }
            val stale=withTimeout(8000){prepared.await()}
            load("https://untrusted.invalid")
            deliver.complete(Unit)
            withTimeout(8000) {
                while(true) {
                    try {stale.status()}
                    catch(expected: IllegalStateException){assertEquals("Music connection closed.",expected.message);break}
                    delay(20)
                }
            }
            assertEquals(0,portCount());assertEquals(1,attempts.get())
            assertFalse(handoff.requestPause())
            load("https://anf.local")
            withTimeout(8000){while(portCount()!=1)delay(20)}
            withContext(Dispatchers.Main.immediate){repeat(3){host!!.onPageFinished(web.url)}}
            assertEquals(2,attempts.get());assertEquals(1,portCount())
            // Detaching a page never closes its service/controller.
            withContext(Dispatchers.Main.immediate){host!!.close();host!!.close()}
            assertEquals(0,released.get())
            assertFalse(handoff.requestPause())
            load("https://anf.local")
            assertEquals(2,attempts.get());assertEquals(0,portCount())
            // A replacement owner supports the original application origin too.
            withContext(Dispatchers.Main.immediate){host=AndroidMkrPageHost(web,"https://coucou.local",handoff){attempts.incrementAndGet();AndroidMkrConnection.connect(activity,token)}}
            load("https://coucou.local")
            withTimeout(8000){while(portCount()!=1)delay(20)}
            assertEquals(3,attempts.get())
        } finally {
            deliver.complete(Unit)
            withContext(Dispatchers.Main.immediate){host?.close();web.stopLoading();web.destroy()}
            context.stopService(Intent(context,MkrPlaybackService::class.java));controller.close()
            instrumentation.runOnMainSync{activity.finish()}
        }
        withTimeout(8000){while(released.get()!=1)delay(20)}
        assertEquals(1,released.get())
    }
}
