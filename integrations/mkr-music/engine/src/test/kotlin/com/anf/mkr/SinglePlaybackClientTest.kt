// SPDX-License-Identifier: MIT
package com.anf.mkr

import com.metrolist.innertubex.extraction.ContentHints
import com.metrolist.innertubex.extraction.strategy.*
import com.metrolist.innertubex.models.YouTubeClient
import kotlin.test.*

class SinglePlaybackClientTest {
    @Test fun failedSelectionDoesNotRotateToAnotherClientOrPretendEntitlement() {
        var choices = listOf(YouTubeClient.WEB,YouTubeClient.IOS)
        val strategy = SinglePlaybackClient(object : ClientFallbackStrategy {
            override fun resolveClients(hints: ContentHints) = choices
        })
        val request = ClientSelectionRequest(ContentHints(),authenticated=false)
        assertEquals(listOf(YouTubeClient.WEB),strategy.selectClients(request).candidates.map { it.client })
        choices = listOf(YouTubeClient.IOS)
        assertTrue(strategy.selectClients(request).candidates.isEmpty())
        assertTrue(strategy.selectClients(request.copy(authenticated=true)).candidates.isEmpty())
        assertTrue(strategy.selectClients(request.copy(premium=true)).candidates.isEmpty())
    }
}
