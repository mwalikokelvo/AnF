// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.os.Looper
import android.os.SystemClock
import java.util.UUID
import kotlinx.coroutines.*

/** One-use acknowledgement from the currently attached trusted renderer.
 * No renderer, timeout, cancellation or replacement always denies playback.
 * Background resume without a renderer needs a separate native-engine proof.
 */
internal class AndroidAudioHandoff {
    private class Page(val send: (String) -> Boolean)
    private class Request(val page: Page) {
        val token=UUID.randomUUID().toString()
        val expiresAt=SystemClock.elapsedRealtime()+4000
        val result=CompletableDeferred<Boolean>()
    }
    private var page: Page?=null
    private var pending: Request?=null
    private fun main(){check(Looper.myLooper()==Looper.getMainLooper())}
    internal inner class Binding(private val identity: Any) : AutoCloseable {
        fun acknowledge(token: String, paused: Boolean): Boolean {
            main();val request=pending?:return false
            if(page!==identity || request.page!==identity || request.token!=token)return false
            if(SystemClock.elapsedRealtime()>=request.expiresAt){pending=null;request.result.complete(false);return false}
            pending=null;return request.result.complete(paused)
        }
        override fun close() {
            main();if(page!==identity)return
            page=null;pending?.result?.complete(false);pending=null
        }
    }
    fun attach(send: (String) -> Boolean): Binding {
        main();pending?.result?.complete(false);pending=null
        val next=Page(send);page=next;return Binding(next)
    }
    suspend fun requestPause(): Boolean=withContext(Dispatchers.Main.immediate) {
        val current=page ?: return@withContext false
        pending?.result?.complete(false)
        val request=Request(current);pending=request
        try {
            val allowed=withTimeoutOrNull(4000){
                if(!current.send(request.token))false else request.result.await()
            }?:false
            allowed && SystemClock.elapsedRealtime()<request.expiresAt
        } catch(error: CancellationException){throw error}
        catch(error: Exception){false}
        finally {if(pending===request)pending=null}
    }
}
