// SPDX-License-Identifier: MIT
package com.anf.mkr

import com.anf.mkr.windows.MediaChunkSource
import com.anf.mkr.windows.WindowsMediaBridge
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** Explicit engineering probe: generated AAC -> JVM lease -> real muted WinRT.
 * No provider request and no production loader/IPC capability is enabled.
 */
fun main() {
    check(System.getProperty("os.name").startsWith("Windows")) { "Windows fixture probe only." }
    val fixture = Path.of(requireNotNull(System.getenv("ANF_MKR_TEST_AUDIO")) { "Choose a generated AAC fixture." })
    val native = Path.of(requireNotNull(System.getenv("ANF_MKR_NATIVE_TEST_EXE")) { "Build/select the native test harness." })
    check(Files.isRegularFile(fixture) && Files.size(fixture) in 1..5_242_880) { "Invalid generated fixture size." }
    check(Files.isRegularFile(native) && native.fileName.toString().startsWith("anf_mkr_windows_audio-")) { "Select the explicit cargo test harness." }
    val bytes = Files.readAllBytes(fixture)
    val calls = AtomicInteger()
    val stream = MkrStream("https://r1.googlevideo.com/generated-fixture", "audio/mp4", emptyMap(),
        true,true,65_536,bytes.size.toLong(),System.currentTimeMillis()+60_000)
    WindowsMediaBridge(stream,MediaChunkSource { _, span ->
        calls.incrementAndGet()
        bytes.copyOfRange(span.start.toInt(),span.end.toInt()+1)
    }).use { bridge ->
        val builder = ProcessBuilder(native.toAbsolutePath().toString(),"--exact",
            "tests::real_muted_playback_seek_pause_and_resume","--ignored","--test-threads=1")
            .redirectErrorStream(true)
        // The ephemeral token stays in an owned child environment. Never print
        // it, a provider URL, request headers or the whole process environment.
        builder.environment()["ANF_MKR_TEST_HTTP"] = bridge.leaseUri.toString()
        val process = builder.start()
        try {
            check(process.waitFor(40,TimeUnit.SECONDS)) { "Muted native bridge probe timed out." }
            val output = process.inputStream.use { it.readNBytes(65_536) }.toString(Charsets.UTF_8)
            check(process.exitValue()==0 && output.contains("1 passed; 0 failed") && calls.get()>0) {
                "Muted native bridge probe failed; no lease/source details retained."
            }
        } finally { if (process.isAlive) process.destroyForcibly() }
    }
    println("PASS: generated AAC through bounded JVM loopback to actual muted Windows decoder, including failure recovery, seek, deadlines and reopen. No provider streaming or AnF app integration claimed.")
}
