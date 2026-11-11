// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import com.anf.mkr.MkrTrack

/** Revocable lease on an approved native owner, not a runtime-presence check.
 * Implementations retain selected-track/audio-handoff policy and recheck the
 * lease after suspended work. Close must be idempotent and detach this page
 * without stopping service-owned playback. No stream URLs cross this boundary.
 *
 * This separates page transport from Binder so a future prepared owner can
 * perform preflight without starting a foreground service merely for discovery.
 * It does not install that lazy owner or a production Activity bootstrap.
 */
internal interface AndroidMkrPageConnection : AutoCloseable {
    suspend fun search(query: String): List<MkrTrack>
    suspend fun status(): AndroidPlaybackState
    suspend fun control(command: String, id: String?=null, positionMs: Long?=null): AndroidPlaybackState
}
