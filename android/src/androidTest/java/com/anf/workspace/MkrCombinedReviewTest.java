package com.anf.workspace;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.Instrumentation;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.webkit.WebView;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import static org.junit.Assert.*;

/** Real optional review APK and native cold channel. No search/provider/decoder. */
public class MkrCombinedReviewTest {
  private static final String SERVICE="com.anf.mkr.android.MkrPlaybackService";
  private static void capture(Instrumentation instrumentation,Context context,String name) throws Exception {
    instrumentation.waitForIdleSync();
    android.graphics.Bitmap bitmap=instrumentation.getUiAutomation().takeScreenshot();
    assertNotNull("Actual combined UI screenshot missing",bitmap);
    try(java.io.FileOutputStream out=new java.io.FileOutputStream(new File(context.getFilesDir(),name))){
      assertTrue(bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out));
    }finally{bitmap.recycle();}
  }
  private static JSONObject state(Instrumentation instrumentation,Activity activity) throws Exception {
    AtomicReference<String> value=new AtomicReference<>();
    instrumentation.runOnMainSync(()->{
      WebView web=RendererRecoveryTest.web(activity.getWindow().getDecorView());
      if(web==null){value.set("null");return;}
      web.evaluateJavascript("JSON.stringify({origin:location.origin,ready:[...document.querySelectorAll('button')].some(b=>b.textContent==='MKR Music'&&!b.hidden),panel:!!document.querySelector('.mkr-browser:not([hidden])'),dock:!!document.querySelector('.mkr-dock:not([hidden])'),overflow:document.documentElement.scrollWidth>innerWidth})",value::set);
    });
    RendererRecoveryTest.until(instrumentation,()->value.get()!=null);
    Object decoded=new JSONTokener(value.get()).nextValue();
    return decoded instanceof String?new JSONObject((String)decoded):new JSONObject();
  }
  private static void ready(Instrumentation instrumentation,Activity activity) throws Exception {
    long until=android.os.SystemClock.elapsedRealtime()+15000;
    while(android.os.SystemClock.elapsedRealtime()<until){if(state(instrumentation,activity).optBoolean("ready"))return;Thread.sleep(30);}
    throw new AssertionError("Actual AnF never received a live packaged MKR channel");
  }
  @SuppressWarnings("deprecation")
  private static boolean service(Context context){
    for(ActivityManager.RunningServiceInfo info:context.getSystemService(ActivityManager.class).getRunningServices(Integer.MAX_VALUE))
      if(SERVICE.equals(info.service.getClassName()))return true;
    return false;
  }
  @SuppressWarnings("deprecation")
  private static void cold(Context context){
    boolean found=false;
    for(ActivityManager.RunningServiceInfo info:context.getSystemService(ActivityManager.class).getRunningServices(Integer.MAX_VALUE)){
      if(SERVICE.equals(info.service.getClassName())){found=true;assertFalse("Browsing must not promote foreground",info.foreground);}
    }
    assertTrue("Native channel must belong to an actual bound service",found);
    for(android.service.notification.StatusBarNotification note:context.getSystemService(NotificationManager.class).getActiveNotifications())
      assertNotEquals("Cold MKR browsing must not create its media notification",37041,note.getId());
  }
  @Test public void packagedNativeChannelStaysInsideAnFAndRecoversWithoutProviderIO() throws Exception {
    assertTrue(Build.HARDWARE.equals("ranchu")||Build.HARDWARE.equals("goldfish"));
    Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();Context context=instrumentation.getTargetContext();
    assertTrue("Review identities only",context.getPackageName().equals("com.anf.workspace.musicdev")||context.getPackageName().equals("com.coucou.workspace.musicdev"));
    Class.forName("com.anf.mkr.android.MkrPageLifecycle",false,context.getClassLoader());
    ServiceInfo registered=context.getPackageManager().getServiceInfo(new ComponentName(context,SERVICE),0);
    assertFalse("Native service must not be exported",registered.exported);
    assertTrue((registered.getForegroundServiceType()&ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)!=0);
    File sentinel=File.createTempFile("combined-mkr-qa-",".txt",context.getFilesDir());
    byte[] saved="Generated combined review marker".getBytes(StandardCharsets.UTF_8);Files.write(sentinel.toPath(),saved);
    Activity activity=instrumentation.startActivitySync(new Intent().setClassName(context,"com.anf.workspace.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    AtomicReference<Activity> current=new AtomicReference<>(activity);
    try {
      ready(instrumentation,activity);cold(context);
      String origin=context.getPackageName().equals("com.coucou.workspace.musicdev")?"https://coucou.local":"https://anf.local";
      assertEquals(origin,state(instrumentation,activity).getString("origin"));
      instrumentation.runOnMainSync(()->RendererRecoveryTest.web(activity.getWindow().getDecorView()).evaluateJavascript("[...document.querySelectorAll('button')].find(b=>b.textContent==='MKR Music'&&!b.hidden).click()",null));
      long until=android.os.SystemClock.elapsedRealtime()+15000;
      JSONObject opened=state(instrumentation,activity);
      while(!opened.optBoolean("panel")&&android.os.SystemClock.elapsedRealtime()<until){Thread.sleep(30);opened=state(instrumentation,activity);}
      assertTrue("MKR must open inside the actual AnF workspace",opened.optBoolean("panel"));
      assertFalse(opened.optBoolean("dock"));assertFalse("Cold music UI overflows the phone",opened.optBoolean("overflow"));
      assertFalse(activity.isFinishing());cold(context);
      capture(instrumentation,context,"mkr-combined-cold.png");
      instrumentation.runOnMainSync(()->assertTrue(RendererRecoveryTest.web(activity.getWindow().getDecorView()).getWebViewRenderProcess().terminate()));
      RendererRecoveryTest.until(instrumentation,()->RendererRecoveryTest.reload(activity.getWindow().getDecorView())!=null&&!service(context));
      Instrumentation.ActivityMonitor monitor=new Instrumentation.ActivityMonitor(MainActivity.class.getName(),null,false);
      instrumentation.addMonitor(monitor);Activity reopened;
      try {
        instrumentation.runOnMainSync(()->RendererRecoveryTest.reload(activity.getWindow().getDecorView()).performClick());
        reopened=monitor.waitForActivityWithTimeout(15000);
      }finally{instrumentation.removeMonitor(monitor);}
      assertNotNull(reopened);current.set(reopened);ready(instrumentation,reopened);cold(context);
      assertEquals(origin,state(instrumentation,reopened).getString("origin"));
      capture(instrumentation,context,"mkr-combined-reconnected.png");
      assertArrayEquals(saved,Files.readAllBytes(sentinel.toPath()));
    }finally{
      instrumentation.runOnMainSync(()->current.get().finish());
      RendererRecoveryTest.until(instrumentation,()->!service(context));Files.deleteIfExists(sentinel.toPath());
    }
  }
}
