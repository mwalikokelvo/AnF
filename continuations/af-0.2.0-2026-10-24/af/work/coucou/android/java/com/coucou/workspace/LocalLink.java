package com.coucou.workspace;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Native LAN transport. Pairing secrets are supplied in memory and never written to disk. */
public final class LocalLink {
  static final int LIMIT=16000000;
  static byte[] fromHex(String s) throws IOException {
    if(!s.matches("[0-9a-f]{64}"))throw new IOException("Invalid pairing key.");
    byte[] key=new byte[32];for(int i=0;i<32;i++)key[i]=(byte)Integer.parseInt(s.substring(i*2,i*2+2),16);return key;
  }
  static String hex(byte[] b){StringBuilder s=new StringBuilder();for(byte v:b)s.append(String.format("%02x",v&255));return s.toString();}
  static byte[] seal(byte[] key,String aad,byte[] plain)throws Exception{
    byte[] nonce=new byte[12];new SecureRandom().nextBytes(nonce);
    Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,nonce));c.updateAAD(aad.getBytes(StandardCharsets.UTF_8));
    byte[] encrypted=c.doFinal(plain), result=Arrays.copyOf(nonce,12+encrypted.length);System.arraycopy(encrypted,0,result,12,encrypted.length);return result;
  }
  static byte[] open(byte[] key,String aad,byte[] data)throws Exception{
    if(data.length<28||data.length>LIMIT+28)throw new IOException("Invalid response size.");
    Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,Arrays.copyOf(data,12)));c.updateAAD(aad.getBytes(StandardCharsets.UTF_8));return c.doFinal(data,12,data.length-12);
  }
  static boolean privateAddress(String address){
    if(!address.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}"))return false;
    String[] parts=address.split("\\.");int[] n=new int[4];for(int i=0;i<4;i++){n[i]=Integer.parseInt(parts[i]);if(n[i]>255||!parts[i].equals(Integer.toString(n[i])))return false;}
    return n[0]==10||(n[0]==172&&n[1]>=16&&n[1]<=31)||(n[0]==192&&n[1]==168)||n[0]==127;
  }
  public static String request(String code,String path,String json)throws Exception{
    if(code.length()>150||!path.matches("/v1/(list|pull|sync|ask)"))throw new IOException("Invalid connection request.");
    String[] parts=code.trim().split(":");if(parts.length!=4||!parts[0].equals("coucou1")||!privateAddress(parts[1])||!parts[2].matches("[0-9]{1,5}"))throw new IOException("Paste the complete pairing code from Windows Settings.");
    int port=Integer.parseInt(parts[2]);if(port<1||port>65535)throw new IOException("Invalid port.");
    byte[] key=fromHex(parts[3]),plain=json.getBytes(StandardCharsets.UTF_8);if(plain.length>LIMIT)throw new IOException("Conversation exceeds 16 MB. Export it separately.");
    byte[] body=seal(key,"coucou-v1-request|"+path,plain);
    HttpURLConnection connection=(HttpURLConnection)new URL("http",parts[1],port,path).openConnection(Proxy.NO_PROXY);
    try{
      connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(10000);connection.setReadTimeout(path.equals("/v1/ask")?930000:30000);connection.setUseCaches(false);connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/octet-stream");connection.setFixedLengthStreamingMode(body.length);
      try(OutputStream out=connection.getOutputStream()){out.write(body);}
      if(connection.getResponseCode()!=200)throw new IOException("Connection refused. Check pairing and Windows sharing.");
      ByteArrayOutputStream out=new ByteArrayOutputStream();try(InputStream in=connection.getInputStream()){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>LIMIT+28)throw new IOException("Response too large.");out.write(buffer,0,n);}}
      return new String(open(key,"coucou-v1-response|"+path+"|"+hex(Arrays.copyOf(body,12)),out.toByteArray()),StandardCharsets.UTF_8);
    }finally{connection.disconnect();Arrays.fill(key,(byte)0);}
  }
}
