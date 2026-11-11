// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.content.Intent
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.anf.mkr.*
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.*
import kotlin.coroutines.resume
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Real WebView JS -> origin-bound MessagePort -> Binder -> service -> Media3. */
@RunWith(AndroidJUnit4::class)
class AndroidMkrWebPortTest {
    @Test fun trustedPageUsesNativePlayerWithoutUrlOrExternalFallback() = runBlocking {
        val instrumentation=InstrumentationRegistry.getInstrumentation();val context=instrumentation.context
        assertEquals("com.anf.mkr.catalog.test",context.packageName)
        val activity=instrumentation.startActivitySync(Intent(context,MkrNativeQaActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val data=context.assets.open("generated-aac.m4a").use{it.readBytes()}
        assertEquals("801e0e26a6f69c415fd06370b0fed08688802f031ba2da13046e1646aaaafd0a",
            MessageDigest.getInstance("SHA-256").digest(data).joinToString(""){"%02x".format(it)})
        val requests=AtomicInteger();val closed=AtomicInteger();val requested=CompletableDeferred<Unit>();val handoff=AndroidAudioHandoff()
        val backend=object : CatalogBackend {
            override suspend fun search(query: String)=listOf(MkrTrack("abcdefghijk","Generated WebView fixture","AnF QA"))
            override suspend fun streams(videoId: String): List<Pair<Int,String>> {
                requests.incrementAndGet();return listOf(140 to "https://r1.googlevideo.com/generated-fixture")
            }
        }
        val cdn=MkrNativePlaybackTest.GeneratedCdn(data)
        val audio=Media3Playback.createDeferred(context,muted=true)
        val controller=AndroidPlaybackController(MkrCatalog(backend),audio,{requested.complete(Unit);handoff.requestPause()},
            {closed.incrementAndGet()},leaseFactory={stream -> AndroidMediaLease(MkrStream(stream.url,stream.mimeType,stream.headers,
                true,true,65536,data.size.toLong(),System.currentTimeMillis()+120000),connect=cdn::connect)})
        val web=withContext(Dispatchers.Main.immediate){WebView(activity)}
        var host: AndroidMkrPageHost?=null
        var connection: AndroidMkrPageConnection?=null
        var loaded=CompletableDeferred<Unit>()
        suspend fun report(): JSONObject=withContext(Dispatchers.Main.immediate) {
            suspendCancellableCoroutine { continuation ->
                web.evaluateJavascript("JSON.stringify(window.report||{})") {value ->
                    if(continuation.isActive) {
                        val encoded=org.json.JSONTokener(value).nextValue() as String
                        continuation.resume(JSONObject(encoded))
                    }
                }
            }
        }
        try {
            withContext(Dispatchers.Main.immediate) {
                web.settings.javaScriptEnabled=true;web.settings.blockNetworkLoads=true
                web.webViewClient=object : WebViewClient() {
                    override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {host?.onPageStarted()}
                    override fun onPageFinished(view: WebView?, url: String?) {host?.onPageFinished(url);loaded.complete(Unit)}
                }
                activity.setContentView(web)
                web.loadDataWithBaseURL("https://anf.local/",context.assets.open("native-web-port.html").bufferedReader().use{it.readText()}.replace("<script>","<script>"+context.assets.open("native-web-client.js").bufferedReader().use{it.readText()}+"</script><script>"),"text/html","UTF-8","https://anf.local/")
            }
            withTimeout(8000){loaded.await()}
            val client=MkrPlaybackService.prepare(activity,controller);connection=client
            val token=client.token
            withContext(Dispatchers.Main.immediate){
                assertEquals("https://anf.local/",web.url)
                host=AndroidMkrPageHost(web,"https://anf.local",handoff){client}
                host!!.onPageFinished(web.url)
            }
            withTimeout(8000){requested.await()}
            withTimeout(8000){while(report().optString("phase")!="audio-handoff")delay(20)}
            assertEquals(0,requests.get());assertTrue(cdn.requests.isEmpty())
            assertTrue(context.getSystemService(android.app.NotificationManager::class.java).activeNotifications.none{it.id==MkrPlaybackService.NOTIFICATION})
            withContext(Dispatchers.Main.immediate){web.evaluateJavascript("window.releaseOtherAudio()",null)}
            val result=withTimeout(8000){var value=report();while(!value.optBoolean("done")){delay(25);value=report()};value}
            assertFalse(result.toString(),result.has("error"));assertTrue(result.getInt("audioPauseRequests")>=2)
            assertEquals("Generated WebView fixture",result.getJSONArray("tracks").getJSONObject(0).getString("title"))
            assertTrue(result.getJSONObject("state").getBoolean("playing"))
            assertFalse(result.getJSONObject("paused").getBoolean("playing"))
            assertEquals(500L,result.getJSONObject("sought").getLong("positionMs"))
            assertFalse(result.toString().contains("googlevideo"));assertTrue(cdn.requests.isNotEmpty())
            assertTrue(context.getSystemService(android.app.NotificationManager::class.java).activeNotifications.any{it.id==MkrPlaybackService.NOTIFICATION})
            withContext(Dispatchers.Main.immediate){web.evaluateJavascript("window.sendDeeplyNested()",null)}
            withTimeout(8000) {
                var detached=false
                while(!detached) {
                    try {client.status()}
                    catch(expected: IllegalStateException) {
                        assertEquals("Music connection closed.",expected.message);detached=true
                    }
                    if(!detached)delay(20)
                }
            }
            // Lifecycle host revokes on navigation; no manual port close here.
            // Neither app origin can be attached on a foreign page.
            withContext(Dispatchers.Main.immediate) {
                loaded=CompletableDeferred()
                web.loadDataWithBaseURL("https://untrusted.invalid/","<p>Untrusted fixture</p>","text/html","UTF-8","https://untrusted.invalid/")
            }
            withTimeout(8000){loaded.await()}
            assertFalse(handoff.requestPause())
            val fresh=AndroidMkrConnection.connect(activity,token)
            try {
                withContext(Dispatchers.Main.immediate) {
                    for(origin in listOf("https://anf.local","https://coucou.local","https://untrusted.invalid","*")) {
                        try {AndroidMkrWebPort.attach(web,origin,fresh,handoff);fail("Accepted foreign/wildcard origin")}
                        catch(expected: IllegalArgumentException){ /* Native origin boundary. */ }
                    }
                }
                assertNotNull(fresh.status().track)
            } finally {fresh.close()}
        } finally {
            withContext(Dispatchers.Main.immediate){host?.close();connection?.close();web.stopLoading();web.destroy()}
            context.stopService(Intent(context,MkrPlaybackService::class.java));controller.close()
            instrumentation.runOnMainSync{activity.finish()}
        }
        withTimeout(8000){while(closed.get()!=1)delay(20)}
        assertEquals(1,closed.get())
    }
}
