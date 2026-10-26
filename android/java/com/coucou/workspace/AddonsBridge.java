package com.coucou.workspace;

import org.json.*;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/** Marketplace themes (CSS only). The page names an id; this class picks the URL and checksum from the registry, verifies, and stores. Mirrors windows/src-tauri/src/addons.rs. */
final class AddonsBridge {
  interface Reply {void send(String id,String value,String error);}
  private static final int LIMIT=200_000;
  private final File base;private final Reply reply;
  private final ExecutorService worker=Executors.newSingleThreadExecutor();
  private final AtomicInteger pending=new AtomicInteger();
  private volatile boolean closed;
  AddonsBridge(File base,Reply reply){this.base=base;this.reply=reply;}

  void request(String request,String operation,String json){
    if(closed||request==null||!request.matches("[0-9]{1,12}"))return;
    if(operation==null||json==null||json.length()>2_000){reply.send(request,"","Marketplace request is too large.");return;}
    if(pending.incrementAndGet()>4){pending.decrementAndGet();reply.send(request,"","The marketplace is busy. Try again.");return;}
    try{worker.execute(()->{
      try{if(!closed)reply.send(request,handle(operation,new JSONObject(json)),"");}
      catch(UserError e){reply.send(request,"",e.getMessage());}
      catch(Exception e){reply.send(request,"","The marketplace could not complete this action.");}
      finally{pending.decrementAndGet();}
    });}catch(RejectedExecutionException e){pending.decrementAndGet();reply.send(request,"","The marketplace is closing.");}
  }
  /** An error whose text is safe to show the user. */
  private static final class UserError extends Exception{UserError(String m){super(m);}}

  private String handle(String operation,JSONObject data)throws Exception{
    switch(operation){
      case "addons_registry":return entriesJson(registry());
      case "addons_install":install(data.optString("id"));return "{}";
      case "addons_list":return entriesJson(installed());
      case "addons_read":return readTheme(data.optString("id"));
      case "addons_remove":remove(data.optString("id"));return "{}";
      default:throw new UserError("Unknown marketplace action.");
    }
  }

  private static JSONObject trustedEntry(JSONObject o){
    String id=o.optString("id"),type=o.optString("type"),url=o.optString("downloadUrl"),sha=o.optString("sha256");
    if(!AddonRules.trusted(id,type,url,sha,o.optString("name"),o.optString("description"),o.optString("version"),o.optString("author")))return null;
    try{return new JSONObject().put("id",id).put("name",o.getString("name")).put("version",o.getString("version")).put("type",type).put("description",o.getString("description")).put("author",o.optString("author")).put("downloadUrl",url).put("sha256",sha);}
    catch(JSONException e){return null;}
  }
  private static String entriesJson(List<JSONObject> list){JSONArray a=new JSONArray();for(JSONObject o:list){JSONObject copy=new JSONObject();try{for(String k:new String[]{"id","name","version","type","description","author"})copy.put(k,o.getString(k));}catch(JSONException ignored){continue;}a.put(copy);}return a.toString();}
  private List<JSONObject> registry()throws Exception{
    List<JSONObject> out=new ArrayList<>();
    JSONArray all;try{all=new JSONArray(fetch(AddonRules.REGISTRY));}catch(JSONException e){return out;}
    for(int i=0;i<all.length()&&out.size()<100;i++){JSONObject o=all.optJSONObject(i);JSONObject e=o==null?null:trustedEntry(o);if(e!=null)out.add(e);}
    return out;
  }
  private void install(String id)throws Exception{
    // The page names only an id; the URL and hash come from the registry, never from the page.
    JSONObject entry=null;for(JSONObject e:registry())if(e.getString("id").equals(id)){entry=e;break;}
    if(entry==null)throw new UserError("That add-on is not in the marketplace.");
    if(!"theme".equals(entry.getString("type")))throw new UserError("Plugins cannot be installed yet.");
    String css=fetch(entry.getString("downloadUrl"));
    if(!AddonRules.matchesHash(css,entry.getString("sha256")))throw new UserError("The download does not match the marketplace checksum, so it was not installed.");
    String why=AddonRules.checkCss(css);if(why!=null)throw new UserError(why);
    File dir=themeDir(id);if(!dir.isDirectory()&&!dir.mkdirs())throw new IOException("Cannot create theme folder");
    write(new File(dir,"theme.css"),css);write(new File(dir,"manifest.json"),entry.toString());
  }
  private List<JSONObject> installed(){
    List<JSONObject> out=new ArrayList<>();File[] dirs=base.listFiles();if(dirs==null)return out;
    for(File d:dirs){try{JSONObject e=trustedEntry(new JSONObject(read(new File(d,"manifest.json"))));if(e!=null&&e.getString("id").equals(d.getName()))out.add(e);}catch(Exception ignored){}}
    Collections.sort(out,(a,b)->a.optString("id").compareTo(b.optString("id")));return out;
  }
  private String readTheme(String id)throws Exception{
    File file=new File(themeDir(id),"theme.css");if(!file.isFile())throw new UserError("Theme is not installed.");
    String css=read(file);String why=AddonRules.checkCss(css);if(why!=null)throw new UserError(why);return css;
  }
  private void remove(String id)throws Exception{
    File dir=themeDir(id);File[] files=dir.listFiles();if(files!=null)for(File f:files)if(!f.delete())throw new IOException("Cannot remove theme");
    if(dir.exists()&&!dir.delete())throw new IOException("Cannot remove theme");
  }
  private File themeDir(String id)throws UserError{if(!AddonRules.validId(id))throw new UserError("Invalid theme id.");return new File(base,id);}

  private static void write(File file,String text)throws IOException{File tmp=new File(file.getPath()+".tmp");try(FileOutputStream out=new FileOutputStream(tmp)){out.write(text.getBytes(StandardCharsets.UTF_8));out.getFD().sync();}if(!tmp.renameTo(file)){tmp.delete();throw new IOException("Cannot save theme");}}
  private static String read(File file)throws IOException{
    if(file.length()>LIMIT)throw new IOException("Too large");
    try(InputStream in=new FileInputStream(file)){return utf8(readBytes(in));}
  }
  private static byte[] readBytes(InputStream in)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buf=new byte[8192];int n;while((n=in.read(buf))>0){if(out.size()+n>LIMIT)throw new IOException("Too large");out.write(buf,0,n);}return out.toByteArray();}
  private static String utf8(byte[] bytes)throws IOException{try{return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();}catch(CharacterCodingException e){throw new IOException("Not text");}}

  /** HTTPS GET with no redirects, a timeout and a size cap. Only URLs from AddonRules are ever passed in. */
  private static String fetch(String url)throws Exception{
    if(!url.equals(AddonRules.REGISTRY)&&!url.startsWith(AddonRules.PREFIX))throw new UserError("The marketplace address is not trusted.");
    HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();
    c.setInstanceFollowRedirects(false);c.setConnectTimeout(20_000);c.setReadTimeout(20_000);c.setRequestProperty("User-Agent","AnF marketplace");
    try{
      int code;try{code=c.getResponseCode();}catch(IOException e){throw new UserError("The marketplace could not be reached.");}
      if(code<200||code>299)throw new UserError("The marketplace is unavailable.");
      try(InputStream in=c.getInputStream()){return utf8(readBytes(in));}
      catch(IOException e){throw new UserError("The download failed or exceeded its size limit.");}
    }finally{c.disconnect();}
  }
  void close(){closed=true;worker.shutdown();}
}
