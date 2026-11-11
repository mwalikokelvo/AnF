// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.content.*
import android.media.session.MediaSession
import android.os.*
import com.anf.mkr.MkrTrack
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.*

/** Activity-scoped native browsing connection to an already approved service owner.
 * Closing detaches this UI, never the service's ongoing playback. Controls use
 * the supplied framework token; this API cannot accept a stream URL or player.
 */
internal class AndroidMkrConnection private constructor(
    val token: MediaSession.Token,
    private val binder: MkrPlaybackService.NativeBinder,
    private val detach: () -> Unit,
) : AndroidMkrPageConnection {
    private val closed=AtomicBoolean()
    private fun checkOpen() {check(!closed.get()){"Music connection closed."}}
    override suspend fun search(query: String): List<MkrTrack> {
        checkOpen();val result=binder.search(query);checkOpen();return result
    }
    override suspend fun status(): AndroidPlaybackState {checkOpen();return binder.status().also{checkOpen()}}
    override suspend fun control(command: String, id: String?, positionMs: Long?): AndroidPlaybackState {
        checkOpen();return binder.control(command,id,positionMs).also{checkOpen()}
    }
    override fun close() {if(closed.compareAndSet(false,true))detach()}
    companion object {
        suspend fun connect(context: Context, token: MediaSession.Token): AndroidMkrConnection {
            var prepared: AndroidMkrConnection?=null
            try {return withContext(Dispatchers.Main.immediate) {
                withTimeout(5000) {
                    suspendCancellableCoroutine { continuation ->
                        val app=context.applicationContext
                        val main=Handler(Looper.getMainLooper())
                        var registered=false
                        var retained: MkrPlaybackService.NativeBinder?=null
                        var handle: AndroidMkrConnection?=null
                        lateinit var connection: ServiceConnection
                        fun detach() {
                            // Cancellation may arrive from another dispatcher. Serialize
                            // unregister with bindService's Main-thread return/registration.
                            val task=Runnable {
                                retained?.release();retained=null
                                if(registered) {registered=false;app.unbindService(connection)}
                            }
                            if(Looper.myLooper()==Looper.getMainLooper())task.run() else main.post(task)
                        }
                        fun unavailable() {
                            handle?.close();detach()
                            if(continuation.isActive)continuation.resumeWith(Result.failure(IllegalStateException("Music service unavailable.")))
                        }
                        connection=object : ServiceConnection {
                            override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
                                val local=service as? MkrPlaybackService.NativeBinder
                                if(local==null || !continuation.isActive || !local.retain(token)){unavailable();return}
                                retained=local
                                val client=AndroidMkrConnection(token,local,::detach);handle=client;prepared=client
                                continuation.resume(client,onCancellation={_,value,_->value.close()})
                            }
                            override fun onServiceDisconnected(name: ComponentName?)=unavailable()
                            override fun onBindingDied(name: ComponentName?)=unavailable()
                            override fun onNullBinding(name: ComponentName?)=unavailable()
                        }
                        continuation.invokeOnCancellation {handle?.close();detach()}
                        try {
                            if(!continuation.isActive)return@suspendCancellableCoroutine
                            registered=app.bindService(Intent(app,MkrPlaybackService::class.java)
                                .setAction(MkrPlaybackService.BIND).putExtra(MkrPlaybackService.TOKEN,token),
                                connection,Context.BIND_AUTO_CREATE)
                            if(!registered)unavailable() else if(!continuation.isActive)detach()
                        } catch(error: Exception) {unavailable()}
                    }
                }
            }} catch(error: Exception) {
                // withContext can discard a successfully bound result when the
                // caller's dispatcher is cancelled before return delivery.
                prepared?.close();throw error
            }
        }
    }
}
