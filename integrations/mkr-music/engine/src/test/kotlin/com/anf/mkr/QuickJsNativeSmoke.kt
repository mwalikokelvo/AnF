// SPDX-License-Identifier: MIT
package com.anf.mkr

import com.dokar.quickjs.QuickJs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking

/** Explicit hosted JNI QA only; no test annotation, provider input or network binding. */
object QuickJsNativeSmoke {
    @JvmStatic fun main(args: Array<String>) = runBlocking {
        check(System.getProperty("os.name").startsWith("Windows"))
        check(!System.getProperty("com.dokar.quickjs.library.path").isNullOrBlank())
        val js=QuickJs.create(Dispatchers.Default)
        try {
            check(js.evaluate<Int>("6 * 7")==42)
            check(js.evaluate<String>("typeof fetch")=="undefined")
            val bytecode=js.compile("'AnF JNI ' + (20 + 22)")
            check(js.evaluate<String>(bytecode)=="AnF JNI 42")
        } finally {js.close()}
        println("ANF_QUICKJS_REBUILT_JNI_PASS: arithmetic, compile/evaluate, close; no provider or networking")
    }
}
