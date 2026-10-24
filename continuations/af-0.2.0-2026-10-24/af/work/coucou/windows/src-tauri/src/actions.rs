//! Explicit preview/apply file actions. Model output is never a command.
use crate::{local_ai::random_key, platform, settings};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};
#[derive(Deserialize)]
pub struct Request {
    pub kind: String,
    #[serde(default)]
    pub folder: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub paths: Vec<String>,
    #[serde(default)]
    pub text: String,
}
#[derive(Serialize)]
pub struct Preview {
    pub id: String,
    pub lines: Vec<String>,
}
enum Operation {
    Folder(PathBuf),
    Open(PathBuf),
    Notepad(PathBuf, String),
    Copy(Vec<(PathBuf, PathBuf, String)>),
}
struct Plan {
    op: Operation,
    created: Instant,
}
#[derive(Default)]
pub struct Plans(Mutex<HashMap<String, Plan>>);
fn leaf(name: &str) -> Result<(), String> {
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if name.is_empty()
        || name.len() > 160
        || name.contains(['\\', '/', ':', '\0', '<', '>', '|', '"', '?', '*'])
        || name.ends_with(['.', ' '])
        || name == ".."
        || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
    {
        return Err(
            "Use a simple folder name without slashes or Windows reserved characters.".into(),
        );
    }
    Ok(())
}
fn folder(input: &str) -> Result<PathBuf, String> {
    let p = Path::new(input);
    if !p.is_absolute() || !p.is_dir() {
        return Err("Enter the full path of an existing folder.".into());
    }
    std::fs::canonicalize(p).map_err(|e| e.to_string())
}
fn safe_file(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    let ext = p
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !p.is_absolute()
        || !p.is_file()
        || !matches!(
            ext.as_str(),
            "pdf" | "txt" | "md" | "csv" | "json" | "log" | "docx" | "png" | "jpg" | "jpeg"
        )
    {
        return Err("Choose an existing document or image. Programs and scripts cannot be opened by this action.".into());
    }
    if std::fs::metadata(p).map_err(|e| e.to_string())?.len() > 20 * 1024 * 1024 {
        return Err("Choose a file under 20 MB.".into());
    }
    std::fs::canonicalize(p).map_err(|e| e.to_string())
}
fn hash(p: &Path) -> Result<String, String> {
    Ok(format!(
        "{:x}",
        Sha256::digest(std::fs::read(p).map_err(|e| e.to_string())?)
    ))
}
fn unchanged_parent(p: &Path) -> Result<(), String> {
    let parent = p.parent().ok_or("Destination has no parent.")?;
    if std::fs::canonicalize(parent).map_err(|e| e.to_string())? != parent {
        return Err("Destination folder changed. Preview again.".into());
    }
    Ok(())
}
impl Plans {
    pub fn preview(&self, r: Request) -> Result<Preview, String> {
        let mut lines = Vec::new();
        let op = match r.kind.as_str() {
            "folder" => {
                leaf(&r.name)?;
                let p = folder(&r.folder)?.join(&r.name);
                if p.exists() {
                    return Err("This folder already exists. Choose a new name.".into());
                }
                lines.push(format!("Create folder: {}", p.display()));
                Operation::Folder(p)
            }
            "open" => {
                if r.paths.len() != 1 {
                    return Err("Choose exactly one file.".into());
                }
                let p = safe_file(&r.paths[0])?;
                lines.push(format!("Open in its Windows default app: {}", p.display()));
                Operation::Open(p)
            }
            "notepad" => {
                if r.text.trim().is_empty() || r.text.len() > 200_000 {
                    return Err("Draft must contain text under 200 KB.".into());
                }
                let d = settings::local_dir().join("documents");
                platform::ensure_private_dir(&d).map_err(|e| e.to_string())?;
                let p = d.join(format!("Draft-{}.txt", random_key()?));
                lines.push(format!("Save a new text document: {}", p.display()));
                lines.push(format!(
                    "Open this draft in Notepad ({} characters).",
                    r.text.chars().count()
                ));
                Operation::Notepad(p, r.text)
            }
            "organize" => {
                if r.paths.is_empty() || r.paths.len() > 30 {
                    return Err("Select between 1 and 30 documents.".into());
                }
                let parent = folder(&r.folder)?;
                let d = parent.join(format!("Coucou-organized-{}", &random_key()?[..12]));
                let mut copies = Vec::new();
                for raw in r.paths {
                    let src = safe_file(&raw)?;
                    let ext = src
                        .extension()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_ascii_lowercase();
                    let category = match ext.as_str() {
                        "pdf" => "PDF",
                        "png" | "jpg" | "jpeg" => "Images",
                        "docx" => "Word",
                        _ => "Text",
                    };
                    let dst = d
                        .join(category)
                        .join(src.file_name().ok_or("Missing filename.")?);
                    if copies.iter().any(|(_, p, _)| p == &dst) {
                        return Err(
                            "Two selected files have the same name. Organize them separately."
                                .into(),
                        );
                    }
                    lines.push(format!("Copy {} → {}", src.display(), dst.display()));
                    copies.push((src.clone(), dst, hash(&src)?));
                }
                lines.push(
                    "Original files stay in place. Existing files will never be overwritten."
                        .into(),
                );
                Operation::Copy(copies)
            }
            _ => return Err("Choose one of the listed actions.".into()),
        };
        let id = random_key()?;
        let mut plans = self.0.lock().unwrap();
        plans.retain(|_, p| p.created.elapsed() < Duration::from_secs(300));
        if plans.len() >= 16 {
            plans.clear();
        }
        plans.insert(
            id.clone(),
            Plan {
                op,
                created: Instant::now(),
            },
        );
        Ok(Preview { id, lines })
    }
    pub fn apply(&self, id: &str) -> Result<String, String> {
        let plan = self
            .0
            .lock()
            .unwrap()
            .remove(id)
            .ok_or("Preview expired. Preview the action again.")?;
        if plan.created.elapsed() > Duration::from_secs(300) {
            return Err("Preview expired. Preview the action again.".into());
        }
        match plan.op {
            Operation::Folder(p) => {
                unchanged_parent(&p)?;
                std::fs::create_dir(&p).map_err(|e| e.to_string())?;
                Ok(format!("Created {}", p.display()))
            }
            Operation::Open(p) => {
                safe_file(&p.to_string_lossy())?;
                platform::open_url(&p.to_string_lossy());
                Ok(format!("Opened {}", p.display()))
            }
            Operation::Notepad(p, text) => {
                let mut f = std::fs::OpenOptions::new()
                    .create_new(true)
                    .write(true)
                    .open(&p)
                    .map_err(|e| e.to_string())?;
                f.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
                drop(f);
                #[cfg(windows)]
                {
                    let system = std::env::var_os("WINDIR").ok_or("Windows folder missing.")?;
                    platform::no_console(&mut std::process::Command::new(
                        Path::new(&system).join("System32/notepad.exe"),
                    ))
                    .arg(&p)
                    .spawn()
                    .map_err(|e| format!("Saved draft, but Notepad could not start: {e}"))?;
                }
                Ok(format!("Saved and opened {}", p.display()))
            }
            Operation::Copy(copies) => {
                for (src, dst, fingerprint) in &copies {
                    safe_file(&src.to_string_lossy())?;
                    if hash(src)? != *fingerprint || dst.exists() {
                        return Err("A selected file or destination changed. Preview again.".into());
                    }
                }
                // Reserve a new root so a junction or existing directory cannot redirect writes.
                let root = copies[0]
                    .1
                    .parent()
                    .and_then(Path::parent)
                    .ok_or("Destination missing.")?
                    .to_path_buf();
                unchanged_parent(&root)?;
                std::fs::create_dir(&root).map_err(|e| e.to_string())?;
                let mut done = 0;
                for (src, dst, fingerprint) in copies {
                    let result = (|| -> Result<(), String> {
                        let bytes = std::fs::read(&src).map_err(|e| e.to_string())?;
                        if format!("{:x}", Sha256::digest(&bytes)) != fingerprint {
                            return Err("Source changed since preview.".into());
                        }
                        let d = dst.parent().unwrap();
                        if !d.exists() {
                            std::fs::create_dir(d).map_err(|e| e.to_string())?;
                        }
                        if std::fs::canonicalize(d).map_err(|e| e.to_string())? != d {
                            return Err("Destination changed since preview.".into());
                        }
                        let mut f = std::fs::OpenOptions::new()
                            .create_new(true)
                            .write(true)
                            .open(&dst)
                            .map_err(|e| e.to_string())?;
                        f.write_all(&bytes).map_err(|e| e.to_string())?;
                        Ok(())
                    })();
                    if let Err(e) = result {
                        return Err(format!("Copied {done} files into {} before an error: {e}. Originals remain safe.",root.display()));
                    }
                    done += 1;
                }
                Ok(format!("Copied {done} files into {}", root.display()))
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refuse_reserved_paths() {
        for s in ["..", "CON", "COM1.txt", "a/b", "a\\b", "x:", "name."] {
            assert!(leaf(s).is_err(), "{s}");
        }
        assert!(leaf("My letters").is_ok());
    }
    #[test]
    fn preview_does_not_write_and_apply_cannot_repeat() {
        let d = settings::local_dir().join(format!("action-test-{}", random_key().unwrap()));
        std::fs::create_dir_all(&d).unwrap();
        let plans = Plans::default();
        let p = plans
            .preview(Request {
                kind: "folder".into(),
                folder: d.to_string_lossy().into(),
                name: "Letters".into(),
                paths: vec![],
                text: String::new(),
            })
            .unwrap();
        assert!(!d.join("Letters").exists());
        plans.apply(&p.id).unwrap();
        assert!(d.join("Letters").is_dir());
        assert!(plans.apply(&p.id).is_err());
        std::fs::remove_dir(d.join("Letters")).unwrap();
        std::fs::remove_dir(d).unwrap();
    }
    #[test]
    fn modified_source_invalidates_copy() {
        let d = settings::local_dir().join(format!("copy-test-{}", random_key().unwrap()));
        std::fs::create_dir_all(&d).unwrap();
        let src = d.join("a.txt");
        std::fs::write(&src, "original").unwrap();
        let plans = Plans::default();
        let p = plans
            .preview(Request {
                kind: "organize".into(),
                folder: d.to_string_lossy().into(),
                name: String::new(),
                paths: vec![src.to_string_lossy().into()],
                text: String::new(),
            })
            .unwrap();
        std::fs::write(&src, "changed").unwrap();
        assert!(plans.apply(&p.id).is_err());
        assert_eq!(std::fs::read_to_string(&src).unwrap(), "changed");
        std::fs::remove_file(src).unwrap();
        std::fs::remove_dir(d).unwrap();
    }
}
