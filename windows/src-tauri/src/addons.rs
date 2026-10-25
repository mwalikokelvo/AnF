//! Bounded add-on storage and a separate-origin plugin document. No app IPC is
//! exposed to the sandbox. The existing application identity remains unchanged.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, io::{Read, Write}, path::{Path, PathBuf}, sync::atomic::{AtomicU64, Ordering}};
use tauri::{AppHandle, Manager};

const LIMIT: usize = 512 * 1024;
static SERIAL: AtomicU64 = AtomicU64::new(0);
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub id: String, pub name: String, pub version: String,
    #[serde(rename = "type")] pub kind: String,
    pub entry: String, pub description: String,
    #[serde(default)] pub author: String,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub download_url: Option<String>,
    pub sha256: String,
}
#[derive(Serialize, Deserialize)]
struct Record { manifest: Manifest, content: String }
fn slug(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}
fn category(s: &str) -> Result<&str, String> {
    match s { "themes" | "plugins" => Ok(s), _ => Err("Invalid add-on category".into()) }
}
fn validate(m: &Manifest, kind: &str, id: &str) -> Result<(), String> {
    category(kind)?;
    if !slug(id) || m.id != id || m.name.is_empty() || m.name.len()>120 ||
        m.description.len()>1000 || m.author.len()>120 || m.version.is_empty() || m.version.len()>40 ||
        !m.sha256.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()) || m.sha256.len()!=64 ||
        !matches!((kind, m.kind.as_str(), m.entry.as_str()), ("themes","theme","theme.css") | ("plugins","plugin","index.js")) {
        return Err("Invalid add-on manifest".into());
    }
    if let Some(url) = &m.download_url { allowed_url(url)?; }
    Ok(())
}
fn allowed_url(value: &str) -> Result<(), String> {
    let u = reqwest::Url::parse(value).map_err(|_| "Invalid marketplace URL")?;
    if u.scheme()!="https" || u.host_str()!=Some("raw.githubusercontent.com") ||
        !u.username().is_empty() || u.password().is_some() || u.port().is_some() ||
        u.query().is_some() || u.fragment().is_some() ||
        !u.path().starts_with("/mwalikokelvo/AnF/main/marketplace/") {
        return Err("Marketplace downloads must come from the AnF registry repository".into());
    }
    Ok(())
}
fn check_plain(path: &Path) -> Result<(), String> {
    let m = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if m.file_type().is_symlink() { return Err("Add-on links are not allowed".into()); }
    #[cfg(windows)] {
        use std::os::windows::fs::MetadataExt;
        if m.file_attributes() & 0x400 != 0 { return Err("Add-on reparse points are not allowed".into()); }
    }
    Ok(())
}
fn directory(path: &Path) -> Result<(), String> {
    if path.exists() { check_plain(path)?; } else { fs::create_dir(path).map_err(|e|e.to_string())?; }
    if !path.is_dir() { return Err("Add-on directory is not a folder".into()); }
    Ok(())
}
fn folder(root: &Path, kind: &str, id: Option<&str>) -> Result<PathBuf, String> {
    category(kind)?;
    if id.is_some_and(|id| !slug(id)) { return Err("Invalid add-on ID".into()); }
    fs::create_dir_all(root).map_err(|e|e.to_string())?;
    check_plain(root)?;
    let addons = root.join("addons"); directory(&addons)?;
    let mut path = addons.join(kind); directory(&path)?;
    if let Some(id) = id { path.push(id); directory(&path)?; }
    Ok(path)
}
fn root(app: &AppHandle) -> Result<PathBuf,String> { app.path().app_data_dir().map_err(|e|e.to_string()) }
fn record(root: &Path, kind: &str, id: &str) -> Result<Record,String> {
    let path = folder(root,kind,Some(id))?.join("addon.json");
    check_plain(&path)?;
    let mut bytes=Vec::new();
    fs::File::open(&path).map_err(|e|e.to_string())?.take((LIMIT*2+1) as u64).read_to_end(&mut bytes).map_err(|e|e.to_string())?;
    if bytes.len()>LIMIT*2 { return Err("Add-on record exceeds its limit".into()); }
    let value:Record=serde_json::from_slice(&bytes).map_err(|e|e.to_string())?;
    validate(&value.manifest,kind,id)?;
    if value.content.len()>LIMIT || format!("{:x}",Sha256::digest(value.content.as_bytes()))!=value.manifest.sha256 {
        return Err("Add-on integrity check failed".into());
    }
    Ok(value)
}
fn save(root:&Path, kind:&str,id:&str,manifest_json:&str,content:&str,entry:&str)->Result<(),String>{
    if manifest_json.len()>8192 || content.is_empty() || content.len()>LIMIT {return Err("Add-on exceeds its size limit".into());}
    let m:Manifest=serde_json::from_str(manifest_json).map_err(|e|e.to_string())?;
    validate(&m,kind,id)?;
    if entry!=m.entry || format!("{:x}",Sha256::digest(content.as_bytes()))!=m.sha256 {return Err("Add-on hash or entry does not match".into());}
    let dir=folder(root,kind,Some(id))?;
    let dest=dir.join("addon.json");
    if dest.exists(){check_plain(&dest)?;}
    let temp=dir.join(format!("write-{}-{}.tmp",std::process::id(),SERIAL.fetch_add(1,Ordering::Relaxed)));
    let result=(||{
        let data=serde_json::to_vec(&Record{manifest:m,content:content.into()}).map_err(|e|e.to_string())?;
        if data.len()>LIMIT*2 { return Err("Encoded add-on record exceeds its limit".into()); }
        let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|e|e.to_string())?;
        file.write_all(&data).and_then(|_|file.sync_all()).map_err(|e|e.to_string())?;
        drop(file);
        fs::rename(&temp,&dest).map_err(|e|e.to_string())
    })();
    if result.is_err(){let _=fs::remove_file(temp);}
    result
}
#[tauri::command]
pub fn list_installed_addons(app:AppHandle,addon_type:String)->Result<Vec<String>,String>{
    let root=root(&app)?;let dir=folder(&root,&addon_type,None)?;let mut out=Vec::new();
    for entry in fs::read_dir(dir).map_err(|e|e.to_string())?.take(200){
        let entry=entry.map_err(|e|e.to_string())?;
        let id=entry.file_name().to_string_lossy().into_owned();
        if slug(&id) { if let Ok(r)=record(&root,&addon_type,&id){out.push(serde_json::to_string(&r.manifest).map_err(|e|e.to_string())?);} }
    }
    out.sort(); Ok(out)
}
#[tauri::command]
pub fn read_addon_file(app:AppHandle,addon_type:String,id:String,filename:String)->Result<String,String>{
    let r=record(&root(&app)?,&addon_type,&id)?;
    if filename=="manifest.json" {return serde_json::to_string(&r.manifest).map_err(|e|e.to_string());}
    if filename!=r.manifest.entry {return Err("Only the declared entry file can be read".into());}
    Ok(r.content)
}
#[tauri::command]
pub fn save_addon(app:AppHandle,addon_type:String,id:String,manifest_json:String,content:String,entry_file:String)->Result<(),String>{
    save(&root(&app)?,&addon_type,&id,&manifest_json,&content,&entry_file)
}
#[tauri::command]
pub async fn fetch_addon_resource(url:String)->Result<String,String>{
    allowed_url(&url)?;
    let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).redirect(reqwest::redirect::Policy::none()).build().map_err(|e|e.to_string())?;
    let mut response=client.get(url).send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?;
    if response.content_length().is_some_and(|v|v>LIMIT as u64){return Err("Marketplace response too large".into());}
    let mut body=Vec::new();
    while let Some(chunk)=response.chunk().await.map_err(|e|e.to_string())? {
        if body.len()+chunk.len()>LIMIT {return Err("Marketplace response too large".into());}
        body.extend_from_slice(&chunk);
    }
    String::from_utf8(body).map_err(|_|"Marketplace response is not UTF-8".into())
}
pub fn sandbox(app:&AppHandle,path:&str)->Result<String,String>{
    let id=path.strip_prefix("/plugins/").ok_or("Invalid plugin route")?;
    let r=record(&root(app)?,"plugins",id)?;
    Ok(sandbox_document(&r.content))
}
fn sandbox_document(script:&str)->String {
    // JSON is data inside a script element: escape HTML delimiters before embedding.
    let code=serde_json::to_string(script).expect("string JSON serialization").replace('<',"\\u003c").replace('>',"\\u003e").replace('&',"\\u0026");
    include_str!("addon-sandbox.html").replace("__ANF_PLUGIN_CODE__",&code)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn script_cannot_break_out_of_document(){
        let html=sandbox_document("</script><script>attack()</script>");
        assert!(!html.contains("</script><script>attack"));
        assert!(html.contains("\\u003c/script\\u003e"));
    }
    #[test]
    fn traversal_hash_and_update_are_checked(){
        let root=std::env::temp_dir().join(format!("anf-addon-test-{}",std::process::id()));
        let content="api.log('test')";
        let m=Manifest{id:"test-plugin".into(),name:"Test".into(),version:"1".into(),kind:"plugin".into(),entry:"index.js".into(),description:"Test".into(),author:"AnF".into(),download_url:None,sha256:format!("{:x}",Sha256::digest(content.as_bytes()))};
        let json=serde_json::to_string(&m).unwrap();
        assert!(save(&root,"../plugins",&m.id,&json,content,&m.entry).is_err());
        assert!(save(&root,"plugins","../escape",&json,content,&m.entry).is_err());
        assert!(save(&root,"plugins",&m.id,&json,"tampered",&m.entry).is_err());
        save(&root,"plugins",&m.id,&json,content,&m.entry).unwrap();
        save(&root,"plugins",&m.id,&json,content,&m.entry).unwrap();
        assert_eq!(record(&root,"plugins",&m.id).unwrap().content,content);
        fs::remove_file(root.join("addons/plugins/test-plugin/addon.json")).unwrap();
        for p in ["addons/plugins/test-plugin","addons/plugins","addons"]{fs::remove_dir(root.join(p)).unwrap();}
        fs::remove_dir(root).unwrap();
    }
    #[test]
    fn registry_origin_is_restricted(){
        assert!(allowed_url("https://raw.githubusercontent.com/mwalikokelvo/AnF/main/marketplace/registry.json").is_ok());
        for url in ["https://example.com/a","https://raw.githubusercontent.com/other/repo/main/marketplace/a","http://raw.githubusercontent.com/mwalikokelvo/AnF/main/marketplace/a","https://raw.githubusercontent.com/mwalikokelvo/AnF/main/marketplace/../../secret"]{assert!(allowed_url(url).is_err());}
    }
}
