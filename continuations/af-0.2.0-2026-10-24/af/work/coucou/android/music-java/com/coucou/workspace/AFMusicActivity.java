package com.coucou.workspace;

import com.ryanheise.audioservice.AudioServiceActivity;
import io.flutter.embedding.engine.FlutterEngine;
import io.flutter.plugin.common.MethodChannel;
import android.os.Handler;
import android.os.Looper;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BiConsumer;

/** Embeds the Flutter music library in A&F's process with audio-service ownership. */
public final class AFMusicActivity extends AudioServiceActivity {
  private static final Handler main = new Handler(Looper.getMainLooper());
  private static MethodChannel channel;
  private static boolean ready;

  @Override public void configureFlutterEngine(FlutterEngine engine) {
    super.configureFlutterEngine(engine);
    channel = new MethodChannel(engine.getDartExecutor().getBinaryMessenger(),"af/music_host");
    channel.setMethodCallHandler((call,result)->{
      if (call.method.equals("ready")) { ready=true;result.success(null); }
      else result.notImplemented();
    });
  }
  @Override public boolean shouldDestroyEngineWithHost() { return false; }

  public static void request(String operation,BiConsumer<String,String> reply) {
    main.post(()->{
      if (channel==null) { reply.accept("{\"playing\":false}","");return; }
      if (!ready) { reply.accept("","Music is still starting. Try again when Music Hub is ready.");return; }
      final AtomicBoolean complete=new AtomicBoolean();
      final Runnable timeout=()->{if(complete.compareAndSet(false,true))reply.accept("","Music did not acknowledge the request. Playback was not started.");};
      main.postDelayed(timeout,8000);
      channel.invokeMethod(operation,null,new MethodChannel.Result(){
        public void success(Object value) {
          if (!complete.compareAndSet(false,true)) return;
          main.removeCallbacks(timeout);
          if (!(value instanceof Map) || !(((Map<?,?>)value).get("playing") instanceof Boolean)) { reply.accept("","Invalid music playback response.");return; }
          boolean playing=(Boolean)((Map<?,?>)value).get("playing");
          if(operation.equals("pause") && playing) { reply.accept("","Music could not be paused.");return; }
          reply.accept("{\"playing\":"+playing+"}","");
        }
        public void error(String code,String message,Object details) { if(complete.compareAndSet(false,true)){main.removeCallbacks(timeout);reply.accept("",message==null?"Music request failed.":message);} }
        public void notImplemented() { error("unsupported","Music host command is not supported.",null); }
      });
    });
  }
}
