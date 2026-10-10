//! Local, versioned project snapshots. A failed write cannot destroy the previous save.
use crate::{local_ai::random_key, platform, settings, workspace::Source};
use serde::{Deserialize, Serialize};
use std::{io::Write, path::PathBuf, sync::Mutex};
#[derive(Clone, Serialize, Deserialize)]
pub struct Turn {
    pub role: String,
    pub content: Vec<Part>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Part {
    pub text: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub title: String,
    pub question: String,
    pub draft: String,
    pub history: Vec<Turn>,
    pub sources: Vec<Source>,
    pub memory: String,
    pub model: String,
}
#[derive(Serialize)]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub updated: u128,
    pub snippet: String,
}
#[derive(Default, Clone)]
pub struct Store(std::sync::Arc<Mutex<SearchCache>>);
#[derive(Default)]
struct SearchCache {
    // Search keeps conversation text, never document sources. Bounded to 32 MB.
    entries: std::collections::HashMap<String,(Vec<(PathBuf,u64,u128)>,Project)>,
    bytes: usize,
}

fn matching_snippet(p: &Project, query: &str) -> Option<String> {
    let term = query.trim().to_lowercase();
    if term.is_empty() { return Some(p.history.last().map(|t| t.content[0].text.chars().take(130).collect()).unwrap_or_default()); }
    let fields = std::iter::once(p.name.as_str()).chain(std::iter::once(p.title.as_str()))
        .chain(std::iter::once(p.draft.as_str()))
        .chain(p.history.iter().rev().flat_map(|t| t.content.iter().map(|c| c.text.as_str())));
    for text in fields {
        let folded = text.to_lowercase();
        if let Some(offset) = folded.find(&term) {
            let start = folded[..offset].chars().count().saturating_sub(40);
            let excerpt: String = text.chars().skip(start).take(160).collect();
            return Some(format!("{}{}", if start > 0 { "…" } else { "" }, excerpt));
        }
    }
    None
}
fn dir() -> Result<PathBuf, String> {
    let d = settings::local_dir().join("projects");
    platform::ensure_private_dir(&d).map_err(|e| e.to_string())?;
    Ok(d)
}
fn id_valid(id: &str) -> bool {
    id.len() == 64 && id.bytes().all(|b| b.is_ascii_hexdigit())
}
pub fn validate(p: &Project) -> Result<(), String> {
    if !id_valid(&p.id)
        || p.name.len() > 160
        || p.title.len() > 300
        || p.question.len() > 10000
        || p.draft.len() > 200_000
        || p.memory.len() > 12_000
        || !matches!(p.model.as_str(), "fast" | "balanced")
        || p.history.len() > 1000
        || p.sources.len() > 4
    {
        return Err(
            "Project is too large or invalid. Start a new project and keep the old one saved."
                .into(),
        );
    }
    if p.history.iter().any(|t| {
        !matches!(t.role.as_str(), "user" | "assistant")
            || t.content.len() != 1
            || t.content[0].text.len() > 200_000
    }) || p.sources.iter().any(|s| {
        !crate::workspace::valid_reading(s) || s.text.len() > 2_000_000
            || s.name.len() > 2000
            || s.pages.len() > 600
            || s.pages.iter().map(|p| p.text.len()).sum::<usize>() > 2_000_000
    }) {
        return Err("Project contains invalid conversation or sources.".into());
    }
    Ok(())
}
fn snapshots(id: &str) -> Result<Vec<PathBuf>, String> {
    if !id_valid(id) {
        return Err("Invalid project ID.".into());
    }
    let mut paths = std::fs::read_dir(dir()?)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with(&format!("{id}-")) && n.ends_with(".json"))
        })
        .collect::<Vec<_>>();
    paths.sort();
    Ok(paths)
}
impl Store {
    pub fn enable_vault(&self)->Result<crate::vault::Status,String>{
        let mut lock=self.0.lock().map_err(|_|"Storage is busy")?;
        if crate::vault::enabled(){return crate::vault::status();}
        let mut ids=std::collections::BTreeSet::new();
        for entry in std::fs::read_dir(dir()?).map_err(|e|e.to_string())?{let entry=entry.map_err(|e|e.to_string())?;if let Some(name)=entry.file_name().to_str(){if let Some((id,_))=name.split_once('-'){if id_valid(id)&&name.ends_with(".json"){ids.insert(id.to_owned());}}}}
        let result=crate::vault::migrate(&ids.into_iter().collect::<Vec<_>>(),load_latest)?;
        *lock=SearchCache::default();Ok(result)
    }

    pub fn save(&self, p: Project) -> Result<Project, String> {
        let _lock = self.0.lock().unwrap();
        save_unlocked(p)
    }
    pub fn save_checked(&self,mut p:Project,expected:Option<&str>)->Result<Project,String>{
        let _lock=self.0.lock().unwrap();
        if let (Some(expected),Ok(current))=(expected,load_latest(&p.id)){
            if crate::sync_data::revision(&current,true)!=expected && crate::sync_data::revision(&p,true)!=crate::sync_data::revision(&current,true){p.id=random_key()?;p.name=crate::sync_data::conflict_name(&p.name);}
        }
        save_unlocked(p)
    }
    pub fn merge_sync(&self,mut p:Project,base:Option<&str>,documents:bool)->Result<crate::sync_data::Merge,String>{
        use crate::sync_data::{revision,snapshot,Merge,conflict_id,conflict_name};
        let _lock=self.0.lock().unwrap();validate(&p)?;
        for source in &mut p.sources {source.path=None;}
        let mut other=None;let mut conflict=false;
        if let Ok(current)=load_latest(&p.id){
            if !documents {p.sources=current.sources.clone();}
            else {for source in &mut p.sources {source.path=current.sources.iter().find(|old|old.name==source.name&&old.text==source.text).and_then(|old|old.path.clone());}}
            let remote=revision(&current,documents);let local=revision(&p,documents);
            if local==remote || base==Some(local.as_str()){return Ok(Merge{snapshot:snapshot(current,documents),conflict:false,other:None});}
            if base!=Some(remote.as_str()){conflict=true;other=Some(snapshot(current,documents));p.id=conflict_id(&p.id,&local);p.name=conflict_name(&p.name);if let Ok(existing)=load_latest(&p.id){return Ok(Merge{snapshot:snapshot(existing,documents),conflict,other});}}
        }else if !documents {p.sources.clear();}
        Ok(Merge{snapshot:snapshot(save_unlocked(p)?,documents),conflict,other})
    }
    pub fn load(&self, id: &str) -> Result<Project, String> {
        let _lock = self.0.lock().unwrap();
        load_latest(id)
    }
    pub fn list(&self, query: &str) -> Result<Vec<Entry>, String> {
        if crate::vault::enabled(){return crate::vault::list(query);}
        if query.len() > 1024 { return Err("Use a shorter search phrase.".into()); }
        let mut cache = self.0.lock().unwrap();
        let mut groups:std::collections::BTreeMap<String,Vec<PathBuf>>=std::collections::BTreeMap::new();
        for e in std::fs::read_dir(dir()?)
            .map_err(|e| e.to_string())?
            .flatten()
        {
            if let Some(name) = e.file_name().to_str() {
                if let Some((id, _)) = name.split_once('-') {
                    if id_valid(id) && name.ends_with(".json") {
                        groups.entry(id.to_string()).or_default().push(e.path());
                    }
                }
            }
        }
        let mut entries = Vec::new();
        for (id,mut paths) in groups {
            paths.sort();
            let signature:Vec<_>=paths.iter().filter_map(|p|{let m=std::fs::metadata(p).ok()?;let time=m.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_nanos();Some((p.clone(),m.len(),time))}).collect();
            if !cache.entries.get(&id).is_some_and(|(old,_)|old==&signature) {
                let Ok(mut p)=load_paths(&id,&paths) else {cache.entries.remove(&id);continue;};
                p.sources.clear();p.question.clear();p.memory.clear();
                let size=p.name.len()+p.title.len()+p.draft.len()+p.history.iter().flat_map(|t|&t.content).map(|c|c.text.len()).sum::<usize>();
                if cache.bytes+size>32_000_000 {cache.entries.clear();cache.bytes=0;}
                cache.bytes+=size;
                cache.entries.insert(id.clone(),(signature.clone(),p));
            }
            if let Some((_,p))=cache.entries.get(&id) {
                let Some(snippet) = matching_snippet(p, query) else { continue; };
                let updated = signature.last().map(|s|s.2/1_000_000).unwrap_or(0);
                entries.push(Entry {
                    id,
                    name: p.name.clone(),
                    updated,
                    snippet,
                });
            }
        }
        entries.sort_by(|a, b| b.updated.cmp(&a.updated));
        Ok(entries)
    }
}
fn save_unlocked(mut p:Project)->Result<Project,String>{
        if p.id.is_empty() {
            p.id = random_key()?;
        }
        validate(&p)?;
        if crate::vault::enabled(){crate::vault::save(&p)?;return Ok(p);}
        let bytes = serde_json::to_vec(&p).map_err(|e| e.to_string())?;
        if bytes.len() > 16_000_000 {
            return Err("Project exceeds 16 MB. Start another project.".into());
        }
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        let path = dir()?.join(format!("{}-{stamp:032}.json", p.id));
        let tmp = path.with_extension("partial");
        let mut f = std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&tmp)
            .map_err(|e| e.to_string())?;
        f.write_all(&bytes)
            .and_then(|_| f.sync_all())
            .map_err(|e| e.to_string())?;
        drop(f);
        std::fs::rename(tmp, path).map_err(|e| e.to_string())?;
        let old = snapshots(&p.id)?;
        for path in old.iter().take(old.len().saturating_sub(3)) {
            let _ = std::fs::remove_file(path);
        }
        Ok(p)
    }
fn load_latest(id: &str) -> Result<Project, String> {
    if crate::vault::enabled(){return crate::vault::load(id);}
    load_paths(id,&snapshots(id)?)
}
fn load_paths(id:&str,paths:&[PathBuf])->Result<Project,String>{
    for file in paths.iter().rev() {
        if std::fs::metadata(&file)
            .map(|m| m.len() > 16_000_000)
            .unwrap_or(true)
        {
            continue;
        }
        if let Ok(bytes) = std::fs::read(&file) {
            if let Ok(p) = serde_json::from_slice::<Project>(&bytes) {
                if validate(&p).is_ok() && p.id == id {
                    return Ok(p);
                }
            }
        }
    }
    Err("No readable saved project found.".into())
}
pub fn retain_file(path: &str) -> Result<String, String> {
    let src = std::path::Path::new(path);
    let meta = std::fs::metadata(src).map_err(|e| e.to_string())?;
    if !src.is_absolute() || !meta.is_file() || meta.len() > 50 * 1024 * 1024 {
        return Err("Choose an existing file under 50 MB.".into());
    }
    let d = settings::local_dir().join("sources").join(random_key()?);
    platform::ensure_private_dir(&d).map_err(|e| e.to_string())?;
    let dest = d.join(src.file_name().ok_or("File has no name.")?);
    std::fs::copy(src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sync_preserves_both_edits_and_stale_desktop_saves(){
        use crate::sync_data::revision;
        let db=Store::default();let original=db.save(Project{id:String::new(),name:"Sync test".into(),title:"Draft".into(),question:String::new(),draft:"Original".into(),history:vec![],sources:vec![Source{reading:None,name:"private".into(),text:"source".into(),pages:vec![],path:Some("C:\\private\\file.txt".into())}],memory:String::new(),model:"fast".into()}).unwrap();
        let base=revision(&original,false);let full_base=revision(&original,true);
        let mut phone=original.clone();phone.draft="Phone edit".into();phone.sources.clear();
        let merged=db.merge_sync(phone.clone(),Some(&base),false).unwrap();assert!(!merged.conflict);assert!(merged.snapshot.project.sources.is_empty());assert_eq!(db.load(&original.id).unwrap().sources[0].text,"source");
        let retry=db.merge_sync(phone.clone(),Some(&base),false).unwrap();assert!(!retry.conflict);
        let mut desktop=original.clone();desktop.draft="Desktop edit".into();let copy=db.save_checked(desktop,Some(&full_base)).unwrap();assert_ne!(copy.id,original.id);assert_eq!(db.load(&original.id).unwrap().draft,"Phone edit");
        let mut other=original.clone();other.draft="Second device edit".into();let conflict=db.merge_sync(other.clone(),Some(&base),false).unwrap();assert!(conflict.conflict);assert_eq!(conflict.other.as_ref().unwrap().project.draft,"Phone edit");let same=db.merge_sync(other,Some(&base),false).unwrap();assert_eq!(same.snapshot.project.id,conflict.snapshot.project.id);
        let wire=crate::sync_data::snapshot(db.load(&original.id).unwrap(),true);assert!(wire.project.sources[0].path.is_none());
        let mut uploaded=wire.project.clone();uploaded.draft="Updated with documents".into();let merged=db.merge_sync(uploaded,Some(&wire.revision),true).unwrap();assert!(!merged.conflict);assert_eq!(db.load(&original.id).unwrap().sources[0].path.as_deref(),Some("C:\\private\\file.txt"));
        for id in [&original.id,&copy.id,&conflict.snapshot.project.id]{for file in snapshots(id).unwrap(){std::fs::remove_file(file).unwrap();}}
    }
    #[test]
    fn saves_and_recovers_previous_snapshot() {
        let store = Store::default();
        let p = Project {
            id: String::new(),
            name: "Recovery test".into(),
            title: "Draft".into(),
            question: String::new(),
            draft: "Keep this".into(),
            history: vec![],
            sources: vec![],
            memory: "My preferences".into(),
            model: "fast".into(),
        };
        let saved = store.save(p).unwrap();
        assert!(store.list("Keep this").unwrap().iter().any(|e|e.id==saved.id));
        let mut next = saved.clone();
        next.draft = "Latest".into();
        store.save(next).unwrap();
        assert!(store.list("Latest").unwrap().iter().any(|e|e.id==saved.id));
        let files = snapshots(&saved.id).unwrap();
        std::fs::write(files.last().unwrap(), b"broken").unwrap();
        assert_eq!(store.load(&saved.id).unwrap().draft, "Keep this");
        assert!(store.list("Keep this").unwrap().iter().any(|e|e.id==saved.id));
        for f in files {
            std::fs::remove_file(f).unwrap();
        }
    }
    #[test]
    fn refuses_path_traversal() {
        assert!(snapshots("../settings").is_err());
    }
    #[test]
    #[ignore = "measures search with generated document-heavy projects"]
    fn cached_search_measurement() {
        let store=Store::default();let mut ids=Vec::new();
        for i in 0..12 {let p=Project{id:String::new(),name:format!("Search measurement {i}"),title:"Notes".into(),question:String::new(),draft:"distinctive benchmark phrase".into(),history:vec![],sources:vec![Source{reading:None,name:"Sample source".into(),text:"source text ".repeat(80000),pages:vec![],path:None}],memory:String::new(),model:"fast".into()};ids.push(store.save(p).unwrap().id);}
        let start=std::time::Instant::now();assert_eq!(store.list("distinctive benchmark phrase").unwrap().len(),12);let cold=start.elapsed();
        let start=std::time::Instant::now();for _ in 0..10 {assert_eq!(store.list("distinctive benchmark phrase").unwrap().len(),12);}let cached=start.elapsed()/10;
        println!("Search measurement: first scan {:?}; cached scan average {:?} (12 projects, about 11 MB source text).",cold,cached);
        for id in ids {for p in snapshots(&id).unwrap(){std::fs::remove_file(p).unwrap();}}
    }
    #[test]
    fn searches_old_conversation_text_and_drafts_with_unicode() {
        let p = Project { id: "a".repeat(64), name: "Untitled".into(), title: "Notes".into(),
            question: String::new(), draft: "Our next appointment is Thursday".into(),
            history: vec![Turn { role: "user".into(), content: vec![Part {text: "We discussed CAFÉ supplies and a budget".into()}]}],
            sources: vec![], memory: String::new(), model: "fast".into() };
        assert!(matching_snippet(&p,"café").unwrap().contains("CAFÉ"));
        assert!(matching_snippet(&p,"Thursday").unwrap().contains("Thursday"));
        assert!(matching_snippet(&p,"not in the conversation").is_none());
        assert!(matching_snippet(&p,"").is_some());
    }
}
