package com.anf.workspace;

import android.app.Activity;
import android.content.ComponentName;
import android.net.Uri;
import android.util.Base64;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.google.common.util.concurrent.ListenableFuture;
import org.json.*;
import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/** Chunked local audio intake and a narrow controller bridge. No remote URIs. */
final class MediaBridge {
  interface Reply {void send(String id,String value,String error);}
  private final Activity activity;private final Reply reply;private final File folder;
  private final ExecutorService worker=Executors.newSingleThreadExecutor();
  private final AtomicInteger pending=new AtomicInteger();
  private final ListenableFuture<MediaController> controller;
  private volatile boolean closed;
  private File partial;private String importId,extension,expectedHash;private long expectedSize,written;
  private OutputStream output;private MessageDigest digest;
  MediaBridge(Activity activity,Reply reply){this.activity=activity;this.reply=reply;folder=new File(activity.getFilesDir(),"vault/audio/files");controller=new MediaController.Builder(activity,new SessionToken(activity,new ComponentName(activity,PlaybackService.class))).buildAsync();}
  private static String id(JSONObject data)throws Exception{String id=data.getString("track");if(!id.matches("[a-zA-Z0-9-]{1,64}"))throw new IOException("Invalid track");return id;}
  private static String ext(JSONObject data)throws Exception{String ext=data.getString("ext").toLowerCase(Locale.ROOT);if(!Arrays.asList("mp3","m4a","aac","wav","flac","ogg","opus","wma","aif","aiff","amr","alac").contains(ext))throw new IOException("Unsupported audio extension");return ext;}
  private static String hex(byte[] bytes){StringBuilder s=new StringBuilder();for(byte b:bytes)s.append(String.format(Locale.ROOT,"%02x",b&255));return s.toString();}
  void request(String request,String operation,String json){
    if(closed||request==null||!request.matches("[0-9]{1,12}"))return;
    if(json==null||json.length()>1_100_000||operation==null){reply.send(request,"","Audio request exceeds its limit.");return;}
    if(pending.incrementAndGet()>8){pending.decrementAndGet();reply.send(request,"","Audio is busy. Try again.");return;}
    try{worker.execute(()->{
      boolean handedOff=false;
      try{
        if(closed)return;
        JSONObject data=new JSONObject(json);
        if(operation.startsWith("import_")){
          try{reply.send(request,importFile(operation,data).toString(),"");}
          catch(Exception e){if(data.optString("track").equals(importId))abortImport();throw e;}
        }else{
          if(!controller.isDone())throw new IOException("Player is starting");
          activity.runOnUiThread(()->{
            try{if(!closed)reply.send(request,control(controller.get(),operation,data).toString(),"");}
            catch(Exception e){reply.send(request,"","Native audio could not complete this action.");}
            finally{pending.decrementAndGet();}
          });
          handedOff=true;
        }
      }catch(Exception e){reply.send(request,"","Audio action failed. Check storage, file size and format, or try again after the player starts. Originals are unchanged.");}
      finally{if(!handedOff)pending.decrementAndGet();}
    });}catch(RejectedExecutionException e){pending.decrementAndGet();reply.send(request,"","Audio is closing.");}
  }
  private synchronized JSONObject importFile(String operation,JSONObject data)throws Exception{
    String track=id(data);
    if(operation.equals("import_begin")){
      if(output!=null)throw new IOException("Import already active");
      String ext=ext(data),hash=data.getString("sha256");long size=data.getLong("size");
      if(size<1||size>16_000_000||!hash.matches("[0-9a-f]{64}"))throw new IOException("Invalid import size/hash");
      if(!folder.isDirectory()&&!folder.mkdirs())throw new IOException("Cannot create audio library");
      File existing=new File(folder,track+"."+ext);if(existing.isFile()&&existing.length()==size){MessageDigest check=MessageDigest.getInstance("SHA-256");try(InputStream stream=new FileInputStream(existing)){byte[] block=new byte[65536];int n;while((n=stream.read(block))!=-1)check.update(block,0,n);}if(hex(check.digest()).equals(hash))return new JSONObject().put("existing",true);}
      long total=0;int count=0;File[] files=folder.listFiles();if(files!=null)for(File f:files){if(f.isFile()){total+=f.length();count++;}}
      if(total+size>384_000_000||count>=100)throw new IOException("Native audio library full");
      partial=new File(folder,track+"-"+UUID.randomUUID().toString()+".part");output=new FileOutputStream(partial,false);digest=MessageDigest.getInstance("SHA-256");importId=track;extension=ext;expectedHash=hash;expectedSize=size;written=0;return new JSONObject().put("existing",false);
    }
    if(!track.equals(importId)||output==null)throw new IOException("No active import");
    if(operation.equals("import_abort")){abortImport();return new JSONObject().put("aborted",true);}
    if(operation.equals("import_chunk")){byte[] bytes=Base64.decode(data.getString("base64"),Base64.NO_WRAP);if(bytes.length>750_000||written+bytes.length>expectedSize)throw new IOException("Invalid audio chunk");output.write(bytes);digest.update(bytes);written+=bytes.length;return new JSONObject().put("received",written);}
    if(!operation.equals("import_finish"))throw new IOException("Unknown import action");
    output.flush();((FileOutputStream)output).getFD().sync();output.close();output=null;
    if(written!=expectedSize||!hex(digest.digest()).equals(expectedHash)){abortImport();throw new IOException("Audio verification failed");}
    Files.move(partial.toPath(),new File(folder,importId+"."+extension).toPath(),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);partial=null;importId=null;return new JSONObject().put("verified",true);
  }
  private synchronized void abortImport(){try{if(output!=null)output.close();}catch(IOException ignored){}output=null;if(partial!=null)partial.delete();partial=null;importId=null;}
  private synchronized JSONObject control(MediaController player,String operation,JSONObject data)throws Exception{
    if(operation.equals("queue")){
      JSONArray items=data.getJSONArray("items");if(items.length()<1||items.length()>100)throw new IOException("Invalid queue size");
      ArrayList<MediaItem> queue=new ArrayList<>();for(int i=0;i<items.length();i++){JSONObject item=items.getJSONObject(i);String track=id(item),ext=ext(item);File file=new File(folder,track+"."+ext);if(!file.isFile())throw new IOException("Missing imported audio");
        MediaMetadata metadata=new MediaMetadata.Builder().setTitle(item.optString("title","Audio").substring(0,Math.min(160,item.optString("title","Audio").length()))).setArtist(item.optString("artist","")).setAlbumTitle(item.optString("album","")).build();
        queue.add(new MediaItem.Builder().setMediaId(track).setUri(Uri.fromFile(file)).setMediaMetadata(metadata).build());
      }
      player.setMediaItems(queue);player.setRepeatMode(data.optString("repeat","off").equals("all")?Player.REPEAT_MODE_ALL:data.optString("repeat","off").equals("track")?Player.REPEAT_MODE_ONE:Player.REPEAT_MODE_OFF);player.prepare();player.play();
    }else if(operation.equals("clear")){
      if(output!=null)throw new IOException("Finish the active import first");player.stop();player.clearMediaItems();File[] copies=folder.listFiles();if(copies!=null)for(File copy:copies){if(copy.isFile()&&copy.getName().matches("[a-zA-Z0-9-]{1,110}\\.(mp3|m4a|aac|wav|flac|ogg|opus|wma|aif|aiff|amr|alac|part)")&&!copy.delete())throw new IOException("Could not remove a background copy");}
    }else if(operation.equals("play"))player.play();else if(operation.equals("pause"))player.pause();else if(operation.equals("next"))player.seekToNextMediaItem();else if(operation.equals("previous"))player.seekToPreviousMediaItem();else if(operation.equals("seek")){long position=data.getLong("position");if(position<0||position>86_400_000)throw new IOException("Invalid position");player.seekTo(position);}else if(operation.equals("stop")){player.stop();player.clearMediaItems();}else if(!operation.equals("status"))throw new IOException("Unknown media action");
    MediaItem item=player.getCurrentMediaItem();return new JSONObject().put("title",item==null?"":String.valueOf(item.mediaMetadata.title)).put("position",Math.max(0,player.getCurrentPosition())).put("duration",Math.max(0,player.getDuration())).put("playing",player.getPlayWhenReady()).put("count",player.getMediaItemCount()).put("error",player.getPlayerError()!=null);
  }
  void close(){closed=true;worker.execute(this::abortImport);worker.shutdown();MediaController.releaseFuture(controller);}
}
