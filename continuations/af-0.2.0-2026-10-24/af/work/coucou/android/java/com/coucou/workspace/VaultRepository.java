package com.coucou.workspace;

import android.content.Context;
import android.database.Cursor;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import net.zetetic.database.sqlcipher.SQLiteDatabase;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** Encrypted native project store; IndexedDB is retained only as migration recovery. */
public final class VaultRepository {
  private final File folder,active,stage,wrapped,marker;
  private final String alias="coucou-vault-wrap-v1";
  public VaultRepository(Context context){folder=new File(context.getFilesDir(),"vault");active=new File(folder,"coucou.db");stage=new File(folder,"migration.db");wrapped=new File(folder,"key.wrapped");marker=new File(folder,"coucou.active");System.loadLibrary("sqlcipher");}
  private boolean enabled(){return active.exists()||marker.exists();}
  private SecretKey wrappingKey(boolean create)throws Exception{
    KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
    if(!ks.containsAlias(alias)){if(!create)throw new IllegalArgumentException("Vault key unavailable. Restore a recovery pack.");KeyGenerator g=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");g.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());g.generateKey();}
    return (SecretKey)ks.getKey(alias,null);
  }
  private void storeKey(byte[] value)throws Exception{
    if(!folder.exists()&&!folder.mkdirs())throw new IOException();Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,wrappingKey(true));cipher.updateAAD("Coucou vault key v1".getBytes(StandardCharsets.UTF_8));byte[] data=cipher.doFinal(value),iv=cipher.getIV();if(iv.length!=12||data.length!=48)throw new IOException("Unsupported key encoding.");AtomicFile file=new AtomicFile(wrapped);FileOutputStream out=null;try{out=file.startWrite();out.write(iv);out.write(data);file.finishWrite(out);}catch(Exception e){if(out!=null)file.failWrite(out);throw e;}
  }
  private byte[] key(boolean create)throws Exception{
    if(!wrapped.exists()){if(!create||enabled()||stage.exists())throw new IllegalArgumentException("Vault key unavailable. Restore a recovery pack.");byte[] value=new byte[32];new SecureRandom().nextBytes(value);storeKey(value);return value;}
    byte[] data;try(DataInputStream in=new DataInputStream(new AtomicFile(wrapped).openRead())){data=new byte[60];in.readFully(data);if(in.read()!=-1)throw new IOException();}
    Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,wrappingKey(false),new GCMParameterSpec(128,Arrays.copyOfRange(data,0,12)));cipher.updateAAD("Coucou vault key v1".getBytes(StandardCharsets.UTF_8));return cipher.doFinal(Arrays.copyOfRange(data,12,data.length));
  }
  // Random 256-bit keys do not need password stretching on every autosave.
  private byte[] rawKey(byte[] key){StringBuilder hex=new StringBuilder("x'");for(byte b:key)hex.append(String.format(Locale.ROOT,"%02x",b&255));return hex.append("'").toString().getBytes(StandardCharsets.US_ASCII);}
  private SQLiteDatabase open(File file,byte[] key,boolean create)throws Exception{
    if(!create&&!file.isFile())throw new IllegalArgumentException("Encrypted vault is not enabled.");
    if(!folder.exists()&&!folder.mkdirs())throw new IOException();
    SQLiteDatabase db=SQLiteDatabase.openDatabase(file.getAbsolutePath(),rawKey(key),null,SQLiteDatabase.OPEN_READWRITE|(create?SQLiteDatabase.CREATE_IF_NECESSARY:0),(damaged,cause)->{throw cause;},null);
    try{db.execSQL("PRAGMA temp_store=MEMORY");db.execSQL("PRAGMA secure_delete=ON");try(Cursor c=db.rawQuery("PRAGMA journal_mode=DELETE",new String[0])){c.moveToFirst();}try(Cursor c=db.rawQuery("PRAGMA cipher_version",new String[0])){if(!c.moveToFirst()||c.getString(0).isEmpty())throw new IOException();}try(Cursor c=db.rawQuery("SELECT count(*) FROM sqlite_master",new String[0])){c.moveToFirst();}if(file.equals(active)){try(Cursor c=db.rawQuery("SELECT value FROM meta WHERE key='schema'",new String[0])){if(!c.moveToFirst()||!c.getString(0).equals("1"))throw new IOException("Unsupported vault schema.");}}return db;}catch(Exception e){db.close();throw e;}
  }
  private void schema(SQLiteDatabase db){db.execSQL("CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,json TEXT NOT NULL,name TEXT NOT NULL,updated INTEGER NOT NULL,sync_id TEXT)");db.execSQL("CREATE VIRTUAL TABLE IF NOT EXISTS project_search USING fts5(id UNINDEXED,title,body,tokenize='unicode61')");db.execSQL("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)");db.execSQL("INSERT OR IGNORE INTO meta VALUES('schema','1')");db.execSQL("CREATE TABLE IF NOT EXISTS versions(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL,json TEXT NOT NULL,updated INTEGER NOT NULL)");}
  private void validate(JSONObject p)throws Exception{String id=p.getString("id");if(!id.matches("[a-zA-Z0-9-]{16,80}")||p.toString().getBytes(StandardCharsets.UTF_8).length>16000000||p.getString("name").length()>160||p.getString("draft").getBytes(StandardCharsets.UTF_8).length>200000||p.getJSONArray("notes").length()>1000||p.getJSONArray("sources").length()>4)throw new IllegalArgumentException("Invalid or oversized project.");}
  private void put(SQLiteDatabase db,JSONArray items)throws Exception{
    if(items.length()>200)throw new IllegalArgumentException("Too many projects in one operation.");for(int i=0;i<items.length();i++)validate(items.getJSONObject(i));
    db.beginTransaction();try{for(int i=0;i<items.length();i++){JSONObject p=items.getJSONObject(i);String id=p.getString("id"),json=p.toString();long stamp=p.optLong("updated",System.currentTimeMillis());JSONObject sync=p.optJSONObject("sync");db.execSQL("INSERT OR REPLACE INTO projects VALUES(?,?,?,?,?)",new Object[]{id,json,p.getString("name"),stamp,sync==null?null:sync.optString("id",null)});
      StringBuilder body=new StringBuilder(p.getString("draft")).append('\n').append(p.optString("prompt",""));JSONArray notes=p.getJSONArray("notes"),sources=p.getJSONArray("sources");for(int j=0;j<notes.length();j++)body.append('\n').append(notes.getJSONObject(j).getString("text"));for(int j=0;j<sources.length();j++)body.append('\n').append(sources.getJSONObject(j).getString("text"));
      db.execSQL("DELETE FROM project_search WHERE id=?",new Object[]{id});db.execSQL("INSERT INTO project_search VALUES(?,?,?)",new Object[]{id,p.getString("name"),body.toString()});long seq=-1;try(Cursor c=db.rawQuery("SELECT seq,updated FROM versions WHERE id=? ORDER BY seq DESC LIMIT 1",new String[]{id})){if(c.moveToFirst()&&c.getLong(1)/60000==stamp/60000)seq=c.getLong(0);}if(seq>=0)db.execSQL("UPDATE versions SET json=?,updated=? WHERE seq=?",new Object[]{json,stamp,seq});else db.execSQL("INSERT INTO versions(id,json,updated) VALUES(?,?,?)",new Object[]{id,json,stamp});db.execSQL("DELETE FROM versions WHERE id=? AND seq NOT IN (SELECT seq FROM versions WHERE id=? ORDER BY seq DESC LIMIT 20)",new Object[]{id,id});
    }db.setTransactionSuccessful();}finally{db.endTransaction();}
  }
  public synchronized String request(String operation,String json)throws Exception{
    JSONObject args=new JSONObject(json);
    if(operation.equals("status")){JSONObject result=new JSONObject().put("encrypted",enabled()).put("legacy_retained",true);if(enabled()){try(SQLiteDatabase db=open(active,key(false),false);Cursor c=db.rawQuery("SELECT count(*) FROM projects",new String[0])){c.moveToFirst();result.put("projects",c.getInt(0));}}return result.toString();}
    if(operation.equals("begin")){if(enabled())throw new IllegalArgumentException("Vault already enabled.");try(SQLiteDatabase db=open(stage,key(true),true)){schema(db);db.beginTransaction();try{db.execSQL("DELETE FROM projects");db.execSQL("DELETE FROM project_search");db.execSQL("DELETE FROM versions");db.setTransactionSuccessful();}finally{db.endTransaction();}}return "true";}
    if(operation.equals("commit")){if(enabled())throw new IllegalArgumentException("Vault already enabled.");try(SQLiteDatabase db=open(stage,key(false),false);Cursor c=db.rawQuery("SELECT count(*) FROM projects",new String[0])){c.moveToFirst();if(c.getInt(0)!=args.getInt("count"))throw new IllegalArgumentException("Migration count mismatch.");try(Cursor integrity=db.rawQuery("PRAGMA integrity_check",new String[0])){if(!integrity.moveToFirst()||!"ok".equals(integrity.getString(0))||integrity.moveToNext())throw new IOException("Vault integrity check failed.");}}try(RandomAccessFile file=new RandomAccessFile(stage,"rw")){file.getFD().sync();}if(!stage.renameTo(active))throw new IOException();try(FileOutputStream out=new FileOutputStream(marker)){out.write("Coucou encrypted vault v1".getBytes(StandardCharsets.UTF_8));out.getFD().sync();}return "true";}
    if(operation.equals("recovery")){try(SQLiteDatabase db=open(active,key(false),false)){byte[] k=key(false);StringBuilder hex=new StringBuilder();for(byte b:k)hex.append(String.format(Locale.ROOT,"%02x",b&255));Arrays.fill(k,(byte)0);return JSONObject.quote(hex.toString());}}
    if(operation.equals("recover")){String hex=args.getString("key");if(!hex.matches("[0-9a-fA-F]{64}"))throw new IllegalArgumentException("Invalid recovery key.");byte[] k=new byte[32];for(int i=0;i<32;i++)k[i]=(byte)Integer.parseInt(hex.substring(i*2,i*2+2),16);try(SQLiteDatabase db=open(active,k,false);Cursor c=db.rawQuery("SELECT value FROM meta WHERE key='schema'",new String[0])){if(!c.moveToFirst()||!c.getString(0).equals("1"))throw new IOException();storeKey(k);}finally{Arrays.fill(k,(byte)0);}return "true";}
    File target=operation.startsWith("migration_")?stage:active;
    try(SQLiteDatabase db=open(target,key(false),false)){
      if(operation.equals("put")||operation.equals("migration_put")){put(db,args.getJSONArray("projects"));return "true";}
      if(operation.equals("get")||operation.equals("migration_get")){try(Cursor c=db.rawQuery("SELECT json FROM projects WHERE id=?",new String[]{args.getString("id")})){return c.moveToFirst()?c.getString(0):"null";}}
      if(operation.equals("versions")){JSONArray list=new JSONArray();try(Cursor c=db.rawQuery("SELECT seq,updated FROM versions WHERE id=? ORDER BY seq DESC LIMIT 20",new String[]{args.getString("id")})){while(c.moveToNext())list.put(new JSONObject().put("seq",c.getLong(0)).put("updated",c.getLong(1)));}return list.toString();}
      if(operation.equals("version")){try(Cursor c=db.rawQuery("SELECT json FROM versions WHERE id=? AND seq=?",new String[]{args.getString("id"),Long.toString(args.getLong("seq"))})){if(!c.moveToFirst())throw new IllegalArgumentException("Snapshot is no longer available.");return c.getString(0);}}
      if(operation.equals("list")){String query=args.optString("query","").trim();if(query.length()>1024)throw new IllegalArgumentException("Use a shorter search phrase.");StringBuilder term=new StringBuilder();for(String s:query.split("\\s+")){if(s.isEmpty())continue;if(term.length()>0)term.append(" AND ");term.append('"').append(s.replace("\"","\"\"")).append('"');}String sql=term.length()==0?"SELECT id,name,updated,sync_id FROM projects ORDER BY updated DESC":"SELECT p.id,p.name,p.updated,p.sync_id FROM project_search JOIN projects p ON p.id=project_search.id WHERE project_search MATCH ? ORDER BY rank,p.updated DESC";JSONArray list=new JSONArray();try(Cursor c=db.rawQuery(sql,term.length()==0?new String[0]:new String[]{term.toString()})){while(c.moveToNext()){JSONObject p=new JSONObject().put("id",c.getString(0)).put("name",c.getString(1)).put("updated",c.getLong(2));if(!c.isNull(3))p.put("syncId",c.getString(3));list.put(p);}}return list.toString();}
      throw new IllegalArgumentException("Unsupported storage operation.");
    }
  }
}
