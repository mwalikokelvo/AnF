//! AnF-owned IPC adapter. No renderer-selected executables, URLs or manifests.
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
#[cfg(all(windows, feature = "embedded-mkr"))]
use tauri::{Emitter, Manager};

const UNAVAILABLE: &str = "Embedded MKR Music is not installed in this AnF build.";
// Deliberately no production inventory until the bundled graph/source is reviewed.
#[cfg(all(windows, feature = "embedded-mkr"))]
const REVIEWED_MANIFEST: Option<&'static str> = None;

#[derive(Default)]
pub struct Managed(Arc<Inner>);
#[derive(Default)]
struct Inner {
    pending: Mutex<Option<(String, tokio::sync::oneshot::Sender<bool>)>>,
    #[cfg(all(windows, feature = "embedded-mkr"))]
    host: Mutex<Option<Arc<anf_mkr_windows_audio::host::PlaybackHost>>>,
    #[cfg(all(windows, feature = "embedded-mkr"))]
    starting: std::sync::atomic::AtomicBool,
    #[cfg(all(windows, feature = "embedded-mkr"))]
    stopped: std::sync::atomic::AtomicBool,
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Command {
    Capabilities,
    Open,
    Hide,
    Status,
    Search,
    Play,
    Pause,
    Previous,
    Next,
    Seek,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Search {
    query: String,
}
#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct Play {
    id: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Seek {
    position_ms: u64,
}
struct Arguments {
    query: Option<String>,
    id: Option<String>,
    position: Option<u64>,
}
fn arguments(command: Command, payload: Option<Value>) -> Result<Arguments, String> {
    let payload = payload
        .filter(|p| !p.is_null())
        .unwrap_or_else(|| json!({}));
    let mut args = Arguments {
        query: None,
        id: None,
        position: None,
    };
    let bad = || "Invalid MKR command arguments.".to_owned();
    match command {
        Command::Search => {
            let value: Search = serde_json::from_value(payload).map_err(|_| bad())?;
            let query = value.query.trim();
            if query.is_empty()
                || query.chars().count() > 500
                || query.chars().any(char::is_control)
            {
                return Err(bad());
            }
            args.query = Some(query.to_owned());
        }
        Command::Play => {
            let value: Play = serde_json::from_value(payload).map_err(|_| bad())?;
            if value.id.as_ref().is_some_and(|id| {
                id.is_empty() || id.len() > 256 || id.chars().any(char::is_control)
            }) {
                return Err(bad());
            }
            args.id = value.id;
        }
        Command::Seek => {
            let value: Seek = serde_json::from_value(payload).map_err(|_| bad())?;
            if value.position_ms > 9_007_199_254_740_991 {
                return Err(bad());
            }
            args.position = Some(value.position_ms);
        }
        _ => {
            if !payload.as_object().is_some_and(|p| p.is_empty()) {
                return Err(bad());
            }
        }
    }
    Ok(args)
}
fn workspace(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "workspace" {
        Ok(())
    } else {
        Err("MKR belongs to the workspace window.".into())
    }
}

#[tauri::command]
pub fn mkr_ack(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Managed>,
    token: String,
    paused: bool,
) -> Result<(), String> {
    workspace(&window)?;
    acknowledge(&state.0, &token, paused)
}
fn acknowledge(inner: &Inner, token: &str, paused: bool) -> Result<(), String> {
    let mut pending = inner
        .pending
        .lock()
        .map_err(|_| "MKR handoff unavailable.")?;
    if !pending
        .as_ref()
        .is_some_and(|(expected, _)| expected == token)
    {
        return Err("MKR handoff expired.".into());
    }
    if let Some((_, reply)) = pending.take() {
        let _ = reply.send(paused);
    }
    Ok(())
}

#[cfg(all(windows, feature = "embedded-mkr"))]
async fn host(
    app: &tauri::AppHandle,
    inner: Arc<Inner>,
) -> Result<Arc<anf_mkr_windows_audio::host::PlaybackHost>, String> {
    use std::sync::atomic::Ordering;
    if inner.stopped.load(Ordering::Acquire) {
        return Err(UNAVAILABLE.into());
    }
    if let Some(host) = inner.host.lock().map_err(|_| UNAVAILABLE)?.clone() {
        return if host.is_ready() {
            Ok(host)
        } else {
            Err("MKR session stopped; restart AnF to recover.".into())
        };
    }
    let manifest = REVIEWED_MANIFEST.ok_or(UNAVAILABLE)?;
    if inner.starting.swap(true, Ordering::AcqRel) {
        return Err("MKR is starting.".into());
    }
    let app = app.clone();
    let launched = tauri::async_runtime::spawn_blocking(move || {
        let root = app
            .path()
            .resolve("mkr-runtime", tauri::path::BaseDirectory::Resource)
            .map_err(|_| UNAVAILABLE)?;
        let runtime = anf_mkr_windows_audio::resources::VerifiedRuntime::verify(&root, manifest)?;
        anf_mkr_windows_audio::host::PlaybackHost::launch(runtime, false).map(Arc::new)
    })
    .await
    .map_err(|_| "MKR startup did not complete.".to_owned())
    .and_then(|v| v);
    inner.starting.store(false, Ordering::Release);
    let host = launched?;
    let mut slot = inner.host.lock().map_err(|_| UNAVAILABLE)?;
    if inner.stopped.load(Ordering::Acquire) {
        host.shutdown();
        return Err(UNAVAILABLE.into());
    }
    *slot = Some(host.clone());
    Ok(host)
}

#[cfg(all(windows, feature = "embedded-mkr"))]
async fn acknowledge_pause(app: &tauri::AppHandle, inner: &Inner) -> Result<(), String> {
    use ring::rand::{SecureRandom, SystemRandom};
    let mut random = [0u8; 32];
    SystemRandom::new()
        .fill(&mut random)
        .map_err(|_| "MKR handoff unavailable.")?;
    let token: String = random.iter().map(|byte| format!("{byte:02x}")).collect();
    let (reply, wait) = tokio::sync::oneshot::channel();
    {
        let mut pending = inner
            .pending
            .lock()
            .map_err(|_| "MKR handoff unavailable.")?;
        if pending.is_some() {
            return Err("MKR handoff is already in progress.".into());
        }
        *pending = Some((token.clone(), reply));
    }
    let outcome = async {
        crate::music_native::music_pause().await?;
        app.emit_to("workspace", "mkr-pause-request", json!({"token":token}))
            .map_err(|_| "MKR workspace unavailable.")?;
        match tokio::time::timeout(std::time::Duration::from_secs(4), wait).await {
            Ok(Ok(true)) => Ok(()),
            _ => Err("Other audio did not acknowledge pausing. MKR playback was cancelled.".into()),
        }
    }
    .await;
    if let Ok(mut pending) = inner.pending.lock() {
        if pending.as_ref().is_some_and(|(value, _)| value == &token) {
            pending.take();
        }
    }
    outcome
}

#[tauri::command]
pub async fn mkr_request(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Managed>,
    command: Command,
    payload: Option<Value>,
) -> Result<Value, String> {
    workspace(&window)?;
    let args = arguments(command, payload)?;
    #[cfg(all(windows, feature = "embedded-mkr"))]
    {
        let inner = state.0.clone();
        let available = host(&app, inner.clone()).await;
        if matches!(command, Command::Capabilities) {
            return Ok(
                json!({"protocol":1,"platform":"windows-native","embedded":available.is_ok()}),
            );
        }
        let host = available?;
        let ticket = host.handoff_ticket();
        if matches!(command, Command::Play | Command::Previous | Command::Next) {
            acknowledge_pause(&app, &inner).await?;
        }
        tauri::async_runtime::spawn_blocking(move || {
            let output = match command {
                Command::Search => {
                    return serde_json::to_value(
                        host.search(args.query.as_deref().ok_or("Enter a music search.")?)?,
                    )
                    .map_err(|_| "MKR results unavailable.".into())
                }
                Command::Play => host.play_after_handoff(args.id.as_deref(), ticket)?,
                Command::Previous => host.step_after_handoff(false, ticket)?,
                Command::Next => host.step_after_handoff(true, ticket)?,
                Command::Pause => host.pause()?,
                Command::Seek => host.seek(args.position.ok_or("Choose a playback position.")?)?,
                Command::Open | Command::Hide | Command::Status => host.status()?,
                Command::Capabilities => return Err("Unexpected capability operation.".into()),
            };
            serde_json::to_value(output).map_err(|_| "MKR playback state unavailable.".into())
        })
        .await
        .map_err(|_| "MKR operation did not complete.".to_owned())?
    }
    #[cfg(not(all(windows, feature = "embedded-mkr")))]
    {
        let _ = (app, state, args);
        if matches!(command, Command::Capabilities) {
            Ok(json!({"protocol":1,"embedded":false}))
        } else {
            Err(UNAVAILABLE.into())
        }
    }
}
pub fn shutdown(state: &Managed) {
    if let Ok(mut pending) = state.0.pending.lock() {
        pending.take();
    }
    #[cfg(all(windows, feature = "embedded-mkr"))]
    {
        state
            .0
            .stopped
            .store(true, std::sync::atomic::Ordering::Release);
        if let Ok(mut slot) = state.0.host.lock() {
            if let Some(host) = slot.take() {
                host.shutdown();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn handoff_rejects_wrong_and_replayed_tokens_and_preserves_failed_pause() {
        let inner = Inner::default();
        let (send, mut receive) = tokio::sync::oneshot::channel();
        *inner.pending.lock().unwrap() = Some(("fixture-token".into(), send));
        assert!(acknowledge(&inner, "wrong-token", true).is_err());
        assert!(inner.pending.lock().unwrap().is_some());
        acknowledge(&inner, "fixture-token", false).unwrap();
        assert!(
            !receive.try_recv().unwrap(),
            "failed pause must not become successful acknowledgement"
        );
        assert!(acknowledge(&inner, "fixture-token", true).is_err());
    }
    #[test]
    fn commands_reject_executable_url_and_unexpected_payload_fields() {
        assert!(arguments(
            Command::Search,
            Some(json!({"query":"song","url":"https://example.com"}))
        )
        .is_err());
        assert!(arguments(
            Command::Play,
            Some(json!({"id":"song","executable":"java.exe"}))
        )
        .is_err());
        assert!(arguments(Command::Status, Some(json!({"path":"runtime"}))).is_err());
        assert!(arguments(Command::Search, Some(json!({"query":"\u{0000}"}))).is_err());
        assert!(arguments(Command::Seek, Some(json!({"positionMs":-1}))).is_err());
        assert!(arguments(
            Command::Seek,
            Some(json!({"positionMs":9_007_199_254_740_992u64}))
        )
        .is_err());
        assert!(
            arguments(Command::Search, Some(json!({"query":" song "})))
                .unwrap()
                .query
                .as_deref()
                == Some("song")
        );
        assert!(arguments(Command::Pause, None).is_ok());
    }
}
