package com.anf.workspace;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URI;
import java.net.URL;

/** Public https fetch. Redirects are checked again; private, loopback and credential URLs are refused. */
final class SafeHttps {
  private SafeHttps() {}

  static HttpURLConnection open(String raw) throws Exception {
    URL current = URI.create(raw).toURL();
    check(current);
    for (int hop = 0; hop < 3; hop++) {
      HttpURLConnection conn = (HttpURLConnection) current.openConnection();
      conn.setInstanceFollowRedirects(false);
      conn.setConnectTimeout(15000);
      conn.setReadTimeout(60000);
      conn.setRequestProperty("User-Agent", "AnF/0.1");
      int code = conn.getResponseCode();
      if (code >= 300 && code < 400) {
        String location = conn.getHeaderField("Location");
        conn.disconnect();
        if (location == null || location.trim().isEmpty()) throw new IOException("Redirect had no destination.");
        current = current.toURI().resolve(location).toURL();
        check(current);
        continue;
      }
      return conn;
    }
    throw new IOException("Too many redirects.");
  }

  static void check(URL url) throws Exception {
    if (!"https".equalsIgnoreCase(url.getProtocol())) throw new IOException("Only https URLs can be fetched.");
    if (url.getUserInfo() != null) throw new IOException("URL included credentials.");
    int port = url.getPort();
    if (port != -1 && port != 443) throw new IOException("Only the standard https port can be fetched.");
    String host = url.getHost();
    if (host == null || host.isEmpty()) throw new IOException("Host is not public.");
    String bare = host.startsWith("[") && host.endsWith("]") ? host.substring(1, host.length() - 1) : host;
    String name = bare.toLowerCase(java.util.Locale.ROOT);
    while (name.endsWith(".")) name = name.substring(0, name.length() - 1);
    if (name.isEmpty() || name.equals("localhost") || name.endsWith(".local") || name.endsWith(".localhost")
        || name.endsWith(".internal") || name.endsWith(".lan") || name.endsWith(".home") || name.endsWith(".corp")
        || name.endsWith(".intranet") || name.endsWith(".localdomain") || !name.contains(".") && name.indexOf(':') < 0)
      throw new IOException("Host is not public.");
    boolean numeric = name.indexOf(':') >= 0 || name.chars().allMatch(c -> (c >= '0' && c <= '9') || c == '.');
    if (numeric) {
      rejectAddress(InetAddress.getByName(bare));
      return;
    }
    for (InetAddress address : InetAddress.getAllByName(bare)) rejectAddress(address);
  }

  static void rejectAddress(InetAddress address) throws IOException {
    byte[] raw = address.getAddress();
    if (raw.length == 16 && (raw[10] & 255) == 255 && (raw[11] & 255) == 255) {
      byte[] v4 = new byte[] {raw[12], raw[13], raw[14], raw[15]};
      rejectAddress(InetAddress.getByAddress(v4));
      return;
    }
    int a = raw.length == 4 ? raw[0] & 255 : -1;
    int b = raw.length == 4 ? raw[1] & 255 : -1;
    int c = raw.length == 4 ? raw[2] & 255 : -1;
    boolean documentation = (a == 192 && b == 0 && (c == 0 || c == 2)) || (a == 192 && b == 88 && c == 99)
        || (a == 198 && (b == 18 || b == 19)) || (a == 198 && b == 51 && c == 100) || (a == 203 && b == 0 && c == 113);
    if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress() || address.isSiteLocalAddress() || address.isMulticastAddress()
        || a == 0 || a >= 224 || (a == 100 && b >= 64 && b <= 127) || documentation)
      throw new IOException("Host is not public.");
  }
}
