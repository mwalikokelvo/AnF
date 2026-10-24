package com.coucou.workspace;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.TileService;

/** Explicit user entry point; requires normal device unlock. */
public class QuickNoteTile extends TileService {
  @Override public void onClick(){
    super.onClick();
    unlockAndRun(()->{
      Intent intent=new Intent(this,MainActivity.class).setAction("com.coucou.QUICK_NOTE").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
      if(Build.VERSION.SDK_INT>=34)startActivityAndCollapse(PendingIntent.getActivity(this,31,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
      else startActivityAndCollapse(intent);
    });
  }
}
