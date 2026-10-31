// SPDX-License-Identifier: MIT
//! Private owned-process supervisor prototype. No renderer command or arbitrary
//! executable constructor is exported. Production launch accepts only a verified
//! inventory; the actual bundled inventory and AnF app wiring remain pending.
use super::Result;
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::process::{Child, Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use windows::Win32::Foundation::HANDLE;
use windows::Win32::Security::Cryptography::{BCryptGenRandom, BCRYPT_USE_SYSTEM_PREFERRED_RNG};
use windows::Win32::System::JobObjects::*;

const MAX_REPLY: usize = 1_048_576;
const MAX_REQUEST: usize = 4096;
const SESSION_ERROR: &str = "MKR catalog session stopped or returned an invalid response.";

struct Job(OwnedHandle);

fn own_job(child: &Child) -> Result<Job> {
    unsafe {
        let raw = CreateJobObjectW(None, None).map_err(|_| SESSION_ERROR)?;
        let job = Job(OwnedHandle::from_raw_handle(raw.0));
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(
            HANDLE(job.0.as_raw_handle()),
            JobObjectExtendedLimitInformation,
            &limits as *const _ as _,
            std::mem::size_of_val(&limits) as u32,
        )
        .map_err(|_| SESSION_ERROR)?;
        AssignProcessToJobObject(HANDLE(job.0.as_raw_handle()), HANDLE(child.as_raw_handle()))
            .map_err(|_| SESSION_ERROR)?;
        Ok(job)
    }
}

#[derive(Clone)]
pub struct OwnedLease {
    uri: String,
    expires_at: u64,
    session_alive: Arc<AtomicBool>,
    valid: Arc<AtomicBool>,
}
impl std::fmt::Debug for OwnedLease {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("OwnedLease(source=redacted)")
    }
}
impl OwnedLease {
    pub(super) fn valid(&self) -> bool {
        self.session_alive.load(Ordering::Acquire)
            && self.valid.load(Ordering::Acquire)
            && now_ms() < self.expires_at
    }
    pub(super) fn uri(&self) -> &str {
        &self.uri
    }
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u64::MAX as u128) as u64
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Reply {
    protocol: u32,
    id: u64,
    ok: bool,
    result: Option<Value>,
    error: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LeaseReply {
    track_id: String,
    lease_uri: String,
    content_length_bytes: u64,
    expires_at_epoch_ms: u64,
    mime_type: String,
}

#[derive(Clone, Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct CatalogTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
}
fn valid_id(value: &str) -> bool {
    value.len() == 11
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}
fn valid_text(value: &str, max: usize) -> bool {
    value.encode_utf16().count() <= max
        && !value
            .chars()
            .any(|c| matches!(c,'\u{0}'..='\u{8}'|'\u{b}'|'\u{c}'|'\u{e}'..='\u{1f}'))
}

fn bounded_frame(reader: &mut impl BufRead) -> Result<Vec<u8>> {
    let mut frame = Vec::new();
    loop {
        let available = reader.fill_buf().map_err(|_| SESSION_ERROR)?;
        if available.is_empty() {
            return Err(SESSION_ERROR.into());
        }
        let count = available
            .iter()
            .position(|b| *b == b'\n')
            .map(|n| n + 1)
            .unwrap_or(available.len());
        if frame.len() + count > MAX_REPLY + 1 {
            return Err(SESSION_ERROR.into());
        }
        let done = available[count - 1] == b'\n';
        frame.extend_from_slice(&available[..count]);
        reader.consume(count);
        if done {
            frame.pop();
            return Ok(frame);
        }
    }
}

struct Request {
    bytes: Vec<u8>,
    reply: mpsc::Sender<Result<Vec<u8>>>,
}

pub struct CatalogProcess {
    child: Arc<Mutex<Child>>,
    alive: Arc<AtomicBool>,
    requests: Option<mpsc::SyncSender<Request>>,
    worker: Option<JoinHandle<()>>,
    reader: Option<JoinHandle<()>>,
    active: Option<Arc<AtomicBool>>,
    sequence: u64,
    _job: Job,
    _resources: Option<super::resources::VerifiedRuntime>,
}
impl CatalogProcess {
    /// No renderer-provided paths/manifests. The caller must supply resources
    /// verified against its reviewed, compiled-in package inventory.
    pub fn launch(runtime: super::resources::VerifiedRuntime) -> Result<Self> {
        let command = runtime.command()?;
        let mut session = Self::spawn(command)?;
        session._resources = Some(runtime);
        Ok(session)
    }
    // Deliberately private: production callers enter through launch with a
    // verified inventory. Explicit generated-fixture QA alone bypasses that gate.
    pub(crate) fn spawn(mut command: Command) -> Result<Self> {
        use std::os::windows::process::CommandExt;
        let mut random = [0u8; 32];
        unsafe { BCryptGenRandom(None, &mut random, BCRYPT_USE_SYSTEM_PREFERRED_RNG) }
            .ok()
            .map_err(|_| SESSION_ERROR)?;
        let nonce = random
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        // Clear Java injection variables even in the explicit engineering probe.
        for key in [
            "JAVA_TOOL_OPTIONS",
            "JDK_JAVA_OPTIONS",
            "_JAVA_OPTIONS",
            "CLASSPATH",
        ] {
            command.env_remove(key);
        }
        command
            .env("ANF_MKR_SESSION_NONCE", &nonce)
            .creation_flags(0x08000000)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        let mut child = command
            .spawn()
            .map_err(|_| "MKR catalog process could not start.")?;
        let job = match own_job(&child) {
            Ok(job) => job,
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("MKR catalog process could not be safely supervised.".into());
            }
        };
        let mut input = child.stdin.take().ok_or(SESSION_ERROR)?;
        let output = child.stdout.take().ok_or(SESSION_ERROR)?;
        let child = Arc::new(Mutex::new(child));
        let alive = Arc::new(AtomicBool::new(true));
        let (frames, received) = mpsc::sync_channel(1);
        let reader_alive = alive.clone();
        let reader = thread::Builder::new()
            .name("anf-mkr-catalog-output".into())
            .spawn(move || {
                let mut output = BufReader::with_capacity(8192, output);
                while let Ok(frame) = bounded_frame(&mut output) {
                    if frames.try_send(frame).is_err() {
                        break;
                    }
                }
                reader_alive.store(false, Ordering::Release);
            })
            .map_err(|_| SESSION_ERROR)?;
        let (requests, work) = mpsc::sync_channel::<Request>(1);
        let worker_alive = alive.clone();
        let worker = thread::Builder::new()
            .name("anf-mkr-catalog-input".into())
            .spawn(move || {
                for request in work {
                    let result = (|| {
                        if !worker_alive.load(Ordering::Acquire) {
                            return Err(SESSION_ERROR.into());
                        }
                        input
                            .write_all(&request.bytes)
                            .and_then(|_| input.write_all(b"\n"))
                            .and_then(|_| input.flush())
                            .map_err(|_| SESSION_ERROR)?;
                        received
                            .recv_timeout(Duration::from_secs(25))
                            .map_err(|_| SESSION_ERROR.to_string())
                    })();
                    let failed = result.is_err();
                    let _ = request.reply.send(result);
                    if failed {
                        worker_alive.store(false, Ordering::Release);
                        break;
                    }
                }
            })
            .map_err(|_| SESSION_ERROR)?;
        let mut session = Self {
            child,
            alive,
            requests: Some(requests),
            worker: Some(worker),
            reader: Some(reader),
            active: None,
            sequence: 0,
            _job: job,
            _resources: None,
        };
        let response = session.request("hello", Some(("nonce", nonce)), Duration::from_secs(10))?;
        if response != json!({"protocol":1,"catalog":true,"leasedInput":true,"embedded":false}) {
            return Err(SESSION_ERROR.into());
        }
        Ok(session)
    }
    fn stop(&mut self) {
        self.alive.store(false, Ordering::Release);
        if let Some(active) = self.active.take() {
            active.store(false, Ordering::Release);
        }
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    fn request(
        &mut self,
        command: &str,
        field: Option<(&str, String)>,
        timeout: Duration,
    ) -> Result<Value> {
        if !self.alive.load(Ordering::Acquire) {
            self.stop();
            return Err(SESSION_ERROR.into());
        }
        self.sequence += 1;
        let mut request = json!({"protocol":1,"id":self.sequence,"command":command});
        if let Some((name, value)) = field {
            request[name] = Value::String(value);
        }
        let bytes = serde_json::to_vec(&request).map_err(|_| SESSION_ERROR)?;
        if bytes.len() > MAX_REQUEST {
            return Err("MKR request exceeded its bound.".into());
        }
        let (reply, result) = mpsc::channel();
        let output = (|| {
            self.requests
                .as_ref()
                .ok_or(SESSION_ERROR)?
                .try_send(Request { bytes, reply })
                .map_err(|_| SESSION_ERROR)?;
            let bytes = result.recv_timeout(timeout).map_err(|_| SESSION_ERROR)??;
            let reply: Reply = serde_json::from_slice(&bytes).map_err(|_| SESSION_ERROR)?;
            if reply.protocol != 1
                || reply.id != self.sequence
                || (reply.ok && reply.error.is_some())
            {
                return Err(SESSION_ERROR.into());
            }
            if !reply.ok {
                // No raw provider text from a child is ever forwarded.
                return Err("MKR catalog request could not be completed.".into());
            }
            Ok(reply.result.unwrap_or(Value::Null))
        })();
        if output.is_err() {
            self.stop();
        }
        output
    }
    pub fn search(&mut self, query: &str) -> Result<Vec<CatalogTrack>> {
        if query.trim().is_empty() || !valid_text(query, 500) {
            return Err("Enter a music search of 1–500 characters.".into());
        }
        let value = self.request(
            "search",
            Some(("query", query.trim().into())),
            Duration::from_secs(24),
        )?;
        let parsed: Vec<CatalogTrack> = match serde_json::from_value(value) {
            Ok(value) => value,
            Err(_) => {
                self.stop();
                return Err(SESSION_ERROR.into());
            }
        };
        if parsed.len() > 100
            || parsed.iter().any(|t| {
                !valid_id(&t.id) || !valid_text(&t.title, 1000) || !valid_text(&t.artist, 1000)
            })
        {
            self.stop();
            return Err(SESSION_ERROR.into());
        }
        Ok(parsed)
    }
    pub fn prepare(&mut self, track: &str) -> Result<OwnedLease> {
        if track.len() != 11
            || !track
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        {
            return Err("Choose a valid MKR track.".into());
        }
        if self.active.is_some() {
            return Err("Release the previous MKR source first.".into());
        }
        let response = self.request(
            "prepare",
            Some(("trackId", track.into())),
            Duration::from_secs(24),
        )?;
        let parsed: LeaseReply = match serde_json::from_value(response) {
            Ok(value) => value,
            Err(_) => {
                self.stop();
                return Err(SESSION_ERROR.into());
            }
        };
        if parsed.track_id != track
            || parsed.mime_type != "audio/mp4"
            || parsed.content_length_bytes == 0
            || parsed.content_length_bytes > 8 * 1024 * 1024 * 1024
            || parsed.expires_at_epoch_ms <= now_ms()
            || !permitted_lease(&parsed.lease_uri)
        {
            self.stop();
            return Err(SESSION_ERROR.into());
        }
        let valid = Arc::new(AtomicBool::new(true));
        self.active = Some(valid.clone());
        Ok(OwnedLease {
            uri: parsed.lease_uri,
            expires_at: parsed.expires_at_epoch_ms,
            session_alive: self.alive.clone(),
            valid,
        })
    }
    pub fn release(&mut self) -> Result<()> {
        if let Some(valid) = self.active.take() {
            valid.store(false, Ordering::Release);
        }
        self.request("release", None, Duration::from_secs(5))
            .map(|_| ())
    }
    pub(crate) fn is_alive(&self) -> bool {
        self.alive.load(Ordering::Acquire)
    }
    pub(crate) fn liveness(&self) -> Arc<AtomicBool> {
        self.alive.clone()
    }
    pub(crate) fn shutdown(&mut self) {
        self.stop();
    }
}
impl Drop for CatalogProcess {
    fn drop(&mut self) {
        self.stop();
        drop(self.requests.take());
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
    }
}
fn permitted_lease(value: &str) -> bool {
    let Ok(uri) = url::Url::parse(value) else {
        return false;
    };
    let Some(token) = uri.path().strip_prefix("/audio/") else {
        return false;
    };
    uri.scheme() == "http"
        && uri.host_str() == Some("127.0.0.1")
        && uri.port().is_some_and(|p| p > 0)
        && uri.username().is_empty()
        && uri.password().is_none()
        && uri.query().is_none()
        && uri.fragment().is_none()
        && token.len() == 64
        && token
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_frames_and_leases_reject_untrusted_inputs() {
        assert_eq!(bounded_frame(&mut &b"{}\n"[..]).unwrap(), b"{}");
        assert!(bounded_frame(&mut &b"unterminated"[..]).is_err());
        assert!(bounded_frame(&mut &vec![b'x'; MAX_REPLY + 2][..]).is_err());
        let good = format!("http://127.0.0.1:12345/audio/{}", "a".repeat(64));
        assert!(permitted_lease(&good));
        for bad in [
            good.replace("127.0.0.1", "localhost"),
            format!("{good}?target=private"),
            good.replace("http:", "https:"),
            good.replace("/audio/", "/private/"),
        ] {
            assert!(!permitted_lease(&bad));
        }
    }

    #[test]
    #[ignore = "explicit generated-fixture JVM/native process QA only"]
    fn real_catalog_process_prepares_owned_native_audio() {
        let java =
            std::env::var_os("ANF_MKR_TEST_JAVA").expect("verified engineering JDK required");
        let classpath = std::env::var_os("ANF_MKR_TEST_CLASSPATH")
            .expect("engineering test classpath required");
        for mode in ["wrong-id", "oversized", "stall"] {
            let mut broken = Command::new(&java);
            broken
                .arg("-Xmx256m")
                .arg("-XX:ActiveProcessorCount=2")
                .arg("-cp")
                .arg(&classpath)
                .arg("com.anf.mkr.WindowsCatalogFixtureSidecarKt")
                .env("ANF_MKR_TEST_MODE", mode);
            let started = std::time::Instant::now();
            assert!(
                CatalogProcess::spawn(broken).is_err(),
                "bad fixture child was accepted"
            );
            assert!(
                started.elapsed() < Duration::from_secs(14),
                "child failure exceeded deadline"
            );
        }
        let mut command = Command::new(java);
        command
            .arg("-Xmx256m")
            .arg("-XX:ActiveProcessorCount=2")
            .arg("-cp")
            .arg(classpath)
            .arg("com.anf.mkr.WindowsCatalogFixtureSidecarKt");
        let mut catalog = CatalogProcess::spawn(command).expect("actual owned catalog child");
        let found = catalog.search("generated fixture").unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, "abcdefghijk");
        let lease = catalog
            .prepare("abcdefghijk")
            .expect("actual private-pipe lease receipt");
        assert!(lease.valid());
        assert!(!format!("{lease:?}").contains("127.0.0.1"));
        let engine = super::super::NativeEngine::new(true).unwrap();
        assert!(
            engine.load(lease.uri()).is_err(),
            "public URL loader must still reject loopback"
        );
        engine.load_owned(&lease).unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(12);
        while engine.status().unwrap().duration_ms == 0 && std::time::Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
        }
        assert!(engine.status().unwrap().duration_ms >= 4000);
        engine.play().unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(4);
        while engine.status().unwrap().position_ms < 250 && std::time::Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
        }
        assert!(engine.status().unwrap().position_ms >= 250);
        // Releasing the receipt must pause the real player without the test
        // issuing Pause itself, even when there are no frontend polling calls.
        catalog.release().unwrap();
        thread::sleep(Duration::from_millis(250));
        let state = engine
            .request(super::super::Operation::FixtureRawStatus)
            .unwrap();
        assert!(!state.playing, "revoked lease continued playing");
        assert!(engine.play().is_err());
        assert!(!lease.valid());
        let second = catalog.prepare("abcdefghijk").unwrap();
        engine.load_owned(&second).unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(8);
        while engine.status().unwrap().duration_ms == 0 && std::time::Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
        }
        engine.play().unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(4);
        while engine.status().unwrap().position_ms < 250 && std::time::Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
        }
        assert!(engine.status().unwrap().position_ms >= 250);
        // Unexpected child exit: no supervisor release or native Pause call.
        catalog.child.lock().unwrap().kill().unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(3);
        while second.valid() && std::time::Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
        }
        assert!(!second.valid(), "catalog EOF did not revoke receipt");
        thread::sleep(Duration::from_millis(200));
        assert!(
            !engine
                .request(super::super::Operation::FixtureRawStatus)
                .unwrap()
                .playing,
            "buffered audio continued after catalog child exit"
        );
        drop(catalog);
    }
}
