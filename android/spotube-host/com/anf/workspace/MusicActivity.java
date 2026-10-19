package com.anf.workspace;

import com.ryanheise.audioservice.AudioServiceActivity;

/** Back returns to AnF; audio_service retains the engine for background music. */
public class MusicActivity extends AudioServiceActivity {
  @Override public void onCreate(android.os.Bundle state){super.onCreate(state);SpotubeHost.attach(this);}
  @Override public boolean shouldDestroyEngineWithHost(){return false;}
}
