package com.anf.workspace;
import java.nio.charset.StandardCharsets;
public class LinkCheck {
  public static void main(String[] args)throws Exception{
    String code=args[0];byte[] key=new byte[32];String aad="test";byte[] encrypted=LocalLink.seal(key,aad,"private".getBytes(StandardCharsets.UTF_8));
    if(!new String(LocalLink.open(key,aad,encrypted),StandardCharsets.UTF_8).equals("private"))throw new AssertionError();encrypted[14]^=1;try{LocalLink.open(key,aad,encrypted);throw new AssertionError();}catch(javax.crypto.AEADBadTagException expected){}
    if(LocalLink.privateAddress("8.8.8.8")||LocalLink.privateAddress("127.00.0.1")||LocalLink.privateAddress("example.com"))throw new AssertionError();
    String list=LocalLink.request(code,"/v1/list","{}");if(!list.contains("\"entries\""))throw new AssertionError("Missing encrypted list");
    String denied=LocalLink.request(code,"/v1/ask","{}");if(!denied.contains("offline AI is off"))throw new AssertionError("AI permission not enforced");
    String missing=LocalLink.request(code,"/v1/pull","{\"id\":\"../invalid\"}");if(!missing.contains("error"))throw new AssertionError("Invalid path accepted");
    try{LocalLink.request(code.substring(0,code.length()-1)+"8","/v1/list","{}");throw new AssertionError("Wrong key accepted");}catch(java.io.IOException expected){}
    System.out.println("Java/native transport passed: encrypted list, AI permission, invalid ID, wrong key, tamper, address validation.");
  }
}
