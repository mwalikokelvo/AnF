// SPDX-License-Identifier: MIT
package com.anf.mkr

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.runBlocking
import kotlin.test.*

class PrimaryRequestPolicyTest {
    @Test fun restrictedResponsesLatchWithoutAnotherNetworkRequest() = runBlocking {
        for (status in listOf(401, 403, 429)) {
            var requests = 0
            val client = primaryHttpClient(PrimaryRequestPolicy(), MockEngine { requests++; respond("", HttpStatusCode.fromValue(status)) })
            try {
                assertFailsWith<ProviderRequestStopped> { client.get("https://www.youtube.com/watch?v=abcdefghijk") }
                assertFailsWith<ProviderRequestStopped> { client.get("https://music.youtube.com/youtubei/v1/player") }
                assertEquals(1, requests)
            } finally { client.close() }
        }
    }

    @Test fun unconfiguredEndpointsAndCredentialsNeverReachTheNetwork() = runBlocking {
        for (url in listOf("https://example.invalid/", "http://www.youtube.com/", "https://www.youtube.com:8443/", "https://user:password@www.youtube.com/")) {
            var requests = 0
            val client = primaryHttpClient(PrimaryRequestPolicy(), MockEngine { requests++; respond("") })
            try { assertFailsWith<ProviderRequestStopped> { client.get(url) }; assertEquals(0, requests) } finally { client.close() }
        }
        var requests = 0
        val client = primaryHttpClient(PrimaryRequestPolicy(), MockEngine { requests++; respond("") })
        try {
            val failure = assertFailsWith<ProviderRequestStopped> { client.get("https://www.youtube.com/") { header("Authorization", "synthetic-private-fixture") } }
            assertFalse(failure.message!!.contains("synthetic-private")); assertEquals(0, requests)
        } finally { client.close() }
    }

    @Test fun redirectsAreNotFollowedAndPlayerRequestIsSingleAttempt() = runBlocking {
        var requests = 0
        val redirect = primaryHttpClient(PrimaryRequestPolicy(), MockEngine { requests++; respond("", HttpStatusCode.Found, headersOf("Location", "https://example.invalid/")) })
        try { assertFailsWith<ProviderRequestStopped> { redirect.get("https://www.youtube.com/") }; assertEquals(1, requests) } finally { redirect.close() }
        requests = 0
        val player = primaryHttpClient(PrimaryRequestPolicy(), MockEngine { requests++; respond("{\"playabilityStatus\":{\"status\":\"OK\"}}") })
        try {
            player.get("https://music.youtube.com/youtubei/v1/player")
            assertFailsWith<ProviderRequestStopped> { player.get("https://music.youtube.com/youtubei/v1/player") }
            assertEquals(1, requests)
        } finally { player.close() }
    }
}
