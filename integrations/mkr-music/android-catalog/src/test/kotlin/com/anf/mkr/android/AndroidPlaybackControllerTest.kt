// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import com.anf.mkr.*
import kotlinx.coroutines.*
import kotlin.test.*

class AndroidPlaybackControllerTest {
    private val first=MkrTrack("abcdefghijk","Fixture first","Generated")
    private val second=MkrTrack("lmnopqrstuv","Fixture second","Generated")
    private inner class Backend : CatalogBackend {
        var requests=0
        var searching: suspend () -> Unit = {}
        var prepare: suspend () -> Unit = {}
        override suspend fun search(query:String): List<MkrTrack> { searching();return listOf(first,second) }
        override suspend fun streams(videoId:String): List<Pair<Int,String>> {
            requests++;prepare();return listOf(140 to "https://r1.googlevideo.com/generated-fixture")
        }
    }
    private class Audio : NativePlayback {
        var starts=0;var releases=0;var last: AndroidMediaLease?=null
        var state=NativePlaybackState()
        var beforePrepare: suspend () -> Unit = {}
        var beforeRelease: suspend () -> Unit = {}
        override suspend fun prepare(track:MkrTrack,lease:AndroidMediaLease,positionMs:Long) {
            beforePrepare();last=lease;state=NativePlaybackState(false,positionMs,120000)
        }
        override suspend fun playIfCurrent(permit:()->Boolean):Boolean {
            if(!permit())return false
            last!!.checkActive();starts++;state=state.copy(playing=true);return true
        }
        override suspend fun pauseAndRelease():NativePlaybackState {
            val old=state;last?.close();last=null;state=state.copy(playing=false);return old.copy(playing=false)
        }
        override suspend fun snapshot()=state
        override suspend fun seek(positionMs:Long){state=state.copy(positionMs=positionMs)}
        override suspend fun release(){beforeRelease();pauseAndRelease();releases++}
    }
    @Test fun failedHandoffNeverResolvesOrPrepares() = runBlocking {
        val backend=Backend();val audio=Audio()
        val controller=AndroidPlaybackController(MkrCatalog(backend),audio,{false},{})
        try {
            controller.search("fixture")
            assertEquals("AUDIO_HANDOFF",assertFailsWith<PlaybackCommandFailure>{controller.play()}.reason)
            assertEquals(0,backend.requests);assertEquals(0,audio.starts);assertNull(audio.last)
        } finally {controller.close()}
    }
    @Test fun lateHandoffCannotRestartAfterPause() = runBlocking {
        val entered=CompletableDeferred<Unit>();val ack=CompletableDeferred<Boolean>();val backend=Backend();val audio=Audio()
        val controller=AndroidPlaybackController(MkrCatalog(backend),audio,{entered.complete(Unit);ack.await()},{})
        try {
            controller.search("fixture")
            val play=async {runCatching{controller.play()}}
            entered.await();controller.pause();ack.complete(true)
            assertEquals("SUPERSEDED",(play.await().exceptionOrNull() as PlaybackCommandFailure).reason)
            assertEquals(0,backend.requests);assertEquals(0,audio.starts)
        } finally {controller.close()}
    }
    @Test fun pauseCancelsResolverWithoutWaitingOrLatePlay() = runBlocking {
        val entered=CompletableDeferred<Unit>();val cancelled=CompletableDeferred<Unit>();val backend=Backend();val audio=Audio()
        backend.prepare={entered.complete(Unit);try {awaitCancellation()} finally {cancelled.complete(Unit)}}
        val controller=AndroidPlaybackController(MkrCatalog(backend),audio,{true},{})
        try {
            controller.search("fixture")
            val play=async {runCatching{controller.play()}}
            entered.await();withTimeout(700){controller.pause();cancelled.await()}
            assertEquals("SUPERSEDED",(play.await().exceptionOrNull() as PlaybackCommandFailure).reason)
            assertEquals(0,audio.starts);assertFalse(controller.status().audio.playing)
        } finally {controller.close()}
    }
    @Test fun pauseDuringPrepareInvalidatesFinalStart() = runBlocking {
        val entered=CompletableDeferred<Unit>();val release=CompletableDeferred<Unit>();val backend=Backend();val audio=Audio()
        audio.beforePrepare={entered.complete(Unit);release.await()}
        val controller=AndroidPlaybackController(MkrCatalog(backend),audio,{true},{})
        try {
            controller.search("fixture")
            val play=async {runCatching{controller.play()}}
            entered.await();val pause=async(start=CoroutineStart.UNDISPATCHED){controller.pause()}
            release.complete(Unit);pause.await()
            assertEquals("SUPERSEDED",(play.await().exceptionOrNull() as PlaybackCommandFailure).reason)
            assertEquals(0,audio.starts);assertNull(audio.last)
        } finally {controller.close()}
    }
    @Test fun queuePauseSeekAndResumeRetainPosition() = runBlocking {
        val backend=Backend();val audio=Audio();val controller=AndroidPlaybackController(MkrCatalog(backend),audio,{true},{})
        try {
            controller.search("fixture");controller.play(first.id);controller.seek(4321)
            val old=audio.last!!;assertFalse(controller.pause().audio.playing)
            assertFailsWith<NativeInputFailure>{old.checkActive()}
            controller.seek(5000);controller.play()
            assertEquals(5000,controller.status().audio.positionMs)
            controller.step(1);assertEquals(second,controller.status().track)
            assertEquals(0,controller.status().audio.positionMs)
            controller.step(-1);assertEquals(first,controller.status().track)
            assertEquals("QUEUE_END",assertFailsWith<PlaybackCommandFailure>{controller.step(-1)}.reason)
        } finally {controller.close()}
    }
    @Test fun closeCancelsPendingAndIsIdempotentAndTerminal() = runBlocking {
        val entered=CompletableDeferred<Unit>();val backend=Backend();val audio=Audio();var closed=0
        backend.prepare={entered.complete(Unit);awaitCancellation()}
        val controller=AndroidPlaybackController(MkrCatalog(backend),audio,{true},{closed++})
        controller.search("fixture");val play=async {runCatching{controller.play()}}
        entered.await();controller.close();controller.close();play.await()
        assertEquals(0,audio.starts);assertEquals(1,audio.releases);assertEquals(1,closed)
        assertEquals("CLOSED",assertFailsWith<PlaybackCommandFailure>{controller.search("fixture")}.reason)
    }
    @Test fun sourceFailureDoesNotLeakUrlAndLeavesOldTrackPaused() = runBlocking {
        val backend=Backend();val audio=Audio();val controller=AndroidPlaybackController(MkrCatalog(backend),audio,{true},{})
        try {
            controller.search("fixture");controller.play(first.id);controller.seek(3210)
            backend.prepare={throw IllegalStateException("https://r1.googlevideo.com/?signed-private-fixture=1")}
            val error=assertFailsWith<PlaybackCommandFailure>{controller.play(second.id)}
            assertEquals("SOURCE_UNAVAILABLE",error.reason);assertNull(error.cause)
            assertFalse(error.toString().contains("signed-private"))
            assertFalse(controller.status().audio.playing);assertEquals(3210,controller.status().audio.positionMs)
        } finally {controller.close()}
    }
    @Test fun closeCancelsOwnedSearchAndSearchErrorsAreSanitized() = runBlocking {
        val entered=CompletableDeferred<Unit>();val cancelled=CompletableDeferred<Unit>()
        val backend=Backend();val audio=Audio()
        backend.searching={entered.complete(Unit);try {awaitCancellation()} finally {cancelled.complete(Unit)}}
        val controller=AndroidPlaybackController(MkrCatalog(backend),audio,{true},{})
        val search=async {runCatching{controller.search("fixture")}}
        entered.await();withTimeout(700){controller.close();cancelled.await()}
        assertEquals("CLOSED",(search.await().exceptionOrNull() as PlaybackCommandFailure).reason)
        val other=Backend();other.searching={throw IllegalStateException("https://example.invalid/?signed-private=1")}
        val next=AndroidPlaybackController(MkrCatalog(other),Audio(),{true},{})
        try {
            val error=assertFailsWith<PlaybackCommandFailure>{next.search("fixture")}
            assertEquals("SEARCH_UNAVAILABLE",error.reason);assertNull(error.cause)
            assertFalse(error.toString().contains("signed-private"))
        } finally {next.close()}
    }
    @Test fun explicitPlayAfterEndRestartsAtBeginning() = runBlocking {
        val backend=Backend();val audio=Audio();val controller=AndroidPlaybackController(MkrCatalog(backend),audio,{true},{})
        try {
            controller.search("fixture");controller.play();controller.seek(120000)
            controller.pause();controller.play()
            assertEquals(0,controller.status().audio.positionMs)
        } finally {controller.close()}
    }
    @Test fun cancelledOwnerStillCompletesSuspendingNativeRelease() = runBlocking {
        val backend=Backend();val audio=Audio();var closed=0
        audio.beforeRelease={yield()}
        val controller=AndroidPlaybackController(MkrCatalog(backend),audio,{true},{closed++})
        controller.search("fixture");controller.play()
        val owner=launch(start=CoroutineStart.UNDISPATCHED) {
            try {awaitCancellation()} finally {controller.close()}
        }
        owner.cancelAndJoin();controller.close()
        assertEquals(1,audio.releases);assertEquals(1,closed);assertNull(audio.last)
    }
}
