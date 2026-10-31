// SPDX-License-Identifier: MIT
package com.anf.mkr

import io.ktor.client.call.body
import io.ktor.client.engine.mock.*
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import kotlin.test.*

class PlayerResponseDiagnosticsTest {
    @Test fun successfulBodyIsReplayedToTheRealDecoderAndOnlySafeCountsRemain() = runBlocking {
        val text="""{"playabilityStatus":{"status":"OK","reason":"private reason"},"streamingData":{"adaptiveFormats":[{"url":"https://private.invalid/secret"}],"formats":[{},{}]},"videoDetails":{"videoId":"private-id"}}"""
        val policy=PrimaryRequestPolicy()
        val client=primaryHttpClient(policy,MockEngine { respond(text,headers=headersOf(HttpHeaders.ContentType,"application/json")) })
        try {
            val body=client.get("https://music.youtube.com/youtubei/v1/player").body<JsonObject>()
            assertEquals("private-id",body["videoDetails"]!!.jsonObject["videoId"]!!.jsonPrimitive.content)
            val diagnostic=policy.diagnostic()
            assertEquals(1,diagnostic.requests)
            assertEquals(PlayerDiagnostic(PlayerDisposition.OK,1,2),diagnostic.firstPlayer)
            assertFalse(diagnostic.toString().contains("private"));assertFalse(diagnostic.toString().contains("https://"))
        } finally {client.close()}
    }

    @Test fun loginAndContentDenialsStopBeforeAnySecondPlayerOrOtherRequest() = runBlocking {
        for((status,reason) in listOf("LOGIN_REQUIRED" to ProviderStopReason.AUTHENTICATION,"AGE_CHECK_REQUIRED" to ProviderStopReason.PLAYABILITY,"UNPLAYABLE" to ProviderStopReason.PLAYABILITY)) {
            var requests=0
            val policy=PrimaryRequestPolicy()
            val client=primaryHttpClient(policy,MockEngine { requests++;respond("""{"playabilityStatus":{"status":"$status","reason":"private-cookie-value"}}""") })
            try {
                val failure=assertFailsWith<ProviderRequestStopped> {client.get("https://music.youtube.com/youtubei/v1/player")}
                assertEquals(reason,failure.reason);assertNotNull(failure.diagnostic.firstPlayer)
                assertFalse(failure.message!!.contains("private-cookie"))
                assertFailsWith<ProviderRequestStopped> {client.get("https://www.youtube.com/watch")}
                assertEquals(1,requests)
            } finally {client.close()}
        }
    }

    @Test fun unknownAndMalformedPlayerBodiesFailWithoutRawBodyInErrors() = runBlocking {
        for(body in listOf("<html>private challenge</html>","{}","""{"playabilityStatus":{"status":"private-status"}}""", "\"private string\"")) {
            val client=primaryHttpClient(PrimaryRequestPolicy(),MockEngine {respond(body)})
            try {
                val failure=assertFailsWith<ProviderRequestStopped> {client.get("https://music.youtube.com/youtubei/v1/player")}
                assertEquals(ProviderStopReason.PLAYER_BODY,failure.reason)
                assertFalse(failure.message!!.contains("private"))
            } finally {client.close()}
        }
    }

    @Test fun oversizeAndOverdeepResponsesAreRejectedBeforeUnboundedParsing() = runBlocking {
        assertNull(playerDiagnostic(("[".repeat(129)+"0"+"]".repeat(129)).encodeToByteArray()))
        val body="x".repeat(MAX_PLAYER_BODY+1)
        val client=primaryHttpClient(PrimaryRequestPolicy(),MockEngine {respond(body)})
        try {
            assertEquals(ProviderStopReason.PLAYER_BODY,assertFailsWith<ProviderRequestStopped>{client.get("https://music.youtube.com/youtubei/v1/player")}.reason)
        } finally {client.close()}
    }

    @Test fun duplicatePlayerAndTotalBudgetHaveDifferentSafeDiagnostics() = runBlocking {
        val policy=PrimaryRequestPolicy()
        val client=primaryHttpClient(policy,MockEngine {respond("""{"playabilityStatus":{"status":"OK"}}""")})
        try {
            client.get("https://music.youtube.com/youtubei/v1/player")
            val failure=assertFailsWith<ProviderRequestStopped>{client.get("https://music.youtube.com/youtubei/v1/player")}
            assertEquals(ProviderStopReason.PLAYER_RETRY,failure.reason)
            assertEquals(PlayerDisposition.OK,failure.diagnostic.firstPlayer!!.disposition)
        } finally {client.close()}
        val limited=primaryHttpClient(PrimaryRequestPolicy(1),MockEngine {respond("plain page")})
        try {
            assertEquals("plain page",limited.get("https://www.youtube.com/watch").bodyAsText())
            assertEquals(ProviderStopReason.REQUEST_BUDGET,assertFailsWith<ProviderRequestStopped>{limited.get("https://www.youtube.com/iframe_api")}.reason)
        } finally {limited.close()}
    }
}
