// SPDX-License-Identifier: MIT
package com.anf.mkr

import kotlinx.serialization.json.*

internal const val MAX_PLAYER_BODY = 2 * 1024 * 1024
enum class PlayerDisposition { OK, LOGIN_REQUIRED, AGE_RESTRICTED, UNAVAILABLE, UNKNOWN }
data class PlayerDiagnostic(val disposition: PlayerDisposition, val adaptiveFormats: Int, val formats: Int)
data class PrimaryDiagnostic(val requests: Int, val playerRequested: Boolean, val firstPlayer: PlayerDiagnostic?)

// Never retain reason strings, video IDs, account/session data or signed URLs.
internal fun playerDiagnostic(bytes: ByteArray): PlayerDiagnostic? {
    if (bytes.size > MAX_PLAYER_BODY) return null
    return try {
        val text = bytes.decodeToString(throwOnInvalidSequence = true)
        var depth = 0; var quoted = false; var escaped = false
        for (c in text) {
            if (quoted) { if (escaped) escaped=false else if (c=='\\') escaped=true else if (c=='"') quoted=false }
            else when(c) { '"' -> quoted=true; '{','[' -> {depth++;if(depth>128)return null}; '}',']' -> {depth--;if(depth<0)return null} }
        }
        if (quoted || depth != 0) return null
        val root = Json.parseToJsonElement(text) as? JsonObject ?: return null
        val status = ((root["playabilityStatus"] as? JsonObject)?.get("status") as? JsonPrimitive)?.contentOrNull
        val disposition = when(status) {
            "OK" -> PlayerDisposition.OK
            "LOGIN_REQUIRED" -> PlayerDisposition.LOGIN_REQUIRED
            "AGE_CHECK_REQUIRED","AGE_VERIFICATION_REQUIRED","CONTENT_CHECK_REQUIRED" -> PlayerDisposition.AGE_RESTRICTED
            "UNPLAYABLE","VIDEO_UNAVAILABLE","LIVE_STREAM_OFFLINE" -> PlayerDisposition.UNAVAILABLE
            else -> PlayerDisposition.UNKNOWN
        }
        val data = root["streamingData"] as? JsonObject
        PlayerDiagnostic(disposition,(data?.get("adaptiveFormats") as? JsonArray)?.size?.coerceAtMost(10000) ?: 0,
            (data?.get("formats") as? JsonArray)?.size?.coerceAtMost(10000) ?: 0)
    } catch (_: Exception) { null }
}
