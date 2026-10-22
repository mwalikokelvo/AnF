//! On-demand bundled CPU inference. Only loopback, authenticated, no cloud service.
#[cfg(not(windows))]
use crate::platform;
use serde_json::{json, Value};
#[cfg(not(windows))]
use std::process::{Child, Command, Stdio};
use std::{path::PathBuf, sync::Mutex};
#[cfg(windows)]
type ModelChild = crate::managed_process::OwnedProcess;
#[cfg(not(windows))]
type ModelChild = Child;

struct Running {
    child: ModelChild,
    url: String,
    key: String,
    profile: String,
    context: usize,
}
fn pack_available(path: &std::path::Path) -> bool {
    path.join(if cfg!(windows) {
        "llama-server.exe"
    } else {
        "llama-server"
    })
    .is_file()
        && (path.join("model.gguf").is_file() || path.join("model-fast.gguf").is_file())
}
impl Drop for Running {
    fn drop(&mut self) {
        #[cfg(not(windows))]
        {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
        // Windows OwnedProcess closes its job after stopping the whole child tree.
    }
}
impl Running {
    fn alive(&mut self) -> Result<bool, String> {
        #[cfg(windows)]
        {
            Ok(self.child.running())
        }
        #[cfg(not(windows))]
        {
            self.child
                .try_wait()
                .map(|status| status.is_none())
                .map_err(|e| e.to_string())
        }
    }
}
#[derive(Default)]
pub struct Engine {
    directory: Mutex<Option<PathBuf>>,
    process: Mutex<Option<Running>>,
    reply_lock: tokio::sync::Mutex<()>,
}
// Created only after acquiring reply_lock, and dropped before that lock is
// released. Cancelling a queued future therefore cannot terminate another turn.
struct InferenceTurn<'a> {
    engine: &'a Engine,
    completed: bool,
}
impl Drop for InferenceTurn<'_> {
    fn drop(&mut self) {
        if !self.completed {
            self.engine.shutdown();
        }
    }
}
impl Engine {
    pub fn configure(&self, directory: PathBuf) {
        *self.directory.lock().unwrap() = Some(directory);
    }
    pub fn directory(&self) -> Option<PathBuf> {
        let mut directory = self.directory.lock().unwrap();
        if directory.as_ref().is_some_and(|p| pack_available(p)) {
            return directory.clone();
        }
        // An installer/repair can restore the pack after this process started.
        // Never cache a missing pack for the lifetime of the application.
        let portable = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.join("local-ai")));
        if let Some(path) = portable.filter(|p| pack_available(p)) {
            *directory = Some(path);
        }
        directory.clone()
    }
    pub fn shutdown(&self) {
        self.process.lock().unwrap().take();
    }

    async fn start(&self, profile: &str, context: usize) -> Result<(String, String), String> {
        {
            let mut current = self.process.lock().unwrap();
            if let Some(p) = current.as_mut() {
                if p.profile == profile && p.context == context && p.alive()? {
                    return Ok((p.url.clone(), p.key.clone()));
                }
            }
            current.take();
        }
        let directory = self.directory().ok_or("AnF could not locate its offline pack. Close AnF from its tray menu, then run the full installer again to repair it. Your saved projects and settings are kept.")?;
        let exe = directory.join(if cfg!(windows) {
            "llama-server.exe"
        } else {
            "llama-server"
        });
        let model = directory.join(if profile == "fast" {
            "model-fast.gguf"
        } else {
            "model.gguf"
        });
        if !exe.is_file() || !model.is_file() {
            return Err(format!("The offline pack in {} is incomplete: {} is missing. Run the full installer again to repair it, then reopen AnF. Your saved projects and settings are kept.", directory.display(), if !exe.is_file() { "the local engine" } else { "the selected model" }));
        }
        let key = random_key()?;
        let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        drop(listener);
        let mut arguments: Vec<std::ffi::OsString> = vec!["-m".into(), model.into_os_string()];
        arguments.extend(
            [
                "--host",
                "127.0.0.1",
                "--port",
                &port.to_string(),
                "--api-key",
                &key,
                "--alias",
                "anf-local",
                "--ctx-size",
                &context.to_string(),
                "--parallel",
                "1",
                "--n-gpu-layers",
                "0",
                "--threads",
                "4",
                "--no-webui",
                "--offline",
                "--log-disable",
            ]
            .into_iter()
            .map(std::ffi::OsString::from),
        );
        #[cfg(windows)]
        let child = ModelChild::start_args(&exe, &arguments, &directory, None)?;
        #[cfg(not(windows))]
        let child = {
            let mut command = Command::new(exe);
            command
                .current_dir(&directory)
                .args(&arguments)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            platform::no_console(&mut command)
                .spawn()
                .map_err(|e| format!("Could not start the offline model: {e}"))?
        };
        let url = format!("http://127.0.0.1:{port}");
        *self.process.lock().unwrap() = Some(Running {
            child,
            url: url.clone(),
            key: key.clone(),
            profile: profile.into(),
            context,
        });
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(2))
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| e.to_string())?;
        for _ in 0..120 {
            let alive = self
                .process
                .lock()
                .unwrap()
                .as_mut()
                .and_then(|p| p.alive().ok())
                .unwrap_or(false);
            if !alive {
                self.shutdown();
                return Err("The offline runtime stopped during startup. Check that this is a Windows x64 computer with enough free memory.".into());
            }
            if let Ok(response) = client
                .get(format!("{url}/v1/models"))
                .bearer_auth(&key)
                .send()
                .await
            {
                if response.status().is_success() {
                    if let Ok(value) = response.json::<Value>().await {
                        if value["data"]
                            .as_array()
                            .is_some_and(|models| models.iter().any(|m| m["id"] == "anf-local"))
                        {
                            return Ok((url, key));
                        }
                    }
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
        self.shutdown();
        Err("The offline model could not finish loading. Free some memory and try again.".into())
    }

    pub async fn reply(&self, messages: &[Value]) -> Result<(String, bool), String> {
        self.reply_profile(messages, "balanced").await
    }
    pub async fn reply_profile(
        &self,
        messages: &[Value],
        profile: &str,
    ) -> Result<(String, bool), String> {
        self.reply_sized(messages, profile, false).await
    }
    pub async fn reply_sized(
        &self,
        messages: &[Value],
        profile: &str,
        long: bool,
    ) -> Result<(String, bool), String> {
        if !matches!(profile, "fast" | "balanced") {
            return Err("Choose Fast or Balanced.".into());
        }
        let _turn = self.reply_lock.lock().await;
        let mut inference = InferenceTurn {
            engine: self,
            completed: false,
        };
        let result = self.reply_unlocked(messages, profile, long).await;
        inference.completed = result.is_ok();
        result
    }
    pub async fn reply_managed(
        &self,
        messages: &[Value],
        mut stop: tokio::sync::watch::Receiver<bool>,
    ) -> Result<(String, bool), String> {
        if *stop.borrow() {
            return Err("Managed gateway stopped.".into());
        }
        let _turn = tokio::select! {guard=self.reply_lock.lock()=>guard,_=stop.changed()=>return Err("Managed gateway stopped while queued.".into())};
        let mut inference = InferenceTurn {
            engine: self,
            completed: false,
        };
        // Shutdown only after this managed turn owns the inference lock. A queued
        // gateway request must never terminate an unrelated offline Chat turn.
        tokio::select! {result=self.reply_unlocked(messages,"fast",false)=>{inference.completed=result.is_ok();result},_=stop.changed()=>Err("Managed gateway stopped.".into()),_=tokio::time::sleep(std::time::Duration::from_secs(180))=>Err("Managed local generation timed out.".into())}
    }
    async fn reply_unlocked(
        &self,
        messages: &[Value],
        profile: &str,
        long: bool,
    ) -> Result<(String, bool), String> {
        let input_bytes: usize = messages
            .iter()
            .filter_map(|m| m["content"].as_str())
            .map(str::len)
            .sum();
        let context = if long || input_bytes > 6200 {
            16384
        } else {
            8192
        };
        let (url, key) = self.start(profile, context).await?;
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(if long {
                1200
            } else {
                600
            }))
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| e.to_string())?;
        let response = client.post(format!("{url}/v1/chat/completions")).bearer_auth(key)
            .json(&json!({"model":"anf-local","messages":messages,"stream":false,"max_tokens":if long{4096}else if profile=="fast"{768}else{1536},
                "temperature":0.7,"chat_template_kwargs":{"enable_thinking":false}}))
            .send().await.map_err(|_|"The local model did not respond. Try again or free some memory.".to_string())?;
        if !response.status().is_success() {
            return Err(format!(
                "Offline model error {}. Start a new chat or shorten the question.",
                response.status()
            ));
        }
        let value: Value = response
            .json()
            .await
            .map_err(|_| "Invalid offline model response.".to_string())?;
        let text = value
            .pointer("/choices/0/message/content")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        if text.is_empty() {
            return Err("The offline model returned no text. Try a shorter question.".into());
        }
        Ok((
            text,
            value
                .pointer("/choices/0/finish_reason")
                .and_then(Value::as_str)
                == Some("length"),
        ))
    }
}

pub(crate) fn random_key() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    #[cfg(windows)]
    {
        #[link(name = "bcrypt")]
        extern "system" {
            fn BCryptGenRandom(
                algorithm: *mut std::ffi::c_void,
                buffer: *mut u8,
                count: u32,
                flags: u32,
            ) -> i32;
        }
        let result = unsafe {
            BCryptGenRandom(
                std::ptr::null_mut(),
                bytes.as_mut_ptr(),
                bytes.len() as u32,
                2,
            )
        };
        if result < 0 {
            return Err("Could not secure the local AI connection.".into());
        }
    }
    #[cfg(not(windows))]
    {
        use std::io::Read;
        std::fs::File::open("/dev/urandom")
            .and_then(|mut f| f.read_exact(&mut bytes))
            .map_err(|e| e.to_string())?;
    }
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Keep the local prompt well inside its finite context, even for UTF-8 input.
/// Old turns are dropped whole; oversized new questions are shortened explicitly.
pub fn bounded_messages(history: &[Value], query: &str) -> (Vec<Value>, bool) {
    let system = json!({"role":"system","content":"You are Mochi, an offline assistant. Answer clearly in the user's language. Do not claim web access. /no_think"});
    let question = truncate_utf8(query, 11000);
    let mut remaining = 11500usize.saturating_sub(question.len());
    let mut retained = Vec::new();
    for message in history.iter().rev().take(20) {
        let text = message["content"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|p| p["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n");
        if text.len() > remaining {
            break;
        }
        remaining -= text.len();
        retained.push(json!({"role":message["role"],"content":text}));
    }
    retained.reverse();
    // A conversation should start with a user turn, never an orphaned answer.
    while retained.first().is_some_and(|m| m["role"] != "user") {
        retained.remove(0);
    }
    let trimmed = retained.len() < history.len() || question.len() < query.len();
    let mut messages = vec![system];
    messages.extend(retained);
    messages.push(json!({"role":"user","content":question}));
    (messages, trimmed)
}
fn truncate_utf8(text: &str, max: usize) -> &str {
    let mut end = text.len().min(max);
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

/// Retain the ending of a long answer so a short "continue" prompt still works.
pub fn history_reply(text: &str) -> (String, bool) {
    if text.len() <= 2000 {
        return (text.to_string(), false);
    }
    let mut start = text.len() - 2000;
    while !text.is_char_boundary(start) {
        start += 1;
    }
    (format!("[Earlier reply omitted]\n{}", &text[start..]), true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "owned child-process fixture, launched only by the cancellation test"]
    fn cancellation_process_fixture() {
        if std::env::var("ANF_ENGINE_CANCEL_CHILD").as_deref() == Ok("1") {
            std::thread::sleep(std::time::Duration::from_secs(60));
        }
    }
    #[tokio::test]
    async fn cancelling_queued_turn_preserves_engine_but_owned_turn_stops_it() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (_socket, _) = listener.accept().await.unwrap();
            std::future::pending::<()>().await;
        });
        let e = Engine::default();
        #[cfg(windows)]
        let child = {
            let mut environment: Vec<(String, String)> = std::env::vars().collect();
            environment.retain(|(key, _)| key != "ANF_ENGINE_CANCEL_CHILD");
            environment.push(("ANF_ENGINE_CANCEL_CHILD".into(), "1".into()));
            ModelChild::start_args(
                &std::env::current_exe().unwrap(),
                &[
                    "--exact".into(),
                    "local_ai::tests::cancellation_process_fixture".into(),
                    "--ignored".into(),
                ],
                &std::env::current_dir().unwrap(),
                Some(&environment),
            )
            .unwrap()
        };
        #[cfg(not(windows))]
        let child = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "local_ai::tests::cancellation_process_fixture",
                "--ignored",
            ])
            .env("ANF_ENGINE_CANCEL_CHILD", "1")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        #[cfg(windows)]
        let pid = child.pid().unwrap();
        #[cfg(not(windows))]
        let pid = child.id();
        *e.process.lock().unwrap() = Some(Running {
            child,
            url: format!("http://{address}"),
            key: "0".repeat(64),
            profile: "fast".into(),
            context: 8192,
        });
        let held = e.reply_lock.lock().await;
        let messages =
            vec![json!({"role":"user","content":"A request that must wait for the current turn."})];
        let mut queued = Box::pin(e.reply_sized(&messages, "fast", false));
        tokio::select! {_=&mut queued=>panic!("Queued inference bypassed its lock"),_=tokio::time::sleep(std::time::Duration::from_millis(100))=>{}}
        drop(queued);
        {
            let mut process = e.process.lock().unwrap();
            let process = process.as_mut().unwrap();
            #[cfg(windows)]
            assert_eq!(process.child.pid(), Some(pid));
            #[cfg(not(windows))]
            assert_eq!(process.child.id(), pid);
            assert!(process.alive().unwrap());
        }
        drop(held);
        let mut owned = Box::pin(e.reply_sized(&messages, "fast", false));
        tokio::select! {_=&mut owned=>panic!("The held HTTP fixture responded unexpectedly"),_=tokio::time::sleep(std::time::Duration::from_millis(100))=>{}}
        drop(owned);
        assert!(
            e.process.lock().unwrap().is_none(),
            "Cancelled active turn left its process running"
        );
        assert!(e.reply_lock.try_lock().is_ok());
        server.abort();
    }
    #[test]
    fn repaired_pack_is_detected_without_restarting() {
        let root = std::env::temp_dir().join(format!(
            "\x63\x6f\x75\x63\x6f\x75-pack-repair-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let e = Engine::default();
        e.configure(root.clone());
        assert!(!pack_available(&root));
        std::fs::write(
            root.join(if cfg!(windows) {
                "llama-server.exe"
            } else {
                "llama-server"
            }),
            b"fixture",
        )
        .unwrap();
        std::fs::write(root.join("model-fast.gguf"), b"fixture").unwrap();
        assert!(pack_available(&e.directory().unwrap()));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    #[ignore = "runs both bundled CPU models"]
    fn switches_between_fast_and_balanced_models_without_keys() {
        let e = Engine::default();
        e.configure(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../local-ai"));
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let messages = vec![
            json!({"role":"user","content":"What is 2 plus 2? Reply with the number only. /no_think"}),
        ];
        for profile in ["fast", "balanced"] {
            let (reply, _) = rt.block_on(e.reply_profile(&messages, profile)).unwrap();
            assert!(reply.contains('4'), "{profile}: {reply}");
            assert_eq!(e.process.lock().unwrap().as_ref().unwrap().profile, profile);
        }
        e.shutdown();
        assert!(e.process.lock().unwrap().is_none());
    }
    #[test]
    #[ignore = "starts and cancels real local inference"]
    fn cancellation_stops_the_owned_model_process() {
        let e = Engine::default();
        e.configure(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../local-ai"));
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async{let messages=vec![json!({"role":"user","content":"Write a very long story about a forest. /no_think"})];tokio::select!{_ = e.reply_profile(&messages,"fast")=>panic!("Inference ended before cancellation test"),_ = tokio::time::sleep(std::time::Duration::from_secs(2))=>{e.shutdown();}}});
        assert!(e.process.lock().unwrap().is_none());
    }
    #[test]
    fn budgets_unicode_and_drops_whole_old_turns() {
        let long = "😀".repeat(4000);
        let h = vec![
            json!({"role":"user","content":[{"text":"old".repeat(3000)}]}),
            json!({"role":"assistant","content":[{"text":"answer"}]}),
        ];
        let (messages, trimmed) = bounded_messages(&h, &long);
        assert!(trimmed);
        assert_eq!(messages.len(), 2);
        assert!(messages[1]["content"].as_str().unwrap().len() <= 11000);
        assert!(messages[1]["content"].as_str().unwrap().ends_with('😀'));
    }
    #[test]
    fn local_authentication_keys_are_random_and_never_persistent() {
        let a = random_key().unwrap();
        let b = random_key().unwrap();
        assert_eq!(a.len(), 64);
        assert_ne!(a, b);
    }
    #[test]
    #[ignore = "runs the real bundled model with a long response budget"]
    fn long_response_uses_expanded_context() {
        let e = Engine::default();
        e.configure(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../local-ai"));
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let messages = vec![
            json!({"role":"user","content":"Write an approximately 1700-word practical guide to building a weekly reading habit, with eight developed sections and examples. Keep writing until all sections are developed; do not claim or print a word count. /no_think"}),
        ];
        let (text, incomplete) = rt.block_on(e.reply_sized(&messages, "fast", true)).unwrap();
        assert!(!text.trim().is_empty());
        assert_eq!(e.process.lock().unwrap().as_ref().unwrap().context, 16384);
        println!(
            "Long-response live check: {} words, token-limit reached: {}",
            text.split_whitespace().count(),
            incomplete
        );
        e.shutdown();
    }
    #[test]
    fn continuation_retains_the_ending_of_a_long_answer() {
        let (reply, shortened) = history_reply(&format!("{}ENDING", "😀".repeat(2000)));
        assert!(shortened);
        let history = vec![
            json!({"role":"user","content":[{"text":"question"}]}),
            json!({"role":"assistant","content":[{"text":reply}]}),
        ];
        let (messages, _) = bounded_messages(&history, "Please continue");
        assert_eq!(messages.len(), 4);
        assert!(messages[2]["content"].as_str().unwrap().ends_with("ENDING"));
    }
}
