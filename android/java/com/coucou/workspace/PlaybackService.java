package com.coucou.workspace;

import android.content.Intent;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;
import java.util.List;

/** Local-only native playback owned by the foreground media service. */
public final class PlaybackService extends MediaSessionService {
  private ExoPlayer player;
  private MediaSession session;
  @Override public void onCreate(){
    super.onCreate();
    DefaultRenderersFactory renderers=new DefaultRenderersFactory(this)
      .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON);
    player=new ExoPlayer.Builder(this,renderers)
      .setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),true)
      .setHandleAudioBecomingNoisy(true).setWakeMode(C.WAKE_MODE_LOCAL)
      .setSeekBackIncrementMs(15000).setSeekForwardIncrementMs(15000).build();
    session=new MediaSession.Builder(this,player).setCallback(new MediaSession.Callback(){
      @Override public ListenableFuture<List<MediaItem>> onAddMediaItems(MediaSession mediaSession,MediaSession.ControllerInfo controller,List<MediaItem> items){
        try{
          if(!getPackageName().equals(controller.getPackageName())||items.size()>100)throw new SecurityException("Local app queue required");
          String folder=new File(getFilesDir(),"vault/audio/files").getCanonicalPath()+File.separator;
          for(MediaItem item:items){
            if(item.localConfiguration==null)throw new SecurityException("Local audio only");
            String scheme=item.localConfiguration.uri.getScheme();
            if("https".equals(scheme))continue;
            if(!"file".equals(scheme))throw new SecurityException("Local audio only");
            File file=new File(item.localConfiguration.uri.getPath());
            if(!file.getCanonicalPath().startsWith(folder)||!file.isFile())throw new SecurityException("Audio is outside this library");
          }
          return Futures.immediateFuture(items);
        }catch(Exception e){return Futures.immediateFailedFuture(new IllegalArgumentException("Only imported AnF audio can be played."));}
      }
    }).build();
  }
  @Override public MediaSession onGetSession(MediaSession.ControllerInfo controller){return getPackageName().equals(controller.getPackageName())||controller.isTrusted()?session:null;}
  @Override public void onTaskRemoved(Intent intent){if(player==null||!player.getPlayWhenReady()||player.getMediaItemCount()==0||player.getPlaybackState()==Player.STATE_ENDED)stopSelf();}
  @Override public void onDestroy(){if(session!=null){session.release();session=null;}if(player!=null){player.release();player=null;}super.onDestroy();}
}
