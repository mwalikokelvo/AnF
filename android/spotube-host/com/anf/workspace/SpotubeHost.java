package com.anf.workspace;

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
import java.util.function.BiConsumer;

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
    request(activity,"pause",(value,error)->result.accept(error));
  }

  public static void request(Activity activity,String operation,BiConsumer<String,String> result) {
    if(!java.util.Arrays.asList("status","play","pause","previous","next","retry").contains(operation)){
      result.accept("","Unsupported music operation.");return;
    }
    // Status and pause never boot a not-yet-started module.
    if(channel==null || FlutterEngineCache.getInstance().get(AudioServicePlugin.getFlutterEngineId())!=cachedEngine){
      result.accept("",("status".equals(operation)||"pause".equals(operation))?"":"Open Spotube and choose music first.");return;
    }
    if(waiting.size()>=32){result.accept("","Music requests are busy.");return;}
    final boolean[] completed={false};
    final Runnable[] timeout={null};
    BiConsumer<String,String> finish=(value,error)->{if(!completed[0]){completed[0]=true;if(timeout[0]!=null)handler.removeCallbacks(timeout[0]);result.accept(value,error);}};
    Runnable action=()->{
      if(completed[0])return;
      channel.invokeMethod("control",operation,new MethodChannel.Result(){
        @Override public void success(Object value){
          if(value instanceof String && ((String)value).length()<=3500)finish.accept((String)value,"");
          else finish.accept("","Invalid Spotube playback status.");
        }
        @Override public void error(String code,String message,Object details){finish.accept("","Spotube playback control failed.");}
        @Override public void notImplemented(){finish.accept("","Spotube playback bridge is unavailable.");}
      });
    };
    timeout[0]=()->{waiting.remove(action);finish.accept("","Spotube did not respond. Stop music before previewing audio.");};
    handler.postDelayed(timeout[0],10000);
    if(ready)action.run();else waiting.add(action);
  }
}
