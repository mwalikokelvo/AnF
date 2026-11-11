// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.content.Context
import android.webkit.WebView
import com.anf.mkr.MkrCatalog
import com.anf.mkr.UpstreamCatalogBackend
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Native Java lifecycle API for an optional, reviewed host build.
 * This library is not registered or linked into the production AnF application.
 * Forward main-frame navigation, then close before renderer recovery/destruction.
 * No renderer-supplied factories, URLs, credentials or external-player fallback.
 */
class MkrPageLifecycle private constructor(private val page: AndroidMkrPageHost) : AutoCloseable {
    fun onPageStarted()=page.onPageStarted()
    fun onPageFinished(url: String?)=page.onPageFinished(url)
    override fun close()=page.close()
    companion object {
        // Holds no Activity/WebView. Catalog/decoder construction remains lazy.
        private val owner=AndroidMkrOwner { context, handoff ->
            val backend=UpstreamCatalogBackend()
            AndroidPlaybackController(MkrCatalog(backend),Media3Playback.createDeferred(context),
                {handoff.requestPause()},{backend.close()})
        }
        @JvmStatic fun attach(web: WebView, origin: String): MkrPageLifecycle = attach(web,origin,owner)
        internal fun attach(web: WebView, origin: String, owner: AndroidMkrOwner): MkrPageLifecycle {
            val app=web.context.applicationContext
            return MkrPageLifecycle(AndroidMkrPageHost(web,origin.removeSuffix("/"),owner.handoff){owner.connect(app)})
        }
    }
}

/** One process-local native owner, shared by recreated Activity pages. */
internal class AndroidMkrOwner(private val factory: suspend (Context, AndroidAudioHandoff) -> AndroidPlaybackController) {
    val handoff=AndroidAudioHandoff()
    private val gate=Mutex()
    suspend fun connect(context: Context): AndroidMkrPageConnection = gate.withLock {
        MkrPlaybackService.prepare(context.applicationContext,factory(context.applicationContext,handoff))
    }
}
