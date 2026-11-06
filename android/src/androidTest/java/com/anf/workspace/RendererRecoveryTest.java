package com.anf.workspace;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import android.widget.Button;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import static org.junit.Assert.*;

/** Actual production Activity in a fresh disposable emulator; generated data only. */
public class RendererRecoveryTest {
  static WebView web(View view){
    if(view instanceof WebView)return (WebView)view;
    if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){
      WebView found=web(((ViewGroup)view).getChildAt(i));if(found!=null)return found;
    }
    return null;
  }
  static Button reload(View view){
    if(view instanceof Button && "Reload workspace".contentEquals(((Button)view).getText()))return (Button)view;
    if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){
      Button found=reload(((ViewGroup)view).getChildAt(i));if(found!=null)return found;
    }
    return null;
  }
  @Test public void failedDisplayOffersRecoveryWithoutChangingSavedFiles() throws Exception {
    assertTrue("Disposable emulator required",Build.HARDWARE.equals("ranchu") || Build.HARDWARE.equals("goldfish"));
    android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
    Context context=instrumentation.getTargetContext();
    File sentinel=File.createTempFile("renderer-qa-",".txt",context.getFilesDir());
    byte[] saved="Generated renderer recovery marker".getBytes(StandardCharsets.UTF_8);Files.write(sentinel.toPath(),saved);
    Activity activity=instrumentation.startActivitySync(new Intent().setClassName(context,"com.anf.workspace.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    try {
      AtomicReference<WebView> original=new AtomicReference<>();AtomicBoolean handled=new AtomicBoolean();
      instrumentation.runOnMainSync(()->{
        original.set(web(activity.getWindow().getDecorView()));
        handled.set(original.get().getWebViewClient().onRenderProcessGone(original.get(),new RenderProcessGoneDetail(){
          public boolean didCrash(){return false;}
          public int rendererPriorityAtExit(){return WebView.RENDERER_PRIORITY_IMPORTANT;}
        }));
      });
      assertTrue("The Activity must handle a lost renderer instead of allowing process termination",handled.get());
      AtomicReference<Button> recovery=new AtomicReference<>();AtomicBoolean detached=new AtomicBoolean();
      instrumentation.runOnMainSync(()->{
        recovery.set(reload(activity.getWindow().getDecorView()));
        detached.set(original.get().getParent()==null && web(activity.getWindow().getDecorView())==null);
        activity.onBackPressed();
      });
      assertNotNull("Native recovery action missing",recovery.get());
      assertTrue("Dead display remained attached",detached.get());
      assertArrayEquals(saved,Files.readAllBytes(sentinel.toPath()));
    } finally {instrumentation.runOnMainSync(activity::finish);Files.deleteIfExists(sentinel.toPath());}
  }
}
