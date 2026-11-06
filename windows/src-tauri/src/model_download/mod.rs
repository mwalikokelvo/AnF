//! Verified download of local-AI model weights. The webview only names a model
//! id; the URL, size and SHA-256 are pinned in `policy::MODELS`. Bytes are
//! streamed by Rust (never the webview, so the CSP stays closed to
//! huggingface.co) into `local-ai/models/<file>.part`, hashed, and only then
//! renamed to their final name. See `policy` (rules) and `store` (files).
pub mod policy;
pub mod store;

use policy::{accept_response, check_url_parts, is_public_ip, is_redirect, spec, ModelSpec, ResumePlan, MAX_REDIRECTS, MODELS};
use reqwest::Url;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

const EVENT: &str = "local-ai-download";
const CANCELLED: &str = "Download cancelled. The partial file is kept so it can resume.";
const RESTART: &str = "restart";

/// Phases the UI can show. `ready` is only ever sent after the hash matched.
#[derive(Clone, Serialize)]
pub struct Progress {
    pub id: String,
    pub phase: &'static str,
    pub done: u64,
    pub total: u64,
    pub error: Option<String>,
}

#[derive(Default)]
pub struct Downloads(Mutex<HashMap<&'static str, Arc<AtomicBool>>>);

struct Slot<'a> {
    map: &'a Downloads,
    id: &'static str,
}
impl Drop for Slot<'_> {
    fn drop(&mut self) {
        self.map.0.lock().unwrap().remove(self.id);
    }
}

fn dir() -> PathBuf {
    store::models_dir(&crate::settings::local_dir())
}

/// Path of a verified model for a runtime slot (`fast` / `balanced`), if installed.
pub fn verified_model(slot: &str) -> Option<PathBuf> {
    let d = dir();
    MODELS.iter().find(|m| policy::slot_of(m) == slot && store::installed(&d, m)).map(|m| store::final_path(&d, m))
}

pub fn any_verified() -> bool {
    let d = dir();
    MODELS.iter().any(|m| store::installed(&d, m))
}

fn validate(url: &Url, first_hop: bool) -> Result<(), String> {
    check_url_parts(url.scheme(), url.username(), url.password().is_some(), url.host_str(), url.port(), first_hop).map_err(|e| e.to_string())
}

/// Resolve the host and require every address to be public; the connection is
/// pinned to exactly the addresses that were checked.
async fn resolve_public(url: &Url) -> Result<Vec<SocketAddr>, String> {
    let host = url.host_str().ok_or("The address has no host.")?;
    let addrs: Vec<SocketAddr> = tokio::time::timeout(Duration::from_secs(10), tokio::net::lookup_host((host, 443u16)))
        .await
        .map_err(|_| "Website lookup timed out.".to_string())?
        .map_err(|_| "Could not find the Hugging Face download host. Check your internet connection.".to_string())?
        .collect();
    if addrs.is_empty() || addrs.iter().any(|a| !is_public_ip(a.ip())) {
        return Err("The download host did not resolve to a public internet address, so nothing was downloaded.".into());
    }
    Ok(addrs)
}

/// Follow redirects by hand (each hop re-validated against the host allowlist
/// and DNS-pinned) until a final response, then check it against the manifest.
async fn open_stream(spec: &ModelSpec, offset: u64) -> Result<(reqwest::Response, u64), String> {
    let mut current = Url::parse(spec.url).map_err(|_| "Internal error: bad model address.".to_string())?;
    for hop in 0..=MAX_REDIRECTS {
        validate(&current, hop == 0)?;
        let addrs = resolve_public(&current).await?;
        let host = current.host_str().unwrap_or_default().trim_end_matches('.').to_string();
        // no_proxy: a proxy would resolve the name itself and bypass the pinned, checked addresses.
        let client = reqwest::Client::builder()
            .no_proxy()
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .user_agent("AnF model download")
            .resolve_to_addrs(&host, &addrs)
            .build()
            .map_err(|_| "Could not start the download.".to_string())?;
        let mut request = client.get(current.clone()).header("Accept-Encoding", "identity");
        if offset > 0 {
            request = request.header("Range", format!("bytes={offset}-"));
        }
        let response = request.send().await.map_err(|_| "Could not reach Hugging Face. Check your internet connection and try again.".to_string())?;
        let status = response.status().as_u16();
        if is_redirect(status) {
            if hop == MAX_REDIRECTS {
                return Err(format!("Too many redirects (more than {MAX_REDIRECTS})."));
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or("The server redirected without saying where.")?;
            current = current.join(location.trim()).map_err(|_| "The server sent an invalid redirect.".to_string())?;
            validate(&current, false).map_err(|e| format!("Redirect refused: {e}"))?;
            continue;
        }
        if status == 416 && offset > 0 {
            return Err(RESTART.into());
        }
        let header = |name| response.headers().get(name).and_then(|v| v.to_str().ok());
        let start = accept_response(
            status,
            response.content_length(),
            header(reqwest::header::CONTENT_RANGE),
            header(reqwest::header::CONTENT_TYPE),
            offset,
            spec.size,
        )
        .map_err(|e| format!("{e} (status {status})"))?;
        return Ok((response, start));
    }
    Err(format!("Too many redirects (more than {MAX_REDIRECTS})."))
}

fn sha256_file(path: &Path, cancel: &AtomicBool) -> Result<[u8; 32], String> {
    let mut file = std::fs::File::open(path).map_err(|e| format!("Could not read the downloaded file: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 20];
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err(CANCELLED.into());
        }
        let n = file.read(&mut buffer).map_err(|e| format!("Could not read the downloaded file: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(hasher.finalize().into())
}

async fn verify(dir: &Path, spec: &'static ModelSpec, source: store::Source, cancel: &Arc<AtomicBool>) -> Result<(), String> {
    let path = match source {
        store::Source::Part => store::part_path(dir, spec),
        store::Source::Existing => store::final_path(dir, spec),
    };
    let flag = cancel.clone();
    let digest = tokio::task::spawn_blocking(move || sha256_file(&path, &flag)).await.map_err(|_| "Verification stopped unexpectedly.".to_string())??;
    store::finalize(dir, spec, &digest, source)
}

/// Download, verify and install one model. `emit(phase, done)` reports progress.
/// Restart-safe: after any failure the final name is untouched; a `.part` file
/// survives network errors and cancellation (and is resumed with a Range
/// request), but is deleted on a size or checksum mismatch.
pub async fn download<F: FnMut(&'static str, u64) + Send>(spec: &'static ModelSpec, dir: &Path, cancel: &Arc<AtomicBool>, emit: &mut F) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("Could not create the model folder: {e}"))?;
    if store::installed(dir, spec) {
        return Ok(());
    }
    if store::needs_adoption(dir, spec) {
        emit("verifying", spec.size);
        return verify(dir, spec, store::Source::Existing, cancel).await;
    }
    let mut retried = false;
    loop {
        let (mut file, plan) = store::open_part(dir, spec).map_err(|e| format!("Could not open the partial file: {e}"))?;
        let offset = match plan {
            ResumePlan::Resume(n) => n,
            ResumePlan::Fresh => 0,
            ResumePlan::Verify => {
                emit("verifying", spec.size);
                return verify(dir, spec, store::Source::Part, cancel).await;
            }
        };
        emit("downloading", offset);
        let (mut response, start) = match open_stream(spec, offset).await {
            Ok(v) => v,
            Err(e) if e == RESTART && !retried => {
                store::discard_part(dir, spec);
                retried = true;
                continue;
            }
            Err(e) => return Err(e),
        };
        if start == 0 && offset > 0 {
            file = store::restart_part(dir, spec).map_err(|e| format!("Could not restart the partial file: {e}"))?;
        }
        let mut written = start;
        let mut last = Instant::now();
        loop {
            if cancel.load(Ordering::Relaxed) {
                return Err(CANCELLED.into());
            }
            let chunk = tokio::time::timeout(Duration::from_secs(60), response.chunk())
                .await
                .map_err(|_| "The download stalled. Try again to resume.".to_string())?
                .map_err(|_| "The connection dropped. Try again to resume.".to_string())?;
            let Some(chunk) = chunk else { break };
            written += chunk.len() as u64;
            if written > spec.size {
                drop(file);
                store::discard_part(dir, spec);
                return Err("The server sent more data than the expected model size. The partial file was deleted.".into());
            }
            file.write_all(&chunk).map_err(|e| format!("Could not write the model file (is the disk full?): {e}"))?;
            if last.elapsed() >= Duration::from_millis(250) {
                emit("downloading", written);
                last = Instant::now();
            }
        }
        file.sync_all().map_err(|e| format!("Could not save the model file: {e}"))?;
        drop(file);
        if written != spec.size {
            return Err("The download ended early. Try again to resume.".into());
        }
        emit("verifying", written);
        return verify(dir, spec, store::Source::Part, cancel).await;
    }
}

// ── Tauri surface ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ModelStatus {
    pub id: &'static str,
    pub file: &'static str,
    pub size: u64,
    pub sha256: &'static str,
    pub slot: &'static str,
    /// `installed` (verified), `partial` (resumable bytes only), `unverified`, or `absent`.
    pub state: &'static str,
    pub partial_bytes: u64,
    pub downloading: bool,
}

#[tauri::command]
pub fn local_ai_models(downloads: State<'_, Downloads>) -> Vec<ModelStatus> {
    let d = dir();
    let active = downloads.0.lock().unwrap();
    MODELS
        .iter()
        .map(|m| {
            let partial = store::part_len(&d, m).unwrap_or(0);
            let state = if store::installed(&d, m) {
                "installed"
            } else if store::needs_adoption(&d, m) {
                "unverified"
            } else if partial > 0 {
                "partial"
            } else {
                "absent"
            };
            ModelStatus { id: m.id, file: m.file, size: m.size, sha256: m.sha256, slot: policy::slot_of(m), state, partial_bytes: partial, downloading: active.contains_key(m.id) }
        })
        .collect()
}

#[tauri::command]
pub async fn local_ai_download(id: String, app: AppHandle, downloads: State<'_, Downloads>) -> Result<(), String> {
    let spec = spec(&id).ok_or("Unknown model.")?;
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut active = downloads.0.lock().unwrap();
        if active.contains_key(spec.id) {
            return Err("This model is already downloading.".into());
        }
        active.insert(spec.id, cancel.clone());
    }
    let _slot = Slot { map: downloads.inner(), id: spec.id };
    let send = |phase: &'static str, done: u64, error: Option<String>| {
        let _ = app.emit(EVENT, Progress { id: spec.id.to_string(), phase, done, total: spec.size, error });
    };
    let mut on = |phase: &'static str, done: u64| send(phase, done, None);
    match download(spec, &dir(), &cancel, &mut on).await {
        Ok(()) => {
            send("ready", spec.size, None);
            Ok(())
        }
        Err(e) if e == CANCELLED => {
            send("cancelled", 0, None);
            Err(e)
        }
        Err(e) => {
            send("failed", 0, Some(e.clone()));
            Err(e)
        }
    }
}

#[tauri::command]
pub fn local_ai_download_cancel(id: String, downloads: State<'_, Downloads>) -> bool {
    match downloads.0.lock().unwrap().get(id.as_str()) {
        Some(flag) => {
            flag.store(true, Ordering::Relaxed);
            true
        }
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashing_matches_known_vectors_and_honours_cancel() {
        let d = std::env::temp_dir().join(format!("anf-hash-test-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        let p = d.join("f.bin");
        std::fs::write(&p, b"hello").unwrap();
        let live = AtomicBool::new(false);
        let digest = sha256_file(&p, &live).unwrap();
        assert!(policy::digest_matches("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", &digest));
        assert_eq!(sha256_file(&p, &AtomicBool::new(true)).unwrap_err(), CANCELLED);
        // spans several 1 MiB buffers
        std::fs::write(&p, vec![0u8; 3 << 20]).unwrap();
        assert_eq!(policy::hex(&sha256_file(&p, &live).unwrap()), "bbd05cf6097ac9b1f89ea29d2542c1b7b67ee46848393895f5a9e43fa1f621e5");
    }

    #[test]
    fn every_network_hop_is_validated_before_any_request() {
        let ok = Url::parse("https://cas-bridge.xethub.hf.co/x?sig=1").unwrap();
        assert!(validate(&ok, false).is_ok());
        assert!(validate(&ok, true).is_err(), "the first request must be huggingface.co");
        for bad in ["http://huggingface.co/x", "https://evil.example/x", "https://127.0.0.1/x", "https://huggingface.co:8443/x", "https://u:p@huggingface.co/x"] {
            assert!(validate(&Url::parse(bad).unwrap(), false).is_err(), "{bad}");
        }
    }
}
