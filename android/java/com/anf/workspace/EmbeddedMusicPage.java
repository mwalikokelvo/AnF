package com.anf.workspace;

import android.webkit.WebView;
import java.lang.reflect.Method;

/** Optional packaged native lifecycle, never a player-availability flag. */
public interface EmbeddedMusicPage extends AutoCloseable {
  void onPageStarted();
  void onPageFinished(String url);
  @Override void close();

  static EmbeddedMusicPage attach(WebView web,String origin) {
    try {
      // Only classes packaged in this app; no downloaded code or renderer factory.
      Class<?> type=Class.forName("com.anf.mkr.android.MkrPageLifecycle",true,MainActivity.class.getClassLoader());
      Method start=type.getMethod("onPageStarted"),finish=type.getMethod("onPageFinished",String.class),close=type.getMethod("close");
      Object owner=type.getMethod("attach",WebView.class,String.class).invoke(null,web,origin);
      return new EmbeddedMusicPage() {
        private boolean closed;
        private void invoke(Method method,Object... args) {
          if(closed)return;
          try {method.invoke(owner,args);}catch(ReflectiveOperationException|LinkageError error){close();}
        }
        public void onPageStarted(){invoke(start);}
        public void onPageFinished(String url){invoke(finish,url);}
        public void close(){
          if(closed)return;closed=true;
          try {close.invoke(owner);}catch(ReflectiveOperationException|LinkageError ignored){/* Fail closed; keep workspace recovery usable. */}
        }
      };
    }catch(ReflectiveOperationException|LinkageError error){return NONE;}
  }
  EmbeddedMusicPage NONE=new EmbeddedMusicPage(){
    public void onPageStarted(){}
    public void onPageFinished(String url){}
    public void close(){}
  };
}
