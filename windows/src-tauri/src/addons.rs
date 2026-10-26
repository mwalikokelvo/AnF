//! Marketplace themes. CSS only: plugins are listed but cannot be installed until
//! they have a reviewed sandbox. Only the registry below is contacted, and only when
//! the user opens the marketplace or presses Install.
use serde::{Deserialize,Serialize};
use sha2::{Digest,Sha256};
use std::path::{Path,PathBuf};
const REGISTRY:&str="https://raw.githubusercontent.com/mwalikokelvo/AnF/main/marketplace/registry.json";
const PREFIX:&str="https://raw.githubusercontent.com/mwalikokelvo/AnF/main/marketplace/";
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Entry{pub id:String,pub name:String,pub version:String,#[serde(rename="type")]pub kind:String,pub description:String,#[serde(default)]pub author:String,pub download_url:String,pub sha256:String}
pub fn valid_id(id:&str)->bool{let b=id.as_bytes();!b.is_empty()&&b.len()<=64&&b[0].is_ascii_alphanumeric()&&b.iter().all(|c|c.is_ascii_lowercase()||c.is_ascii_digit()||*c==b'-')}
fn check_entry(e:&Entry)->Result<(),String>{
    if !valid_id(&e.id){return Err("Invalid add-on id.".into());}
    if e.kind!="theme"&&e.kind!="plugin"{return Err("Unknown add-on type.".into());}
    let tail=e.download_url.strip_prefix(PREFIX).unwrap_or("");
    if tail.is_empty()||tail.contains("..")||tail.contains(['?','#','\\','@'])||e.sha256.len()!=64||!e.sha256.bytes().all(|c|c.is_ascii_hexdigit()){return Err("Add-on entry is not trusted.".into());}
    if e.name.len()>80||e.description.len()>400||e.version.len()>20||e.author.len()>80{return Err("Add-on text is too long.".into());}
    Ok(())
}
/// A theme may restyle AnF but not load anything: no @import and no url() except data:.
pub fn check_css(css:&str)->Result<(),String>{
    if css.len()>200_000{return Err("Theme is larger than 200 KB.".into());}
    let low=css.to_ascii_lowercase();
    if low.contains("@import"){return Err("Themes cannot use @import.".into());}
    for part in low.split("url(").skip(1){if !part.trim_start().trim_start_matches(['"','\'']).starts_with("data:"){return Err("Themes can only use url(data:…).".into());}}
    Ok(())
}
fn theme_dir(base:&Path,id:&str)->Result<PathBuf,String>{if !valid_id(id){return Err("Invalid theme id.".into());}Ok(base.join("addons").join("themes").join(id))}
pub fn save_theme(base:&Path,e:&Entry,css:&str)->Result<(),String>{
    check_entry(e)?;check_css(css)?;
    let dir=theme_dir(base,&e.id)?;std::fs::create_dir_all(&dir).map_err(|x|x.to_string())?;
    std::fs::write(dir.join("theme.css"),css).map_err(|x|x.to_string())?;
    std::fs::write(dir.join("manifest.json"),serde_json::to_string(e).map_err(|x|x.to_string())?).map_err(|x|x.to_string())
}
pub fn read_theme(base:&Path,id:&str)->Result<String,String>{let css=std::fs::read_to_string(theme_dir(base,id)?.join("theme.css")).map_err(|_|"Theme is not installed.".to_string())?;check_css(&css)?;Ok(css)}
pub fn list(base:&Path)->Vec<Entry>{
    let Ok(rows)=std::fs::read_dir(base.join("addons").join("themes")) else{return vec![]};
    let mut out:Vec<Entry>=rows.flatten().filter_map(|r|serde_json::from_str::<Entry>(&std::fs::read_to_string(r.path().join("manifest.json")).ok()?).ok()).filter(|e|check_entry(e).is_ok()).collect();
    out.sort_by(|a,b|a.id.cmp(&b.id));out
}
pub fn remove(base:&Path,id:&str)->Result<(),String>{let dir=theme_dir(base,id)?;if dir.exists(){std::fs::remove_dir_all(dir).map_err(|e|e.to_string())?;}Ok(())}
async fn fetch(url:&str,max:usize)->Result<String,String>{
    let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).redirect(reqwest::redirect::Policy::none()).build().map_err(|e|e.to_string())?;
    let mut response=client.get(url).header("User-Agent","AnF marketplace").send().await.map_err(|_|"The marketplace could not be reached.")?;
    if !response.status().is_success(){return Err("The marketplace is unavailable.".into());}
    let mut bytes=Vec::new();while let Some(chunk)=response.chunk().await.map_err(|_|"The download stopped.")?{if bytes.len()+chunk.len()>max{return Err("The download exceeded its size limit.".into());}bytes.extend_from_slice(&chunk);}
    String::from_utf8(bytes).map_err(|_|"The download was not text.".into())
}
pub fn parse_registry(body:&str)->Vec<Entry>{serde_json::from_str::<Vec<Entry>>(body).unwrap_or_default().into_iter().filter(|e|check_entry(e).is_ok()).take(100).collect()}
fn matches_hash(content:&str,expected:&str)->bool{format!("{:x}",Sha256::digest(content.as_bytes())).eq_ignore_ascii_case(expected)}
#[tauri::command]pub async fn addons_registry()->Result<Vec<Entry>,String>{Ok(parse_registry(&fetch(REGISTRY,200_000).await?))}
#[tauri::command]pub async fn addons_install(id:String)->Result<(),String>{
    // The page names only an id; the URL and hash come from the registry, never from the page.
    let entry=parse_registry(&fetch(REGISTRY,200_000).await?).into_iter().find(|e|e.id==id).ok_or("That add-on is not in the marketplace.")?;
    if entry.kind!="theme"{return Err("Plugins cannot be installed yet.".into());}
    let css=fetch(&entry.download_url,200_000).await?;
    if !matches_hash(&css,&entry.sha256){return Err("The download does not match the marketplace checksum, so it was not installed.".into());}
    save_theme(&crate::settings::local_dir(),&entry,&css)
}
#[tauri::command]pub fn addons_list()->Vec<Entry>{list(&crate::settings::local_dir())}
#[tauri::command]pub fn addons_read(id:String)->Result<String,String>{read_theme(&crate::settings::local_dir(),&id)}
#[tauri::command]pub fn addons_remove(id:String)->Result<(),String>{remove(&crate::settings::local_dir(),&id)}
#[cfg(test)]mod tests{
    use super::*;
    fn entry(id:&str,url:&str)->Entry{Entry{id:id.into(),name:"T".into(),version:"1".into(),kind:"theme".into(),description:"d".into(),author:String::new(),download_url:url.into(),sha256:"0".repeat(64)}}
    fn good(id:&str)->Entry{entry(id,&format!("{PREFIX}{id}/theme.css"))}
    fn temp(name:&str)->PathBuf{let p=std::env::temp_dir().join(format!("anf-addons-{name}-{}",std::process::id()));let _=std::fs::remove_dir_all(&p);p}
    #[test]fn ids_cannot_escape_the_addons_folder(){for bad in["","..","../x","a/b","a\\b","A","-a","a.b",&"a".repeat(65)]{assert!(!valid_id(bad),"{bad}");}assert!(valid_id("catppuccin-mocha"));assert!(read_theme(Path::new("/nonexistent"),"../etc").is_err());assert!(remove(Path::new("/nonexistent"),"..").is_err());}
    #[test]fn only_registry_urls_are_trusted(){assert!(check_entry(&good("a")).is_ok());for url in["https://evil.example/a.css","http://raw.githubusercontent.com/mwalikokelvo/AnF/main/marketplace/a.css",&format!("{PREFIX}../../x.css"),&format!("{PREFIX}a.css?x=1"),&format!("{PREFIX}"),"https://raw.githubusercontent.com/mwalikokelvo/AnF/main/marketplace@evil/a.css"]{assert!(check_entry(&entry("a",url)).is_err(),"{url}");}let mut e=good("a");e.sha256="zz".into();assert!(check_entry(&e).is_err());}
    #[test]fn css_cannot_load_anything(){assert!(check_css("#workspace-root{--bg:#000}").is_ok());assert!(check_css("a{background:url(data:image/png;base64,AAAA)}").is_ok());for bad in["@import 'x.css';","@IMPORT url(x)","a{background:url(https://evil.example/p.png)}","a{background:URL( 'http://x' )}","a{b:url(x)}"]{assert!(check_css(bad).is_err(),"{bad}");}assert!(check_css(&"a".repeat(200_001)).is_err());}
    #[test]fn registry_drops_bad_entries_and_garbage(){let mut bad=good("b");bad.download_url="https://evil.example/x".into();let json=serde_json::to_string(&vec![good("a"),bad]).unwrap();let got=parse_registry(&json);assert_eq!(got.len(),1);assert_eq!(got[0].id,"a");assert!(parse_registry("not json").is_empty());}
    #[test]fn checksum_must_match(){let css="#workspace-root{--bg:#111}";let hash=format!("{:x}",Sha256::digest(css.as_bytes()));assert!(matches_hash(css,&hash));assert!(matches_hash(css,&hash.to_uppercase()));assert!(!matches_hash("#workspace-root{--bg:#222}",&hash));}
    #[test]fn save_read_list_remove_round_trip(){let base=temp("rt");let e=good("night");save_theme(&base,&e,"#workspace-root{--bg:#000}").unwrap();assert_eq!(read_theme(&base,"night").unwrap(),"#workspace-root{--bg:#000}");assert_eq!(list(&base).len(),1);assert!(save_theme(&base,&good("bad"),"@import 'x';").is_err());assert!(!base.join("addons/themes/bad").exists());std::fs::write(base.join("addons/themes/night/theme.css"),"a{b:url(https://x)}").unwrap();assert!(read_theme(&base,"night").is_err(),"tampered file is refused");remove(&base,"night").unwrap();assert!(list(&base).is_empty());let _=std::fs::remove_dir_all(&base);}
    #[test]fn published_registry_matches_its_files(){
        let root=Path::new(env!("CARGO_MANIFEST_DIR")).join("../../marketplace");
        let entries=parse_registry(&std::fs::read_to_string(root.join("registry.json")).unwrap());
        assert!(!entries.is_empty(),"the published registry must parse");
        for e in entries{let file=std::fs::read_to_string(root.join(e.download_url.strip_prefix(PREFIX).unwrap())).unwrap();assert!(matches_hash(&file,&e.sha256),"{} checksum is stale: update marketplace/registry.json",e.id);if e.kind=="theme"{check_css(&file).unwrap();}}
    }
}
