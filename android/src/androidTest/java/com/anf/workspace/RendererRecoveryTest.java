package com.anf.workspace;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import android.widget.Button;
import android.graphics.Bitmap;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import org.junit.Test;
import static org.junit.Assert.*;

/** Actual production Activity in a fresh disposable emulator; generated data only. */
public class RendererRecoveryTest {
  static void until(Instrumentation instrumentation,BooleanSupplier condition) throws Exception {
    long deadline=android.os.SystemClock.elapsedRealtime()+15000;AtomicBoolean ready=new AtomicBoolean();
    while(android.os.SystemClock.elapsedRealtime()<deadline){
      instrumentation.runOnMainSync(()->ready.set(condition.getAsBoolean()));
      if(ready.get())return;Thread.sleep(30);
    }
    throw new AssertionError("Timed out waiting for actual Activity recovery");
  }
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
    AtomicReference<Activity> current=new AtomicReference<>(activity);
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
      });
      assertNotNull("Native recovery action missing",recovery.get());
      assertTrue("Dead display remained attached",detached.get());
      Instrumentation.ActivityMonitor monitor=new Instrumentation.ActivityMonitor(MainActivity.class.getName(),null,false);
      instrumentation.addMonitor(monitor);
      Activity reopened;
      try {
        instrumentation.runOnMainSync(()->recovery.get().performClick());
        reopened=monitor.waitForActivityWithTimeout(15000);
      } finally {instrumentation.removeMonitor(monitor);}
      assertNotNull("Recovery button did not reopen the real Activity",reopened);current.set(reopened);
      until(instrumentation,()->{
        WebView view=web(reopened.getWindow().getDecorView());
        return view!=null && view.getProgress()==100 && view.getWebViewRenderProcess()!=null;
      });
      assertArrayEquals(saved,Files.readAllBytes(sentinel.toPath()));
      // Kill the real renderer once. This is not a simulated WebView callback.
      AtomicBoolean terminated=new AtomicBoolean();
      instrumentation.runOnMainSync(()->terminated.set(web(reopened.getWindow().getDecorView()).getWebViewRenderProcess().terminate()));
      assertTrue("Could not terminate the disposable renderer",terminated.get());
      until(instrumentation,()->{
        Button button=reload(reopened.getWindow().getDecorView());
        return button!=null && button.isShown() && button.getWidth()>0;
      });
      instrumentation.waitForIdleSync();
      instrumentation.getUiAutomation().waitForIdle(250,5000);
      int[] location=new int[2];int[] size=new int[2];
      instrumentation.runOnMainSync(()->{
        Button button=reload(reopened.getWindow().getDecorView());button.getLocationOnScreen(location);
        size[0]=button.getWidth();size[1]=button.getHeight();
      });
      Bitmap screenshot=instrumentation.getUiAutomation().takeScreenshot();assertNotNull(screenshot);
      assertNotEquals("Screenshot captured a blank transitional frame",
        screenshot.getPixel(1,location[1]+size[1]/2),screenshot.getPixel(location[0]+size[0]/2,location[1]+size[1]/4));
      try(FileOutputStream out=new FileOutputStream(new File(context.getExternalFilesDir("qa"),"renderer-recovery.png"))){
        assertTrue(screenshot.compress(Bitmap.CompressFormat.PNG,100,out));
      } finally {screenshot.recycle();}
      instrumentation.runOnMainSync(reopened::onBackPressed);
      assertArrayEquals(saved,Files.readAllBytes(sentinel.toPath()));
    } finally {instrumentation.runOnMainSync(()->current.get().finish());Files.deleteIfExists(sentinel.toPath());}
  }
}
