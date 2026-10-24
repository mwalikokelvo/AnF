use crate::projects::Project;
use serde::Serialize;
use sha2::{Digest,Sha256};
#[derive(Serialize)]
pub struct Snapshot {pub project:Project,pub revision:String}
#[derive(Serialize)]
pub struct Merge {#[serde(flatten)]pub snapshot:Snapshot,pub conflict:bool,pub other:Option<Snapshot>}
pub fn clean(mut p:Project,documents:bool)->Project{
    if !documents {p.sources.clear();for turn in &mut p.history {turn.evidence.clear();}}else{for source in &mut p.sources {source.path=None;}}
    p
}
pub fn revision(p:&Project,documents:bool)->String{format!("{:x}",Sha256::digest(serde_json::to_vec(&clean(p.clone(),documents)).unwrap()))}
pub fn snapshot(p:Project,documents:bool)->Snapshot{let revision=revision(&p,documents);Snapshot{project:clean(p,documents),revision}}
pub fn conflict_id(id:&str,revision:&str)->String{format!("{:x}",Sha256::digest(format!("coucou-conflict-v1|{id}|{revision}")))}
pub fn conflict_name(name:&str)->String{let mut s=String::new();for c in name.chars(){if s.len()+c.len_utf8()>125{break;}s.push(c);}s+" (conflict copy)"}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn chat_only_snapshots_exclude_saved_excerpts(){
        let p:Project=serde_json::from_value(serde_json::json!({
            "id":"a".repeat(64),"name":"Evidence","title":"Draft","question":"","draft":"","sources":[],"memory":"","model":"fast",
            "history":[{"role":"assistant","content":[{"text":"Answer [1]"}],"evidence":[{"id":1,"sourceName":"Private book","page":2,"text":"Private excerpt","ocr":false}]}]
        })).unwrap();
        assert!(!serde_json::to_string(&snapshot(p.clone(),false)).unwrap().contains("Private excerpt"));
        assert_eq!(snapshot(p.clone(),true).project.history[0].evidence[0].text,"Private excerpt");
        let mut changed=p.clone();changed.history[0].evidence[0].text="Another excerpt".into();
        assert_eq!(revision(&p,false),revision(&changed,false));
        assert_ne!(revision(&p,true),revision(&changed,true));
    }
    #[test]fn safe_conflict_names_and_deterministic_ids(){assert!(conflict_name(&"🙂".repeat(100)).len()<=160);assert_eq!(conflict_id("a","b"),conflict_id("a","b"));assert_ne!(conflict_id("a","b"),conflict_id("a","c"));}
}
