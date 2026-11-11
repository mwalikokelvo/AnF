// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.webkit.WebView
import android.net.Uri
import android.os.Looper
import kotlinx.coroutines.*

/** Page lifecycle boundary for an already approved service owner.
 * Call on Main from WebViewClient page callbacks and Activity destruction.
 * Detaching a page never stops the service. Engineering-only: not linked into
 * the production AnF Activity; the factory must bind an already approved owner.
 */
internal class AndroidMkrPageHost(
    private val web: WebView,
    private val origin: String,
    private val handoff: AndroidAudioHandoff,
    private val connect: suspend () -> AndroidMkrPageConnection,
) : AutoCloseable {
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
    private var generation=0L
    private var closed=false
    private var attaching: Job?=null
    private var port: AndroidMkrWebPort?=null
    init {main();require(origin in setOf("https://anf.local","https://coucou.local"))}
    private fun main(){check(Looper.myLooper()==Looper.getMainLooper())}
    private fun trusted(url: String?): Boolean {
        if(url==null || url!=web.url)return false
        val uri=Uri.parse(url)
        return uri.scheme=="https" && uri.host==Uri.parse(origin).host &&
            uri.userInfo==null && (uri.port==-1 || uri.port==443)
    }
    private fun revoke() {
        generation++;attaching?.cancel();attaching=null
        port?.close();port=null
    }
    fun onPageStarted() {main();if(!closed)revoke()}
    fun onPageFinished(url: String?) {
        main()
        if(closed || port!=null || attaching?.isActive==true || !trusted(url))return
        val ticket=generation
        attaching=scope.launch {
            var candidate: AndroidMkrPageConnection?=null
            try {
                // Assign ownership before cancellation can discard a returned
                // bind result. The standard connector is bounded and cancellable;
                // this outer deadline also bounds a slow acquisition factory.
                withContext(NonCancellable){withTimeout(5000){candidate=connect()}}
                ensureActive()
                if(closed || generation!=ticket || !trusted(url))return@launch
                port=AndroidMkrWebPort.attach(web,origin,candidate!!,handoff)
                candidate=null
            } catch(error: CancellationException){throw error}
            catch(error: Exception){ /* No channel means unavailable, never a fallback. */ }
            finally {candidate?.close();if(generation==ticket)attaching=null}
        }
    }
    override fun close() {main();if(closed)return;closed=true;revoke();scope.cancel()}
}
