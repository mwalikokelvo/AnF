package com.coucou.workspace;

import android.app.Activity;
import android.content.Intent;
import java.util.function.BiConsumer;

/** Fixed internal component: never launches an external music application. */
final class AFMusicHost {
  private static final String COMPONENT = "com.coucou.workspace.AFMusicActivity";
  static boolean available() {
    try { Class.forName(COMPONENT); return true; }
    catch (ClassNotFoundException e) { return false; }
  }
  static void request(Activity activity,String operation,BiConsumer<String,String> reply) {
    if (operation.equals("available")) { reply.accept("{\"available\":"+available()+"}",""); return; }
    if (!available()) { reply.accept("","Embedded music is not included in this package."); return; }
    if (operation.equals("open")) {
      activity.runOnUiThread(()->{
        try { activity.startActivity(new Intent().setClassName(activity,COMPONENT));reply.accept("{\"opened\":true}",""); }
        catch(Exception e) { reply.accept("","Music Hub could not open."); }
      });
      return;
    }
    if (!operation.equals("pause") && !operation.equals("status")) { reply.accept("","Unsupported music command."); return; }
    try { Class.forName(COMPONENT).getMethod("request",String.class,BiConsumer.class).invoke(null,operation,reply); }
    catch (ReflectiveOperationException e) { reply.accept("","Music host connection is unavailable."); }
  }
}
