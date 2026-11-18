//! Kevo's state bus for the float HUD (`docs/kevo-briefs/hud.md`, H.1).
//! One event, `kevo://state`, sent only when what it shows changed. Speech loudness is sent at most
//! 20 times a second, and only while Kevo speaks. Until Phase 1 moves hearing into Rust, the main window
//! reports its state with `kevo_hud_set`; `kevo_ask` sets the badge from its own timing.
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

pub const STATE_EVENT: &str = "kevo://state";
/// 20 loudness events a second at most.
const LEVEL_GAP: Duration = Duration::from_millis(50);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum KevoHudState {
    #[default]
    Off,
    Idle,
    Listening,
    Thinking,
    Speaking,
    Alert,
    Sleeping,
}

/// The `kevo://state` payload: state, the current step in plain words, engine and time, loudness 0–1.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct KevoHudEvent {
    pub state: KevoHudState,
    pub line: String,
    pub badge: String,
    pub level: f32,
}

/// What the HUD shows now. The caller passes the time, so it is tested without waiting.
#[derive(Default)]
pub struct HudBus {
    shown: KevoHudEvent,
    level_sent: Option<Instant>,
}

impl HudBus {
    /// A report from the web view. Returns the event to send, or `None` when nothing changed.
    pub fn set(
        &mut self,
        state: KevoHudState,
        line: Option<String>,
        level: Option<f32>,
        now: Instant,
    ) -> Option<KevoHudEvent> {
        let mut next = self.shown.clone();
        next.state = state;
        if let Some(line) = line {
            next.line = line;
        }
        next.level = if state == KevoHudState::Speaking {
            level
                .filter(|l| l.is_finite())
                .map_or(next.level, |l| l.clamp(0.0, 1.0))
        } else {
            0.0
        };
        self.publish(next, now)
    }

    pub fn set_badge(&mut self, badge: String, now: Instant) -> Option<KevoHudEvent> {
        let mut next = self.shown.clone();
        next.badge = badge;
        self.publish(next, now)
    }

    fn publish(&mut self, next: KevoHudEvent, now: Instant) -> Option<KevoHudEvent> {
        if next == self.shown {
            return None;
        }
        if next.level != self.shown.level {
            // A change of loudness alone waits its turn; any other change goes out at once and carries it.
            let only_level = KevoHudEvent {
                level: self.shown.level,
                ..next.clone()
            } == self.shown;
            if only_level
                && self
                    .level_sent
                    .is_some_and(|t| now.duration_since(t) < LEVEL_GAP)
            {
                return None;
            }
            self.level_sent = Some(now);
        }
        self.shown = next.clone();
        Some(next)
    }
}

#[derive(Default)]
pub struct KevoHud(Mutex<HudBus>);

fn send(app: &AppHandle, event: Option<KevoHudEvent>) {
    if let Some(event) = event {
        let _ = app.emit(STATE_EVENT, event);
    }
}

/// The main window's report of what Kevo is doing.
#[tauri::command]
pub fn kevo_hud_set(
    app: AppHandle,
    hud: State<KevoHud>,
    state: KevoHudState,
    line: Option<String>,
    level: Option<f32>,
) {
    let event =
        hud.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .set(state, line, level, Instant::now());
    send(&app, event);
}

/// Shows which engine answered and how long it took ("Local model · 1.2 s").
pub fn set_badge(app: &AppHandle, badge: String) {
    let event = app
        .state::<KevoHud>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .set_badge(badge, Instant::now());
    send(app, event);
}

#[cfg(test)]
mod tests {
    use super::*;
    use KevoHudState::*;

    #[test]
    fn sends_only_when_something_changed() {
        let t = Instant::now();
        let mut bus = HudBus::default();
        assert_eq!(bus.set(Off, None, None, t), None, "starts off: nothing new");
        let idle = bus.set(Idle, None, None, t).expect("off to idle is sent");
        assert_eq!(
            idle,
            KevoHudEvent {
                state: Idle,
                ..Default::default()
            }
        );
        assert_eq!(bus.set(Idle, None, None, t), None);
        assert!(bus
            .set(Idle, Some("Opening Brave".into()), None, t)
            .is_some());
        assert_eq!(bus.set(Idle, Some("Opening Brave".into()), None, t), None);
        assert!(bus.set_badge("Local model · 1.2 s".into(), t).is_some());
        assert_eq!(bus.set_badge("Local model · 1.2 s".into(), t), None);
        let thinking = bus.set(Thinking, None, None, t).unwrap();
        assert_eq!(
            (thinking.line.as_str(), thinking.badge.as_str()),
            ("Opening Brave", "Local model · 1.2 s"),
            "unchanged fields are kept"
        );
    }

    #[test]
    fn level_only_while_speaking() {
        let t = Instant::now();
        let mut bus = HudBus::default();
        assert_eq!(bus.set(Idle, None, Some(0.8), t).unwrap().level, 0.0);
        assert_eq!(
            bus.set(Idle, None, Some(0.5), t + Duration::from_secs(1)),
            None,
            "loudness is ignored unless speaking"
        );
        assert_eq!(
            bus.set(Speaking, None, Some(2.0), t + Duration::from_secs(2))
                .unwrap()
                .level,
            1.0,
            "clamped to 0–1"
        );
        assert_eq!(
            bus.set(Speaking, None, Some(f32::NAN), t + Duration::from_secs(3)),
            None,
            "not a number is ignored"
        );
        assert_eq!(
            bus.set(Idle, None, None, t + Duration::from_secs(4))
                .unwrap()
                .level,
            0.0,
            "back to 0 when speech ends"
        );
    }

    #[test]
    fn level_capped_at_20_a_second() {
        let t = Instant::now();
        let mut bus = HudBus::default();
        bus.set(Speaking, None, None, t).unwrap();
        // A new loudness every millisecond for one second.
        let sent = (0..1000u64)
            .filter(|ms| {
                bus.set(
                    Speaking,
                    None,
                    Some((ms % 7) as f32 / 10.0 + 0.1),
                    t + Duration::from_millis(*ms),
                )
                .is_some()
            })
            .count();
        assert_eq!(sent, 20);
        // Any other change is never held back by the cap, and carries the newest loudness.
        let later = t + Duration::from_millis(1001);
        assert!(bus
            .set(Speaking, None, Some(0.9), later)
            .is_some_and(|e| e.level == 0.9));
        assert!(bus
            .set(
                Speaking,
                Some("Reading the answer".into()),
                Some(0.3),
                later
            )
            .is_some_and(|e| e.level == 0.3));
        assert!(bus.set(Thinking, None, None, later).is_some());
    }
}
