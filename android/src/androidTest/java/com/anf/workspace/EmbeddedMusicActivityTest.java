package com.anf.workspace;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Looper;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import static org.junit.Assert.*;

/** Real AnF Activity callbacks; native player itself is separately exercised. */
public class EmbeddedMusicActivityTest {
  @Test public void navigationAndRecoveryRevokeMusicBeforeDestroyingThePage() throws Exception {
    assertTrue(Build.HARDWARE.equals("ranchu")||Build.HARDWARE.equals("goldfish"));
    Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();Context context=instrumentation.getTargetContext();
    File sentinel=File.createTempFile("music-lifecycle-qa-",".txt",context.getFilesDir());
    byte[] saved="Generated music lifecycle marker".getBytes(StandardCharsets.UTF_8);Files.write(sentinel.toPath(),saved);
    Activity activity=instrumentation.startActivitySync(new Intent().setClassName(context,"com.anf.workspace.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    AtomicInteger started=new AtomicInteger(),finished=new AtomicInteger(),closed=new AtomicInteger();
    AtomicReference<String> finishedUrl=new AtomicReference<>();AtomicReference<WebView> original=new AtomicReference<>();
    try {
      RendererRecoveryTest.until(instrumentation,()->{
        WebView web=RendererRecoveryTest.web(activity.getWindow().getDecorView());
        return web!=null&&web.getProgress()==100&&web.getWebViewRenderProcess()!=null;
      });
      instrumentation.waitForIdleSync();
      Field field=MainActivity.class.getDeclaredField("embeddedMusic");field.setAccessible(true);
      instrumentation.runOnMainSync(()->{
        WebView web=RendererRecoveryTest.web(activity.getWindow().getDecorView());original.set(web);
        EmbeddedMusicPage probe=new EmbeddedMusicPage(){
          public void onPageStarted(){assertEquals(Looper.getMainLooper(),Looper.myLooper());started.incrementAndGet();}
          public void onPageFinished(String url){assertEquals(Looper.getMainLooper(),Looper.myLooper());finishedUrl.set(url);finished.incrementAndGet();}
          public void close(){
            assertEquals(Looper.getMainLooper(),Looper.myLooper());
            assertNotNull("Music must be revoked before the display is detached",web.getParent());
            closed.incrementAndGet();
          }
        };
        try {((EmbeddedMusicPage)field.get(activity)).close();field.set(activity,probe);}
        catch(ReflectiveOperationException error){throw new AssertionError(error);}
        WebViewClient client=web.getWebViewClient();
        client.onPageStarted(web,web.getUrl(),null);client.onPageFinished(web,web.getUrl());
      });
      assertEquals("Actual AnF page-start callback must revoke the previous channel",1,started.get());
      assertEquals("Actual AnF page-finish callback must attach the trusted page",1,finished.get());
      instrumentation.runOnMainSync(()->{
        WebView web=original.get();assertEquals(web.getUrl(),finishedUrl.get());
        WebViewClient client=web.getWebViewClient();
        assertTrue(client.onRenderProcessGone(web,new RenderProcessGoneDetail(){
          public boolean didCrash(){return false;}
          public int rendererPriorityAtExit(){return WebView.RENDERER_PRIORITY_IMPORTANT;}
        }));
        assertNotNull(RendererRecoveryTest.reload(activity.getWindow().getDecorView()));
        // Queued callbacks from the old display cannot reconnect after recovery.
        client.onPageStarted(web,finishedUrl.get(),null);client.onPageFinished(web,finishedUrl.get());
      });
      assertEquals(1,closed.get());assertEquals(1,started.get());assertEquals(1,finished.get());
      instrumentation.runOnMainSync(activity::finish);
      RendererRecoveryTest.until(instrumentation,activity::isDestroyed);
      assertEquals("Recovery plus onDestroy must close exactly once",1,closed.get());
      assertArrayEquals(saved,Files.readAllBytes(sentinel.toPath()));
    } finally {instrumentation.runOnMainSync(activity::finish);Files.deleteIfExists(sentinel.toPath());}
  }
}
