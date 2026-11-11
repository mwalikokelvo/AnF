// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import com.anf.mkr.MkrTrack
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Native decoder acquisition boundary; no provider or service startup here. */
internal object DeferredNativePlayback {
    suspend fun create(factory: suspend () -> NativePlayback): NativePlayback = Lease(factory)

    private class Lease(private val factory: suspend () -> NativePlayback) : NativePlayback {
        private val gate=Mutex()
        private val closed=AtomicBoolean()
        private var native: NativePlayback?=null
        private var listener: (() -> Unit)?=null
        private fun checkOpen(){check(!closed.get()){"Native music owner closed."}}
        // Called under gate. Capture the returned owner before cancellation can
        // discard it across a dispatcher boundary; dispose any unclaimed result.
        private suspend fun prepared(): NativePlayback {
            checkOpen();native?.let{return it}
            var candidate: NativePlayback?=null
            try {
                withContext(NonCancellable){candidate=factory()}
                currentCoroutineContext().ensureActive();checkOpen()
                candidate!!.setStateListener(listener)
                currentCoroutineContext().ensureActive();checkOpen()
                native=candidate;candidate=null
                return native!!
            } finally {withContext(NonCancellable){candidate?.release()}}
        }
        override suspend fun prepare(track: MkrTrack, lease: AndroidMediaLease, positionMs: Long)=gate.withLock {
            checkOpen();lease.checkActive();prepared().prepare(track,lease,positionMs)
        }
        override suspend fun snapshot(): NativePlaybackState=gate.withLock {
            checkOpen();native?.snapshot()?:NativePlaybackState()
        }
        override suspend fun pauseAndRelease(): NativePlaybackState=gate.withLock {
            checkOpen();native?.pauseAndRelease()?:NativePlaybackState()
        }
        override suspend fun playIfCurrent(permit: () -> Boolean): Boolean=gate.withLock {
            if(closed.get())false else native?.playIfCurrent(permit)?:false
        }
        override suspend fun seek(positionMs: Long)=gate.withLock {
            checkOpen();require(positionMs in 0..86_400_000)
            checkNotNull(native){"Choose music before seeking."}.seek(positionMs)
        }
        override suspend fun setStateListener(listener: (() -> Unit)?)=gate.withLock {
            checkOpen();this.listener=listener;native?.setStateListener(listener);Unit
        }
        override suspend fun release() {
            if(!closed.compareAndSet(false,true))return
            withContext(NonCancellable){gate.withLock {
                val previous=native;native=null;listener=null;previous?.release()
            }}
        }
    }
}
