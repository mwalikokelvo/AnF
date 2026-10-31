// SPDX-License-Identifier: MIT
// ENGINEERING FIXTURE ONLY. No upstream catalog, provider or user media access.
package com.anf.mkr.windows;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.concurrent.*;
import java.util.regex.*;

public final class WindowsCatalogSidecarKt {
    private static volatile String active = "";
    private static byte[] audio;
    private static String field(String json, String key) {
        Matcher m = Pattern.compile("\"" + key + "\"\\s*:\\s*\"([a-zA-Z0-9 _-]*)\"").matcher(json);
        return m.find() ? m.group(1) : "";
    }
    private static void serve(Socket socket) {
        try (socket) {
            socket.setSoTimeout(3000);
            var input = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
            String first = input.readLine();
            if (first == null || first.length() > 256) return;
            String[] request = first.split(" ");
            String range = "";
            for (int i = 0; i < 40; i++) {
                String header = input.readLine();
                if (header == null || header.isEmpty()) break;
                if (header.length() > 2048) return;
                if (header.regionMatches(true, 0, "Range:", 0, 6)) range = header.substring(6).trim();
            }
            var out = socket.getOutputStream();
            if (request.length != 3 || active.isEmpty() || !request[1].equals("/audio/" + active)
                    || !(request[0].equals("GET") || request[0].equals("HEAD"))) {
                out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII)); return;
            }
            int start = 0, end = audio.length - 1;
            Matcher span = Pattern.compile("bytes=(\\d+)-(\\d*)").matcher(range);
            boolean partial = span.matches();
            if (partial) {
                start = Integer.parseInt(span.group(1));
                if (!span.group(2).isEmpty()) end = Math.min(end, Integer.parseInt(span.group(2)));
            }
            if (start < 0 || start > end) return;
            String headers = "HTTP/1.1 " + (partial ? "206 Partial Content" : "200 OK")
                + "\r\nContent-Type: audio/mp4\r\nAccept-Ranges: bytes\r\nContent-Length: " + (end - start + 1)
                + (partial ? "\r\nContent-Range: bytes " + start + "-" + end + "/" + audio.length : "")
                + "\r\nConnection: close\r\n\r\n";
            out.write(headers.getBytes(StandardCharsets.US_ASCII));
            if (request[0].equals("GET")) out.write(audio, start, end - start + 1);
        } catch (Exception ignored) { /* No raw frames, paths or nonce logs. */ }
    }
    public static void main(String[] ignored) throws Exception {
        try (var source = WindowsCatalogSidecarKt.class.getResourceAsStream("/fixture.m4a")) {
            if (source == null) throw new IOException("generated fixture missing");
            audio = source.readNBytes(5_242_881);
            if (audio.length == 0 || audio.length > 5_242_880) throw new IOException("fixture size");
        }
        var pool = new ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(8),
            task -> { var t = new Thread(task, "fixture-http"); t.setDaemon(true); return t; }, new ThreadPoolExecutor.AbortPolicy());
        try (var server = new ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"))) {
            var accept = new Thread(() -> {
                while (!server.isClosed()) try {
                    var socket = server.accept();
                    try { pool.execute(() -> serve(socket)); } catch (RejectedExecutionException e) { socket.close(); }
                } catch (IOException e) { break; }
            }, "fixture-listener"); accept.setDaemon(true); accept.start();
            var reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
            boolean authenticated = false;
            long sequence = 0;
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.length() > 4096) break;
                Matcher id = Pattern.compile("\"id\"\\s*:\\s*(\\d+)").matcher(line);
                if (!id.find() || Long.parseLong(id.group(1)) != ++sequence) break;
                String command = field(line, "command"), result;
                if (!authenticated) {
                    if (!command.equals("hello") || !field(line,"nonce").equals(System.getenv("ANF_MKR_SESSION_NONCE"))) break;
                    authenticated = true; result = "{\"protocol\":1,\"catalog\":true,\"leasedInput\":true,\"embedded\":false}";
                } else switch (command) {
                    case "search" -> {
                        String query = field(line, "query");
                        if (query.equals("exit-fixture")) return;
                        if (query.equals("slow")) Thread.sleep(2000);
                        result = "[{\"id\":\"abcdefghijk\",\"title\":\"Generated AAC\",\"artist\":\"Engineering fixture\"},{\"id\":\"lmnopqrstuv\",\"title\":\"Second generated AAC\",\"artist\":\"Engineering fixture\"}]";
                    }
                    case "release" -> { active = ""; result = "null"; }
                    case "prepare" -> {
                        String track = field(line,"trackId");
                        if (!(track.equals("abcdefghijk") || track.equals("lmnopqrstuv"))) return;
                        Thread.sleep(1500);
                        byte[] token = new byte[32]; new SecureRandom().nextBytes(token); active = HexFormat.of().formatHex(token);
                        result = "{\"trackId\":\"" + track + "\",\"leaseUri\":\"http://127.0.0.1:" + server.getLocalPort() + "/audio/" + active
                            + "\",\"contentLengthBytes\":" + audio.length + ",\"expiresAtEpochMs\":" + (System.currentTimeMillis()+120_000) + ",\"mimeType\":\"audio/mp4\"}";
                    }
                    default -> { return; }
                }
                System.out.println("{\"protocol\":1,\"id\":" + sequence + ",\"ok\":true,\"result\":" + result + "}");
                System.out.flush();
            }
        } finally { active = ""; pool.shutdownNow(); }
    }
}
