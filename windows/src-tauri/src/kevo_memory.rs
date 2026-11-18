//! Kevo persistent memory store (Phase 3 Step 3.1).
//! Stores structured facts and bounded conversation turn history in `settings::local_dir()/kevo/kevo-memory.json`.

use crate::{platform, settings};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_TURNS: usize = 50;
const MAX_FACTS: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KevoFact {
    pub id: String,
    pub fact: String,
    pub category: String,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KevoTurn {
    pub id: String,
    pub role: String,
    pub text: String,
    pub at: u64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct KevoMemoryStore {
    #[serde(default)]
    pub facts: Vec<KevoFact>,
    #[serde(default)]
    pub turns: Vec<KevoTurn>,
}

static MEMORY_LOCK: Mutex<()> = Mutex::new(());

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn memory_file_path() -> PathBuf {
    settings::local_dir().join("kevo").join("kevo-memory.json")
}

pub fn load_store(path: &Path) -> KevoMemoryStore {
    if !path.exists() {
        return KevoMemoryStore::default();
    }
    match std::fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str::<KevoMemoryStore>(&raw).unwrap_or_else(|_| {
            // Corrupt file recovery: heal safely without crashing
            KevoMemoryStore::default()
        }),
        Err(_) => KevoMemoryStore::default(),
    }
}

pub fn save_store(path: &Path, store: &KevoMemoryStore) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        platform::ensure_private_dir(parent)?;
    }
    let data = serde_json::to_string_pretty(store)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, data)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

fn generate_id(prefix: &str) -> String {
    let now = now_ms();
    let key = crate::local_ai::random_key().unwrap_or_else(|_| format!("{:x}", now));
    let suffix = if key.len() >= 8 { &key[..8] } else { &key };
    format!("{prefix}_{now}_{suffix}")
}

pub fn remember_fact_in(
    path: &Path,
    fact_text: String,
    category: Option<String>,
) -> Result<KevoFact, String> {
    let _guard = MEMORY_LOCK.lock().map_err(|e| e.to_string())?;
    let mut store = load_store(path);
    let clean = fact_text.trim();
    if clean.is_empty() {
        return Err("Fact cannot be empty.".to_string());
    }

    let cat = category
        .map(|c| c.trim().to_lowercase())
        .filter(|c| !c.is_empty())
        .unwrap_or_else(|| "general".to_string());

    let now = now_ms();

    // Deduplicate identical facts in the same category
    if let Some(existing) = store
        .facts
        .iter_mut()
        .find(|f| f.fact.eq_ignore_ascii_case(clean) && f.category == cat)
    {
        existing.updated_at = now;
        let result = existing.clone();
        save_store(path, &store).map_err(|e| e.to_string())?;
        return Ok(result);
    }

    let new_fact = KevoFact {
        id: generate_id("fact"),
        fact: clean.to_string(),
        category: cat,
        created_at: now,
        updated_at: now,
    };

    store.facts.push(new_fact.clone());
    if store.facts.len() > MAX_FACTS {
        store.facts.remove(0);
    }

    save_store(path, &store).map_err(|e| e.to_string())?;
    Ok(new_fact)
}

pub fn list_facts_in(path: &Path, query: Option<String>) -> Result<Vec<KevoFact>, String> {
    let _guard = MEMORY_LOCK.lock().map_err(|e| e.to_string())?;
    let store = load_store(path);
    let q = query.map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty());

    let filtered = match q {
        Some(needle) => store
            .facts
            .into_iter()
            .filter(|f| {
                f.fact.to_lowercase().contains(&needle)
                    || f.category.to_lowercase().contains(&needle)
            })
            .collect(),
        None => store.facts,
    };

    Ok(filtered)
}

pub fn delete_fact_in(path: &Path, id: &str) -> Result<bool, String> {
    let _guard = MEMORY_LOCK.lock().map_err(|e| e.to_string())?;
    let mut store = load_store(path);
    let initial_len = store.facts.len();
    store.facts.retain(|f| f.id != id);
    let changed = store.facts.len() != initial_len;
    if changed {
        save_store(path, &store).map_err(|e| e.to_string())?;
    }
    Ok(changed)
}

pub fn clear_facts_in(path: &Path) -> Result<bool, String> {
    let _guard = MEMORY_LOCK.lock().map_err(|e| e.to_string())?;
    let mut store = load_store(path);
    let had_facts = !store.facts.is_empty();
    store.facts.clear();
    save_store(path, &store).map_err(|e| e.to_string())?;
    Ok(had_facts)
}

pub fn load_turns_in(path: &Path, limit: Option<usize>) -> Result<Vec<KevoTurn>, String> {
    let _guard = MEMORY_LOCK.lock().map_err(|e| e.to_string())?;
    let store = load_store(path);
    let lim = limit.unwrap_or(MAX_TURNS).min(MAX_TURNS);
    let start = store.turns.len().saturating_sub(lim);
    Ok(store.turns[start..].to_vec())
}

pub fn save_turn_in(path: &Path, role: String, text: String) -> Result<(), String> {
    let _guard = MEMORY_LOCK.lock().map_err(|e| e.to_string())?;
    let clean = text.trim();
    if clean.is_empty() {
        return Ok(());
    }
    let mut store = load_store(path);
    store.turns.push(KevoTurn {
        id: generate_id("turn"),
        role,
        text: clean.to_string(),
        at: now_ms(),
    });
    if store.turns.len() > MAX_TURNS {
        let trim_to = store.turns.len() - MAX_TURNS;
        store.turns.drain(0..trim_to);
    }
    save_store(path, &store).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn clear_turns_in(path: &Path) -> Result<bool, String> {
    let _guard = MEMORY_LOCK.lock().map_err(|e| e.to_string())?;
    let mut store = load_store(path);
    let had_turns = !store.turns.is_empty();
    store.turns.clear();
    save_store(path, &store).map_err(|e| e.to_string())?;
    Ok(had_turns)
}

// Tauri commands

#[tauri::command]
pub fn kevo_memory_remember_fact(
    fact: String,
    category: Option<String>,
) -> Result<KevoFact, String> {
    remember_fact_in(&memory_file_path(), fact, category)
}

#[tauri::command]
pub fn kevo_memory_list_facts(query: Option<String>) -> Result<Vec<KevoFact>, String> {
    list_facts_in(&memory_file_path(), query)
}

#[tauri::command]
pub fn kevo_memory_delete_fact(id: String) -> Result<bool, String> {
    delete_fact_in(&memory_file_path(), &id)
}

#[tauri::command]
pub fn kevo_memory_clear_facts() -> Result<bool, String> {
    clear_facts_in(&memory_file_path())
}

#[tauri::command]
pub fn kevo_memory_load_history(limit: Option<usize>) -> Result<Vec<KevoTurn>, String> {
    load_turns_in(&memory_file_path(), limit)
}

#[tauri::command]
pub fn kevo_memory_save_turn(role: String, text: String) -> Result<(), String> {
    save_turn_in(&memory_file_path(), role, text)
}

#[tauri::command]
pub fn kevo_memory_clear_history() -> Result<bool, String> {
    clear_turns_in(&memory_file_path())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_file(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("kevo-test-memory-{name}.json"))
    }

    #[test]
    fn remembers_and_lists_facts() {
        let path = test_file("remember_list");
        let _ = std::fs::remove_file(&path);

        let fact1 = remember_fact_in(&path, "User prefers dark chocolate".to_string(), Some("food".to_string())).unwrap();
        assert_eq!(fact1.fact, "User prefers dark chocolate");
        assert_eq!(fact1.category, "food");

        let fact2 = remember_fact_in(&path, "User works in TypeScript".to_string(), None).unwrap();
        assert_eq!(fact2.category, "general");

        let all = list_facts_in(&path, None).unwrap();
        assert_eq!(all.len(), 2);

        let search = list_facts_in(&path, Some("chocolate".to_string())).unwrap();
        assert_eq!(search.len(), 1);
        assert_eq!(search[0].id, fact1.id);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn deletes_fact_and_clears() {
        let path = test_file("delete_clear");
        let _ = std::fs::remove_file(&path);

        let fact = remember_fact_in(&path, "Temporary fact".to_string(), None).unwrap();
        let deleted = delete_fact_in(&path, &fact.id).unwrap();
        assert!(deleted);

        let remaining = list_facts_in(&path, None).unwrap();
        assert!(remaining.is_empty());

        let _ = remember_fact_in(&path, "Fact to clear".to_string(), None).unwrap();
        let cleared = clear_facts_in(&path).unwrap();
        assert!(cleared);
        assert!(list_facts_in(&path, None).unwrap().is_empty());

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn saves_and_bounds_turns() {
        let path = test_file("turns_bounds");
        let _ = std::fs::remove_file(&path);

        for i in 0..60 {
            save_turn_in(&path, "user".to_string(), format!("Query {i}")).unwrap();
        }

        let turns = load_turns_in(&path, None).unwrap();
        assert_eq!(turns.len(), MAX_TURNS);
        assert_eq!(turns.last().unwrap().text, "Query 59");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn recovers_from_corrupt_file() {
        let path = test_file("corrupt");
        std::fs::write(&path, "{ not valid json").unwrap();

        let store = load_store(&path);
        assert!(store.facts.is_empty());
        assert!(store.turns.is_empty());

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn persists_across_restart_and_purges_deleted() {
        let path = test_file("restart_survival");
        let _ = std::fs::remove_file(&path);

        // Initial process run writes facts and turns
        let f1 = remember_fact_in(&path, "User lives in Evansville".to_string(), Some("location".to_string())).unwrap();
        let _f2 = remember_fact_in(&path, "User likes jazz".to_string(), Some("music".to_string())).unwrap();
        save_turn_in(&path, "user".to_string(), "Where do I live?".to_string()).unwrap();

        // Simulate restart by loading fresh from disk
        let loaded = load_store(&path);
        assert_eq!(loaded.facts.len(), 2);
        assert_eq!(loaded.turns.len(), 1);
        assert_eq!(loaded.facts[0].fact, "User lives in Evansville");
        assert_eq!(loaded.turns[0].text, "Where do I live?");

        // Delete a fact and verify it remains deleted across reload
        let deleted = delete_fact_in(&path, &f1.id).unwrap();
        assert!(deleted);

        let reloaded = load_store(&path);
        assert_eq!(reloaded.facts.len(), 1);
        assert_eq!(reloaded.facts[0].fact, "User likes jazz");
        assert!(!reloaded.facts.iter().any(|f| f.id == f1.id));

        let _ = std::fs::remove_file(&path);
    }
}
