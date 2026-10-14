package com.coucou.workspace;

import android.app.Activity;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import com.ryanheise.audioservice.AudioServicePlugin;
import io.flutter.embedding.engine.FlutterEngine;
import io.flutter.embedding.engine.FlutterEngineCache;
import io.flutter.plugin.common.MethodChannel;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/** Internal Flutter screen sharing audio_service's retained engine. */
public final class SpotubeHost {
  private static MethodChannel channel;
  private static FlutterEngine cachedEngine;
  private static boolean ready;
  private static java.lang.ref.WeakReference<Activity> screen=new java.lang.ref.WeakReference<>(null);
  private static final List<Runnable> waiting=new ArrayList<>();
  private static final Handler handler=new Handler(Looper.getMainLooper());

  public static void open(Activity activity) {
    ensure(activity);
    activity.startActivity(new Intent(activity,MusicActivity.class));
  }

  public static void attach(Activity activity){screen=new java.lang.ref.WeakReference<>(activity);}

  private static void ensure(Activity activity) {
    FlutterEngine engine=AudioServicePlugin.getFlutterEngine(activity);
    if(channel!=null && engine==cachedEngine)return;
    if(channel!=null)channel.setMethodCallHandler(null);
    ready=false;cachedEngine=engine;
    channel=new MethodChannel(engine.getDartExecutor().getBinaryMessenger(),"anf/spotube");
    channel.setMethodCallHandler((call,result)->{
      if("ready".equals(call.method)){
        ready=true;
        List<Runnable> pending=new ArrayList<>(waiting);waiting.clear();
        for(Runnable action:pending)action.run();
        result.success(null);
      }else if("close".equals(call.method)){
        Activity music=screen.get();if(music!=null)music.finish();result.success(null);
      }else result.notImplemented();
    });
  }

  public static void pause(Activity activity,Consumer<String> result) {
    // A not-yet-started module cannot be playing. Do not boot it for local audio.
    if(channel==null || FlutterEngineCache.getInstance().get(AudioServicePlugin.getFlutterEngineId())!=cachedEngine){result.accept("");return;}
    final boolean[] completed={false};
    Consumer<String> finish=error->{if(!completed[0]){completed[0]=true;result.accept(error);}};
    Runnable action=()->{
      if(completed[0])return;
      channel.invokeMethod("pause",null,new MethodChannel.Result(){
        @Override public void success(Object value){finish.accept("");}
        @Override public void error(String code,String message,Object details){finish.accept("Spotube could not pause playback.");}
        @Override public void notImplemented(){finish.accept("Spotube playback bridge is unavailable.");}
      });
    };
    if(ready)action.run();else waiting.add(action);
    handler.postDelayed(()->{waiting.remove(action);finish.accept("Spotube did not respond. Stop music before previewing audio.");},10000);
  }
}
