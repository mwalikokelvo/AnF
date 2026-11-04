// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.datasource.BaseDataSource
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import java.io.IOException

/** Media3 sees an opaque native receipt, never a provider URL or caller headers. */
internal class MkrMediaDataSource(private val lease: AndroidMediaLease) : BaseDataSource(true) {
    private var input: AndroidRangeInput? = null
    private var opened = false
    private var position = 0L
    private var remaining = 0L
    private var chunk = ByteArray(0)
    private var cursor = 0

    override fun open(spec: DataSpec): Long {
        close()
        if (spec.uri.toString() != lease.receipt || spec.httpMethod != DataSpec.HTTP_METHOD_GET
            || spec.httpBody != null || spec.httpRequestHeaders.isNotEmpty() || spec.position < 0)
            throw IOException("Invalid native music receipt.")
        lease.checkActive()
        transferInitializing(spec)
        val source = lease.input()
        input = source; position = spec.position
        try {
            val total = lease.stream.contentLengthBytes
            if (total != null && position > total) throw IOException("Audio seek is outside this source.")
            if (total == position) { chunk = ByteArray(0); remaining = 0 }
            else {
                val first = source.read(position, mediaChunkEnd(position,total,spec.length,lease.stream.rangeChunkSizeBytes))
                chunk = first.bytes
                remaining = first.total-position
            }
            if (spec.length != C.LENGTH_UNSET.toLong()) remaining = minOf(remaining, spec.length)
            cursor = 0; opened = true
            transferStarted(spec)
            return remaining
        } catch (error: Exception) {
            close()
            if (error is NativeInputFailure) throw error
            throw IOException("Native music input could not be opened.")
        }
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        require(offset >= 0 && length >= 0 && offset <= buffer.size-length)
        if (length == 0) return 0
        if (!opened) throw IOException("Native music input is closed.")
        lease.checkActive()
        if (remaining == 0L) return C.RESULT_END_OF_INPUT
        if (cursor == chunk.size) {
            val next = input!!.read(position, mediaChunkEnd(position,null,remaining,lease.stream.rangeChunkSizeBytes))
            chunk = next.bytes; cursor = 0
        }
        val count = minOf(length, chunk.size-cursor, minOf(remaining,Int.MAX_VALUE.toLong()).toInt())
        chunk.copyInto(buffer, offset, cursor, cursor+count)
        cursor += count; position += count; remaining -= count
        bytesTransferred(count)
        return count
    }
    override fun getUri(): Uri? = if(opened) Uri.parse(lease.receipt) else null
    override fun close() {
        input?.close(); input = null
        chunk = ByteArray(0); cursor = 0; remaining = 0
        if (opened) { opened = false; transferEnded() }
    }
    class Factory(private val lease: AndroidMediaLease) : DataSource.Factory {
        override fun createDataSource(): DataSource = MkrMediaDataSource(lease)
    }
}
