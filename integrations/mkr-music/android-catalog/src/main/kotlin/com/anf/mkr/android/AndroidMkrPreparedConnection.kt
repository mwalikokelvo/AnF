// SPDX-License-Identifier: MIT
package com.anf.mkr.android

/** Browsing-only preparation. Deliberately not a playable page connection or
 * capability signal: explicit foreground promotion is a separate pending step.
 */
internal class AndroidMkrPreparedConnection(private val lease: AndroidMkrConnection) : AutoCloseable {
    val token get()=lease.token
    suspend fun search(query: String)=lease.search(query)
    suspend fun status()=lease.status()
    override fun close()=lease.close()
}
