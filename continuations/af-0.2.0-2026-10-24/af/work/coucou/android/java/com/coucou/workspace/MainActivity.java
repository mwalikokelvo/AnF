package com.coucou.workspace;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.*;
import android.speech.tts.TextToSpeech;
import android.view.View;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Local assets only. External AI accounts always open in the user's browser. */
public class MainActivity extends Activity {
  private WebView web;
  private VaultRepository vault;
  private MediaBridge media;
  private void mediaResult(String id,String value,String error){runOnUiThread(()->{if(!closing)web.evaluateJavascript("window.coucouMediaResult && window.coucouMediaResult("+JSONObject.quote(id)+","+JSONObject.quote(value)+","+JSONObject.quote(error)+")",null);});}
  private final java.util.concurrent.ExecutorService vaultWorker=java.util.concurrent.Executors.newSingleThreadExecutor();
  private final java.util.concurrent.atomic.AtomicInteger vaultPending=new java.util.concurrent.atomic.AtomicInteger();
  private void vaultResult(String id,String value,String error){runOnUiThread(()->{if(!closing)web.evaluateJavascript("window.vaultResult && window.vaultResult("+JSONObject.quote(id)+","+JSONObject.quote(value)+","+JSONObject.quote(error)+")",null);});}

  private ValueCallback<Uri[]> picker;
  private byte[] exportBytes;
  private TextToSpeech speech;
  private boolean speechReady;
  private boolean closing;
  private boolean quickReady;
  private Intent pendingCapture;
  private final java.util.concurrent.atomic.AtomicBoolean linking=new java.util.concurrent.atomic.AtomicBoolean(false);
  private final String origin="https://coucou.local/";
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    web=new WebView(this);setContentView(web);
    media=new MediaBridge(this,this::mediaResult);
    web.setOnApplyWindowInsetsListener((v,insets)->{
      if(android.os.Build.VERSION.SDK_INT>=30){android.graphics.Insets bars=insets.getInsets(android.view.WindowInsets.Type.systemBars());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);boolean shown=insets.isVisible(android.view.WindowInsets.Type.ime());web.evaluateJavascript("window.nativeKeyboard && window.nativeKeyboard("+shown+")",null);}
      else v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;
    });
    WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
    s.setAllowFileAccess(false);s.setAllowContentAccess(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    web.addJavascriptInterface(new LocalActions(),"CoucouAndroid");
    web.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){return !r.getUrl().toString().startsWith(origin);}
      @Override public WebResourceResponse shouldInterceptRequest(WebView w,WebResourceRequest r){
        Uri u=r.getUrl();
        if(!"https".equals(u.getScheme())||!"coucou.local".equals(u.getHost()))return blocked();
        String path=u.getPath();if(path==null||path.contains("..")||path.contains("\\"))return blocked();
        if(path.equals("/"))path="/index.html";
        String mime=path.endsWith(".js")||path.endsWith(".mjs")?"text/javascript":path.endsWith(".css")?"text/css":path.endsWith(".wasm")?"application/wasm":path.endsWith(".html")?"text/html":"application/octet-stream";
        try{return new WebResourceResponse(mime,"UTF-8",getAssets().open("web"+path));}catch(IOException e){return blocked();}
      }
    });
    web.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onShowFileChooser(WebView w,ValueCallback<Uri[]> cb,FileChooserParams params){
        if(picker!=null)picker.onReceiveValue(null);picker=cb;
        try {Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);startActivityForResult(i,1);}catch(Exception e){picker.onReceiveValue(null);picker=null;notice("No document picker is available.");}return true;
      }
    });
    speech=new TextToSpeech(this,status->{speechReady=status==TextToSpeech.SUCCESS;});
    speech.setOnUtteranceProgressListener(new android.speech.tts.UtteranceProgressListener(){
      public void onStart(String id){}
      public void onDone(String id){runOnUiThread(()->{if(!closing)web.evaluateJavascript("window.coucouSpeechDone && window.coucouSpeechDone("+JSONObject.quote(id)+")",null);});}
      public void onError(String id){speechError(id);}
    });
    pendingCapture=getIntent();
    web.loadUrl(origin);
  }
  @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);pendingCapture=intent;deliverCapture();}
  private void deliverCapture(){
    if(!quickReady||pendingCapture==null||closing)return;
    Intent intent=pendingCapture;pendingCapture=null;String action=intent.getAction();
    if("com.coucou.QUICK_NOTE".equals(action))web.evaluateJavascript("window.coucouQuickCapture && window.coucouQuickCapture()",null);
    else if(Intent.ACTION_SEND.equals(action)&&"text/plain".equals(intent.getType())){String shared=intent.getStringExtra(Intent.EXTRA_TEXT);if(shared!=null)web.evaluateJavascript("window.coucouQuickCapture && window.coucouQuickCapture("+JSONObject.quote(shared.substring(0,Math.min(shared.length(),10000)))+")",null);}
  }
  private WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
  private void notice(String text){runOnUiThread(()->{if(!closing)web.evaluateJavascript("window.nativeNotice && window.nativeNotice("+JSONObject.quote(text)+")",null);});}
  @Override public void onBackPressed(){web.evaluateJavascript("typeof window.nativeBack === 'function' && window.nativeBack()",handled->{if(!"true".equals(handled))moveTaskToBack(true);});}
  public class LocalActions {
    @JavascriptInterface public void musicRequest(String id,String operation) {
      if(id==null || !id.matches("[0-9]{1,12}") || operation==null || closing) return;
      AFMusicHost.request(MainActivity.this,operation,(value,error)->runOnUiThread(()->{
        if(!closing)web.evaluateJavascript("window.coucouMusicResult && window.coucouMusicResult("+JSONObject.quote(id)+","+JSONObject.quote(value)+","+JSONObject.quote(error)+")",null);
      }));
    }
    @JavascriptInterface public void mediaRequest(String id,String operation,String json){if(media!=null)media.request(id,operation,json);}
    @JavascriptInterface public void vaultRequest(String id,String operation,String json){
      if(id==null||!id.matches("[0-9]{1,12}"))return;
      if(operation==null||json==null||json.length()>17000000){vaultResult(id,"","Storage request exceeds the limit.");return;}
      if(vaultPending.incrementAndGet()>8){vaultPending.decrementAndGet();vaultResult(id,"","Storage is busy. Try again.");return;}
      try{vaultWorker.execute(()->{try{if(vault==null)vault=new VaultRepository(MainActivity.this);vaultResult(id,vault.request(operation,json),"");}catch(Exception|LinkageError e){vaultResult(id,"","Encrypted storage could not complete this operation. Check your recovery key and available storage. Existing data was retained.");}finally{vaultPending.decrementAndGet();}});}catch(java.util.concurrent.RejectedExecutionException e){vaultPending.decrementAndGet();vaultResult(id,"","Workspace is closing. Reopen to retry.");}
    }

    @JavascriptInterface public void quickCaptureReady(){runOnUiThread(()->{quickReady=true;deliverCapture();});}
    @JavascriptInterface public void exportAudio(String name,String base64){
      if(base64==null||base64.length()>42666672){notice("Audio export exceeds 32 MB.");return;}
      final byte[] bytes;try{bytes=android.util.Base64.decode(base64,android.util.Base64.DEFAULT);}catch(IllegalArgumentException e){notice("Invalid audio export.");return;}
      if(bytes.length<44||bytes.length>32000000||bytes[0]!='R'||bytes[1]!='I'||bytes[2]!='F'||bytes[3]!='F'||bytes[8]!='W'||bytes[9]!='A'||bytes[10]!='V'||bytes[11]!='E'){notice("Invalid WAV export.");return;}
      runOnUiThread(()->{if(exportBytes!=null){notice("Finish the current export first.");return;}exportBytes=bytes;Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("audio/wav").putExtra(Intent.EXTRA_TITLE,name.replaceAll("[^a-zA-Z0-9._ -]","_"));try{startActivityForResult(intent,2);}catch(Exception e){exportBytes=null;notice("Audio export picker unavailable.");}});
    }

    @JavascriptInterface public void linkRequest(String id,String code,String path,String json){
      if(!id.matches("[0-9]{1,12}"))return;
      if(!linking.compareAndSet(false,true)){linkResult(id,"", "Another connection request is running.");return;}
      new Thread(()->{String value="",error="";try{value=LocalLink.request(code,path,json);}catch(Exception e){error="Could not connect securely. Check the pairing code, same Wi-Fi, and Windows private-network firewall access.";}finally{linking.set(false);}linkResult(id,value,error);}).start();
    }
    @JavascriptInterface public void searchWeb(String query,boolean enabled){if(!enabled||query.trim().isEmpty()||query.length()>1000){notice("Turn on web search and enter public search terms under 1,000 characters.");return;}runOnUiThread(()->{try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://duckduckgo.com/").buildUpon().appendQueryParameter("q",query).build()));}catch(Exception e){notice("Install a browser to search the web.");}});}
    @JavascriptInterface public void openProvider(String id){runOnUiThread(()->{
      String url;
      switch(id){case "chatgpt":url="https://chatgpt.com/";break;case "gemini":url="https://gemini.google.com/";break;case "claude":url="https://claude.ai/";break;case "notebooklm":url="https://notebooklm.google.com/";break;default:return;}
      try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception e){notice("Install a browser to open this service.");}
    });}
    @JavascriptInterface public void copy(String text){if(text.length()>200000)return;runOnUiThread(()->{android.content.ClipboardManager clipboard=(android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE);clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Coucou",text));notice("Copied. Paste it into your chosen browser service when ready.");});}
    @JavascriptInterface public void export(String name,String text,String mime){
      if(text.getBytes(StandardCharsets.UTF_8).length>16000000){notice("This export exceeds 16 MB. Export a smaller conversation.");return;}
      if(!Arrays.asList("text/plain","text/markdown","text/html","application/json","application/octet-stream").contains(mime))return;
      runOnUiThread(()->{if(exportBytes!=null){notice("Finish the current export first.");return;}exportBytes=text.getBytes(StandardCharsets.UTF_8);Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE,name.replaceAll("[^a-zA-Z0-9._ -]","_"));try{startActivityForResult(i,2);}catch(Exception e){exportBytes=null;notice("The export picker could not open.");}});
    }
    @JavascriptInterface public void speak(String text){runOnUiThread(()->{if(!speechReady){notice("Android read-aloud is not ready. Check installed voice data.");return;}speech.stop();int max=TextToSpeech.getMaxSpeechInputLength()-100;for(int start=0;start<text.length();){int end=Math.min(text.length(),start+max);if(end<text.length()){int stop=text.lastIndexOf('.',end);if(stop>start+max/2)end=stop+1;}speech.speak(text.substring(start,end),TextToSpeech.QUEUE_ADD,null,"coucou-"+start);start=end;}notice("Reading with your Android voice.");});}
    @JavascriptInterface public void speakPart(String text,float rate,String id){if(text.length()>2000||id.length()>30)return;runOnUiThread(()->{if(!speechReady){speechError(id);return;}speech.stop();speech.setSpeechRate(Math.max(.75f,Math.min(2.5f,rate)));if(speech.speak(text,TextToSpeech.QUEUE_FLUSH,null,id)==TextToSpeech.ERROR)speechError(id);});}
    @JavascriptInterface public void haptic(){runOnUiThread(()->web.performHapticFeedback(android.view.HapticFeedbackConstants.CLOCK_TICK));}
    @JavascriptInterface public void stopSpeaking(){runOnUiThread(()->speech.stop());}
  }
  private void speechError(String id){notice("Read-aloud could not continue. Check installed voice data.");runOnUiThread(()->{if(!closing)web.evaluateJavascript("window.coucouSpeechError && window.coucouSpeechError("+JSONObject.quote(id)+")",null);});}
  private void linkResult(String id,String value,String error){runOnUiThread(()->{if(!closing)web.evaluateJavascript("window.linkResult && window.linkResult("+JSONObject.quote(id)+","+JSONObject.quote(value)+","+JSONObject.quote(error)+")",null);});}
  @Override protected void onActivityResult(int request,int result,Intent data){
    super.onActivityResult(request,result,data);
    if(request==1&&picker!=null){
      ArrayList<Uri> selected=new ArrayList<>();
      if(result==RESULT_OK&&data!=null){if(data.getClipData()!=null){for(int n=0;n<Math.min(100,data.getClipData().getItemCount());n++)selected.add(data.getClipData().getItemAt(n).getUri());}else if(data.getData()!=null)selected.add(data.getData());}
      picker.onReceiveValue(selected.isEmpty()?null:selected.toArray(new Uri[0]));picker=null;
    }
    if(request==2){byte[] bytes=exportBytes;exportBytes=null;if(result==RESULT_OK&&data!=null&&bytes!=null){new Thread(()->{try(OutputStream out=getContentResolver().openOutputStream(data.getData())){if(out==null)throw new IOException();out.write(bytes);notice("Export saved.");}catch(Exception e){notice("Could not save this export.");}}).start();}else notice("Export cancelled.");}
  }
  @Override protected void onDestroy(){closing=true;if(media!=null)media.close();vaultWorker.shutdown();if(picker!=null)picker.onReceiveValue(null);if(speech!=null){speech.stop();speech.shutdown();}if(web!=null)web.destroy();super.onDestroy();}
}
