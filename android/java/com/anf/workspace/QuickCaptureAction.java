package com.anf.workspace;

final class QuickCaptureAction {
  private QuickCaptureAction() {}
  static boolean matches(String action) {
    return "com.anf.QUICK_NOTE".equals(action) || "com.coucou.QUICK_NOTE".equals(action);
  }
}
