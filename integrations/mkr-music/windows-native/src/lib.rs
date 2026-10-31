// SPDX-License-Identifier: MIT
//! Independent native Windows audio prototype. Not registered with AnF yet.
//! The catalog's GPL code is not linked here. Its final host/distribution
//! boundary and corresponding-source obligations still need release review.
#![cfg(windows)]
pub mod catalog;
pub mod host;
pub mod resources;

use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    mpsc::{self, Receiver, SyncSender},
    Arc, OnceLock,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use windows::core::HSTRING;
use windows::Foundation::{TimeSpan, TypedEventHandler, Uri};
use windows::Media::Core::MediaSource;
use windows::Media::Playback::{MediaPlaybackState, MediaPlayer};
use windows::Win32::System::Com::CoIncrementMTAUsage;
use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};

type Result<T> = std::result::Result<T, String>;
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlaybackState {
    pub playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
}
enum Operation {
    Load(String),
    OwnedLoad(catalog::OwnedLease),
    #[cfg(test)]
    FixtureRawStatus,
    #[cfg(test)]
    FixtureLoad(String),
    #[cfg(test)]
    FixtureHold(Duration, mpsc::Sender<()>),
    Play,
    GuardedPlay(Arc<AtomicU64>, u64),
    Pause,
    Seek(u64),
    Status,
}
struct Request {
    operation: Operation,
    reply: mpsc::Sender<Result<PlaybackState>>,
    expires_at: Instant,
    cancelled: Arc<AtomicBool>,
}

impl Request {
    fn expired(&self) -> bool {
        self.cancelled.load(Ordering::Acquire) || Instant::now() >= self.expires_at
    }
}

/// Owns all WinRT objects on one MTA worker; never call from a UI thread.
/// Initial media is paused. The bridge must pause AnF's other audio engines
/// before calling play and must not expose capabilities from this crate alone.
pub struct NativeEngine {
    sender: Option<SyncSender<Request>>,
    worker: Option<JoinHandle<()>>,
}

fn media_error(context: &str, error: windows::core::Error) -> String {
    // Never include a signed stream URL, cookie or private file path in logs.
    format!("{context} (HRESULT {})", error.code())
}
struct Apartment;
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

/// Each source owns a distinct player and failure latch. A late event from a
/// retired decoder cannot mark its replacement as failed. Callbacks retain no
/// COM objects or provider error strings and never call back into the actor.
struct NativeMedia {
    player: MediaPlayer,
    failed: Arc<AtomicBool>,
    failure_token: i64,
}

impl NativeMedia {
    fn new(volume: f64) -> windows::core::Result<Self> {
        let player = MediaPlayer::new()?;
        let setup = (|| {
            player.SetAutoPlay(false)?;
            player.SetVolume(volume)?;
            let failed = Arc::new(AtomicBool::new(false));
            let signal = failed.clone();
            let token = player.MediaFailed(&TypedEventHandler::new(move |_, _| {
                signal.store(true, Ordering::Release);
                Ok(())
            }))?;
            Ok((failed, token))
        })();
        match setup {
            Ok((failed, failure_token)) => Ok(Self {
                player,
                failed,
                failure_token,
            }),
            Err(error) => {
                let _ = player.Close();
                Err(error)
            }
        }
    }
}

impl std::ops::Deref for NativeMedia {
    type Target = MediaPlayer;
    fn deref(&self) -> &MediaPlayer {
        &self.player
    }
}

impl Drop for NativeMedia {
    fn drop(&mut self) {
        let _ = self.player.RemoveMediaFailed(self.failure_token);
        let _ = self.player.Pause();
        let _ = self.player.Close();
    }
}

// windows-rs keeps agile activation factories in process-lifetime static caches.
// Letting the last MTA go away between workers can leave those caches referring
// to unloaded runtime state. Keep one process-lifetime MTA usage reference; each
// engine still closes its media objects and balances its thread's RoInitialize.
static PROCESS_MTA: OnceLock<Result<usize>> = OnceLock::new();
fn keep_process_mta() -> Result<()> {
    PROCESS_MTA
        .get_or_init(|| {
            unsafe { CoIncrementMTAUsage() }
                .map(|cookie| cookie.0 as usize)
                .map_err(|e| media_error("Could not retain native audio MTA", e))
        })
        .as_ref()
        .map(|_| ())
        .map_err(Clone::clone)
}

impl NativeEngine {
    pub fn new(muted: bool) -> Result<Self> {
        keep_process_mta()?;
        let (sender, receiver) = mpsc::sync_channel(8);
        let (ready, ready_result) = mpsc::channel();
        let worker = thread::Builder::new()
            .name("anf-mkr-native-audio".into())
            .spawn(move || {
                let init = unsafe { RoInitialize(RO_INIT_MULTITHREADED) }
                    .map_err(|e| media_error("Native audio initialization failed", e));
                if let Err(e) = init {
                    let _ = ready.send(Err(e));
                    return;
                }
                let _apartment = Apartment;
                let player = NativeMedia::new(if muted { 0.0 } else { 1.0 });
                let player = match player {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = ready.send(Err(media_error("Native audio is unavailable", e)));
                        return;
                    }
                };
                if ready.send(Ok(())).is_err() {
                    let _ = player.Close();
                    return;
                }
                run_worker(player, receiver);
            })
            .map_err(|_| "Could not start native audio worker.".to_string())?;
        match ready_result.recv_timeout(Duration::from_secs(10)) {
            Ok(Ok(())) => Ok(Self {
                sender: Some(sender),
                worker: Some(worker),
            }),
            Ok(Err(error)) => {
                drop(sender);
                let _ = worker.join();
                Err(error)
            }
            Err(_) => {
                drop(sender);
                Err("Native audio initialization timed out.".into())
            }
        }
    }

    fn request(&self, operation: Operation) -> Result<PlaybackState> {
        self.request_timeout(operation, Duration::from_secs(5))
    }

    fn request_timeout(&self, operation: Operation, timeout: Duration) -> Result<PlaybackState> {
        let (reply, result) = mpsc::channel();
        let cancelled = Arc::new(AtomicBool::new(false));
        self.sender
            .as_ref()
            .ok_or("Native audio has stopped.")?
            .try_send(Request {
                operation,
                reply,
                expires_at: Instant::now() + timeout,
                cancelled: cancelled.clone(),
            })
            .map_err(|_| "Native audio is busy or stopped.")?;
        match result.recv_timeout(timeout) {
            Ok(outcome) => outcome,
            Err(_) => {
                cancelled.store(true, Ordering::Release);
                Err("Native audio request timed out.".into())
            }
        }
    }

    /// Only the catalog's explicitly permitted HTTPS CDN output is accepted.
    /// No arbitrary file, browser player, executable or local-network source.
    pub fn load(&self, source: &str) -> Result<PlaybackState> {
        if source.len() > 16_384 {
            return Err("Unsupported native audio source.".into());
        }
        self.request(Operation::Load(source.into()))
    }
    /// Only an opaque receipt returned by this crate's owned catalog session.
    /// It cannot be constructed from renderer-supplied localhost/file URLs.
    pub fn load_owned(&self, lease: &catalog::OwnedLease) -> Result<PlaybackState> {
        self.request(Operation::OwnedLoad(lease.clone()))
    }
    pub fn play(&self) -> Result<PlaybackState> {
        self.request(Operation::Play)
    }
    pub(crate) fn play_current(
        &self,
        generation: Arc<AtomicU64>,
        expected: u64,
    ) -> Result<PlaybackState> {
        self.request(Operation::GuardedPlay(generation, expected))
    }
    pub fn pause(&self) -> Result<PlaybackState> {
        self.request(Operation::Pause)
    }
    pub fn seek(&self, position_ms: u64) -> Result<PlaybackState> {
        self.request(Operation::Seek(position_ms))
    }
    pub fn status(&self) -> Result<PlaybackState> {
        self.request(Operation::Status)
    }
}

impl Drop for NativeEngine {
    fn drop(&mut self) {
        // Closing the only command sender drains outstanding bounded requests,
        // then releases player/source/COM on their owning thread.
        drop(self.sender.take());
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn snapshot(player: &MediaPlayer) -> windows::core::Result<PlaybackState> {
    let session = player.PlaybackSession()?;
    Ok(PlaybackState {
        playing: session.PlaybackState()? == MediaPlaybackState::Playing,
        position_ms: session.Position()?.Duration.max(0) as u64 / 10_000,
        duration_ms: session.NaturalDuration()?.Duration.max(0) as u64 / 10_000,
    })
}

fn run_worker(mut player: NativeMedia, receiver: Receiver<Request>) {
    let mut source: Option<MediaSource> = None;
    let mut owned: Option<catalog::OwnedLease> = None;
    loop {
        if owned.as_ref().is_some_and(|lease| !lease.valid()) {
            let _ = player.Pause();
            player.failed.store(true, Ordering::Release);
            if let Some(old) = source.take() {
                let _ = old.Close();
            }
            owned = None;
        }
        let received = if owned.is_some() {
            receiver.recv_timeout(Duration::from_millis(100))
        } else {
            receiver
                .recv()
                .map_err(|_| mpsc::RecvTimeoutError::Disconnected)
        };
        let request = match received {
            Ok(request) => request,
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };
        if request.expired() {
            let _ = request
                .reply
                .send(Err("Native audio request expired before execution.".into()));
            continue;
        }
        let starts_playback = matches!(
            &request.operation,
            Operation::Play | Operation::GuardedPlay(..)
        );
        let current = || match &request.operation {
            Operation::GuardedPlay(generation, expected) => {
                generation.load(Ordering::Acquire) == *expected
            }
            _ => true,
        };
        let mut outcome: Result<PlaybackState> = (|| {
            let operation = &request.operation;
            if !current() {
                return Err("Native playback was superseded by a newer action.".into());
            }
            let replacing = matches!(operation, Operation::Load(_) | Operation::OwnedLoad(_));
            #[cfg(test)]
            let replacing = replacing
                || matches!(
                    operation,
                    Operation::FixtureLoad(_) | Operation::FixtureRawStatus
                );
            if player.failed.load(Ordering::Acquire)
                && !replacing
                && !matches!(operation, Operation::Pause)
            {
                let _ = player.Pause();
                return Err("Native audio decoding failed. Choose a source to try again.".into());
            }
            match operation {
                Operation::Load(value) => {
                    // URI activation also belongs on the initialized MTA, not
                    // an uninitialized async bridge/caller thread.
                    if !permitted_stream(&value) {
                        return Err("Unsupported native audio source.".into());
                    }
                    replace_source(&mut player, &mut source, value.clone())?;
                    owned = None;
                }
                Operation::OwnedLoad(lease) => {
                    if !lease.valid() {
                        return Err("MKR prepared source is no longer valid.".into());
                    }
                    replace_source(&mut player, &mut source, lease.uri().into())?;
                    owned = Some(lease.clone());
                }
                #[cfg(test)]
                Operation::FixtureLoad(value) => {
                    replace_source(&mut player, &mut source, value.clone())?;
                    owned = None;
                }
                #[cfg(test)]
                Operation::FixtureHold(duration, ready) => {
                    let _ = ready.send(());
                    thread::sleep(*duration);
                }
                Operation::Play | Operation::GuardedPlay(..) => {
                    if source.is_none() {
                        return Err("Choose a native audio source first.".into());
                    }
                    player
                        .Play()
                        .map_err(|e| media_error("Could not play native audio", e))?;
                }
                Operation::Pause => pause_acknowledged(&player, &request)?,
                Operation::Seek(position_ms) => {
                    let state = snapshot(&player)
                        .map_err(|e| media_error("Could not inspect native audio", e))?;
                    if state.duration_ms == 0 {
                        return Err("Native audio is not ready to seek.".into());
                    }
                    let ticks = (*position_ms)
                        .min(state.duration_ms)
                        .checked_mul(10_000)
                        .and_then(|n| i64::try_from(n).ok())
                        .ok_or("Invalid native audio position.")?;
                    player
                        .PlaybackSession()
                        .and_then(|s| s.SetPosition(TimeSpan { Duration: ticks }))
                        .map_err(|e| media_error("Could not seek native audio", e))?;
                }
                Operation::Status => {}
                #[cfg(test)]
                Operation::FixtureRawStatus => {}
            }
            snapshot(&player).map_err(|e| media_error("Could not read native audio state", e))
        })();
        if request.expired()
            || !current()
            || (starts_playback && owned.as_ref().is_some_and(|lease| !lease.valid()))
        {
            if starts_playback {
                let _ = player.Pause();
            }
            outcome = Err("Native audio request expired during execution.".into());
        }
        // A lost/timed-out client must not cause a delayed unacknowledged play.
        if request.reply.send(outcome).is_err() && starts_playback {
            let _ = player.Pause();
        }
    }
    let _ = player.Pause();
    drop(player);
    if let Some(source) = source {
        let _ = source.Close();
    }
}

fn pause_acknowledged(player: &MediaPlayer, request: &Request) -> Result<()> {
    player
        .Pause()
        .map_err(|e| media_error("Could not pause native audio", e))?;
    let session = player
        .PlaybackSession()
        .map_err(|e| media_error("Could not inspect native pause", e))?;
    let deadline = Instant::now() + Duration::from_millis(500);
    loop {
        let state = session
            .PlaybackState()
            .map_err(|e| media_error("Could not confirm native pause", e))?;
        if state == MediaPlaybackState::Paused || state == MediaPlaybackState::None {
            return Ok(());
        }
        if request.expired() || Instant::now() >= deadline {
            return Err(
                "Native audio did not acknowledge pausing; audio handoff was stopped.".into(),
            );
        }
        thread::sleep(Duration::from_millis(10));
    }
}

fn replace_source(
    player: &mut NativeMedia,
    source: &mut Option<MediaSource>,
    value: String,
) -> Result<()> {
    player
        .Pause()
        .map_err(|e| media_error("Could not pause native audio", e))?;
    let uri = Uri::CreateUri(&HSTRING::from(value))
        .map_err(|e| media_error("Invalid native audio URI", e))?;
    let next = MediaSource::CreateFromUri(&uri)
        .map_err(|e| media_error("Could not create native audio source", e))?;
    let replacement = NativeMedia::new(
        player
            .Volume()
            .map_err(|e| media_error("Could not inspect native audio volume", e))?,
    )
    .map_err(|e| media_error("Could not create native audio decoder", e))?;
    replacement
        .SetSource(&next)
        .map_err(|e| media_error("Could not set native audio source", e))?;
    // Drop unsubscribes the old callback and closes the retired decoder on its
    // owning MTA. Its isolated latch remains safe if a callback was in flight.
    drop(std::mem::replace(player, replacement));
    if let Some(old) = source.replace(next) {
        let _ = old.Close();
    }
    Ok(())
}

fn permitted_stream(source: &str) -> bool {
    if source.len() > 16_384 {
        return false;
    }
    let Ok(uri) = url::Url::parse(source) else {
        return false;
    };
    uri.scheme() == "https"
        && uri
            .host_str()
            .is_some_and(|host| host.ends_with(".googlevideo.com"))
        && uri.username().is_empty()
        && uri.password().is_none()
        && uri.fragment().is_none()
        && uri.port_or_known_default() == Some(443)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn only_permitted_https_cdn_sources_enter_public_load() {
        assert!(permitted_stream(
            "https://r1.googlevideo.com/audio?fixture=1"
        ));
        for url in [
            "https://r1.googlevideo.com.evil.invalid/audio",
            "http://r1.googlevideo.com/audio",
            "https://user:password@r1.googlevideo.com/audio",
            "file:///private",
            "https://127.0.0.1/audio",
            "https://r1.googlevideo.com:8443/audio",
            "https://r1.googlevideo.com/audio#fragment",
        ] {
            assert!(!permitted_stream(url));
        }
    }

    #[test]
    #[ignore = "requires Windows native media; explicitly run with a generated muted fixture"]
    fn real_muted_playback_seek_pause_and_resume() {
        let fixture = std::env::var("ANF_MKR_TEST_AUDIO")
            .expect("Set a generated test fixture, never a user recording");
        let engine = NativeEngine::new(true).expect("actual Windows native engine");
        assert!(engine.play().is_err());
        let path = std::fs::canonicalize(fixture).expect("fixture exists");
        let file_uri = format!(
            "file:///{}",
            path.to_string_lossy()
                .replace('\\', "/")
                .trim_start_matches("//?/")
        );
        // Deliberate private test path; the public loader must reject it.
        assert!(engine.load(&file_uri).is_err());
        let fixture_uri = if let Ok(value) = std::env::var("ANF_MKR_TEST_HTTP") {
            // Explicit fixture bridge only. No production API accepts this URI.
            let parsed = url::Url::parse(&value).expect("owned fixture bridge URI");
            assert_eq!(parsed.scheme(), "http");
            assert_eq!(parsed.host_str(), Some("127.0.0.1"));
            assert!(parsed.port().is_some());
            assert!(parsed.username().is_empty() && parsed.password().is_none());
            assert!(parsed.query().is_none() && parsed.fragment().is_none());
            let token = parsed
                .path()
                .strip_prefix("/audio/")
                .expect("owned fixture lease path");
            assert!(token.len() == 64 && token.bytes().all(|b| b.is_ascii_hexdigit()));
            assert!(
                engine.load(&value).is_err(),
                "public loader must reject loopback"
            );
            value
        } else {
            file_uri
        };
        // Exercise a real asynchronous decoder failure, not a synthetic event.
        // The invalid fixture contains only generated text and is removed even
        // if an assertion unwinds. Never use damaged user media for this test.
        struct InvalidFixture(std::path::PathBuf);
        impl Drop for InvalidFixture {
            fn drop(&mut self) {
                let _ = std::fs::remove_file(&self.0);
            }
        }
        let bad = InvalidFixture(std::env::temp_dir().join(format!(
            "anf-mkr-invalid-{}-{}.m4a", std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        )));
        {
            use std::io::Write;
            let mut output = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&bad.0)
                .unwrap();
            output
                .write_all(b"AnF generated invalid decoder fixture; not an audio recording.")
                .unwrap();
        }
        let invalid_uri = url::Url::from_file_path(&bad.0).unwrap().to_string();
        engine.request(Operation::FixtureLoad(invalid_uri)).unwrap();
        let _ = engine.play();
        let deadline = Instant::now() + Duration::from_secs(8);
        let failure = loop {
            if let Err(error) = engine.status() {
                break error;
            }
            assert!(
                Instant::now() < deadline,
                "native decoder failure was not reported"
            );
            thread::sleep(Duration::from_millis(50));
        };
        assert_eq!(
            failure,
            "Native audio decoding failed. Choose a source to try again."
        );
        assert!(engine.play().is_err(), "failed source must remain stopped");
        engine
            .pause()
            .expect("pause remains safe after decoder failure");
        // An explicit new load must create a fresh decoder/failure latch. The
        // entire real playback/seek/reopen regression below proves recovery.
        engine
            .request(Operation::FixtureLoad(fixture_uri.clone()))
            .expect("load generated audio");
        let deadline = Instant::now() + Duration::from_secs(15);
        while engine.status().unwrap().duration_ms == 0 && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
        }
        assert!(
            engine.status().unwrap().duration_ms >= 4000,
            "native decoder did not open fixture"
        );
        // Reproduce a caller timing out behind a busy worker. The queued play
        // must be discarded rather than starting later without acknowledgement.
        let (hold_started, held) = mpsc::channel();
        let (hold_reply, _) = mpsc::channel();
        engine
            .sender
            .as_ref()
            .unwrap()
            .try_send(Request {
                operation: Operation::FixtureHold(Duration::from_millis(200), hold_started),
                reply: hold_reply,
                expires_at: Instant::now() + Duration::from_secs(2),
                cancelled: Arc::new(AtomicBool::new(false)),
            })
            .unwrap_or_else(|_| panic!("queue fixture hold"));
        held.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(engine
            .request_timeout(Operation::Play, Duration::from_millis(30))
            .is_err());
        thread::sleep(Duration::from_millis(250));
        assert!(
            !engine.status().unwrap().playing,
            "expired queued play started audio"
        );
        assert!(
            engine.status().unwrap().position_ms < 100,
            "expired queued play advanced audio"
        );
        // A newer pause/cancel can supersede a Play that has not expired yet.
        // Exercise the actor queue directly so the race is deterministic.
        let generation = Arc::new(AtomicU64::new(1));
        let (hold_started, held) = mpsc::channel();
        let (hold_reply, _) = mpsc::channel();
        let sender = engine.sender.as_ref().unwrap();
        sender
            .try_send(Request {
                operation: Operation::FixtureHold(Duration::from_millis(200), hold_started),
                reply: hold_reply,
                expires_at: Instant::now() + Duration::from_secs(2),
                cancelled: Arc::new(AtomicBool::new(false)),
            })
            .unwrap_or_else(|_| panic!("queue supersession hold"));
        held.recv_timeout(Duration::from_secs(1)).unwrap();
        let (reply, result) = mpsc::channel();
        sender
            .try_send(Request {
                operation: Operation::GuardedPlay(generation.clone(), 1),
                reply,
                expires_at: Instant::now() + Duration::from_secs(2),
                cancelled: Arc::new(AtomicBool::new(false)),
            })
            .unwrap_or_else(|_| panic!("queue superseded play"));
        generation.store(2, Ordering::Release);
        assert!(result
            .recv_timeout(Duration::from_secs(2))
            .unwrap()
            .is_err());
        assert!(
            !engine.status().unwrap().playing,
            "superseded queued play started audio"
        );
        engine.play().unwrap();
        let deadline = Instant::now() + Duration::from_secs(8);
        while engine.status().unwrap().position_ms < 250 && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
        }
        assert!(
            engine.status().unwrap().position_ms >= 250,
            "native position did not advance"
        );
        let acknowledged_pause = engine.pause().unwrap();
        assert!(
            !acknowledged_pause.playing,
            "Pause returned before native audio acknowledged stopping"
        );
        thread::sleep(Duration::from_millis(150));
        let paused = engine.status().unwrap();
        assert!(!paused.playing);
        thread::sleep(Duration::from_millis(250));
        assert!(
            engine
                .status()
                .unwrap()
                .position_ms
                .abs_diff(paused.position_ms)
                < 100,
            "pause did not hold position"
        );
        engine.seek(2000).unwrap();
        let deadline = Instant::now() + Duration::from_secs(3);
        while engine.status().unwrap().position_ms.abs_diff(2000) > 150 && Instant::now() < deadline
        {
            thread::sleep(Duration::from_millis(50));
        }
        assert!(engine.status().unwrap().position_ms.abs_diff(2000) <= 150);
        engine.play().unwrap();
        let deadline = Instant::now() + Duration::from_secs(4);
        while engine.status().unwrap().position_ms < 2250 && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
        }
        assert!(
            engine.status().unwrap().position_ms >= 2250,
            "resume did not advance"
        );
        engine.pause().unwrap();
        drop(engine);
        // A second engine must work after the first owning MTA thread exits;
        // running each test in a new process would miss cached-factory failures.
        let reopened = NativeEngine::new(true).expect("reopen native engine in same process");
        reopened
            .request(Operation::FixtureLoad(fixture_uri))
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(8);
        while reopened.status().unwrap().duration_ms == 0 && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
        }
        assert!(
            reopened.status().unwrap().duration_ms >= 4000,
            "reopened decoder did not load fixture"
        );
        reopened.play().unwrap();
        let deadline = Instant::now() + Duration::from_secs(4);
        while reopened.status().unwrap().position_ms < 250 && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
        }
        assert!(
            reopened.status().unwrap().position_ms >= 250,
            "reopened player did not advance"
        );
        reopened.pause().unwrap();
    }
}
