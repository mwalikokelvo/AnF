// SPDX-License-Identifier: MIT
package com.anf.mkr.android

/** Native decoder acquisition boundary; no provider or service startup here. */
internal object DeferredNativePlayback {
    suspend fun create(factory: suspend () -> NativePlayback): NativePlayback = factory()
}
