// SPDX-License-Identifier: MIT
package com.anf.mkr

import io.ktor.client.engine.mock.*
import io.ktor.http.*
import io.ktor.http.content.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import kotlin.test.*

/** Inspect the actual pinned extractor's request OFFLINE, not another live retry. */
class PrimaryRequestContractTest {
    @Test fun realExtractorSendsSelectedIdAnonymouslyAndStopsOnFirstDenial() = runBlocking {
        var requests=0
        val engine=MockEngine { request ->
            requests++
            assertEquals(HttpMethod.Post,request.method)
            assertTrue(request.url.encodedPath.endsWith("/youtubei/v1/player"))
            assertNull(request.headers[HttpHeaders.Authorization])
            assertNull(request.headers[HttpHeaders.ProxyAuthorization])
            val body=when(val content=request.body) {
                is TextContent -> content.text
                is OutgoingContent.ByteArrayContent -> content.bytes().decodeToString()
                else -> error("Expected serialized player JSON")
            }
            assertTrue(body.toByteArray().size in 1..65536)
            val json=Json.parseToJsonElement(body).jsonObject
            assertEquals("abcdefghijk",json["videoId"]?.jsonPrimitive?.content)
            val client=json["context"]?.jsonObject?.get("client")?.jsonObject
            assertNotNull(client)
            assertTrue(client["clientName"]?.jsonPrimitive?.content?.isNotBlank()==true)
            assertTrue(client["clientVersion"]?.jsonPrimitive?.content?.isNotBlank()==true)
            // Public library client metadata from a synthetic request only.
            // Never dump the body, query values, cookies, tokens or provider URLs.
            val name=client["clientName"]!!.jsonPrimitive.content
            val version=client["clientVersion"]!!.jsonPrimitive.content
            assertTrue(name.matches(Regex("[A-Za-z0-9_.-]{1,80}")))
            assertTrue(version.matches(Regex("[A-Za-z0-9_.-]{1,80}")))
            assertFalse(name=="VISIONOS" && version=="0.1","Deprecated visionOS0.1 must not be selected automatically")
            println("ANF_OFFLINE_REQUEST_CONTRACT: "+buildJsonObject {
                put("clientName",name);put("clientVersion",version)
                put("selectedIdMatches",json["videoId"]?.jsonPrimitive?.content=="abcdefghijk")
                put("fieldMaskPresent",request.url.parameters["fields"]!=null || request.headers["X-Goog-FieldMask"]!=null)
                put("authorizationPresent",request.headers[HttpHeaders.Authorization]!=null)
                put("mockTransportOnly",true)
            })
            val integrity=json["serviceIntegrityDimensions"]?.jsonObject
            assertTrue(integrity?.get("poToken")?.jsonPrimitive?.contentOrNull.isNullOrEmpty())
            respond("""{"playabilityStatus":{"status":"UNPLAYABLE","reason":"private fixture reason"}}""",
                headers=headersOf(HttpHeaders.ContentType,"application/json"))
        }
        val resolver=PrimaryStreamResolver(engine)
        try {
            val failure=assertFailsWith<MkrResolutionException> {resolver.resolve("abcdefghijk")}
            assertEquals(ResolutionReason.CONTENT_RESTRICTED,failure.reason)
            assertEquals(ProviderStopReason.PLAYABILITY,failure.providerStop)
            assertEquals(1,requests)
            assertEquals(1,failure.providerDiagnostic?.requests)
            assertEquals(PlayerDisposition.UNAVAILABLE,failure.providerDiagnostic?.firstPlayer?.disposition)
            assertFalse(failure.message!!.contains("private fixture"))
        } finally {resolver.close()}
    }
}
