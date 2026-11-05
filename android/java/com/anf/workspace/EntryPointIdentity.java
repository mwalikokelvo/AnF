package com.anf.workspace;

final class EntryPointIdentity {
  private EntryPointIdentity() {}
  static String playbackService(String applicationId) {
    boolean legacy="com.coucou.workspace".equals(applicationId) || "com.coucou.workspace.musicdev".equals(applicationId);
    return (legacy?"com.coucou.workspace":"com.anf.workspace")+".PlaybackService";
  }
}
