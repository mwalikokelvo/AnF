// SPDX-License-Identifier: MIT
package com.anf.mkr

import kotlinx.coroutines.runBlocking

// Metadata diagnostics must declare the same transport support as the intended
// host. Success is NOT proof that bytes, lease admission or playback work.
internal suspend fun resolveProbeMetadata(catalog: MkrCatalog, id: String, legacy: Boolean): MkrStream =
    if (legacy) catalog.resolve(id, setOf(AudioContainer.M4A))
    else catalog.resolve(id, NativeStreamCapabilities.m4aRangeLease())

/** Opt-in public-catalog probe; never prints signed stream URLs or user data. */
fun main(args: Array<String>) = runBlocking {
    val backend = UpstreamCatalogBackend(legacyDiagnostic = args.firstOrNull() == "--legacy-resolve")
    val catalog = MkrCatalog(backend)
    try {
    if (args.size == 2 && args[0] in setOf("--resolve","--legacy-resolve")) {
        val stream = resolveProbeMetadata(catalog, args[1], legacy = args[0] == "--legacy-resolve")
        println("MKR metadata diagnostic returned ${stream.mimeType}; URL intentionally omitted. Lease admission and playback were not tested.")
        return@runBlocking
    }
    require(args.size == 1) { "Pass one public test search or --resolve <public video id>, not document context." }
    val tracks = catalog.search(args[0])
    println("MKR live catalog returned ${tracks.size} bounded track record(s).")
    check(tracks.isNotEmpty()) { "No public track was returned; native streaming is unverified." }
    val stream = resolveProbeMetadata(catalog, tracks.first().id, legacy = false)
    println("MKR metadata resolution returned ${stream.mimeType}; URL intentionally omitted. Lease admission and playback were not tested.")
    } finally { backend.close() }
}
