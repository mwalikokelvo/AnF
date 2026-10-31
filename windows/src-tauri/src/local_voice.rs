//! Optional private voice sidecar. Requests use stdin, never a shell or a network API.
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Manager, State};
#[derive(Default)]
pub struct VoiceJobs(Mutex<Option<(String, Arc<AtomicBool>)>>);
const JOB_WORKER: &str = include_str!("../../../scripts/local-voice-job.py");
const MAX_AUDIO: u64 = 5_000_000;
pub fn shutdown(jobs: &VoiceJobs) {
    if let Ok(lock) = jobs.0.lock() {
        if let Some((_, cancel)) = lock.as_ref() {
            cancel.store(true, Ordering::Relaxed);
        }
    }
}

/// Only a freshly created random directory and its two known files are owned.
struct JobDirectory {
    base: PathBuf,
    path: PathBuf,
}
impl JobDirectory {
    fn new(base: &Path) -> Result<Self, String> {
        crate::managed_component::no_links(base)?;
        fs::create_dir_all(base).map_err(|_| "Cannot create private speech job storage.")?;
        crate::managed_component::no_links(base)?;
        let dir = Self {
            base: base.to_path_buf(),
            path: base.join(crate::local_ai::random_key()?),
        };
        fs::create_dir(&dir.path).map_err(|_| "Cannot create an isolated speech job.")?;
        crate::managed_component::no_links(&dir.path)?;
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(dir.path.join("worker.py"))
            .and_then(|mut f| f.write_all(JOB_WORKER.as_bytes()))
            .map_err(|_| "Cannot prepare the isolated speech worker.")?;
        Ok(dir)
    }
    fn cleanup(&self) {
        if self.path.parent() != Some(self.base.as_path())
            || crate::managed_component::no_links(&self.path).is_err()
        {
            return;
        }
        let Ok(entries) = fs::read_dir(&self.path) else {
            return;
        };
        for entry in entries {
            let Ok(entry) = entry else {
                return;
            };
            let p = entry.path();
            if !["worker.py", "output.wav"]
                .iter()
                .any(|name| entry.file_name() == *name)
                || crate::managed_component::no_links(&p).is_err()
                || !p.is_file()
            {
                return;
            }
        }
        let mut worker = Vec::new();
        if File::open(self.path.join("worker.py"))
            .and_then(|f| f.take(JOB_WORKER.len() as u64 + 1).read_to_end(&mut worker))
            .is_err()
            || worker != JOB_WORKER.as_bytes()
        {
            return;
        }
        for name in ["output.wav", "worker.py"] {
            let _ = fs::remove_file(self.path.join(name));
        }
        let _ = fs::remove_dir(&self.path);
    }
}
impl Drop for JobDirectory {
    fn drop(&mut self) {
        self.cleanup();
    }
}
fn valid_audio(bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    if !(44..=MAX_AUDIO as usize).contains(&bytes.len())
        || bytes.get(..4) != Some(b"RIFF")
        || bytes.get(8..12) != Some(b"WAVE")
    {
        return Err("The voice runtime produced invalid or oversized audio.".into());
    }
    Ok(bytes)
}
fn workspace(label: &str) -> Result<(), String> {
    if label != "workspace" {
        return Err("Open local voices in the workspace.".into());
    }
    Ok(())
}
fn valid_request(id: &str, voice: &str, text: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 64
        || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
        || ![
            "amazing",
            "always-forever",
            "burt-preview",
            "serafina-preview",
            "kelvin-preview",
        ]
        .contains(&voice)
        || text.trim().is_empty()
        || text.chars().count() > 600
    {
        return Err("Voice requests require a registered voice and at most 600 characters.".into());
    }
    Ok(())
}
fn ready(root: &std::path::Path) -> bool {
    let required = [
        "python/python.exe",
        "worker.py",
        "provenance.json",
        "model/ve.safetensors",
        "model/t3_nano_v1.safetensors",
        "model/s3gen_meanflow.safetensors",
        "model/tokenizer_config.json",
        "source/chatterbox/tts_nano.py",
        "references/amazing.wav",
        "references/always-forever.wav",
        "references/burt-preview.wav",
        "references/serafina-preview.wav",
        "references/kelvin-preview.wav",
    ];
    if !required.iter().all(|p| root.join(p).is_file()) {
        return false;
    }
    let bytes = match std::fs::read(root.join("ready.json")) {
        Ok(b) if b.len() < 16384 => b,
        _ => return false,
    };
    let value: serde_json::Value = match serde_json::from_slice(&bytes) {
        Ok(v) => v,
        Err(_) => return false,
    };
    value["engine"] == "Chatterbox Nano CPU"
        && value["offline"] == true
        && [
            "amazing",
            "always-forever",
            "burt-preview",
            "serafina-preview",
            "kelvin-preview",
        ]
        .iter()
        .all(|voice| {
            value["proof"]
                .as_array()
                .map(|items| {
                    items.iter().any(|p| {
                        p["voice"] == *voice
                            && p["sampleRate"] == 24000
                            && p["seconds"]
                                .as_f64()
                                .map(|s| s > 0.25 && s <= 90.0)
                                .unwrap_or(false)
                            && p["sha256"]
                                .as_str()
                                .map(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()))
                                .unwrap_or(false)
                    })
                })
                .unwrap_or(false)
        })
}
fn home(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let local = crate::settings::local_dir().join("local-voice");
    let bundled = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("local-voice");
    let portable = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.join("local-voice")));
    for p in [Some(local), Some(bundled), portable].into_iter().flatten() {
        if ready(&p) {
            return p.canonicalize().map_err(|e| e.to_string());
        }
    }
    Err("Install the private local voice pack beside AnF.exe or in the AnF data folder, then refresh Reading assets. Choose an installed device voice while it is unavailable.".into())
}
#[tauri::command]
pub fn local_voice_status(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<(), String> {
    workspace(window.label())?;
    home(&app).map(|_| ())
}
#[tauri::command]
pub fn local_voice_cancel(
    window: tauri::WebviewWindow,
    jobs: State<VoiceJobs>,
    id: String,
) -> Result<(), String> {
    workspace(window.label())?;
    if let Ok(job) = jobs.0.lock() {
        if let Some((key, cancel)) = job.as_ref() {
            if key == &id {
                cancel.store(true, Ordering::Relaxed);
            }
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn local_voice_speak(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    jobs: State<'_, VoiceJobs>,
    id: String,
    voice: String,
    text: String,
) -> Result<Vec<u8>, String> {
    workspace(window.label())?;
    valid_request(&id, &voice, &text)?;
    let root = home(&app)?;
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut lock = jobs.0.lock().map_err(|_| "Voice job lock unavailable.")?;
        if lock.is_some() {
            return Err("The previous local voice request is stopping. Try again shortly.".into());
        }
        *lock = Some((id, cancel.clone()));
    }
    let base = crate::settings::local_dir().join("voice-jobs");
    let result = tokio::task::spawn_blocking(move || run(root, base, voice, text, cancel))
        .await
        .map_err(|_| "Local voice job stopped.".to_string())
        .and_then(|r| r);
    if let Ok(mut lock) = jobs.0.lock() {
        *lock = None;
    }
    result
}
#[cfg(windows)]
fn run(
    root: PathBuf,
    base: PathBuf,
    voice: String,
    text: String,
    cancel: Arc<AtomicBool>,
) -> Result<Vec<u8>, String> {
    if cancel.load(Ordering::Relaxed) {
        return Err("Local synthesis cancelled.".into());
    }
    let payload=serde_json::json!({"root":root.to_str().ok_or("Private voice path must be valid Unicode.")?,"voice":voice,"text":text}).to_string();
    if payload.len() > 8192 {
        return Err("Local speech input or private pack path exceeded its limit.".into());
    }
    let directory = JobDirectory::new(&base)?;
    let mut child = crate::voice_process::VoiceProcess::start(
        &root.join("python/python.exe"),
        &directory.path.join("worker.py"),
        &root,
    )?;
    child.send(payload.as_bytes())?;
    let started = Instant::now();
    loop {
        if cancel.load(Ordering::Relaxed) || started.elapsed() > Duration::from_secs(240) {
            return Err("Local synthesis cancelled or exceeded four minutes.".into());
        }
        match child.exit_code()?{Some(0)=>break,Some(_)=>return Err("Local voice synthesis failed. Verify the private voice pack and choose an installed voice.".into()),None=>std::thread::sleep(Duration::from_millis(60))}
    }
    let output = directory.path.join("output.wav");
    crate::managed_component::no_links(&output)?;
    let mut bytes = Vec::new();
    File::open(output)
        .and_then(|f| f.take(MAX_AUDIO + 1).read_to_end(&mut bytes))
        .map_err(|_| "Local voice audio could not be read.")?;
    valid_audio(bytes)
}
#[cfg(not(windows))]
fn run(
    _root: PathBuf,
    _base: PathBuf,
    _voice: String,
    _text: String,
    _cancel: Arc<AtomicBool>,
) -> Result<Vec<u8>, String> {
    Err("Private custom synthesis currently requires the Windows CPU voice pack.".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_workspace_can_access_voices() {
        assert!(workspace("workspace").is_ok());
        for label in ["island", "settings", ""] {
            assert!(workspace(label).is_err());
        }
    }
    #[test]
    fn voice_requests_are_bounded() {
        assert!(valid_request("abc-1", "amazing", "A new story.").is_ok());
        assert!(valid_request("abc", "always-forever", &"🌻".repeat(600)).is_ok());
        for (id, voice, text) in [
            ("../x", "amazing", "x"),
            ("x", "other", "x"),
            ("x", "amazing", " "),
        ] {
            assert!(valid_request(id, voice, text).is_err());
        }
        assert!(valid_request("x", "amazing", &"a".repeat(601)).is_err());
    }
    #[test]
    fn missing_pack_never_claims_readiness() {
        assert!(!ready(&std::env::temp_dir().join("anf-no-such-voice-pack")));
    }
    #[test]
    fn audio_result_is_bounded_and_requires_wave_headers() {
        assert!(valid_audio(vec![0; 44]).is_err());
        let mut wav = vec![0; 44];
        wav[..4].copy_from_slice(b"RIFF");
        wav[8..12].copy_from_slice(b"WAVE");
        assert!(valid_audio(wav.clone()).is_ok());
        wav.resize(MAX_AUDIO as usize + 1, 0);
        assert!(valid_audio(wav).is_err());
    }
    #[test]
    fn isolated_job_cleanup_preserves_other_jobs_and_unexpected_files() {
        let base = std::env::temp_dir().join(format!(
            "anf-voice-jobs-{}",
            crate::local_ai::random_key().unwrap()
        ));
        let first = JobDirectory::new(&base).unwrap();
        let second = JobDirectory::new(&base).unwrap();
        assert_ne!(first.path, second.path);
        let first_path = first.path.clone();
        fs::write(first.path.join("output.wav"), b"first generated clip").unwrap();
        let second_path = second.path.clone();
        drop(first);
        assert!(!first_path.exists());
        assert!(second_path.join("worker.py").is_file());
        fs::write(second_path.join("unrelated.txt"), b"preserve").unwrap();
        drop(second);
        assert_eq!(
            fs::read(second_path.join("unrelated.txt")).unwrap(),
            b"preserve"
        );
        for name in ["unrelated.txt", "worker.py"] {
            fs::remove_file(second_path.join(name)).unwrap();
        }
        fs::remove_dir(second_path).unwrap();
        fs::remove_dir(base).unwrap();
    }
}
