// AnF-owned source transformation recipes. No credentials or user data access.
function once(text,before,after,label){
 text=text.replaceAll('\r\n','\n');
 if(text.split(before).length!==2)throw Error('Pinned Spotube '+label+' patch did not match exactly once.');
 return text.replace(before,after);
}
export function patchEmbeddedDatabase(text){
 return once(text,"File(join(dbFolder.path, 'db.sqlite'))","File(join(dbFolder.path, 'anf-spotube.sqlite'))",'database filename');
}
export function patchEmbeddedLogger(text){
 if(text.includes("File(join(support.path, 'logs', 'spotube.log'))"))throw Error('Pinned Spotube embedded logger patch did not match exactly once: already patched.');
 for(const required of ["import 'dart:io';","import 'package:path/path.dart';","import 'package:path_provider/path_provider.dart';"]){
  if(!text.includes(required))throw Error('Pinned Spotube logger imports changed.');
 }
 const signature='  static Future<File> getLogsPath() async {\n';
 return once(text,signature,signature+[
  "    // Embedded logs belong to this app's support directory, never the",
  "    // standalone Spotube log in the user's Documents directory.",
  "    if (const bool.fromEnvironment('ANF_EMBEDDED', defaultValue: true)) {",
  "      final support = await getApplicationSupportDirectory();",
  "      final file = File(join(support.path, 'logs', 'spotube.log'));",
  "      if (!await file.exists()) await file.create(recursive: true);",
  "      return file;",
  "    }",''].join('\n'),'embedded logger');
}
export function patchWindowsStorageIdentity(text){
 text=once(text,'VALUE "CompanyName", "oss.krtirtho"','VALUE "CompanyName", "AnF"','Windows company identity');
 return once(text,'VALUE "ProductName", "spotube"','VALUE "ProductName", "AnFMusic"','Windows product identity');
}
