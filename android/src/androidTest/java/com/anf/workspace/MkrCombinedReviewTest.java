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
  private static void capture(Instrumentation instrumentation,Activity activity,String name) throws Exception {
    java.util.concurrent.atomic.AtomicBoolean drawn=new java.util.concurrent.atomic.AtomicBoolean();
    instrumentation.runOnMainSync(()->{
      WebView web=RendererRecoveryTest.web(activity.getWindow().getDecorView());assertNotNull(web);
      // Browser animation callbacks do not fence Android's compositor. Require
      // the updated WebView visual state and a subsequent native draw frame.
      web.postVisualStateCallback(1,new WebView.VisualStateCallback(){
        @Override public void onComplete(long requestId){
          web.postInvalidateOnAnimation();
          web.postOnAnimation(()->web.postOnAnimation(()->drawn.set(true)));
        }
      });
    });
    RendererRecoveryTest.until(instrumentation,drawn::get);
    instrumentation.waitForIdleSync();
    android.graphics.Bitmap bitmap=instrumentation.getUiAutomation().takeScreenshot();
    assertNotNull("Actual combined UI screenshot missing",bitmap);
    try(java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()){
      assertTrue(bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out));
      assertTrue("Review screenshot exceeds the instrumentation result limit",out.size()<512000);
      android.os.Bundle result=new android.os.Bundle();
      result.putString(name,android.util.Base64.encodeToString(out.toByteArray(),android.util.Base64.NO_WRAP));
      // Instrumentation owns these generated emulator screenshots. Export via
      // its result channel, without making the release-derived app debuggable.
      instrumentation.addResults(result);
    }finally{bitmap.recycle();}
  }
  /** Compare actual web controls in screen pixels with Android's system-bar safe
   * bounds. DOM visibility alone does not catch controls drawn under navigation. */
  private static void navigationInsideSystemBars(Instrumentation instrumentation,Activity activity,String phase) throws Exception {
    AtomicReference<String> raw=new AtomicReference<>();
    instrumentation.runOnMainSync(()->RendererRecoveryTest.web(activity.getWindow().getDecorView()).evaluateJavascript(
      "(()=>{const controls=[...document.querySelectorAll('.bottom-nav button')].filter(b=>!b.closest('[hidden]')&&b.getClientRects().length);return JSON.stringify({width:innerWidth,bottom:Math.max(...controls.map(b=>b.getBoundingClientRect().bottom)),count:controls.length});})()",raw::set));
    RendererRecoveryTest.until(instrumentation,()->raw.get()!=null);
    JSONObject controls=new JSONObject((String)new JSONTokener(raw.get()).nextValue());
    assertTrue("Workspace navigation must exist",controls.getInt("count")>0);
    AtomicReference<String> geometry=new AtomicReference<>();
    instrumentation.runOnMainSync(()->{
      WebView web=RendererRecoveryTest.web(activity.getWindow().getDecorView());int[] position=new int[2];web.getLocationOnScreen(position);
      android.view.WindowMetrics metrics=activity.getWindowManager().getCurrentWindowMetrics();
      android.graphics.Insets bars=metrics.getWindowInsets().getInsetsIgnoringVisibility(android.view.WindowInsets.Type.systemBars()|android.view.WindowInsets.Type.displayCutout());
      try{
        double scale=(web.getWidth()-web.getPaddingLeft()-web.getPaddingRight())/controls.getDouble("width");
        double controlBottom=position[1]+web.getPaddingTop()+controls.getDouble("bottom")*scale;
        int safeBottom=metrics.getBounds().bottom-bars.bottom;
        geometry.set("phase="+phase+",controlBottom="+controlBottom+",safeBottom="+safeBottom+",webTop="+position[1]+",webHeight="+web.getHeight()+",paddingTop="+web.getPaddingTop()+",paddingBottom="+web.getPaddingBottom());
        android.os.Bundle report=new android.os.Bundle();report.putString("anf-navigation-geometry-"+phase,geometry.get());instrumentation.addResults(report);
        assertTrue("Workspace navigation overlaps Android system controls: "+geometry.get(),controlBottom<=safeBottom+1);
      }catch(org.json.JSONException error){throw new AssertionError(error);}
    });
  }
  private static JSONObject state(Instrumentation instrumentation,Activity activity) throws Exception {
    AtomicReference<String> value=new AtomicReference<>();
    instrumentation.runOnMainSync(()->{
      WebView web=RendererRecoveryTest.web(activity.getWindow().getDecorView());
      if(web==null){value.set("null");return;}
      web.evaluateJavascript("(()=>{const visible=e=>!!e&&!e.closest('[hidden]')&&e.getClientRects().length>0;const light=c=>c.match(/[0-9.]+/g).slice(0,3).map(Number).map(v=>{const n=v/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);const box=document.querySelector('.mkr-browser');const background=box?light(getComputedStyle(box).backgroundColor):0;const minimum=box?Math.min(...[...box.querySelectorAll('h2,header>button,.mkr-search button,.mkr-empty h3')].map(e=>{const text=light(getComputedStyle(e).color);return(Math.max(text,background)+.05)/(Math.min(text,background)+.05);})):0;const source=[...document.querySelectorAll('button')].find(b=>b.textContent==='MKR Music'&&!b.hidden);return JSON.stringify({origin:location.origin,ready:!!source&&!source.disabled&&document.querySelector('#app')?.getAttribute('aria-busy')!=='true',sourceVisible:visible(source),music:document.body.classList.contains('music-view'),minimumContrast:minimum,backFontPx:parseFloat(box?getComputedStyle(box.querySelector('header>button')).fontSize:0),painted:window.anfMkrQaPainted===true,panel:visible(document.querySelector('.mkr-browser')),dock:visible(document.querySelector('.mkr-dock')),overflow:document.documentElement.scrollWidth>innerWidth});})()",value::set);
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
  private static boolean requestSpeechStop(Instrumentation instrumentation,Activity activity) throws Exception {
    String id=java.util.UUID.randomUUID().toString();
    instrumentation.runOnMainSync(()->RendererRecoveryTest.web(activity.getWindow().getDecorView()).evaluateJavascript(
      "window.anfQaSpeechPause=null;window.anfQaPreviousSpeechPause=window.AnFSpeechPauseResult;window.AnFSpeechPauseResult=(id,paused)=>{if(id==="+JSONObject.quote(id)+")window.anfQaSpeechPause=paused;};window.AnFAndroid.stopSpeakingConfirmed("+JSONObject.quote(id)+")",null));
    AtomicReference<String> value=new AtomicReference<>();
    long until=android.os.SystemClock.elapsedRealtime()+3500;
    do{
      value.set(null);
      instrumentation.runOnMainSync(()->RendererRecoveryTest.web(activity.getWindow().getDecorView()).evaluateJavascript("window.anfQaSpeechPause",value::set));
      RendererRecoveryTest.until(instrumentation,()->value.get()!=null);
      if("true".equals(value.get())||"false".equals(value.get()))break;
      Thread.sleep(30);
    }while(android.os.SystemClock.elapsedRealtime()<until);
    assertTrue("Actual native speech stop must return a matching boolean receipt", "true".equals(value.get())||"false".equals(value.get()));
    boolean accepted=Boolean.parseBoolean(value.get());
    instrumentation.runOnMainSync(()->RendererRecoveryTest.web(activity.getWindow().getDecorView()).evaluateJavascript("window.AnFSpeechPauseResult=window.anfQaPreviousSpeechPause;delete window.anfQaPreviousSpeechPause;delete window.anfQaSpeechPause",null));
    return accepted;
  }
  private static void speechStopReceipt(Instrumentation instrumentation,Activity activity) throws Exception {
    boolean accepted=requestSpeechStop(instrumentation,activity);
    if(accepted){
      java.lang.reflect.Field field=MainActivity.class.getDeclaredField("speech");field.setAccessible(true);
      android.speech.tts.TextToSpeech engine=(android.speech.tts.TextToSpeech)field.get(activity);
      assertNotNull(engine);assertFalse("An accepted stop receipt must observe an idle TTS engine",engine.isSpeaking());
    }
    android.os.Bundle receipt=new android.os.Bundle();receipt.putString("anf-speech-stop-accepted",String.valueOf(accepted));instrumentation.addResults(receipt);
  }
  private static void openVisibleMusic(Instrumentation instrumentation,Activity activity) throws Exception {
    ready(instrumentation,activity);
    instrumentation.runOnMainSync(()->RendererRecoveryTest.web(activity.getWindow().getDecorView()).evaluateJavascript("document.querySelector('button[role=tab][data-mode=listen]').click()",null));
    long until=android.os.SystemClock.elapsedRealtime()+15000;
    JSONObject current=state(instrumentation,activity);
    while(!current.optBoolean("sourceVisible")&&android.os.SystemClock.elapsedRealtime()<until){Thread.sleep(30);current=state(instrumentation,activity);}
    assertTrue("MKR source must be visible inside Music, not in a hidden ancestor",current.optBoolean("sourceVisible"));
    instrumentation.runOnMainSync(()->RendererRecoveryTest.web(activity.getWindow().getDecorView()).evaluateJavascript("window.anfMkrQaPainted=false;[...document.querySelectorAll('button')].find(b=>b.textContent==='MKR Music'&&!b.hidden&&!b.disabled).click()",null));
    until=android.os.SystemClock.elapsedRealtime()+15000;
    current=state(instrumentation,activity);
    while(!current.optBoolean("panel")&&android.os.SystemClock.elapsedRealtime()<until){Thread.sleep(30);current=state(instrumentation,activity);}
    assertTrue("MKR must open visibly inside the actual AnF workspace",current.optBoolean("panel"));
    assertTrue("Music navigation must remain selected",current.optBoolean("music"));
    assertFalse(current.optBoolean("dock"));assertFalse("Cold music UI overflows the phone",current.optBoolean("overflow"));
    // Native UI idle does not wait for WebView's compositor. Observe two actual
    // browser frames after the visible panel, rather than capture the old Home.
    instrumentation.runOnMainSync(()->RendererRecoveryTest.web(activity.getWindow().getDecorView()).evaluateJavascript("requestAnimationFrame(()=>requestAnimationFrame(()=>{window.anfMkrQaPainted=true;}))",null));
    until=android.os.SystemClock.elapsedRealtime()+15000;
    current=state(instrumentation,activity);
    while(!current.optBoolean("painted")&&android.os.SystemClock.elapsedRealtime()<until){Thread.sleep(30);current=state(instrumentation,activity);}
    assertTrue(current.optBoolean("painted"));assertTrue(current.optBoolean("panel"));
    assertTrue("Actual embedded music headings and buttons must have readable contrast",current.getDouble("minimumContrast")>=4.5);
    assertTrue("Embedded back button must not inherit the app header icon size",current.getDouble("backFontPx")<=16);
  }
  @SuppressWarnings("deprecation")
  private static boolean service(Context context){
    for(ActivityManager.RunningServiceInfo info:context.getSystemService(ActivityManager.class).getRunningServices(Integer.MAX_VALUE))
      if(SERVICE.equals(info.service.getClassName()))return true;
    return false;
  }
  /** Engine double only: the actual MainActivity bridge and JS receipt stay real.
   * No utterance is synthesized and no audible stop/device proof is claimed. */
  private static final class SpeechEngineDouble extends android.speech.tts.TextToSpeech {
    static final int DELAYED=0,DENIED=1,STUCK=2;
    volatile boolean speaking;
    volatile int mode;
    volatile long stoppedAt;
    final java.util.concurrent.atomic.AtomicInteger stops=new java.util.concurrent.atomic.AtomicInteger();
    final java.util.concurrent.atomic.AtomicInteger observations=new java.util.concurrent.atomic.AtomicInteger();
    SpeechEngineDouble(Context context){super(context,status->{});}
    void configure(int value){mode=value;speaking=true;stoppedAt=0;stops.set(0);observations.set(0);}
    @Override public int stop(){
      stops.incrementAndGet();stoppedAt=android.os.SystemClock.elapsedRealtime();
      if(mode==DENIED)return ERROR;
      if(mode==DELAYED)new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(()->speaking=false,90);
      return SUCCESS;
    }
    @Override public boolean isSpeaking(){observations.incrementAndGet();return speaking;}
  }
  @Test public void requestedSpeechStopRequiresSuccessAndObservedIdleWithEngineDouble() throws Exception {
    assertTrue(Build.HARDWARE.equals("ranchu")||Build.HARDWARE.equals("goldfish"));
    Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();Context context=instrumentation.getTargetContext();
    assertTrue(context.getPackageName().equals("com.anf.workspace.musicdev")||context.getPackageName().equals("com.coucou.workspace.musicdev"));
    Activity activity=instrumentation.startActivitySync(new Intent().setClassName(context,"com.anf.workspace.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    java.lang.reflect.Field engineField=MainActivity.class.getDeclaredField("speech"),requestedField=MainActivity.class.getDeclaredField("speechRequested");
    engineField.setAccessible(true);requestedField.setAccessible(true);
    android.speech.tts.TextToSpeech original=(android.speech.tts.TextToSpeech)engineField.get(activity);
    boolean originalRequested=requestedField.getBoolean(activity);
    AtomicReference<SpeechEngineDouble> model=new AtomicReference<>();
    try{
      ready(instrumentation,activity);
      instrumentation.runOnMainSync(()->model.set(new SpeechEngineDouble(context)));
      SpeechEngineDouble engine=model.get();
      for(int mode:new int[]{SpeechEngineDouble.DELAYED,SpeechEngineDouble.DENIED,SpeechEngineDouble.STUCK}){
        instrumentation.runOnMainSync(()->{
          engine.configure(mode);
          try{engineField.set(activity,engine);requestedField.setBoolean(activity,true);}catch(IllegalAccessException error){throw new AssertionError(error);}
        });
        boolean accepted=requestSpeechStop(instrumentation,activity);
        assertEquals("Requested speech must invoke the native STOP operation",1,engine.stops.get());
        if(mode==SpeechEngineDouble.DELAYED){
          assertTrue("Successful STOP must wait for the engine to become idle",accepted);
          assertFalse(engine.speaking);assertTrue(engine.observations.get()>=2);
          assertFalse("Only an accepted receipt may clear requested speech",requestedField.getBoolean(activity));
        }else{
          assertFalse("Denied or still-speaking engines must never authorize music",accepted);
          assertTrue(engine.speaking);assertTrue(requestedField.getBoolean(activity));
          if(mode==SpeechEngineDouble.STUCK){
            assertTrue(engine.observations.get()>=2);
            assertTrue("Busy timeout must observe the actual bounded deadline",android.os.SystemClock.elapsedRealtime()-engine.stoppedAt>=1800);
          }
        }
      }
      android.os.Bundle evidence=new android.os.Bundle();evidence.putString("anf-speech-policy-engine-double","success-denial-timeout");instrumentation.addResults(evidence);
    }finally{
      instrumentation.runOnMainSync(()->{
        try{engineField.set(activity,original);requestedField.setBoolean(activity,originalRequested);}catch(IllegalAccessException error){throw new AssertionError(error);}
        if(model.get()!=null){model.get().speaking=false;model.get().shutdown();}
        activity.finish();
      });
      RendererRecoveryTest.until(instrumentation,()->!service(context));
    }
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
      speechStopReceipt(instrumentation,activity);
      String origin=context.getPackageName().equals("com.coucou.workspace.musicdev")?"https://coucou.local":"https://anf.local";
      assertEquals(origin,state(instrumentation,activity).getString("origin"));
      openVisibleMusic(instrumentation,activity);
      assertFalse(activity.isFinishing());cold(context);
      capture(instrumentation,activity,"mkr-combined-cold.png");
      navigationInsideSystemBars(instrumentation,activity,"cold");
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
      openVisibleMusic(instrumentation,reopened);
      capture(instrumentation,reopened,"mkr-combined-reconnected.png");
      navigationInsideSystemBars(instrumentation,reopened,"reconnected");
      assertArrayEquals(saved,Files.readAllBytes(sentinel.toPath()));
    }finally{
      instrumentation.runOnMainSync(()->current.get().finish());
      RendererRecoveryTest.until(instrumentation,()->!service(context));Files.deleteIfExists(sentinel.toPath());
    }
  }
}
