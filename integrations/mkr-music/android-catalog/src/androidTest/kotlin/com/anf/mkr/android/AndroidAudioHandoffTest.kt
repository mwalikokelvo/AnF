// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AndroidAudioHandoffTest {
    @Test fun acknowledgementsAreSingleUseAndBoundToCurrentPage() = runBlocking {
        val owner=AndroidAudioHandoff();assertFalse(owner.requestPause())
        val sent=Channel<String>(Channel.UNLIMITED)
        val first=withContext(Dispatchers.Main.immediate){owner.attach{sent.trySend(it);true}}
        val denied=async{owner.requestPause()};val token=withTimeout(2000){sent.receive()}
        withContext(Dispatchers.Main.immediate){assertFalse(first.acknowledge("wrong",true))}
        assertFalse(denied.isCompleted)
        withContext(Dispatchers.Main.immediate){assertTrue(first.acknowledge(token,false));assertFalse(first.acknowledge(token,true))}
        assertFalse(denied.await())
        val superseded=async{owner.requestPause()};val oldToken=withTimeout(2000){sent.receive()}
        val second=withContext(Dispatchers.Main.immediate){owner.attach{sent.trySend(it);true}}
        assertFalse(superseded.await())
        val allowed=async{owner.requestPause()};val current=withTimeout(2000){sent.receive()}
        assertNotEquals(oldToken,current)
        withContext(Dispatchers.Main.immediate){first.close();assertFalse(first.acknowledge(oldToken,true));assertFalse(second.acknowledge(oldToken,true))}
        assertFalse(allowed.isCompleted)
        withContext(Dispatchers.Main.immediate){assertTrue(second.acknowledge(current,true));assertFalse(second.acknowledge(current,true))}
        assertTrue(allowed.await())
        val cancelled=async{owner.requestPause()};val cancelledToken=withTimeout(2000){sent.receive()}
        cancelled.cancelAndJoin()
        withContext(Dispatchers.Main.immediate){assertFalse(second.acknowledge(cancelledToken,true));second.close()}
        assertFalse(owner.requestPause());sent.close()
    }
    @Test fun timeoutAndDetachedPageCannotApprovePlayback() = runBlocking {
        val owner=AndroidAudioHandoff();var token=""
        val binding=withContext(Dispatchers.Main.immediate){owner.attach{token=it;true}}
        val start=SystemClock.elapsedRealtime()
        assertFalse(withTimeout(6000){owner.requestPause()})
        assertTrue(SystemClock.elapsedRealtime()-start>=3500)
        withContext(Dispatchers.Main.immediate){assertFalse(binding.acknowledge(token,true))}
        val waiting=async{owner.requestPause()}
        yield();withContext(Dispatchers.Main.immediate){binding.close()}
        assertFalse(withTimeout(1000){waiting.await()});assertFalse(owner.requestPause())
    }
}
