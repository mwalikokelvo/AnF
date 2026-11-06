// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import android.net.Uri
import android.os.*
import android.webkit.*
import com.anf.mkr.MkrTrack
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject

/** Owns one page's native connection. No JavascriptInterface or wildcard origin.
 * Attach after the trusted document finishes loading; revoke on every new main
 * navigation and Activity destruction. This library is not in the release app.
 */
internal class AndroidMkrWebPort private constructor(
    private val web: WebView,
    private val origin: String,
    private val connection: AndroidMkrConnection,
) : AutoCloseable {
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
    private val closed=AtomicBoolean()
    private val requests=mutableSetOf<String>()
    private val ports=web.createWebMessageChannel()
    private var transferred=false
    private fun trusted()=sameOrigin(web.url,origin)
    private fun reply(id: String, value: Any?, error: String?) {
        if(closed.get())return
        if(!trusted()){close();return}
        try {ports[0].postMessage(WebMessage(JSONObject().put("id",id)
            .put("value",value?:JSONObject.NULL).put("error",error?:JSONObject.NULL).toString()))}
        catch(error: Exception){close()}
    }
    private fun receive(data: String?) {
        if(closed.get())return
        if(!trusted() || data==null || data.length>8192 || !boundedNesting(data)){close();return}
        val request=try {JSONObject(data)}catch(error: Exception){close();return}
        val id=request.opt("id") as? String
        if(id==null || !id.matches(Regex("[0-9]{1,12}")) || id in requests){close();return}
        if(requests.size>=8){reply(id,null,"Music is busy. Try again.");return}
        requests.add(id)
        scope.launch {
            try {
                require(request.keys().asSequence().all{it in setOf("id","command","payload")})
                val command=request.get("command") as? String ?: error("Invalid command")
                val payload=if(request.has("payload"))request.get("payload") as? JSONObject ?: error("Invalid payload") else JSONObject()
                val result=dispatch(command,payload)
                reply(id,result,null)
            } catch(error: CancellationException){throw error}
            catch(error: Exception){reply(id,null,"Music request unavailable.")}
            finally {requests.remove(id)}
        }
    }
    private fun fields(payload: JSONObject, allowed: Set<String>) {
        require(payload.keys().asSequence().all{it in allowed})
    }
    private fun text(payload: JSONObject, key: String, max: Int): String {
        val value=payload.get(key) as? String ?: error("Invalid text")
        require(value.isNotEmpty() && value.length<=max && value.none{it.code<32 && it!='\n' && it!='\r' && it!='\t'})
        return value
    }
    private suspend fun dispatch(command: String, payload: JSONObject): Any {
        // Even capabilities requires a live approved native owner, never merely a class.
        return when(command) {
            "capabilities" -> {fields(payload,emptySet());connection.status()
                JSONObject().put("protocol",1).put("embedded",true).put("platform","android-native")}
            "open","hide" -> {fields(payload,emptySet());connection.status();JSONObject()}
            "status" -> {fields(payload,emptySet());state(connection.status())}
            "search" -> {fields(payload,setOf("query"));val query=text(payload,"query",500).trim()
                require(query.isNotEmpty());JSONArray().apply{connection.search(query).forEach{put(track(it))}}}
            "play" -> {fields(payload,setOf("id"));val id=if(payload.has("id"))text(payload,"id",256) else null
                state(connection.control(command,id=id))}
            "pause","previous","next" -> {fields(payload,emptySet());state(connection.control(command))}
            "seek" -> {fields(payload,setOf("positionMs"));val value=payload.get("positionMs")
                require(value is Int || value is Long)
                val position=(value as Number).toLong();require(position in 0L..9007199254740991L)
                state(connection.control(command,positionMs=position))}
            else -> error("Unsupported command")
        }
    }
    override fun close() {
        if(!closed.compareAndSet(false,true))return
        scope.cancel()
        val task=Runnable {
            // Inform the page before revocation; never serialize a native error.
            try {if(transferred && trusted())ports[0].postMessage(WebMessage("{\"event\":\"closed\"}"))}catch(error: Exception){ /* Page already gone. */ }
            try {ports[0].close()}catch(error: Exception){ /* Already detached. */ }
            try {if(!transferred)ports[1].close()}catch(error: Exception){ /* Transfer already owns it. */ }
            finally {requests.clear();connection.close()}
        }
        if(Looper.myLooper()==Looper.getMainLooper())task.run() else Handler(Looper.getMainLooper()).post(task)
    }
    companion object {
        // Bound recursive JSON parsing before handing input to the platform parser.
        private fun boundedNesting(value: String): Boolean {
            var depth=0;var quoted=false;var escaped=false
            for(character in value) {
                if(quoted) {
                    if(escaped)escaped=false else if(character=='\\')escaped=true else if(character=='"')quoted=false
                } else when(character) {
                    '"' -> quoted=true
                    '{','[' -> {depth++;if(depth>8)return false}
                    '}',']' -> {depth--;if(depth<0)return false}
                }
            }
            return depth==0 && !quoted
        }
        private fun sameOrigin(url: String?, origin: String): Boolean {
            if(url==null)return false
            val uri=Uri.parse(url);val expected=Uri.parse(origin)
            return uri.scheme=="https" && uri.host==expected.host && uri.userInfo==null && (uri.port==-1 || uri.port==443)
        }
        private fun track(track: MkrTrack)=JSONObject().put("id",track.id).put("title",track.title).put("artist",track.artist)
        private fun state(state: AndroidPlaybackState)=JSONObject().put("playing",state.audio.playing)
            .put("positionMs",state.audio.positionMs.coerceAtLeast(0)).put("durationMs",state.audio.durationMs.coerceAtLeast(0))
            .put("track",state.track?.let{track(it)}?:JSONObject.NULL)
        /** Owns connection only after successful attachment; caller closes on failure. */
        fun attach(web: WebView, origin: String, connection: AndroidMkrConnection): AndroidMkrWebPort {
            check(Looper.myLooper()==Looper.getMainLooper())
            require(origin in setOf("https://anf.local","https://coucou.local") && sameOrigin(web.url,origin))
            val host=AndroidMkrWebPort(web,origin,connection)
            try {
                host.ports[0].setWebMessageCallback(object : WebMessagePort.WebMessageCallback() {
                    override fun onMessage(port: WebMessagePort?, message: WebMessage?) {host.receive(message?.data)}
                })
                web.postWebMessage(WebMessage("anf-mkr-port-v1",arrayOf(host.ports[1])),Uri.parse(origin))
                host.transferred=true
                return host
            } catch(error: Exception){host.close();throw error}
        }
    }
}
