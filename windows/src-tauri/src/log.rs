// Small append-only log at %LOCALAPPDATA%\Coucou\coucou.log (Windows) or
// ~/.local/share/coucou/coucou.log (Linux) — the equivalent of nbLog() in
// HookServer.swift. Nothing leaves the machine.

use std::io::Write;

use crate::{platform, settings};

pub fn line(message: impl AsRef<str>) {
    let t = platform::local_time();
    let stamp = format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        t.year, t.month, t.day, t.hour, t.minute, t.second
    );
    let dir = settings::local_dir();
    if platform::ensure_private_dir(&dir).is_err() {
        return;
    }
    let path = dir.join("coucou.log");
    // Keep it from growing forever: start fresh past ~1 MB.
    if std::fs::metadata(&path).map(|m| m.len() > 1_000_000).unwrap_or(false) {
        let _ = std::fs::remove_file(&path);
    }
    let mut options = std::fs::OpenOptions::new();
    options.create(true).append(true);
    // Readable by us only, like the macOS log.
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    if let Ok(mut file) = options.open(path) {
        let _ = writeln!(file, "{stamp} {}", message.as_ref());
    }
}

// ── Kevo's log ────────────────────────────────────────────────────────────────
// One JSON line per Kevo event in `kevo/kevo-log.jsonl` next to coucou.log, for
// the owner's test runs and the self-test. It stays on this PC: nothing sends it
// anywhere, and only "Save log" copies it (to the owner's Downloads folder).

const KEEP_LINES: usize = 2_000;
const TRIM_PAST: usize = 3_000;
const MAX_LINE: usize = 16_000;

/// Serialises writers and remembers the line count, so an append never rereads the file.
static KEVO_LOG: std::sync::Mutex<Option<usize>> = std::sync::Mutex::new(None);

fn kevo_log_path() -> std::path::PathBuf {
    settings::local_dir().join("kevo").join("kevo-log.jsonl")
}

/// Appends one line; past `TRIM_PAST` lines the file is cut back to the newest `KEEP_LINES`.
fn append_kevo_line(path: &std::path::Path, lines: &mut Option<usize>, line: &str) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        platform::ensure_private_dir(dir)?;
    }
    let count = match *lines {
        Some(n) => n,
        None => std::fs::read_to_string(path).map(|s| s.lines().count()).unwrap_or(0),
    };
    let mut options = std::fs::OpenOptions::new();
    options.create(true).append(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    writeln!(options.open(path)?, "{line}")?;
    *lines = Some(count + 1);
    if count + 1 > TRIM_PAST {
        let text = std::fs::read_to_string(path)?;
        let all: Vec<&str> = text.lines().collect();
        let kept = all[all.len().saturating_sub(KEEP_LINES)..].join("\n") + "\n";
        let temp = path.with_extension("jsonl.tmp");
        std::fs::write(&temp, kept)?;
        std::fs::rename(&temp, path)?;
        *lines = Some(all.len().min(KEEP_LINES));
    }
    Ok(())
}

/// Kevo's events arrive as objects; serialising them here keeps every entry one valid line.
#[tauri::command]
pub async fn kevo_log_append(entry: serde_json::Value) -> Result<(), String> {
    if !entry.is_object() {
        return Err("A Kevo log entry must be an object.".into());
    }
    let line = entry.to_string();
    if line.len() > MAX_LINE {
        return Err("Kevo log entry is too long.".into());
    }
    let mut lines = KEVO_LOG.lock().map_err(|_| "Kevo's log is unavailable.")?;
    append_kevo_line(&kevo_log_path(), &mut lines, &line).map_err(|e| e.to_string())
}

/// "Save log": a copy in Downloads named after this version, for attaching to a test report.
#[tauri::command]
pub async fn kevo_log_save(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let source = kevo_log_path();
    if !source.is_file() {
        return Err("Kevo's log is empty so far.".into());
    }
    let dir = app.path().download_dir().map_err(|_| "The Downloads folder was not found.")?;
    let target = dir.join(format!("kevo-log-{}.jsonl", env!("CARGO_PKG_VERSION")));
    let _lock = KEVO_LOG.lock().map_err(|_| "Kevo's log is unavailable.")?;
    std::fs::copy(&source, &target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().into())
}

#[tauri::command]
pub fn kevo_log_open_folder() -> Result<(), String> {
    let dir = settings::local_dir().join("kevo");
    platform::ensure_private_dir(&dir).map_err(|e| e.to_string())?;
    platform::reveal_folder(&dir.to_string_lossy());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("anf-kevo-log-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("kevo").join("kevo-log.jsonl")
    }

    #[test]
    fn kevo_log_appends_one_line_per_entry() {
        let path = temp("append");
        let mut lines = None;
        append_kevo_line(&path, &mut lines, r#"{"event":"mic","on":true}"#).unwrap();
        append_kevo_line(&path, &mut lines, r#"{"event":"wake"}"#).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\"event\":\"mic\",\"on\":true}\n{\"event\":\"wake\"}\n");
        assert_eq!(lines, Some(2));
    }

    #[test]
    fn kevo_log_keeps_the_newest_2000_lines_once_past_3000() {
        let path = temp("trim");
        let mut lines = None;
        for i in 0..TRIM_PAST {
            append_kevo_line(&path, &mut lines, &format!("{{\"n\":{i}}}")).unwrap();
        }
        assert_eq!(std::fs::read_to_string(&path).unwrap().lines().count(), TRIM_PAST, "not cut before it passes 3,000");
        // A fresh start counts the lines already in the file.
        let mut lines = None;
        append_kevo_line(&path, &mut lines, &format!("{{\"n\":{TRIM_PAST}}}")).unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        let kept: Vec<&str> = text.lines().collect();
        assert_eq!(kept.len(), KEEP_LINES);
        assert_eq!(kept[0], format!("{{\"n\":{}}}", TRIM_PAST + 1 - KEEP_LINES));
        assert_eq!(*kept.last().unwrap(), format!("{{\"n\":{TRIM_PAST}}}"));
        assert_eq!(lines, Some(KEEP_LINES));
    }
}
