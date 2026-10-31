// SPDX-License-Identifier: MIT
package com.anf.mkr

import java.net.SocketTimeoutException
import kotlin.test.*
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import org.schabi.newpipe.extractor.exceptions.ParsingException

class ResolutionFailureTest {
    @Test fun classificationsDoNotNeedMessagesOrUrls() {
        assertEquals(ResolutionReason.VERIFICATION_OR_LIMIT, resolutionReason(ReCaptchaException("private fixture message", "https://example.invalid/signed-fixture")))
        assertEquals(ResolutionReason.PARSER, resolutionReason(ParsingException("private fixture message")))
        assertEquals(ResolutionReason.NETWORK, resolutionReason(SocketTimeoutException("private fixture URL")))
        assertEquals(ResolutionReason.NETWORK, resolutionReason(IllegalStateException("wrapper", SocketTimeoutException("private"))))
        assertEquals(ResolutionReason.UPSTREAM_FAILURE, resolutionReason(IllegalStateException("unclassified")))
    }

    @Test fun safeFailureDoesNotAttachAnUpstreamCauseOrPrivateDetails() {
        val failure = MkrResolutionException(ResolutionReason.VERIFICATION_OR_LIMIT)
        assertNull(failure.cause)
        assertFalse(failure.message!!.contains("https://"))
        assertTrue(failure.message!!.contains("VERIFICATION_OR_LIMIT"))
    }
}
