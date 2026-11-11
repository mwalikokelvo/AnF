// SPDX-License-Identifier: MIT
package com.anf.mkr.android;

import android.graphics.Bitmap;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Compiles and exercises the same Java-facing callbacks needed by AnF's Activity. */
public final class JavaMkrLifecycleCallbacks extends WebViewClient {
    private final MkrPageLifecycle host;
    public JavaMkrLifecycleCallbacks(MkrPageLifecycle host) { this.host=host; }
    @Override public void onPageStarted(WebView view,String url,Bitmap icon) { host.onPageStarted(); }
    @Override public void onPageFinished(WebView view,String url) { host.onPageFinished(url); }
    public void closeBeforeDestroy() { host.close(); }
}
