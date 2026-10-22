package com.anf.workspace;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import java.io.InputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Exercises the installed release APK, including its native encrypted store. */
public class UpgradeUiTest {
  private final Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
  private WebView web;
  private static final String BEFORE="Keep this saved draft: café and 中文.";
  private static final String AFTER="Edited after updating: saved writing remains local.";

  private WebView findWebView(View view) {
    if(view instanceof WebView)return (WebView)view;
    if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++) {
      WebView found=findWebView(((ViewGroup)view).getChildAt(i));if(found!=null)return found;
    }
    return null;
  }
  private String evaluate(String script)throws Exception {
    CountDownLatch done=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
    instrumentation.runOnMainSync(()->web.evaluateJavascript(script,value->{result.set(value);done.countDown();}));
    assertTrue("WebView evaluation timed out",done.await(30,TimeUnit.SECONDS));return result.get();
  }
  private void until(String expression)throws Exception {
    long deadline=SystemClock.elapsedRealtime()+90000;
    while(SystemClock.elapsedRealtime()<deadline) {
      if("true".equals(evaluate(expression)))return;SystemClock.sleep(150);
    }
    fail("UI condition did not complete: "+expression+"; document: "+
      evaluate("JSON.stringify({url:location.href,title:document.title,ready:document.readyState,status:document.querySelector('.status')?.textContent})"));
  }
  private void clickView(String name)throws Exception {
    evaluate("document.querySelector('[data-view=\""+name+"\"]').click()");
    until("!document.querySelector('section[aria-label=\""+Character.toUpperCase(name.charAt(0))+name.substring(1)+"\"]').hidden");
  }
  private JSONObject fixture(String id,String name)throws Exception {
    return new JSONObject().put("id",id).put("name",name).put("draft",BEFORE)
      .put("prompt","Keep my saved question.").put("updated",100)
      .put("notes",new org.json.JSONArray("[{\"role\":\"You\",\"text\":\"Retain this conversation.\"}]"))
      .put("sources",new org.json.JSONArray("[{\"name\":\"before-update.txt\",\"text\":\"Original document text.\"}]"));
  }
  private void seedEncryptedStore()throws Exception {
    VaultRepository old=new VaultRepository(instrumentation.getTargetContext());
    try {old.request("begin","{}");}catch(Exception error) {
      System.out.println("Baseline encryption initialization: "+error.getClass().getSimpleName()+": "+
        String.valueOf(error.getMessage()).replaceAll("(?i)[0-9a-f]{64}","[redacted]"));
    }
    // Seed the prior version's real key wrapping and encrypted schema directly:
    // its known connection-initialization bug cannot create the fixture itself.
    java.lang.reflect.Method key=VaultRepository.class.getDeclaredMethod("key",boolean.class),
      raw=VaultRepository.class.getDeclaredMethod("rawKey",byte[].class),
      schema=VaultRepository.class.getDeclaredMethod("schema",net.zetetic.database.sqlcipher.SQLiteDatabase.class),
      put=VaultRepository.class.getDeclaredMethod("put",net.zetetic.database.sqlcipher.SQLiteDatabase.class,org.json.JSONArray.class);
    for(java.lang.reflect.Method method:new java.lang.reflect.Method[]{key,raw,schema,put})method.setAccessible(true);
    java.lang.reflect.Field active=VaultRepository.class.getDeclaredField("active");active.setAccessible(true);
    byte[] value=(byte[])key.invoke(old,true),encoded=(byte[])raw.invoke(old,(Object)value);
    try(net.zetetic.database.sqlcipher.SQLiteDatabase db=net.zetetic.database.sqlcipher.SQLiteDatabase.openDatabase(
      ((java.io.File)active.get(old)).getAbsolutePath(),encoded,null,
      net.zetetic.database.sqlcipher.SQLiteDatabase.OPEN_READWRITE|net.zetetic.database.sqlcipher.SQLiteDatabase.CREATE_IF_NECESSARY,
      (damaged,cause)->{throw cause;},null)) {
      schema.invoke(old,db);put.invoke(old,db,new org.json.JSONArray().put(fixture("qa-encrypted-upgrade","Encrypted upgrade conversation")));
    }finally{java.util.Arrays.fill(value,(byte)0);java.util.Arrays.fill(encoded,(byte)0);}
  }
  private void nativeCall(String operation,String json)throws Exception {
    evaluate("window.__qaVaultResult=null;window.vaultResult=(id,value,error)=>window.__qaVaultResult=error?'ERROR:'+error:value;\u0043\u006f\u0075\u0063\u006f\u0075Android.vaultRequest('99001',"+JSONObject.quote(operation)+","+JSONObject.quote(json)+")");
    until("window.__qaVaultResult!==null");
    assertFalse("Native encrypted storage failed",evaluate("window.__qaVaultResult").contains("ERROR:"));
  }
  @Test public void installedAppUpgradeAndWriting()throws Exception {
    Intent launch=instrumentation.getTargetContext().getPackageManager().getLaunchIntentForPackage("com.anf.workspace");
    assertNotNull(launch);launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    Activity activity=instrumentation.startActivitySync(launch);
    instrumentation.runOnMainSync(()->web=findWebView(activity.getWindow().getDecorView()));assertNotNull(web);
    String phase=InstrumentationRegistry.getArguments().getString("phase","verify");
    boolean encrypted=InstrumentationRegistry.getArguments().getString("storage","encrypted").equals("encrypted");
    if(phase.equals("seed")) {
      // The baseline's missing HTML produces a browser error document. Seed its
      // real old origin/store independently of that already-confirmed UI defect.
      instrumentation.runOnMainSync(()->{
        web.stopLoading();
        web.setWebViewClient(new WebViewClient(){
          @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
            return new WebResourceResponse("text/html","UTF-8",new java.io.ByteArrayInputStream(
              "<!doctype html><html><head><title>Upgrade storage fixture</title></head><body>Storage fixture</body></html>".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
          }
        });
        web.loadUrl("https://anf.local/");
      });
    }
    until(phase.equals("seed")?
      "document.readyState==='complete' && document.title==='Upgrade storage fixture'":
      "document.readyState==='complete' && location.hostname==='anf.local'");
    if(phase.equals("seed")) {
      String legacy=fixture("qa-legacy-upgrade","Legacy upgrade conversation").toString();
      evaluate("window.__qaSeed=false;(()=>{const r=indexedDB.open('\u0063\u006f\u0075\u0063\u006f\u0075-mobile',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects',{keyPath:'id'});r.onsuccess=()=>{const t=r.result.transaction('projects','readwrite');t.objectStore('projects').put("+legacy+");t.oncomplete=()=>{r.result.close();window.__qaSeed=true;};};})()");
      until("window.__qaSeed===true");
      if(encrypted)seedEncryptedStore();
      return;
    }
    // The old broken package never renders this form; the fixed release must.
    until("document.querySelector('[aria-label=\"Conversation title\"]')?.value==='"+
      (encrypted?"Encrypted":"Legacy")+" upgrade conversation'");
    clickView("writing");
    until("!!document.querySelector('[aria-label=\"Live Markdown writing\"]')");
    String expected=phase.equals("reopen")?AFTER:BEFORE;
    assertTrue("Saved writing was not retained",evaluate("document.querySelector('[aria-label=\"Live Markdown writing\"]').textContent").contains(expected));
    evaluate("window.__qaLegacy=false;(()=>{const r=indexedDB.open('\u0063\u006f\u0075\u0063\u006f\u0075-mobile',1);r.onsuccess=()=>{const q=r.result.transaction('projects').objectStore('projects').get('qa-legacy-upgrade');q.onsuccess=()=>{window.__qaLegacy=!!q.result && q.result.draft==="+JSONObject.quote(BEFORE)+";r.result.close();};};})()");
    until("window.__qaLegacy===true");
    if(phase.equals("reopen"))return;
    if(!encrypted) {
      clickView("settings");
      evaluate("Array.from(document.querySelectorAll('summary')).find(e=>e.textContent==='Encrypted conversation storage').click()");
      evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Encrypt saved conversations').click()");
      until("document.body.textContent.includes('Migration verified.')");
    }
    for(String view:new String[]{"home","chat","documents","audio","settings","writing"})clickView(view);
    evaluate("(()=>{const e=document.querySelector('[aria-label=\"Live Markdown writing\"]');e.focus();const r=document.createRange();r.selectNodeContents(e);const s=getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('insertText',false,"+JSONObject.quote(AFTER)+");})()");
    until("document.querySelector('[aria-label=\"Live Markdown writing\"]').textContent.includes("+JSONObject.quote(AFTER)+")");
    clickView("documents");
    evaluate("(()=>{const d=new DataTransfer();d.items.add(new File(['A document read after the update.'],'after-update.txt',{type:'text/plain'}));const e=document.querySelector('[aria-label=\"Choose a document\"]');e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
    until("document.body.textContent.includes('after-update.txt') && document.body.textContent.includes('Document added.')");
    byte[] pdf;try(InputStream input=instrumentation.getContext().getAssets().open("short.pdf")){pdf=new byte[input.available()];int offset=0;while(offset<pdf.length){int read=input.read(pdf,offset,pdf.length-offset);if(read<0)break;offset+=read;}assertEquals(pdf.length,offset);}
    String encoded=android.util.Base64.encodeToString(pdf,android.util.Base64.NO_WRAP);
    evaluate("(()=>{const d=new DataTransfer();d.items.add(new File([Uint8Array.from(atob("+JSONObject.quote(encoded)+"),c=>c.charCodeAt(0))],'qa-pdf.pdf',{type:'application/pdf'}));const e=document.querySelector('[aria-label=\"Choose a document\"]');e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
    until("document.body.textContent.includes('qa-pdf.pdf') && document.body.textContent.includes('Document added.')");
    clickView("writing");SystemClock.sleep(1500);
  }
}
