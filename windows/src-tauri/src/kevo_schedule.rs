//! Kevo persistent schedule and reminder store (Phase 4 Step 4.1).
//! Stores structured reminders and scheduled jobs in `settings::local_dir()/kevo/kevo-schedule.json`.

use crate::{platform, settings};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

const MAX_REMINDERS: usize = 200;
const PRUNE_FIRED_AFTER_MS: u64 = 7 * 24 * 60 * 60 * 1000; // 7 days

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KevoReminder {
    pub id: String,
    pub message: String,
    pub trigger_at: u64,
    pub created_at: u64,
    pub fired: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recurring: Option<String>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct KevoScheduleStore {
    #[serde(default)]
    pub reminders: Vec<KevoReminder>,
}

static SCHEDULE_LOCK: Mutex<()> = Mutex::new(());

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn schedule_file_path() -> PathBuf {
    settings::local_dir().join("kevo").join("kevo-schedule.json")
}

pub fn load_store(path: &Path) -> KevoScheduleStore {
    if !path.exists() {
        return KevoScheduleStore::default();
    }
    match std::fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str::<KevoScheduleStore>(&raw).unwrap_or_else(|_| {
            KevoScheduleStore::default()
        }),
        Err(_) => KevoScheduleStore::default(),
    }
}

pub fn save_store(path: &Path, store: &KevoScheduleStore) -> std::io::Result<()> {
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

fn prune_store(store: &mut KevoScheduleStore, now: u64) {
    store.reminders.retain(|r| {
        if r.fired && now.saturating_sub(r.trigger_at) > PRUNE_FIRED_AFTER_MS {
            false
        } else {
            true
        }
    });
    if store.reminders.len() > MAX_REMINDERS {
        let excess = store.reminders.len() - MAX_REMINDERS;
        let mut fired_indices: Vec<usize> = store
            .reminders
            .iter()
            .enumerate()
            .filter(|(_, r)| r.fired)
            .map(|(i, _)| i)
            .collect();
        fired_indices.truncate(excess);
        let set: std::collections::HashSet<usize> = fired_indices.into_iter().collect();
        let mut i = 0;
        store.reminders.retain(|_| {
            let drop = set.contains(&i);
            i += 1;
            !drop
        });
    }
}

pub fn create_reminder_in(
    path: &Path,
    message: String,
    trigger_at: u64,
    recurring: Option<String>,
) -> Result<KevoReminder, String> {
    let _guard = SCHEDULE_LOCK.lock().map_err(|e| e.to_string())?;
    let mut store = load_store(path);
    let clean = message.trim();
    if clean.is_empty() {
        return Err("Reminder message cannot be empty.".to_string());
    }

    let now = now_ms();
    let rec = recurring
        .map(|r| r.trim().to_lowercase())
        .filter(|r| !r.is_empty());

    let reminder = KevoReminder {
        id: generate_id("rem"),
        message: clean.to_string(),
        trigger_at,
        created_at: now,
        fired: false,
        recurring: rec,
    };

    store.reminders.push(reminder.clone());
    prune_store(&mut store, now);
    save_store(path, &store).map_err(|e| e.to_string())?;
    Ok(reminder)
}

pub fn list_reminders_in(
    path: &Path,
    include_fired: Option<bool>,
) -> Result<Vec<KevoReminder>, String> {
    let _guard = SCHEDULE_LOCK.lock().map_err(|e| e.to_string())?;
    let store = load_store(path);
    let with_fired = include_fired.unwrap_or(false);
    let items = store
        .reminders
        .into_iter()
        .filter(|r| with_fired || !r.fired)
        .collect();
    Ok(items)
}

pub fn cancel_reminder_in(path: &Path, id_or_query: &str) -> Result<bool, String> {
    let _guard = SCHEDULE_LOCK.lock().map_err(|e| e.to_string())?;
    let mut store = load_store(path);
    let initial_len = store.reminders.len();
    let q = id_or_query.trim().to_lowercase();
    store.reminders.retain(|r| {
        !(r.id == id_or_query || (!q.is_empty() && r.message.to_lowercase().contains(&q)))
    });
    let changed = store.reminders.len() != initial_len;
    if changed {
        save_store(path, &store).map_err(|e| e.to_string())?;
    }
    Ok(changed)
}

pub fn clear_reminders_in(path: &Path) -> Result<bool, String> {
    let _guard = SCHEDULE_LOCK.lock().map_err(|e| e.to_string())?;
    let mut store = load_store(path);
    let had = !store.reminders.is_empty();
    store.reminders.clear();
    save_store(path, &store).map_err(|e| e.to_string())?;
    Ok(had)
}

pub fn check_and_fire_due_reminders(path: &Path, now_ms: u64) -> Result<Vec<KevoReminder>, String> {
    let _guard = SCHEDULE_LOCK.lock().map_err(|e| e.to_string())?;
    let mut store = load_store(path);
    let mut fired_reminders = Vec::new();
    let mut updated = false;

    for reminder in store.reminders.iter_mut() {
        if !reminder.fired && reminder.trigger_at <= now_ms {
            reminder.fired = true;
            fired_reminders.push(reminder.clone());
            updated = true;
        }
    }

    if updated {
        let mut recurring_to_add = Vec::new();
        for f in &fired_reminders {
            if let Some(ref rec) = f.recurring {
                if rec == "daily" {
                    recurring_to_add.push(KevoReminder {
                        id: generate_id("rem"),
                        message: f.message.clone(),
                        trigger_at: f.trigger_at + 86_400_000,
                        created_at: now_ms,
                        fired: false,
                        recurring: Some("daily".to_string()),
                    });
                }
            }
        }
        store.reminders.extend(recurring_to_add);
        prune_store(&mut store, now_ms);
        save_store(path, &store).map_err(|e| e.to_string())?;
    }

    Ok(fired_reminders)
}

#[cfg(windows)]
pub fn play_system_alert_sound() {
    #[link(name = "user32")]
    extern "system" {
        fn MessageBeep(u_type: u32) -> i32;
    }
    unsafe {
        // 0x00000040 is MB_ICONASTERISK (SystemAsterisk notification chime)
        let _ = MessageBeep(0x00000040);
    }
}

#[cfg(not(windows))]
pub fn play_system_alert_sound() {}

pub fn alert_reminder_triggered(app: &AppHandle, title: &str, message: &str) {
    play_system_alert_sound();
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("workspace") {
        let is_min = win.is_minimized().unwrap_or(false);
        let is_focused = win.is_focused().unwrap_or(false);
        if is_min || !is_focused {
            let _ = win.request_user_attention(Some(tauri::UserAttentionType::Critical));
        }
    }
    let _ = app.emit(
        "kevo://reminder-alert",
        serde_json::json!({
            "title": title,
            "message": message,
        }),
    );
}

pub fn spawn_schedule_ticker(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;
            let now = now_ms();
            if let Ok(fired) = check_and_fire_due_reminders(&schedule_file_path(), now) {
                for rem in fired {
                    let _ = app.emit("kevo://reminder-triggered", &rem);
                    alert_reminder_triggered(&app, "Kevo Reminder", &rem.message);
                }
            }
        }
    });
}

// Tauri commands

#[tauri::command(rename_all = "snake_case")]
pub fn kevo_schedule_trigger_alert(
    app: AppHandle,
    title: String,
    message: String,
) -> Result<(), String> {
    alert_reminder_triggered(&app, &title, &message);
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn kevo_schedule_create_reminder(
    message: String,
    trigger_at: u64,
    recurring: Option<String>,
) -> Result<KevoReminder, String> {
    create_reminder_in(&schedule_file_path(), message, trigger_at, recurring)
}

#[tauri::command(rename_all = "snake_case")]
pub fn kevo_schedule_list_reminders(
    include_fired: Option<bool>,
) -> Result<Vec<KevoReminder>, String> {
    list_reminders_in(&schedule_file_path(), include_fired)
}

#[tauri::command]
pub fn kevo_schedule_cancel_reminder(id: String) -> Result<bool, String> {
    cancel_reminder_in(&schedule_file_path(), &id)
}

#[tauri::command]
pub fn kevo_schedule_clear_reminders() -> Result<bool, String> {
    clear_reminders_in(&schedule_file_path())
}

#[tauri::command]
pub fn kevo_schedule_check_due() -> Result<Vec<KevoReminder>, String> {
    check_and_fire_due_reminders(&schedule_file_path(), now_ms())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_file(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("kevo-test-sched-{name}.json"))
    }

    #[test]
    fn creates_and_lists_active_reminders() {
        let path = test_file("create_list");
        let _ = std::fs::remove_file(&path);

        let r1 = create_reminder_in(&path, "Take vitamins".to_string(), 100_000, None).unwrap();
        assert_eq!(r1.message, "Take vitamins");
        assert_eq!(r1.trigger_at, 100_000);
        assert!(!r1.fired);

        let r2 = create_reminder_in(&path, "Daily briefing".to_string(), 200_000, Some("daily".to_string())).unwrap();
        assert_eq!(r2.recurring, Some("daily".to_string()));

        let active = list_reminders_in(&path, None).unwrap();
        assert_eq!(active.len(), 2);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn cancels_and_clears_reminders() {
        let path = test_file("cancel_clear");
        let _ = std::fs::remove_file(&path);

        let r = create_reminder_in(&path, "Check oven".to_string(), 150_000, None).unwrap();
        let cancelled = cancel_reminder_in(&path, &r.id).unwrap();
        assert!(cancelled);
        assert!(list_reminders_in(&path, None).unwrap().is_empty());

        let _ = create_reminder_in(&path, "Call plumber".to_string(), 160_000, None).unwrap();
        let cancelled_by_query = cancel_reminder_in(&path, "plumber").unwrap();
        assert!(cancelled_by_query);
        assert!(list_reminders_in(&path, None).unwrap().is_empty());

        let _ = create_reminder_in(&path, "Task A".to_string(), 170_000, None).unwrap();
        let cleared = clear_reminders_in(&path).unwrap();
        assert!(cleared);
        assert!(list_reminders_in(&path, None).unwrap().is_empty());

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn fires_due_reminders_once_and_spawns_daily_recurring() {
        let path = test_file("fire_due");
        let _ = std::fs::remove_file(&path);

        let _r1 = create_reminder_in(&path, "Past one-shot".to_string(), 1_000, None).unwrap();
        let _r2 = create_reminder_in(&path, "Daily reminder".to_string(), 2_000, Some("daily".to_string())).unwrap();
        let _r3 = create_reminder_in(&path, "Future reminder".to_string(), 10_000, None).unwrap();

        // Time is 5_000
        let fired = check_and_fire_due_reminders(&path, 5_000).unwrap();
        assert_eq!(fired.len(), 2);
        assert_eq!(fired[0].message, "Past one-shot");
        assert_eq!(fired[1].message, "Daily reminder");

        // Firing again at time 5_500 yields nothing because they already fired
        let fired_again = check_and_fire_due_reminders(&path, 5_500).unwrap();
        assert!(fired_again.is_empty());

        // Check active reminders: Future reminder + next day's Daily reminder (2_000 + 86_400_000)
        let active = list_reminders_in(&path, None).unwrap();
        assert_eq!(active.len(), 2);
        assert!(active.iter().any(|r| r.message == "Future reminder"));
        assert!(active.iter().any(|r| r.message == "Daily reminder" && r.trigger_at == 2_000 + 86_400_000));

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn survives_restart_and_corrupt_recovery() {
        let path = test_file("restart_corrupt");
        let _ = std::fs::remove_file(&path);

        let _ = create_reminder_in(&path, "Persistent task".to_string(), 500_000, None).unwrap();

        // Fresh load simulates app restart
        let store = load_store(&path);
        assert_eq!(store.reminders.len(), 1);
        assert_eq!(store.reminders[0].message, "Persistent task");

        // Write corrupted JSON
        std::fs::write(&path, "not json content").unwrap();
        let recovered = load_store(&path);
        assert!(recovered.reminders.is_empty());

        let _ = std::fs::remove_file(&path);
    }
}
