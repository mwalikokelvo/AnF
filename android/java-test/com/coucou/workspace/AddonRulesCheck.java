package com.coucou.workspace;

/** Plain-JVM check of the marketplace trust rules. Run: javac AddonRules.java AddonRulesCheck.java, then java com.coucou.workspace.AddonRulesCheck */
public class AddonRulesCheck {
  static void ok(boolean value,String what){if(!value)throw new AssertionError(what);}
  static boolean trusted(String id,String url){return AddonRules.trusted(id,"theme",url,"0".repeat(64),"T","d","1","");}
  public static void main(String[] args){
    for(String bad:new String[]{"","..","../x","a/b","a\\b","A","-a","a.b","a".repeat(65)})ok(!AddonRules.validId(bad),"id accepted: "+bad);
    ok(AddonRules.validId("catppuccin-mocha"),"good id rejected");ok(!AddonRules.validId(null),"null id accepted");
    String good=AddonRules.PREFIX+"a/theme.css";
    ok(trusted("a",good),"good entry rejected");
    for(String url:new String[]{"https://evil.example/a.css","http://raw.githubusercontent.com/mwalikokelvo/AnF/main/marketplace/a.css",AddonRules.PREFIX+"../../x.css",AddonRules.PREFIX+"a.css?x=1",AddonRules.PREFIX+"a.css#x",AddonRules.PREFIX+"a\\b.css",AddonRules.PREFIX+"u@evil/a.css",AddonRules.PREFIX,"https://raw.githubusercontent.com/mwalikokelvo/AnF/main/marketplaceX/a.css"})ok(!trusted("a",url),"url accepted: "+url);
    ok(!AddonRules.trusted("a","script",good,"0".repeat(64),"T","d","1",""),"unknown type accepted");
    ok(!AddonRules.trusted("a","theme",good,"0".repeat(63),"T","d","1",""),"short hash accepted");
    ok(!AddonRules.trusted("a","theme",good,"g".repeat(64),"T","d","1",""),"non-hex hash accepted");
    ok(!AddonRules.trusted("a","theme",good,"0".repeat(64),"x".repeat(81),"d","1",""),"long name accepted");
    ok(AddonRules.checkCss("#workspace-root{--bg:#000}")==null,"plain css rejected");
    ok(AddonRules.checkCss("a{background:url(data:image/png;base64,AAAA)}")==null,"data url rejected");
    ok(AddonRules.checkCss("a{background:url( \"data:image/png;base64,AAAA\")}")==null,"quoted data url rejected");
    for(String bad:new String[]{"@import 'x.css';","@IMPORT url(x)","a{background:url(https://evil.example/x.png)}","a{background:URL(//evil.example/x)}","a{background:url('x.png')}","a{background:url(data:x) url(x)}","x".repeat(200_001)})ok(AddonRules.checkCss(bad)!=null,"css accepted: "+(bad.length()>40?bad.substring(0,40):bad));
    String css="#workspace-root{--bg:#111}";
    ok(!AddonRules.matchesHash(css,"0".repeat(64)),"wrong hash accepted");
    try{
      String hash=java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(css.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
      ok(AddonRules.matchesHash(css,hash),"right hash rejected");ok(AddonRules.matchesHash(css,hash.toUpperCase()),"upper-case hash rejected");ok(!AddonRules.matchesHash(css+" ",hash),"changed content accepted");
    }catch(Exception e){throw new AssertionError(e);}
    System.out.println("Marketplace rules passed: ids, trusted URLs, entry limits, CSS restrictions, checksum.");
  }
}
