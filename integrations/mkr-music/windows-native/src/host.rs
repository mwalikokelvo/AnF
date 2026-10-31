// SPDX-License-Identifier: MIT
//! Native controller for AnF command wiring. No URLs, executable paths or lease
//! tokens cross this API. Caller must acknowledge other-engine pause BEFORE play.
use crate::{
    catalog::{CatalogProcess, CatalogTrack},
    resources::VerifiedRuntime,
    NativeEngine, PlaybackState, Result,
};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostState {
    pub playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub track: Option<CatalogTrack>,
}
#[derive(Default)]
struct Library {
    results: Vec<CatalogTrack>,
    queue: Vec<CatalogTrack>,
    current: Option<CatalogTrack>,
}
pub struct PlaybackHost {
    catalog: Mutex<CatalogProcess>,
    engine: NativeEngine,
    library: Mutex<Library>,
    action: Mutex<()>,
    generation: Arc<AtomicU64>,
    stopped: AtomicBool,
    catalog_alive: Arc<AtomicBool>,
}
impl PlaybackHost {
    pub fn launch(runtime: VerifiedRuntime, muted: bool) -> Result<Self> {
        let engine = NativeEngine::new(muted)?;
        let catalog = CatalogProcess::launch(runtime)?;
        Ok(Self::from_parts(catalog, engine))
    }
    fn from_parts(catalog: CatalogProcess, engine: NativeEngine) -> Self {
        let catalog_alive = catalog.liveness();
        Self {
            catalog: Mutex::new(catalog),
            engine,
            library: Mutex::new(Library::default()),
            action: Mutex::new(()),
            generation: Arc::new(AtomicU64::new(0)),
            stopped: AtomicBool::new(false),
            catalog_alive,
        }
    }
    fn ensure(&self) -> Result<()> {
        if !self.is_ready() {
            Err("MKR playback host has stopped.".into())
        } else {
            Ok(())
        }
    }
    pub fn is_ready(&self) -> bool {
        !self.stopped.load(Ordering::Acquire) && self.catalog_alive.load(Ordering::Acquire)
    }
    fn state_from(&self, state: PlaybackState) -> Result<HostState> {
        let track = self
            .library
            .lock()
            .map_err(|_| "MKR metadata unavailable.")?
            .current
            .clone();
        Ok(HostState {
            playing: state.playing,
            position_ms: state.position_ms,
            duration_ms: state.duration_ms,
            track,
        })
    }
    pub fn status(&self) -> Result<HostState> {
        self.ensure()?;
        self.state_from(self.engine.status()?)
    }
    pub fn search(&self, query: &str) -> Result<Vec<CatalogTrack>> {
        self.ensure()?;
        // Long network work holds ONLY catalog, never the native engine/state.
        let mut catalog = self
            .catalog
            .try_lock()
            .map_err(|_| "MKR catalog is already working.")?;
        let result = catalog.search(query);
        if self.stopped.load(Ordering::Acquire) {
            catalog.shutdown();
            return Err("MKR host stopped during search.".into());
        }
        let tracks = result?;
        self.library
            .lock()
            .map_err(|_| "MKR metadata unavailable.")?
            .results = tracks.clone();
        Ok(tracks)
    }
    /// Pause/status do not wait for a search/stream preparation to release its
    /// catalog lock. A pause also invalidates queued/in-flight play generations.
    pub fn pause(&self) -> Result<HostState> {
        self.generation.fetch_add(1, Ordering::AcqRel);
        self.state_from(self.engine.pause()?)
    }
    pub fn seek(&self, position_ms: u64) -> Result<HostState> {
        self.ensure()?;
        let _action = self
            .action
            .try_lock()
            .map_err(|_| "MKR track change is in progress.")?;
        self.state_from(self.engine.seek(position_ms)?)
    }
    pub fn play(&self, id: Option<&str>) -> Result<HostState> {
        self.ensure()?;
        let _action = self
            .action
            .try_lock()
            .map_err(|_| "MKR track change is in progress.")?;
        self.play_locked(id, false, None)
    }
    /// Capture before awaiting AnF's other-engine pause acknowledgement.
    pub fn handoff_ticket(&self) -> u64 {
        self.generation.load(Ordering::Acquire)
    }
    pub fn play_after_handoff(&self, id: Option<&str>, ticket: u64) -> Result<HostState> {
        self.ensure()?;
        let _action = self
            .action
            .try_lock()
            .map_err(|_| "MKR track change is in progress.")?;
        self.play_locked(id, false, Some(ticket))
    }
    fn play_locked(
        &self,
        id: Option<&str>,
        from_queue: bool,
        ticket: Option<u64>,
    ) -> Result<HostState> {
        let expected = if let Some(ticket) = ticket {
            self.generation
                .compare_exchange(
                    ticket,
                    ticket.wrapping_add(1),
                    Ordering::AcqRel,
                    Ordering::Acquire,
                )
                .map_err(|_| "MKR audio handoff was cancelled.")?
                .wrapping_add(1)
        } else {
            self.generation
                .fetch_add(1, Ordering::AcqRel)
                .wrapping_add(1)
        };
        if let Some(id) = id {
            let (track, queue) = {
                let library = self
                    .library
                    .lock()
                    .map_err(|_| "MKR metadata unavailable.")?;
                let source = if !from_queue && library.results.iter().any(|track| track.id == id) {
                    &library.results
                } else {
                    &library.queue
                };
                let track = source
                    .iter()
                    .find(|track| track.id == id)
                    .cloned()
                    .ok_or("Choose a track from MKR results.")?;
                (track, source.clone())
            };
            let mut catalog = self
                .catalog
                .try_lock()
                .map_err(|_| "MKR catalog is already working.")?;
            if !catalog.is_alive() {
                return Err("MKR catalog session has stopped.".into());
            }
            self.engine.pause()?;
            catalog.release()?;
            let lease = catalog.prepare(id)?;
            if self.stopped.load(Ordering::Acquire)
                || self.generation.load(Ordering::Acquire) != expected
            {
                let _ = catalog.release();
                if self.stopped.load(Ordering::Acquire) {
                    catalog.shutdown();
                }
                return Err("MKR track change was cancelled.".into());
            }
            self.engine.load_owned(&lease)?;
            let mut library = self
                .library
                .lock()
                .map_err(|_| "MKR metadata unavailable.")?;
            library.current = Some(track);
            library.queue = queue;
        } else if self
            .library
            .lock()
            .map_err(|_| "MKR metadata unavailable.")?
            .current
            .is_none()
        {
            return Err("Choose an MKR track first.".into());
        }
        self.ensure()?;
        self.state_from(
            self.engine
                .play_current(self.generation.clone(), expected)?,
        )
    }
    pub fn step(&self, forward: bool) -> Result<HostState> {
        self.step_with_ticket(forward, None)
    }
    pub fn step_after_handoff(&self, forward: bool, ticket: u64) -> Result<HostState> {
        self.step_with_ticket(forward, Some(ticket))
    }
    fn step_with_ticket(&self, forward: bool, ticket: Option<u64>) -> Result<HostState> {
        self.ensure()?;
        let _action = self
            .action
            .try_lock()
            .map_err(|_| "MKR track change is in progress.")?;
        let target = {
            let library = self
                .library
                .lock()
                .map_err(|_| "MKR metadata unavailable.")?;
            if library.queue.is_empty() {
                return Err("Choose an MKR track first.".into());
            }
            let index = library
                .current
                .as_ref()
                .and_then(|current| library.queue.iter().position(|t| t.id == current.id))
                .unwrap_or(0);
            let next = if forward {
                (index + 1) % library.queue.len()
            } else {
                (index + library.queue.len() - 1) % library.queue.len()
            };
            library.queue[next].id.clone()
        };
        self.play_locked(Some(&target), true, ticket)
    }
    pub fn shutdown(&self) {
        self.stopped.store(true, Ordering::Release);
        self.generation.fetch_add(1, Ordering::AcqRel);
        let _ = self.engine.pause();
        if let Ok(mut catalog) = self.catalog.try_lock() {
            catalog.shutdown();
        }
    }
}
impl Drop for PlaybackHost {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        process::Command,
        thread,
        time::{Duration, Instant},
    };
    fn wait_catalog(host: &PlaybackHost) {
        let deadline = Instant::now() + Duration::from_secs(4);
        while host.catalog.try_lock().is_ok() {
            assert!(
                Instant::now() < deadline,
                "fixture did not enter catalog operation"
            );
            thread::sleep(Duration::from_millis(20));
        }
    }
    fn wait_play(host: &PlaybackHost) {
        let deadline = Instant::now() + Duration::from_secs(8);
        while host.status().unwrap().position_ms < 200 {
            assert!(
                Instant::now() < deadline,
                "actual native audio did not advance"
            );
            thread::sleep(Duration::from_millis(40));
        }
    }
    #[test]
    #[ignore = "explicit real JVM/native host fixture; generated AAC only"]
    fn real_host_queue_pause_and_superseded_play() {
        let mut command =
            Command::new(std::env::var_os("ANF_MKR_TEST_JAVA").expect("engineering JDK"));
        command
            .arg("-Xmx256m")
            .arg("-XX:ActiveProcessorCount=2")
            .arg("-cp")
            .arg(std::env::var_os("ANF_MKR_TEST_CLASSPATH").expect("engineering test classpath"))
            .arg("com.anf.mkr.WindowsCatalogFixtureSidecarKt")
            .env("ANF_MKR_TEST_MODE", "host");
        let catalog = CatalogProcess::spawn(command).expect("real catalog fixture child");
        let host = Arc::new(PlaybackHost::from_parts(
            catalog,
            NativeEngine::new(true).unwrap(),
        ));
        assert!(host.play(None).is_err());
        assert_eq!(host.search("fixture").unwrap().len(), 2);
        let preparing = host.clone();
        let pending = thread::spawn(move || preparing.play(Some("abcdefghijk")));
        wait_catalog(&host);
        let started = Instant::now();
        host.pause().unwrap();
        assert!(
            started.elapsed() < Duration::from_millis(700),
            "pause waited behind slow catalog preparation"
        );
        assert!(
            pending.join().unwrap().is_err(),
            "superseded prepare started a late play"
        );
        assert!(!host.status().unwrap().playing);
        let stale = host.handoff_ticket();
        host.pause().unwrap();
        assert!(host.play_after_handoff(Some("abcdefghijk"), stale).is_err());
        host.play_after_handoff(Some("abcdefghijk"), host.handoff_ticket())
            .unwrap();
        wait_play(&host);
        assert_eq!(host.status().unwrap().track.unwrap().id, "abcdefghijk");
        let searching = host.clone();
        let search = thread::spawn(move || searching.search("slow"));
        wait_catalog(&host);
        let started = Instant::now();
        host.pause().unwrap();
        assert!(
            started.elapsed() < Duration::from_millis(700),
            "pause waited behind slow search"
        );
        assert_eq!(search.join().unwrap().unwrap().len(), 2);
        host.seek(2000).unwrap();
        host.play(None).unwrap();
        assert_eq!(host.search("single").unwrap().len(), 1);
        let stale = host.handoff_ticket();
        host.pause().unwrap();
        assert!(host.step_after_handoff(true, stale).is_err());
        host.step_after_handoff(true, host.handoff_ticket())
            .unwrap();
        wait_play(&host);
        assert_eq!(host.status().unwrap().track.unwrap().id, "lmnopqrstuv");
        host.step(false).unwrap();
        assert_eq!(host.status().unwrap().track.unwrap().id, "abcdefghijk");
        let preparing = host.clone();
        let pending = thread::spawn(move || preparing.play(Some("lmnopqrstuv")));
        wait_catalog(&host);
        host.shutdown();
        assert!(pending.join().unwrap().is_err());
        assert!(!host.catalog_alive.load(Ordering::Acquire));
        assert!(!host.is_ready());
        assert!(host.status().is_err());
    }
}
