use crate::projects::Project;
use serde::Serialize;
use sha2::{Digest,Sha256};
#[derive(Serialize)]
pub struct Snapshot {pub project:Project,pub revision:String}
#[derive(Serialize)]
pub struct Merge {#[serde(flatten)]pub snapshot:Snapshot,pub conflict:bool,pub other:Option<Snapshot>}
pub fn clean(mut p:Project,documents:bool)->Project{
    if !documents {p.sources.clear();}else{for source in &mut p.sources {source.path=None;}}
    p
}
pub fn revision(p:&Project,documents:bool)->String{format!("{:x}",Sha256::digest(serde_json::to_vec(&clean(p.clone(),documents)).unwrap()))}
pub fn snapshot(p:Project,documents:bool)->Snapshot{let revision=revision(&p,documents);Snapshot{project:clean(p,documents),revision}}
pub fn conflict_id(id:&str,revision:&str)->String{format!("{:x}",Sha256::digest(format!("\x63\x6f\x75\x63\x6f\x75-conflict-v1|{id}|{revision}")))}
pub fn conflict_name(name:&str)->String{let mut s=String::new();for c in name.chars(){if s.len()+c.len_utf8()>125{break;}s.push(c);}s+" (conflict copy)"}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn safe_conflict_names_and_deterministic_ids(){assert!(conflict_name(&"🙂".repeat(100)).len()<=160);assert_eq!(conflict_id("a","b"),conflict_id("a","b"));assert_ne!(conflict_id("a","b"),conflict_id("a","c"));}
}
