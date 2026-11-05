package com.anf.workspace;

public final class QuickCaptureActionCheck {
  public static void main(String[] args) {
    if(!QuickCaptureAction.matches("com.anf.QUICK_NOTE") || !QuickCaptureAction.matches("com.coucou.QUICK_NOTE")) throw new AssertionError("Saved entry point lost");
    for(String action:new String[]{null,"","QUICK_NOTE","com.other.QUICK_NOTE","com.anf.QUICK_NOTE.extra","com.coucou.QUICK_NOTE.extra"}) {
      if(QuickCaptureAction.matches(action)) throw new AssertionError("Unexpected action accepted");
    }
    for(String id:new String[]{"com.coucou.workspace","com.coucou.workspace.musicdev"})if(!EntryPointIdentity.playbackService(id).equals("com.coucou.workspace.PlaybackService"))throw new AssertionError("Legacy media component changed");
    for(String id:new String[]{"com.anf.workspace","com.anf.workspace.musicdev"})if(!EntryPointIdentity.playbackService(id).equals("com.anf.workspace.PlaybackService"))throw new AssertionError("Modern media component changed");
    System.out.println("PASS: modern and saved legacy quick-note actions; unrelated actions rejected");
  }
}
