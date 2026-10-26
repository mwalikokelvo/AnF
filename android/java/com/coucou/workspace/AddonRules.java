package com.coucou.workspace;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Trust rules for marketplace themes. Mirrors windows/src-tauri/src/addons.rs; keep the two in step. No Android imports so a plain JVM can test it. */
final class AddonRules {
  static final String REGISTRY="https://raw.githubusercontent.com/mwalikokelvo/AnF/main/marketplace/registry.json";
  static final String PREFIX="https://raw.githubusercontent.com/mwalikokelvo/AnF/main/marketplace/";
  private AddonRules(){}
  private static int bytes(String s){return s.getBytes(StandardCharsets.UTF_8).length;}
  /** ASCII-only lowercase, like Rust's to_ascii_lowercase, so non-ASCII text cannot change what is matched. */
  private static String lower(String s){StringBuilder b=new StringBuilder(s.length());for(int i=0;i<s.length();i++){char c=s.charAt(i);b.append(c>='A'&&c<='Z'?(char)(c+32):c);}return b.toString();}
  static boolean validId(String id){
    if(id==null||id.isEmpty()||id.length()>64)return false;
    char first=id.charAt(0);if(!((first>='a'&&first<='z')||(first>='0'&&first<='9')))return false;
    for(int i=0;i<id.length();i++){char c=id.charAt(i);if(!((c>='a'&&c<='z')||(c>='0'&&c<='9')||c=='-'))return false;}
    return true;
  }
  private static boolean hex64(String s){if(s==null||s.length()!=64)return false;for(int i=0;i<64;i++){char c=s.charAt(i);if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')||(c>='A'&&c<='F')))return false;}return true;}
  /** True when a registry entry may be shown or installed. */
  static boolean trusted(String id,String type,String url,String sha256,String name,String description,String version,String author){
    if(!validId(id))return false;
    if(!"theme".equals(type)&&!"plugin".equals(type))return false;
    if(url==null||!url.startsWith(PREFIX))return false;
    String tail=url.substring(PREFIX.length());
    if(tail.isEmpty()||tail.contains("..")||tail.indexOf('?')>=0||tail.indexOf('#')>=0||tail.indexOf('\\')>=0||tail.indexOf('@')>=0||!hex64(sha256))return false;
    return name!=null&&description!=null&&version!=null&&author!=null&&bytes(name)<=80&&bytes(description)<=400&&bytes(version)<=20&&bytes(author)<=80;
  }
  /** A theme may restyle AnF but not load anything: no @import and no url() except data:. Returns null when fine, else the reason. */
  static String checkCss(String css){
    if(bytes(css)>200_000)return "Theme is larger than 200 KB.";
    String low=lower(css);
    if(low.contains("@import"))return "Themes cannot use @import.";
    String[] parts=low.split("url\\(",-1);
    for(int i=1;i<parts.length;i++){
      String p=parts[i];int start=0;
      while(start<p.length()&&Character.isWhitespace(p.charAt(start)))start++;
      while(start<p.length()&&(p.charAt(start)=='"'||p.charAt(start)=='\''))start++;
      if(!p.startsWith("data:",start))return "Themes can only use url(data:…).";
    }
    return null;
  }
  static boolean matchesHash(String content,String expected){
    try{
      byte[] d=MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8));
      StringBuilder b=new StringBuilder();for(byte x:d)b.append(String.format("%02x",x&255));
      return b.toString().equalsIgnoreCase(expected);
    }catch(java.security.NoSuchAlgorithmException e){return false;}
  }
}
