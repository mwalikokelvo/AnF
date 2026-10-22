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
pub struct VoiceJobs(
    Mutex<Option<(String, Arc<AtomicBool>)>>,
    #[cfg(windows)] Arc<Mutex<Option<Resident>>>,
);
const JOB_WORKER: &str = include_str!("../../../scripts/local-voice-resident.py");
const MAX_AUDIO: u64 = 5_000_000;
pub fn shutdown(jobs: &VoiceJobs) {
    if let Ok(lock) = jobs.0.lock() {
        if let Some((_, cancel)) = lock.as_ref() {
            cancel.store(true, Ordering::Relaxed);
        }
    }
    #[cfg(windows)]
    if let Ok(mut worker) = jobs.1.try_lock() {
        *worker = None;
    }
}

#[cfg(windows)]
struct Resident {
    // Drop containment before attempting to remove its script directory.
    child: crate::voice_process::VoiceProcess,
    directory: JobDirectory,
    root: PathBuf,
    used: Instant,
}
#[cfg(windows)]
fn expire_idle(state: &Arc<Mutex<Option<Resident>>>, key: PathBuf) {
    let weak = Arc::downgrade(state);
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));
        let Some(state) = weak.upgrade() else {
            break;
        };
        if let Ok(mut lock) = state.try_lock() {
            match lock.as_ref() {
                Some(worker) if worker.directory.path == key => {
                    if worker.used.elapsed() >= Duration::from_secs(60) {
                        *lock = None;
                        break;
                    }
                }
                _ => break,
            }
        };
    });
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
    #[cfg(windows)]
    let resident = jobs.1.clone();
    let result = tokio::task::spawn_blocking(move || {
        #[cfg(windows)]
        {
            run(root, base, voice, text, cancel, resident)
        }
        #[cfg(not(windows))]
        {
            run(root, base, voice, text, cancel)
        }
    })
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
    state: Arc<Mutex<Option<Resident>>>,
) -> Result<Vec<u8>, String> {
    if cancel.load(Ordering::Relaxed) {
        return Err("Local synthesis cancelled.".into());
    }
    crate::managed_component::no_links(&root)?;
    let directory = JobDirectory::new(&base)?;
    let key = directory
        .path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("Invalid speech job path.")?;
    let payload=serde_json::json!({"v":1,"id":key,"root":root.to_str().ok_or("Private voice path must be valid Unicode.")?,"voice":voice,"text":text}).to_string();
    if payload.len() >= 8192 {
        return Err("Local speech input or private pack path exceeded its limit.".into());
    }
    let mut lock = state
        .lock()
        .map_err(|_| "Speech worker lock unavailable.")?;
    if lock
        .as_ref()
        .map(|w| {
            w.root != root
                || w.used.elapsed() >= Duration::from_secs(60)
                || w.child.exit_code().ok() != Some(None)
        })
        .unwrap_or(false)
    {
        *lock = None;
    }
    if lock.is_none() {
        let worker_dir = JobDirectory::new(&base)?;
        let child = crate::voice_process::VoiceProcess::start_resident(
            &root.join("python/python.exe"),
            &worker_dir.path.join("worker.py"),
            &root,
        )?;
        let idle_key = worker_dir.path.clone();
        *lock = Some(Resident {
            child,
            directory: worker_dir,
            root,
            used: Instant::now(),
        });
        expire_idle(&state, idle_key);
    }
    let result = (|| {
        let worker = lock.as_mut().ok_or("Speech worker unavailable.")?;
        worker.child.send_frame(payload.as_bytes())?;
        let started = Instant::now();
        loop {
            if cancel.load(Ordering::Relaxed) || started.elapsed() > Duration::from_secs(240) {
                return Err("Local synthesis cancelled or exceeded four minutes.".into());
            }
            if let Some(frame) = worker.child.reply()? {
                let reply: serde_json::Value =
                    serde_json::from_slice(&frame).map_err(|_| "Invalid speech response.")?;
                if reply.as_object().map(|o| o.len()) != Some(3)
                    || reply["v"] != 1
                    || reply["id"] != key
                    || reply["ok"] != true
                {
                    return Err("Unexpected speech response.".into());
                }
                break;
            }
            if worker.child.exit_code()?.is_some() {
                return Err("Local voice synthesis failed. Verify the private voice pack and choose an installed voice.".into());
            }
            std::thread::sleep(Duration::from_millis(60));
        }
        let output = directory.path.join("output.wav");
        crate::managed_component::no_links(&output)?;
        let mut bytes = Vec::new();
        File::open(output)
            .and_then(|f| f.take(MAX_AUDIO + 1).read_to_end(&mut bytes))
            .map_err(|_| "Local voice audio could not be read.")?;
        if cancel.load(Ordering::Relaxed) {
            return Err("Local synthesis cancelled.".into());
        }
        let bytes = valid_audio(bytes)?;
        worker.used = Instant::now();
        Ok(bytes)
    })();
    if result.is_err() {
        *lock = None;
    }
    result
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
    #[cfg(windows)]
    #[test]
    #[ignore = "Requires ANF_TEST_VOICE_PACK; real private CPU synthesis, kept local."]
    fn real_resident_voices_cancel_restart_and_idle_cleanup() {
        let root = PathBuf::from(std::env::var_os("ANF_TEST_VOICE_PACK").unwrap())
            .canonicalize()
            .unwrap();
        assert!(ready(&root));
        let base = std::env::temp_dir().join(format!(
            "anf-resident-native-{}",
            crate::local_ai::random_key().unwrap()
        ));
        let state = Arc::new(Mutex::new(None));
        let mut identity = None;
        for voice in [
            "amazing",
            "always-forever",
            "burt-preview",
            "serafina-preview",
            "kelvin-preview",
        ] {
            let start = Instant::now();
            let bytes = run(
                root.clone(),
                base.clone(),
                voice.into(),
                "This local reading voice stays on this computer.".into(),
                Arc::new(AtomicBool::new(false)),
                state.clone(),
            )
            .unwrap();
            assert!(bytes.len() > 12000);
            let key = state
                .lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .directory
                .path
                .clone();
            if let Some(first) = identity.as_ref() {
                assert_eq!(first, &key);
            } else {
                identity = Some(key);
            }
            assert_eq!(fs::read_dir(&base).unwrap().count(), 1);
            println!(
                "Native resident {voice}: {}ms {}bytes",
                start.elapsed().as_millis(),
                bytes.len()
            );
        }
        let cancel = Arc::new(AtomicBool::new(false));
        let flag = cancel.clone();
        let trigger = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(300));
            flag.store(true, Ordering::Relaxed);
        });
        assert!(run(
            root.clone(),
            base.clone(),
            "amazing".into(),
            "Cancel this pending local speech.".into(),
            cancel,
            state.clone()
        )
        .unwrap_err()
        .contains("cancel"));
        trigger.join().unwrap();
        assert!(state.lock().unwrap().is_none());
        assert_eq!(fs::read_dir(&base).unwrap().count(), 0);
        run(
            root,
            base.clone(),
            "amazing".into(),
            "A fresh voice worker restarts after cancellation.".into(),
            Arc::new(AtomicBool::new(false)),
            state.clone(),
        )
        .unwrap();
        let start = Instant::now();
        while state.lock().unwrap().is_some() && start.elapsed() < Duration::from_secs(70) {
            std::thread::sleep(Duration::from_millis(250));
        }
        assert!(state.lock().unwrap().is_none());
        assert_eq!(fs::read_dir(&base).unwrap().count(), 0);
        fs::remove_dir(base).unwrap();
    }
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
