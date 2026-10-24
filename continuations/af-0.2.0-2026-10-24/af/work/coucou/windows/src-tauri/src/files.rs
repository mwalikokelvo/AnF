// Dropped files are copied into %LOCALAPPDATA%\Coucou\inbox so the original is
// never touched and the copy survives the drag source going away.
// The inbox is swept of anything older than a week, as on macOS.

use std::path::{Path, PathBuf};
use std::io::Write;
use std::time::{Duration, SystemTime};

use serde::Serialize;

use crate::settings;

const KEEP_FOR: Duration = Duration::from_secs(7 * 24 * 60 * 60);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DroppedFile {
    pub name: String,
    pub path: String,
    pub size: u64,
}

pub fn inbox_dir() -> PathBuf {
    settings::local_dir().join("inbox")
}

pub fn ingest(source: &str) -> Result<DroppedFile, String> {
    let src = Path::new(source);
    let meta = std::fs::metadata(src).map_err(|e| format!("cannot read {source}: {e}"))?;
    if meta.is_dir() {
        return Err("Folders can't be dropped yet.".into());
    }

    let dir = prepare_inbox()?;

    let name = src
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".into());
    let (dest, file) = reserve_dest(&dir, &name)?;
    drop(file);

    if let Err(err) = std::fs::copy(src, &dest) {
        let _ = std::fs::remove_file(&dest);
        return Err(format!("cannot copy: {err}"));
    }
    // CopyFileEx carries the source's timestamps across, so a file last edited
    // three years ago would arrive already older than the sweep window and be
    // deleted on the spot. The inbox ages from when *we* copied it.
    if let Ok(file) = std::fs::File::options().write(true).open(&dest) {
        let _ = file.set_modified(SystemTime::now());
    }
    sweep(&dir);

    Ok(DroppedFile {
        name,
        path: dest.to_string_lossy().to_string(),
        size: meta.len(),
    })
}

/// A file handed over by its contents rather than its path — what WebView2 gives
/// the page for a browser drag and drop. Lands in the inbox like any other drop.
pub fn ingest_bytes(name: &str, bytes: &[u8]) -> Result<DroppedFile, String> {
    if bytes.len() > 200 * 1024 * 1024 {
        return Err("That file is too big to drop (200 MB max).".into());
    }
    // Only the last component: a name must never steer the write elsewhere.
    let name = Path::new(name)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "file".into());
    let device = name.split('.').next().unwrap_or("").trim_end().to_ascii_uppercase();
    let reserved = matches!(device.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (device.len() == 4 && (device.starts_with("COM") || device.starts_with("LPT"))
            && matches!(device.as_bytes()[3], b'1'..=b'9'));
    if name.contains([':', '\0', '<', '>', '|', '"', '?', '*']) || name.ends_with(['.', ' ']) || reserved {
        return Err("That file name is not supported on Windows.".into());
    }
    let dir = prepare_inbox()?;
    let (dest, mut file) = reserve_dest(&dir, &name)?;
    if let Err(err) = file.write_all(bytes) {
        drop(file);
        let _ = std::fs::remove_file(&dest);
        return Err(format!("cannot save: {err}"));
    }
    drop(file);
    sweep(&dir);

    Ok(DroppedFile {
        name,
        path: dest.to_string_lossy().to_string(),
        size: bytes.len() as u64,
    })
}

fn prepare_inbox() -> Result<PathBuf, String> {
    let dir = inbox_dir();
    crate::platform::ensure_private_dir(&settings::local_dir()).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// `name`, or `name (2)`, `name (3)`… — the inbox never overwrites.
fn reserve_dest(dir: &Path, name: &str) -> Result<(PathBuf, std::fs::File), String> {
    let as_path = Path::new(name);
    let stem = as_path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = as_path.extension().map(|s| format!(".{}", s.to_string_lossy())).unwrap_or_default();
    for i in 1..=10_000 {
        let dest = dir.join(if i == 1 { name.to_string() } else { format!("{stem} ({i}){ext}") });
        match std::fs::OpenOptions::new().write(true).create_new(true).open(&dest) {
            Ok(file) => return Ok((dest, file)),
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(err) => return Err(format!("cannot save: {err}")),
        }
    }
    Err("Too many files with that name in the inbox.".into())
}

/// Decodes the `encodeURIComponent` file name the page sends in a header.
pub fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Some(b) = std::str::from_utf8(&bytes[i + 1..i + 3]).ok()
                .and_then(|hex| u8::from_str_radix(hex, 16).ok()) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Drops anything copied here more than a week ago. `ingest` stamps every copy
/// with the time it landed, so this really is the age of the copy and not the
/// age of whatever the user happened to drag in.
fn sweep(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let now = SystemTime::now();
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        let Ok(copied) = meta.modified() else { continue };
        if now.duration_since(copied).map(|age| age > KEEP_FOR).unwrap_or(false) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_drop_names_without_panicking_on_bad_unicode() {
        assert_eq!(percent_decode("caf%C3%A9%20notes.txt"), "café notes.txt");
        assert_eq!(percent_decode("%é"), "%é");
        assert_eq!(percent_decode("%ZZ"), "%ZZ");
    }

    #[test]
    fn byte_drop_preserves_concurrent_files_and_rejects_device_names() {
        assert!(ingest_bytes("NUL.txt", b"x").is_err());
        assert!(ingest_bytes("note.txt:secret", b"x").is_err());
        let name = format!("concurrent-drop-{}.txt", std::process::id());
        let threads: Vec<_> = (0..12).map(|i| {
            let name = name.clone();
            std::thread::spawn(move || ingest_bytes(&name, &[i]).unwrap())
        }).collect();
        let files: Vec<_> = threads.into_iter().map(|t| t.join().unwrap()).collect();
        let unique: std::collections::HashSet<_> = files.iter().map(|f| &f.path).collect();
        assert_eq!(unique.len(), 12);
        for (i, file) in files.iter().enumerate() {
            assert_eq!(std::fs::read(&file.path).unwrap(), vec![i as u8]);
            std::fs::remove_file(&file.path).unwrap();
        }
    }

    #[test]
    fn ingest_copies_and_never_overwrites() {
        let tmp = std::env::temp_dir().join(format!("coucou-test-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        let source = tmp.join("note.txt");
        std::fs::write(&source, b"hello").unwrap();

        let first = ingest(source.to_str().unwrap()).unwrap();
        assert_eq!(first.name, "note.txt");
        assert_eq!(std::fs::read(&first.path).unwrap(), b"hello");

        // A second drop of the same name must not clobber the first copy.
        std::fs::write(&source, b"second").unwrap();
        let second = ingest(source.to_str().unwrap()).unwrap();
        assert_ne!(first.path, second.path);
        assert_eq!(std::fs::read(&first.path).unwrap(), b"hello");
        assert_eq!(std::fs::read(&second.path).unwrap(), b"second");

        // Folders are refused rather than silently ignored.
        assert!(ingest(tmp.to_str().unwrap()).is_err());

        // An ancient source must not arrive already older than the sweep window.
        let old_source = tmp.join("ancient.txt");
        std::fs::write(&old_source, b"old").unwrap();
        let long_ago = SystemTime::now() - KEEP_FOR - Duration::from_secs(60 * 60);
        std::fs::File::options()
            .write(true)
            .open(&old_source)
            .unwrap()
            .set_modified(long_ago)
            .unwrap();
        let aged = ingest(old_source.to_str().unwrap()).unwrap();
        assert!(
            Path::new(&aged.path).exists(),
            "a file copied just now was swept as if it were a week old"
        );
        let _ = std::fs::remove_file(&aged.path);

        let _ = std::fs::remove_file(&first.path);
        let _ = std::fs::remove_file(&second.path);
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
