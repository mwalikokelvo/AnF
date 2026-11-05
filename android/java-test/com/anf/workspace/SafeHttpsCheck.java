package com.anf.workspace;

import java.io.IOException;
import java.net.URL;

/** No network access: numeric public addresses and rejected URLs only. */
public final class SafeHttpsCheck {
  public static void main(String[] args) throws Exception {
    // Package-private access also catches a source package left behind by migration.
    SafeHttps.check(new URL("https://8.8.8.8/"));
    SafeHttps.check(new URL("https://1.1.1.1:443/"));
    String[] denied = {
      "http://8.8.8.8/", "https://name:secret@8.8.8.8/", "https://8.8.8.8:444/",
      "https://localhost/", "https://printer.local/", "https://host.internal/",
      "https://127.0.0.1/", "https://10.0.0.1/", "https://172.16.0.1/",
      "https://192.168.0.1/", "https://169.254.1.1/", "https://100.64.0.1/",
      "https://192.0.2.1/", "https://198.51.100.1/", "https://203.0.113.1/",
      "https://224.0.0.1/", "https://[::1]/", "https://[fe80::1]/"
    };
    for (String raw : denied) {
      try {
        SafeHttps.check(new URL(raw));
        throw new AssertionError("Unsafe URL accepted: " + raw);
      } catch (IOException expected) { /* refused before any connection */ }
    }
    System.out.println("PASS: migrated package access and 18 offline HTTPS boundary rejections");
  }
}
