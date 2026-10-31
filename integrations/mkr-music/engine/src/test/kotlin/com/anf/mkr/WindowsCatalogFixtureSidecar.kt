// SPDX-License-Identifier: MIT
package com.anf.mkr

import com.anf.mkr.windows.MediaChunkSource
import com.anf.mkr.windows.WindowsCatalogSession
import java.nio.file.Files
import java.nio.file.Path

/** Test source only. Generated fixture bytes, no provider or user recordings. */
fun main() {
    // Deliberately broken children for parent framing/deadline QA. These modes
    // exist only in test source and never contact a service or read user media.
    when(System.getenv("ANF_MKR_TEST_MODE")) {
        "wrong-id" -> {
            println("""{"protocol":1,"id":99,"ok":true,"result":{}}""");System.out.flush()
            Thread.sleep(20_000);return
        }
        "oversized" -> {
            System.out.write(ByteArray(1_048_578){120});System.out.flush()
            Thread.sleep(20_000);return
        }
        "stall" -> {Thread.sleep(20_000);return}
    }
    val path=Path.of(requireNotNull(System.getenv("ANF_MKR_TEST_AUDIO")))
    require(Files.isRegularFile(path) && Files.size(path) in 1..5_242_880)
    val bytes=Files.readAllBytes(path)
    val hostMode=System.getenv("ANF_MKR_TEST_MODE")=="host"
    val backend=object:CatalogBackend {
        override suspend fun search(query:String):List<MkrTrack>{
            if(hostMode&&query=="slow")kotlinx.coroutines.delay(1500)
            val first=MkrTrack("abcdefghijk","Generated AAC","Fixture")
            val second=MkrTrack("lmnopqrstuv","Second generated AAC","Fixture")
            return if(hostMode&&query=="single")listOf(second)else if(hostMode)listOf(first,second)else listOf(first)
        }
        override suspend fun streams(videoId:String)=emptyList<Pair<Int,String>>()
        override suspend fun candidates(videoId:String):List<StreamCandidate> {
            require(videoId=="abcdefghijk"||(hostMode&&videoId=="lmnopqrstuv"))
            if(hostMode)kotlinx.coroutines.delay(1500)
            return listOf(StreamCandidate("https://r1.googlevideo.com/generated-fixture","audio/mp4",
                requireBoundedRange=true,useRangeChunks=true,rangeChunkSizeBytes=65_536,
                contentLengthBytes=bytes.size.toLong(),expiresAtEpochMs=System.currentTimeMillis()+60_000))
        }
    }
    WindowsCatalogSession(backend,requireNotNull(System.getenv("ANF_MKR_SESSION_NONCE")),MediaChunkSource { _,span ->
        bytes.copyOfRange(span.start.toInt(),span.end.toInt()+1)
    }).use { it.serve(System.`in`,System.out) }
    kotlin.system.exitProcess(0)
}
