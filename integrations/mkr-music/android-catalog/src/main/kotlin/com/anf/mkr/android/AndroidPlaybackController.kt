// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import com.anf.mkr.*
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

internal data class NativePlaybackState(val playing: Boolean=false, val positionMs: Long=0,
    val durationMs: Long=0, val failed: Boolean=false, val buffering: Boolean=false)
internal data class AndroidPlaybackState(val track: MkrTrack?, val audio: NativePlaybackState)
internal class PlaybackCommandFailure(val reason: String) : IllegalStateException("Music command unavailable: $reason")

internal interface NativePlayback {
    suspend fun prepare(track: MkrTrack, lease: AndroidMediaLease, positionMs: Long)
    suspend fun playIfCurrent(permit: () -> Boolean): Boolean
    suspend fun pauseAndRelease(): NativePlaybackState
    suspend fun snapshot(): NativePlaybackState
    suspend fun seek(positionMs: Long)
    suspend fun release()
    suspend fun setStateListener(listener: (() -> Unit)?) {}
}

/** Owns preparation jobs and native leases; no URI/header payload crosses this API. */
internal class AndroidPlaybackController(
    private val catalog: MkrCatalog,
    private val audio: NativePlayback,
    private val pauseOtherAudio: suspend () -> Boolean,
    private val closeCatalog: () -> Unit,
) {
    private val gate = Mutex()
    private val generation = AtomicLong()
    private val closed = AtomicBoolean()
    private val scope = CoroutineScope(SupervisorJob()+Dispatchers.IO)
    private val preparing = AtomicReference<Deferred<MkrStream>?>()
    @Volatile private var lease: AndroidMediaLease? = null
    private var results = emptyList<MkrTrack>()
    private var current: MkrTrack? = null
    private var paused = NativePlaybackState()
    private fun valid(ticket: Long) = !closed.get() && generation.get()==ticket
    private fun check(ticket: Long) { if(!valid(ticket)) throw PlaybackCommandFailure("SUPERSEDED") }
    private fun checkOpen() { if(closed.get()) throw PlaybackCommandFailure("CLOSED") }

    suspend fun search(query: String): List<MkrTrack> {
        checkOpen()
        val request=scope.async(start=CoroutineStart.LAZY) { catalog.search(query) }
        try {
            checkOpen(); request.start()
            val found=request.await()
            gate.withLock { checkOpen(); results=found }
            return found
        } catch(error: CancellationException) {
            if(!currentCoroutineContext().isActive) throw error
            throw PlaybackCommandFailure(if(closed.get()) "CLOSED" else "SUPERSEDED")
        } catch(error: PlaybackCommandFailure) { throw error
        } catch(error: Exception) { throw PlaybackCommandFailure("SEARCH_UNAVAILABLE")
        } finally { request.cancel() }
    }
    suspend fun play(id: String?=null) {
        checkOpen()
        val target = gate.withLock {
            val selected=id ?: current?.id ?: results.firstOrNull()?.id
            results.firstOrNull { it.id==selected } ?: current?.takeIf { it.id==selected }
                ?: throw PlaybackCommandFailure("CHOOSE_TRACK")
        }
        val ticket=generation.incrementAndGet()
        preparing.getAndSet(null)?.cancel()
        val acknowledged=withTimeoutOrNull(4000) { pauseOtherAudio() } ?: false
        check(ticket)
        if(!acknowledged) throw PlaybackCommandFailure("AUDIO_HANDOFF")
        val resumeAt=gate.withLock {
            check(ticket)
            val previous=if(lease!=null) audio.pauseAndRelease() else paused
            paused=previous.copy(playing=false,failed=false)
            lease?.close(); lease=null
            if(current?.id==target.id && (previous.durationMs<=0 || previous.positionMs<previous.durationMs)) previous.positionMs else 0
        }
        val request=scope.async(start=CoroutineStart.LAZY) {
            catalog.resolve(target.id,NativeStreamCapabilities(setOf(AudioContainer.M4A,AudioContainer.WEBM),true,true))
        }
        preparing.getAndSet(request)?.cancel()
        var owned: AndroidMediaLease?=null
        try {
            check(ticket); request.start()
            val resolved=AndroidMediaLease(request.await())
            owned=resolved
            gate.withLock {
                check(ticket)
                try {
                    audio.prepare(target,resolved,resumeAt)
                    check(ticket)
                    if(!audio.playIfCurrent { valid(ticket) }) throw PlaybackCommandFailure("SUPERSEDED")
                    lease=resolved; owned=null; current=target; paused=NativePlaybackState()
                } catch(error: Exception) {
                    audio.pauseAndRelease()
                    throw error
                }
            }
        } catch(error: CancellationException) {
            if(!currentCoroutineContext().isActive) throw error
            throw PlaybackCommandFailure("SUPERSEDED")
        } catch(error: PlaybackCommandFailure) { throw error
        } catch(error: NativeInputFailure) { throw PlaybackCommandFailure(error.reason)
        } catch(error: MkrResolutionException) { throw PlaybackCommandFailure(error.reason.name)
        } catch(error: Exception) { throw PlaybackCommandFailure("SOURCE_UNAVAILABLE")
        } finally {
            preparing.compareAndSet(request,null)
            request.cancel(); owned?.close()
        }
    }
    suspend fun pause(): AndroidPlaybackState {
        generation.incrementAndGet()
        preparing.getAndSet(null)?.cancel()
        lease?.close()
        return gate.withLock {
            checkOpen()
            if(lease!=null) paused=audio.pauseAndRelease().copy(playing=false,failed=false)
            lease=null
            AndroidPlaybackState(current,paused)
        }
    }
    suspend fun seek(positionMs: Long) {
        require(positionMs in 0..86_400_000)
        gate.withLock {
            checkOpen()
            if(current==null) throw PlaybackCommandFailure("CHOOSE_TRACK")
            if(lease!=null) audio.seek(positionMs)
            else paused=paused.copy(positionMs=if(paused.durationMs>0) minOf(positionMs,paused.durationMs) else positionMs)
        }
    }
    suspend fun step(delta: Int) {
        require(delta==1 || delta== -1)
        val id=gate.withLock {
            checkOpen()
            val index=results.indexOfFirst { it.id==current?.id }
            if(index<0 || index+delta !in results.indices) throw PlaybackCommandFailure("QUEUE_END")
            results[index+delta].id
        }
        play(id)
    }
    suspend fun setStateListener(listener: (() -> Unit)?) = gate.withLock {
        checkOpen(); audio.setStateListener(listener)
    }
    suspend fun status(): AndroidPlaybackState = gate.withLock {
        checkOpen(); AndroidPlaybackState(current,if(lease!=null) audio.snapshot() else paused)
    }
    suspend fun close() {
        if(!closed.compareAndSet(false,true)) return
        generation.incrementAndGet(); preparing.getAndSet(null)?.cancel(); scope.cancel()
        lease?.close()
        // Activity/service destruction commonly runs from a cancelled scope.
        // Terminal state must not prevent a suspended native release completing.
        withContext(NonCancellable) {
            gate.withLock {
                try { audio.release() } finally { lease=null; results=emptyList(); current=null; closeCatalog() }
            }
        }
    }
}
