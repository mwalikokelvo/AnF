// SPDX-License-Identifier: MIT
package com.anf.mkr

import com.anf.mkr.windows.*
import java.net.http.HttpClient
import java.net.http.HttpHeaders
import java.net.http.HttpResponse
import java.nio.ByteBuffer
import java.util.concurrent.Flow
import kotlin.test.*

class MediaChunkInputTest {
    private fun info(code:Int=206, values:Map<String,List<String>> = mapOf(
        "Content-Range" to listOf("bytes 10-19/100"), "Content-Length" to listOf("10")
    )) = object : HttpResponse.ResponseInfo {
        override fun statusCode()=code
        override fun headers()=HttpHeaders.of(values) { _,_->true }
        override fun version()=HttpClient.Version.HTTP_1_1
    }
    @Test fun responseMustMatchExactBoundedSpanWithoutRedirectEncodingOrDuplicateFields() {
        val span=ByteSpan(10,19)
        validateMediaResponse(info(),span,100)
        for ((code,reason) in listOf(401 to MediaInputFailure.DENIED,403 to MediaInputFailure.DENIED,
            429 to MediaInputFailure.RATE_LIMITED,302 to MediaInputFailure.INVALID_RESPONSE,200 to MediaInputFailure.INVALID_RESPONSE)) {
            assertEquals(reason,assertFailsWith<MediaInputException> { validateMediaResponse(info(code),span,100) }.reason)
        }
        for (headers in listOf(
            mapOf("Content-Range" to listOf("bytes 10-20/100")),
            mapOf("Content-Range" to listOf("bytes 10-19/101")),
            mapOf("Content-Range" to listOf("bytes 10-19/*")),
            mapOf("Content-Range" to listOf("bytes 10-19/100"),"Content-Length" to listOf("9")),
            mapOf("Content-Range" to listOf("bytes 10-19/100"),"Content-Encoding" to listOf("gzip")),
            mapOf("Content-Range" to listOf("bytes 10-19/100","bytes 10-19/100")),
        )) assertFailsWith<MediaInputException> { validateMediaResponse(info(values=headers),span,100) }
    }

    private class Subscription:Flow.Subscription {
        var cancelled=false
        var demand=0L
        override fun request(n:Long) { demand+=n }
        override fun cancel() { cancelled=true }
    }
    @Test fun actualBodySubscriberBoundsMemoryAndRejectsShortLongAndCancelledBodies() {
        val good=BoundedAudioBody(4); val subscription=Subscription()
        good.onSubscribe(subscription)
        good.onNext(listOf(ByteBuffer.wrap(byteArrayOf(1,2)),ByteBuffer.wrap(byteArrayOf(3,4))))
        good.onComplete()
        assertContentEquals(byteArrayOf(1,2,3,4),good.body.toCompletableFuture().join())
        assertEquals(2,subscription.demand)
        for (count in listOf(2,5)) {
            val invalid=BoundedAudioBody(4); val sub=Subscription()
            invalid.onSubscribe(sub); invalid.onNext(listOf(ByteBuffer.wrap(ByteArray(count)))); invalid.onComplete()
            assertTrue(invalid.body.toCompletableFuture().isCompletedExceptionally)
            assertTrue(sub.cancelled)
        }
        val pending=BoundedAudioBody(4);val sub=Subscription()
        pending.onSubscribe(sub); pending.cancel()
        assertTrue(sub.cancelled); assertTrue(pending.body.toCompletableFuture().isCompletedExceptionally)
        // Network cause may carry private URLs; the subscriber keeps no cause.
        val failed=BoundedAudioBody(4)
        failed.onError(IllegalStateException("https://private.invalid/token"))
        val error=assertFails { failed.body.toCompletableFuture().join() }
        assertFalse(error.toString().contains("private.invalid"))
        assertNull(error.cause?.cause)
    }
}
