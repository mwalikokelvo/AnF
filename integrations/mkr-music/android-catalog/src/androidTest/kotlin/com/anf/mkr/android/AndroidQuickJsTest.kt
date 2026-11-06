// SPDX-License-Identifier: MIT
package com.anf.mkr.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.dokar.quickjs.QuickJs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Exercise the pinned Android AAR's actual JNI, not the desktop JVM variant.
 * Generated expressions only; no provider request, downloaded player or network binding.
 */
@RunWith(AndroidJUnit4::class)
class AndroidQuickJsTest {
    @Test fun actualAndroidJniEvaluatesBytecodeAndRecoversFromScriptErrors(): Unit = runBlocking {
        assertEquals("com.anf.mkr.catalog.test",InstrumentationRegistry.getInstrumentation().context.packageName)
        withTimeout(10000) {
            repeat(3) {
                val js=QuickJs.create(Dispatchers.Default)
                try {
                    assertEquals(42,js.evaluate<Int>("6 * 7"))
                    assertEquals("undefined:undefined",js.evaluate<String>("typeof fetch + ':' + typeof XMLHttpRequest"))
                    assertEquals("321cba",js.evaluate<String>("(function(s){return s.split('').reverse().join('')})('abc123')"))
                    val bytecode=js.compile("'AnF Android JNI ' + (20 + 22)")
                    assertEquals("AnF Android JNI 42",js.evaluate<String>(bytecode))
                    val failure=runCatching{js.evaluate<String>("throw new Error('generated-fixture-error')")}.exceptionOrNull()
                    assertNotNull("Script exception must reach the caller",failure)
                    assertTrue(failure!!.message.orEmpty().contains("generated-fixture-error"))
                    assertEquals(8,js.evaluate<Int>("7 + 1"))
                } finally {js.close()}
            }
        }
    }
}
