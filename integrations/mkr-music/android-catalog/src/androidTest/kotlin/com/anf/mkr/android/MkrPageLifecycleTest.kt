// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.app.NotificationManager
import android.content.Intent
import android.media.session.MediaSession
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.anf.mkr.*
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.*
import kotlin.coroutines.resume
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Real Java callbacks, new Activity/WebView, same service and fresh page handoff. */
@RunWith(AndroidJUnit4::class)
class MkrPageLifecycleTest {
    @Suppress("DEPRECATION")
    @Test fun recreatedActivityReusesNativeOwnerAndAcknowledgesFromNewPage() = runBlocking {
        val instrumentation=InstrumentationRegistry.getInstrumentation();val context=instrumentation.context
        assertEquals("com.anf.mkr.catalog.test",context.packageName)
        val data=context.assets.open("generated-aac.m4a").use{it.readBytes()}
        val created=AtomicInteger();val closed=AtomicInteger();val decoders=AtomicInteger()
        val cdn=MkrNativePlaybackTest.GeneratedCdn(data)
        val owner=AndroidMkrOwner { app, handoff ->
            created.incrementAndGet()
            val backend=object : CatalogBackend {
                override suspend fun search(query: String)=listOf(MkrTrack("abcdefghijk","Recreated Activity fixture","AnF QA"))
                override suspend fun streams(videoId: String)=listOf(140 to "https://r1.googlevideo.com/generated-fixture")
            }
            val audio=DeferredNativePlayback.create{decoders.incrementAndGet();Media3Playback.create(app,muted=true)}
            AndroidPlaybackController(MkrCatalog(backend),audio,{handoff.requestPause()},{closed.incrementAndGet()},
                leaseFactory={stream -> AndroidMediaLease(MkrStream(stream.url,stream.mimeType,stream.headers,
                    true,true,65536,data.size.toLong(),System.currentTimeMillis()+120000),connect=cdn::connect)})
        }
        var firstToken: MediaSession.Token?=null
        try {
            for(origin in listOf("https://anf.local/","https://coucou.local/")) {
                val activity=instrumentation.startActivitySync(Intent(context,MkrNativeQaActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                val web=withContext(Dispatchers.Main.immediate){WebView(activity)}
                var callbacks: JavaMkrLifecycleCallbacks?=null
                suspend fun report(): JSONObject=withContext(Dispatchers.Main.immediate) {
                    suspendCancellableCoroutine { continuation ->
                        web.evaluateJavascript("JSON.stringify(window.report||{})") {value ->
                            if(continuation.isActive) {
                                val json=org.json.JSONTokener(value).nextValue() as? String
                                continuation.resume(if(json==null)JSONObject() else JSONObject(json))
                            }
                        }
                    }
                }
                try {
                    withContext(Dispatchers.Main.immediate) {
                        web.settings.javaScriptEnabled=true;web.settings.blockNetworkLoads=true
                        callbacks=JavaMkrLifecycleCallbacks(MkrPageLifecycle.attach(web,origin,owner))
                        web.webViewClient=callbacks!!;activity.setContentView(web)
                        val html=context.assets.open("native-web-port.html").bufferedReader().use{it.readText()}
                            .replace("<script>","<script>"+context.assets.open("native-web-client.js").bufferedReader().use{it.readText()}+"</script><script>")
                        web.loadDataWithBaseURL(origin,html,"text/html","UTF-8",origin)
                    }
                    withTimeout(8000) {
                        var value=report()
                        while(value.optString("phase")!="audio-handoff") {
                            assertFalse(value.toString(),value.has("error"));delay(20);value=report()
                        }
                    }
                    withContext(Dispatchers.Main.immediate){web.evaluateJavascript("window.releaseOtherAudio()",null)}
                    val result=withTimeout(8000){var value=report();while(!value.optBoolean("done")){delay(20);value=report()};value}
                    assertFalse(result.toString(),result.has("error"))
                    assertTrue(result.getJSONObject("state").getBoolean("playing"))
                    assertTrue("Each new page must acknowledge audio",result.getInt("audioPauseRequests")>=2)
                    assertEquals(1,created.get());assertEquals(1,decoders.get());assertEquals(0,closed.get())
                    val notification=withTimeout(8000) {
                        val manager=context.getSystemService(NotificationManager::class.java)
                        var value=manager.activeNotifications.firstOrNull{it.id==MkrPlaybackService.NOTIFICATION}
                        while(value==null){delay(20);value=manager.activeNotifications.firstOrNull{it.id==MkrPlaybackService.NOTIFICATION}}
                        value.notification
                    }
                    val token=notification.extras.getParcelable<MediaSession.Token>(android.app.Notification.EXTRA_MEDIA_SESSION)
                    assertNotNull(token);if(firstToken==null)firstToken=token else assertEquals(firstToken,token)
                } finally {
                    withContext(Dispatchers.Main.immediate){callbacks?.closeBeforeDestroy();web.stopLoading();web.destroy();activity.finish()}
                }
                assertEquals("Detaching a played page must preserve native ownership",0,closed.get())
            }
        } finally {context.stopService(Intent(context,MkrPlaybackService::class.java))}
        withTimeout(8000){while(closed.get()!=1)delay(20)}
        assertEquals(1,created.get());assertEquals(1,closed.get())
    }
}
