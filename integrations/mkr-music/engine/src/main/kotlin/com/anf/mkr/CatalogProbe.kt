// SPDX-License-Identifier: MIT
package com.anf.mkr

import kotlinx.coroutines.runBlocking

/** Opt-in public-catalog probe; never prints signed stream URLs or user data. */
fun main(args: Array<String>) = runBlocking {
    val backend = UpstreamCatalogBackend(legacyDiagnostic = args.firstOrNull() == "--legacy-resolve")
    val catalog = MkrCatalog(backend)
    try {
    if (args.size == 2 && args[0] in setOf("--resolve","--legacy-resolve")) {
        val stream = catalog.resolve(args[1], setOf(AudioContainer.M4A))
        println("MKR direct diagnostic returned ${stream.mimeType}; URL intentionally omitted. No playback was tested here.")
        return@runBlocking
    }
    require(args.size == 1) { "Pass one public test search or --resolve <public video id>, not document context." }
    val tracks = catalog.search(args[0])
    println("MKR live catalog returned ${tracks.size} bounded track record(s).")
    check(tracks.isNotEmpty()) { "No public track was returned; native streaming is unverified." }
    val stream = catalog.resolve(tracks.first().id, setOf(AudioContainer.M4A))
    println("MKR live resolution returned compatible ${stream.mimeType}; URL intentionally omitted. No playback was tested here.")
    } finally { backend.close() }
}
