//! Optional, explicitly started, local-only OmniRoute service. All secrets and
//! process ownership remain native; the webview sees only redacted status.
use crate::{
    managed_component::{self, Progress},
    managed_process::OwnedProcess,
    managed_proxy::Proxy,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::{atomic::Ordering, Arc, Mutex, Weak},
    time::Duration,
};
#[derive(Default)]
pub struct Controller {
    pub progress: Arc<Progress>,
    operation: tokio::sync::Mutex<()>,
    commit: Mutex<()>,
    running: Mutex<Option<Running>>,
    error: Mutex<String>,
}
#[derive(Clone, Default)]
pub struct Managed(pub Arc<Controller>);
struct Running {
    process: OwnedProcess,
    proxy: Proxy,
    url: String,
    key: String,
    session: PathBuf,
    port: u16,
}
impl Drop for Running {
    fn drop(&mut self) {
        // End the gateway before releasing the provider socket: it must never
        // reconnect with a prompt/key to a replacement listener during teardown.
        self.process.terminate();
        self.proxy.stop();
    }
}
struct Route {
    owner: Weak<Controller>,
    url: String,
    key: String,
}
static ROUTE: Mutex<Option<Route>> = Mutex::new(None);
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    installed: bool,
    repairable: bool,
    recovery_pending: bool,
    running: bool,
    version: &'static str,
    phase: String,
    done: u64,
    total: u64,
    error: String,
}
pub fn workspace(label: &str) -> Result<(), String> {
    if label != "workspace" {
        Err("Manage OmniRoute from the workspace.".into())
    } else {
        Ok(())
    }
}
fn home() -> PathBuf {
    crate::settings::local_dir().join("managed-omniroute")
}
fn status(c: &Controller) -> Status {
    let running = c
        .running
        .lock()
        .unwrap()
        .as_ref()
        .is_some_and(|r| r.process.owns_listener(r.port));
    Status {
        repairable: std::fs::symlink_metadata(home().join("component")).is_ok()
            || crate::managed_repair::pending(&home()),
        recovery_pending: crate::managed_repair::pending(&home()),
        installed: managed_component::read_manifest(
            &home().join("component/component.json"),
            managed_component::EXPECTED_MANIFEST,
        )
        .is_ok(),
        running,
        version: "3.8.51",
        phase: c.progress.phase.lock().unwrap().clone(),
        done: c.progress.done.load(Ordering::Relaxed),
        total: c.progress.total.load(Ordering::Relaxed),
        error: c.error.lock().unwrap().clone(),
    }
}
pub fn current_route(url: &str, key: Option<&str>) -> bool {
    let lock = ROUTE.lock().unwrap();
    lock.as_ref().is_some_and(|r| {
        r.url == url
            && Some(r.key.as_str()) == key
            && r.owner.upgrade().is_some_and(|c| {
                c.running
                    .lock()
                    .unwrap()
                    .as_ref()
                    .is_some_and(|p| p.process.owns_listener(p.port))
            })
    })
}
pub fn shutdown(c: &Controller) {
    let _commit = c.commit.lock().unwrap();
    c.progress.epoch.fetch_add(1, Ordering::SeqCst);
    ROUTE.lock().unwrap().take();
    let previous = c.running.lock().unwrap().take();
    drop(previous);
    *c.progress.phase.lock().unwrap() = "Stopped".into();
}
#[tauri::command]
pub fn omniroute_status(
    window: tauri::WebviewWindow,
    state: tauri::State<Managed>,
) -> Result<Status, String> {
    workspace(window.label())?;
    Ok(status(&state.0))
}
#[tauri::command]
pub fn omniroute_stop(
    window: tauri::WebviewWindow,
    state: tauri::State<Managed>,
) -> Result<Status, String> {
    workspace(window.label())?;
    shutdown(&state.0);
    Ok(status(&state.0))
}
#[tauri::command]
pub fn omniroute_cancel(
    window: tauri::WebviewWindow,
    state: tauri::State<Managed>,
) -> Result<Status, String> {
    workspace(window.label())?;
    let _commit = state.0.commit.lock().unwrap();
    state.0.progress.epoch.fetch_add(1, Ordering::SeqCst);
    Ok(status(&state.0))
}
#[tauri::command]
pub fn omniroute_pick_component(window: tauri::WebviewWindow) -> Result<Option<String>, String> {
    workspace(window.label())?;
    #[cfg(windows)]
    unsafe {
        use windows::{
            core::{PCWSTR, PWSTR},
            Win32::UI::Controls::Dialogs::{
                GetOpenFileNameW, OFN_FILEMUSTEXIST, OFN_NOCHANGEDIR, OFN_PATHMUSTEXIST,
                OPENFILENAMEW,
            },
        };
        let mut file = vec![0u16; 32768];
        let filter = "AnF component manifest\0component.json\0\0"
            .encode_utf16()
            .collect::<Vec<_>>();
        let title = "Choose extracted OmniRoute component.json\0"
            .encode_utf16()
            .collect::<Vec<_>>();
        let mut open = OPENFILENAMEW::default();
        open.lStructSize = std::mem::size_of_val(&open) as u32;
        open.lpstrFile = PWSTR(file.as_mut_ptr());
        open.nMaxFile = file.len() as u32;
        open.lpstrFilter = PCWSTR(filter.as_ptr());
        open.lpstrTitle = PCWSTR(title.as_ptr());
        open.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
        if GetOpenFileNameW(&mut open).as_bool() {
            let len = file.iter().position(|n| *n == 0).unwrap_or(file.len());
            return Ok(Some(String::from_utf16_lossy(&file[..len])));
        }
        Ok(None)
    }
    #[cfg(not(windows))]
    {
        Err("The reviewed gateway component currently supports Windows x64.".into())
    }
}
#[tauri::command]
pub async fn omniroute_install(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Managed>,
    manifest: String,
) -> Result<Status, String> {
    workspace(window.label())?;
    let c = state.0.clone();
    let _operation = c
        .operation
        .try_lock()
        .map_err(|_| "A gateway operation is already running.")?;
    if c.running.lock().unwrap().is_some() {
        return Err("Stop the managed gateway before installing its component.".into());
    }
    let token = c.progress.epoch.fetch_add(1, Ordering::SeqCst) + 1;
    *c.progress.phase.lock().unwrap() = "Importing and verifying component".into();
    *c.error.lock().unwrap() = String::new();
    let progress = c.progress.clone();
    let result = tokio::task::spawn_blocking(move || {
        crate::managed_repair::recover(
            &home(),
            managed_component::EXPECTED_MANIFEST,
            &progress,
            token,
        )?;
        managed_component::install(&PathBuf::from(manifest), &home(), progress, token)
    })
    .await
    .map_err(|_| "Component import stopped.".to_string())
    .and_then(|r| r);
    match result {
        Ok(()) => *c.progress.phase.lock().unwrap() = "Installed; stopped".into(),
        Err(e) => {
            *c.error.lock().unwrap() = e.clone();
            *c.progress.phase.lock().unwrap() = "Import did not complete".into();
            return Err(e);
        }
    }
    Ok(status(&c))
}
#[tauri::command]
pub async fn omniroute_repair(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Managed>,
    manifest: String,
) -> Result<Status, String> {
    workspace(window.label())?;
    let c = state.0.clone();
    let _operation = c
        .operation
        .try_lock()
        .map_err(|_| "A gateway operation is already running.")?;
    if c.running.lock().unwrap().is_some() {
        return Err("Stop the managed gateway before repairing its component.".into());
    }
    let token = c.progress.epoch.fetch_add(1, Ordering::SeqCst) + 1;
    *c.progress.phase.lock().unwrap() = "Staging pinned repair".into();
    *c.error.lock().unwrap() = String::new();
    let progress = c.progress.clone();
    let result = tokio::task::spawn_blocking(move || {
        crate::managed_repair::repair(&PathBuf::from(manifest), &home(), progress, token)
    })
    .await
    .map_err(|_| "Component repair stopped.".to_string())
    .and_then(|r| r);
    match result {
        Ok(()) => *c.progress.phase.lock().unwrap() = "Repaired; stopped".into(),
        Err(e) => {
            *c.error.lock().unwrap() = e.clone();
            *c.progress.phase.lock().unwrap() = "Repair did not complete".into();
            return Err(e);
        }
    }
    Ok(status(&c))
}
#[derive(Serialize, Deserialize)]
struct Secrets {
    password: String,
    jwt: String,
    api: String,
    storage: String,
}
fn secrets() -> Result<Secrets, String> {
    use sha2::{Digest, Sha256};
    let account = format!("{:x}", Sha256::digest(home().to_string_lossy().as_bytes()));
    let entry = keyring::Entry::new("AnF managed OmniRoute", &account)
        .map_err(|_| "Cannot open the private gateway credential store.")?;
    match entry.get_password() {
        Ok(text) => {
            let value: Secrets = serde_json::from_str(&text).map_err(|_| {
                "Managed gateway credentials could not be read; no replacement was generated."
            })?;
            if [&value.password, &value.jwt, &value.api, &value.storage]
                .iter()
                .all(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()))
            {
                return Ok(value);
            }
            return Err(
                "Invalid private gateway credentials; no replacement was generated.".into(),
            );
        }
        Err(keyring::Error::NoEntry) => {}
        Err(_) => {
            return Err(
                "Private gateway credentials are unavailable; no replacement was generated.".into(),
            )
        }
    }
    let value = Secrets {
        password: crate::local_ai::random_key()?,
        jwt: crate::local_ai::random_key()?,
        api: crate::local_ai::random_key()?,
        storage: crate::local_ai::random_key()?,
    };
    entry
        .set_password(
            &serde_json::to_string(&value).map_err(|_| "Cannot encode gateway credentials.")?,
        )
        .map_err(|_| "Cannot protect private gateway credentials.")?;
    Ok(value)
}
fn free_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|_| "Cannot allocate private gateway port.")?;
    Ok(listener
        .local_addr()
        .map_err(|_| "Cannot inspect gateway port.")?
        .port())
}
fn environment(
    session: &std::path::Path,
    port: u16,
    live: u16,
    s: &Secrets,
) -> Vec<(String, String)> {
    let mut env = Vec::new();
    for name in ["SystemRoot", "WINDIR", "COMSPEC"] {
        if let Ok(value) = std::env::var(name) {
            env.push((name.into(), value));
        }
    }
    let base = session.to_string_lossy().to_string();
    for name in [
        "DATA_DIR",
        "OMNIROUTE_DATA_DIR",
        "OMNIROUTE_PLUGINS_DIR",
        "USERPROFILE",
        "HOME",
        "APPDATA",
        "LOCALAPPDATA",
        "XDG_CONFIG_HOME",
        "XDG_DATA_HOME",
        "TEMP",
        "TMP",
    ] {
        env.push((name.into(), base.clone()));
    }
    for name in [
        "HOSTNAME",
        "HOST",
        "OMNIROUTE_SERVER_HOST",
        "API_HOST",
        "LIVE_WS_HOST",
    ] {
        env.push((name.into(), "127.0.0.1".into()));
    }
    for (name, value) in [
        ("PORT", port.to_string()),
        // Identical explicit ports disable OmniRoute's optional API relay.
        ("OMNIROUTE_PORT", port.to_string()),
        ("API_PORT", port.to_string()),
        ("DASHBOARD_PORT", port.to_string()),
        (
            "OMNIROUTE_PUBLIC_BASE_URL",
            format!("http://127.0.0.1:{port}"),
        ),
        ("LIVE_WS_PORT", live.to_string()),
        ("JWT_SECRET", s.jwt.clone()),
        ("API_KEY_SECRET", s.api.clone()),
        ("STORAGE_ENCRYPTION_KEY", s.storage.clone()),
        ("INITIAL_PASSWORD", s.password.clone()),
        ("NODE_ENV", "production".into()),
        ("OMNIROUTE_ENABLE_LIVE_WS", "false".into()),
        ("OMNIROUTE_DISABLE_BACKGROUND_SERVICES", "true".into()),
        ("REQUIRE_API_KEY", "true".into()),
        ("NO_PROXY", "127.0.0.1,localhost,::1".into()),
        ("no_proxy", "127.0.0.1,localhost,::1".into()),
        ("NO_UPDATE_NOTIFIER", "1".into()),
        ("OMNIROUTE_NO_UPDATE_NOTIFIER", "1".into()),
        ("NEXT_TELEMETRY_DISABLED", "1".into()),
        ("DO_NOT_TRACK", "1".into()),
        ("OMNIROUTE_ALLOW_LOCAL_PROVIDER_URLS", "true".into()),
        ("PRICING_SYNC_ENABLED", "false".into()),
        ("ARENA_ELO_SYNC_ENABLED", "false".into()),
        ("OPENROUTER_PROVIDER_STATS_SYNC_ENABLED", "false".into()),
        ("MODELS_DEV_SYNC_ENABLED", "false".into()),
    ] {
        env.push((name.into(), value));
    }
    env
}
async fn api(
    owner: crate::managed_process::ProcessIdentity,
    port: u16,
    path: &str,
    body: Value,
    cookie: Option<&str>,
    csrf: Option<&str>,
) -> Result<(Value, Option<String>), String> {
    let origin = format!("http://127.0.0.1:{port}");
    let mut headers = vec![
        ("Origin", origin.as_str()),
        ("Content-Type", "application/json"),
    ];
    if let Some(cookie) = cookie {
        headers.push(("Cookie", cookie));
    }
    if let Some(csrf) = csrf {
        headers.push(("x-omniroute-csrf", csrf));
    }
    let response = crate::managed_http::request(
        &owner,
        port,
        "POST",
        path,
        &headers,
        &serde_json::to_vec(&body).map_err(|_| "Invalid gateway setup request.")?,
        Duration::from_secs(15),
    )
    .await?;
    if !(200..300).contains(&response.status) {
        let step = match path {
            "/api/auth/login" => "sign-in",
            "/api/provider-nodes" => "local provider setup",
            "/api/providers" => "local connection setup",
            "/api/provider-models" => "model registration",
            "/api/keys" => "private client setup",
            _ => "local route check",
        };
        return Err(format!(
            "Managed gateway {step} failed (HTTP {}). No external route was changed.",
            response.status
        ));
    }
    let cookie = response
        .headers
        .iter()
        .filter(|(k, _)| k == "set-cookie")
        .map(|(_, v)| v.split(';').next().unwrap_or(""))
        .collect::<Vec<_>>()
        .join("; ");
    let value = serde_json::from_slice(&response.body)
        .map_err(|_| "Invalid managed gateway setup response.")?;
    Ok((value, (!cookie.is_empty()).then_some(cookie)))
}
async fn csrf_token(
    owner: crate::managed_process::ProcessIdentity,
    port: u16,
    cookie: &str,
) -> Result<String, String> {
    let origin = format!("http://127.0.0.1:{port}");
    let response = crate::managed_http::request(
        &owner,
        port,
        "GET",
        "/api/auth/csrf",
        &[("Origin", origin.as_str()), ("Cookie", cookie)],
        &[],
        Duration::from_secs(15),
    )
    .await?;
    if response.status != 200 {
        return Err(format!(
            "Managed gateway private setup authorization failed (HTTP {}).",
            response.status
        ));
    }
    let value: Value = serde_json::from_slice(&response.body)
        .map_err(|_| "Invalid private setup authorization response.")?;
    value["token"]
        .as_str()
        .filter(|t| !t.is_empty() && t.len() <= 1024 && t.bytes().all(|b| b.is_ascii_graphic()))
        .map(str::to_string)
        .ok_or("Managed gateway did not issue a valid private setup token.".into())
}
async fn wait_cancellation(progress: &Progress, token: u64) {
    while progress.check(token).is_ok() {
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}
/// No saved external connection or secret is changed by this explicit route.
pub async fn generate(body: Value) -> Result<Value, String> {
    let (owner, port, key) = {
        let route = ROUTE.lock().unwrap();
        let route = route
            .as_ref()
            .ok_or("Start the managed gateway first. No fallback occurred.")?;
        let controller = route.owner.upgrade().ok_or("Managed gateway stopped.")?;
        let running = controller.running.lock().unwrap();
        let running = running.as_ref().ok_or("Managed gateway stopped.")?;
        (running.process.identity()?, running.port, route.key.clone())
    };
    let auth = format!("Bearer {key}");
    let response = crate::managed_http::request(
        &owner,
        port,
        "POST",
        "/v1/chat/completions",
        &[
            ("Authorization", auth.as_str()),
            ("Content-Type", "application/json"),
        ],
        &serde_json::to_vec(&body).map_err(|_| "Invalid managed generation request.")?,
        Duration::from_secs(180),
    )
    .await?;
    if !(200..300).contains(&response.status) {
        return Err(format!(
            "Managed local gateway returned HTTP {}. No fallback occurred.",
            response.status
        ));
    }
    serde_json::from_slice(&response.body)
        .map_err(|_| "Invalid managed local generation response.".into())
}
#[tauri::command]
pub async fn omniroute_start(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, Managed>,
) -> Result<Status, String> {
    workspace(window.label())?;
    let c = state.0.clone();
    let _operation = c
        .operation
        .try_lock()
        .map_err(|_| "A gateway operation is already running.")?;
    let token = {
        let _commit = c.commit.lock().unwrap();
        let live = c
            .running
            .lock()
            .unwrap()
            .as_ref()
            .is_some_and(|r| r.process.owns_listener(r.port));
        if live {
            return Ok(status(&c));
        }
        // A crashed owned service must not leave its old provider adapter behind.
        ROUTE.lock().unwrap().take();
        let previous = c.running.lock().unwrap().take();
        drop(previous);
        c.progress.epoch.fetch_add(1, Ordering::SeqCst) + 1
    };
    *c.error.lock().unwrap() = String::new();
    *c.progress.phase.lock().unwrap() = "Verifying installed runtime".into();
    let root = home().join("component");
    let verify = root.clone();
    let progress = c.progress.clone();
    tokio::task::spawn_blocking(move || {
        crate::managed_repair::recover(
            verify
                .parent()
                .ok_or("Invalid installed component directory.")?,
            managed_component::EXPECTED_MANIFEST,
            &progress,
            token,
        )?;
        managed_component::verify(
            &verify,
            managed_component::EXPECTED_MANIFEST,
            &progress,
            token,
        )
    })
    .await
    .map_err(|_| "Component verification stopped.")??;
    c.progress.check(token)?;
    let s = secrets()?;
    let session = home().join("sessions").join(crate::local_ai::random_key()?);
    managed_component::no_links(&session)?;
    std::fs::create_dir_all(&session).map_err(|_| "Cannot create private gateway profile.")?;
    crate::managed_process::private_directory(&session)?;
    let port = free_port()?;
    let live = free_port()?;
    let proxy = Proxy::start(app).await?;
    *c.progress.phase.lock().unwrap() = "Starting private loopback gateway".into();
    let process = OwnedProcess::start(
        &root.join("node/node.exe"),
        &root.join("runtime/dist/server-ws.mjs"),
        &session,
        &environment(&session, port, live, &s),
    )?;
    let url = format!("http://127.0.0.1:{port}");
    let mut running = Running {
        process,
        proxy,
        url: url.clone(),
        key: String::new(),
        session,
        port,
    };
    let deadline = std::time::Instant::now() + Duration::from_secs(90);
    let setup = async {
        loop {
            c.progress.check(token)?;
            if !running.process.running() {
                return Err(
                    "Managed gateway exited during startup. Stop it and choose Repair installed component in Settings."
                        .into(),
                );
            }
            if std::time::Instant::now() > deadline {
                return Err("Managed gateway readiness timed out.".into());
            }
            if crate::managed_http::request(
                &running.process.identity()?,
                port,
                "GET",
                "/api/health",
                &[],
                &[],
                Duration::from_secs(2),
            )
            .await
            .is_ok_and(|r| r.status == 200)
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
        let (_, cookie) = api(
            running.process.identity()?,
            port,
            "/api/auth/login",
            json!({"password":s.password}),
            None,
            None,
        )
        .await?;
        let cookie = cookie.ok_or("Managed gateway authentication did not establish a session.")?;
        c.progress.check(token)?;
        let csrf = csrf_token(running.process.identity()?, port, &cookie).await?;
        c.progress.check(token)?;
        let(node,_)=api(running.process.identity()?,port,"/api/provider-nodes",json!({"name":"AnF managed local CPU","prefix":"anfmanaged","type":"openai-compatible","apiType":"chat","baseUrl":format!("http://127.0.0.1:{}/v1",running.proxy.port)}),Some(&cookie),Some(&csrf)).await?;
        let id = node["node"]["id"]
            .as_str()
            .ok_or("Managed local provider was not created.")?;
        let(connection,_)=api(running.process.identity()?,port,"/api/providers",json!({"provider":id,"name":"AnF existing local engine","apiKey":running.proxy.key,"defaultModel":"anf-local"}),Some(&cookie),Some(&csrf)).await?;
        let connection = connection["connection"]["id"]
            .as_str()
            .ok_or("Managed local connection was not created.")?;
        let (probe, _) = api(
            running.process.identity()?,
            port,
            &format!("/api/providers/{connection}/test"),
            json!({}),
            Some(&cookie),
            Some(&csrf),
        )
        .await?;
        if probe["valid"] != true {
            return Err("Managed local provider check failed. No other route was selected.".into());
        }
        c.progress.check(token)?;
        api(running.process.identity()?,port,"/api/provider-models",json!({"provider":id,"modelId":"anf-local","modelName":"AnF local CPU · Fast","max_input_tokens":8192,"max_output_tokens":768}),Some(&cookie),Some(&csrf)).await?;
        let (key, _) = api(
            running.process.identity()?,
            port,
            "/api/keys",
            json!({"name":"AnF managed client"}),
            Some(&cookie),
            Some(&csrf),
        )
        .await?;
        let key = key["key"]["key"]
            .as_str()
            .or_else(|| key["key"].as_str())
            .or_else(|| key["apiKey"].as_str())
            .ok_or("Managed gateway key was not created.")?
            .to_string();
        c.progress.check(token)?;
        running.key = key;
        Ok::<(), String>(())
    };
    let result = tokio::select! {result=setup=>result,_=wait_cancellation(&c.progress,token)=>Err("Cancelled.".to_string())};
    if let Err(e) = result {
        *c.error.lock().unwrap() = e.clone();
        *c.progress.phase.lock().unwrap() = "Startup did not complete".into();
        drop(running);
        return Err(e);
    }
    let _commit = c.commit.lock().unwrap();
    c.progress.check(token)?;
    if !running.process.owns_listener(port) {
        return Err("Managed gateway listener ownership was lost.".into());
    }
    *ROUTE.lock().unwrap() = Some(Route {
        owner: Arc::downgrade(&c),
        url: format!("{}/v1", running.url),
        key: running.key.clone(),
    });
    *c.running.lock().unwrap() = Some(running);
    *c.progress.phase.lock().unwrap() = "Running; local route configured".into();
    Ok(status(&c))
}
#[tauri::command]
pub fn omniroute_use(
    window: tauri::WebviewWindow,
    state: tauri::State<Managed>,
) -> Result<(), String> {
    workspace(window.label())?;
    if !status(&state.0).running {
        return Err("Start the managed gateway first.".into());
    }
    let (url, key) = route().ok_or("Managed gateway is not ready.")?;
    if !current_route(&url, Some(&key)) {
        return Err("Managed gateway is not ready.".into());
    }
    Ok(())
}
pub fn route() -> Option<(String, String)> {
    ROUTE
        .lock()
        .unwrap()
        .as_ref()
        .map(|r| (r.url.clone(), r.key.clone()))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn workspace_only() {
        assert!(workspace("workspace").is_ok());
        for label in ["island", "settings", ""] {
            assert!(workspace(label).is_err());
        }
    }
    #[test]
    fn child_environment_is_allowlisted_and_loopback_only() {
        let s = Secrets {
            password: "p".into(),
            jwt: "j".into(),
            api: "a".into(),
            storage: "s".into(),
        };
        let e = environment(std::path::Path::new("C:/private"), 1234, 1235, &s);
        assert!(e.contains(&(
            "OMNIROUTE_DISABLE_BACKGROUND_SERVICES".into(),
            "true".into()
        )));
        for key in ["PORT", "OMNIROUTE_PORT", "API_PORT", "DASHBOARD_PORT"] {
            assert!(e.contains(&(key.into(), "1234".into())));
        }
        assert!(e.contains(&(
            "OMNIROUTE_PUBLIC_BASE_URL".into(),
            "http://127.0.0.1:1234".into()
        )));
        for key in [
            "NODE_OPTIONS",
            "NODE_PATH",
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "ALL_PROXY",
            "PATH",
        ] {
            assert!(!e.iter().any(|(k, _)| k == key));
        }
        for key in ["HOSTNAME", "HOST", "OMNIROUTE_SERVER_HOST", "LIVE_WS_HOST"] {
            assert!(e.contains(&(key.into(), "127.0.0.1".into())));
        }
    }
    #[tokio::test]
    async fn setup_cancellation_does_not_wait_for_an_http_deadline() {
        let p = Progress::default();
        let waiting = async {
            tokio::time::timeout(Duration::from_secs(1), wait_cancellation(&p, 0))
                .await
                .unwrap();
        };
        let cancel = async {
            tokio::time::sleep(Duration::from_millis(10)).await;
            p.epoch.fetch_add(1, Ordering::SeqCst);
        };
        tokio::join!(waiting, cancel);
    }
}
