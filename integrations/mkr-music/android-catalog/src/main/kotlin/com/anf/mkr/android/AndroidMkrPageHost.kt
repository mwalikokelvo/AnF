// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.webkit.WebView

/** Page lifecycle boundary for an already approved service owner.
 * Engineering-only: not linked into the production AnF Activity.
 */
internal class AndroidMkrPageHost(
    private val web: WebView,
    private val origin: String,
    private val handoff: AndroidAudioHandoff,
    private val connect: suspend () -> AndroidMkrConnection,
) : AutoCloseable {
    fun onPageStarted() {}
    fun onPageFinished(url: String?) {}
    override fun close() {}
}
