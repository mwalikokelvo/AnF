// SPDX-License-Identifier: MIT
package com.anf.mkr

import java.io.IOException
import java.util.Collections
import java.util.IdentityHashMap

enum class ResolutionReason {
    VERIFICATION_OR_LIMIT, AUTHENTICATION_REQUIRED, CONTENT_RESTRICTED,
    NETWORK, PARSER, UNSUPPORTED_AUDIO, UNSUPPORTED_TRANSPORT, ACCESS_DENIED, RATE_LIMITED, NATIVE_ENGINE_UNAVAILABLE, UPSTREAM_FAILURE
}

/** Deliberately has no upstream cause/message: these can contain signed URLs. */
class MkrResolutionException(val reason: ResolutionReason, val providerStop: ProviderStopReason? = null, val providerDiagnostic: PrimaryDiagnostic? = null) : IllegalStateException(
    "MKR stream resolution failed ($reason${providerStop?.let { ", policy=$it" } ?: ""}${providerDiagnostic?.let { ", $it" } ?: ""}). No credential rotation or external player was used."
)

internal fun resolutionReason(error: Throwable): ResolutionReason {
    val seen = Collections.newSetFromMap(IdentityHashMap<Throwable, Boolean>())
    val chain = mutableListOf<Throwable>()
    var current: Throwable? = error
    while (current != null && chain.size < 8 && seen.add(current)) {
        chain.add(current)
        current = current.cause
    }
    val names = chain.map { it.javaClass.simpleName }.toSet()
    return when {
        "ReCaptchaException" in names -> ResolutionReason.VERIFICATION_OR_LIMIT
        names.any { it in setOf("LoginRequiredException", "AuthenticationException") } -> ResolutionReason.AUTHENTICATION_REQUIRED
        names.any { it in setOf("AgeRestrictedContentException", "PaidContentException", "PrivateContentException", "GeographicRestrictionException", "ContentNotAvailableException") } -> ResolutionReason.CONTENT_RESTRICTED
        "ParsingException" in names -> ResolutionReason.PARSER
        chain.any { it is IOException } -> ResolutionReason.NETWORK
        else -> ResolutionReason.UPSTREAM_FAILURE
    }
}
