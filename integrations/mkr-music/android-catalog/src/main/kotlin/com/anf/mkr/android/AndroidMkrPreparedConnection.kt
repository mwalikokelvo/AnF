// SPDX-License-Identifier: MIT
package com.anf.mkr.android

/** Experimental page lease; production Activity/runtime linkage remains absent. */
internal class AndroidMkrPreparedConnection(private val lease: AndroidMkrConnection) : AndroidMkrPageConnection {
    val token get()=lease.token
    override suspend fun search(query: String)=lease.search(query)
    override suspend fun status()=lease.status()
    override suspend fun control(command: String, id: String?, positionMs: Long?)=lease.control(command,id,positionMs)
    override fun close()=lease.close()
}
