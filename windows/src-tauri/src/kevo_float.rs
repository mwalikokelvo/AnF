//! Kevo float (`docs/kevo-briefs/hud.md`, H.2): a 48 × 28 pill just below the island at top centre that
//! shows Kevo's state from `kevo://state`. It never hears, decides or acts. Hidden while Kevo is off or
//! when "Show Kevo float" is unticked; it can be dragged and remembers where it was put.
use crate::kevo_hud::KevoHudState;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "kevo-float";
/// State 1 of the brief: 48 × 28 logical px.
pub const SIZE: (f64, f64) = (48.0, 28.0);
/// Logical px from the top of the screen: under the island's closed 32 px notch, with a small gap.
const TOP: f64 = 40.0;

/// Whether the float is on screen: Kevo is on and the owner left "Show Kevo float" ticked.
pub fn wanted(allowed: bool, state: KevoHudState) -> bool {
    allowed && state != KevoHudState::Off
}

/// Where the float goes the first time, in logical px: centred under the island on its screen.
pub fn default_spot(screen: &crate::ScreenInfo) -> (f64, f64) {
    (screen.x + (screen.width - SIZE.0) / 2.0, screen.y + TOP)
}

/// A remembered position is used only while it is still on one of the screens (a monitor may be gone).
pub fn on_screen(pos: (i32, i32), monitors: &[(i32, i32, u32, u32)]) -> bool {
    monitors.iter().any(|&(x, y, w, h)| {
        pos.0 >= x && pos.1 >= y && pos.0 < x + w as i32 && pos.1 < y + h as i32
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
struct Spot {
    x: i32,
    y: i32,
}

fn spot_file() -> std::path::PathBuf {
    crate::settings::local_dir().join("kevo-float.json")
}

fn remembered() -> Option<(i32, i32)> {
    let spot: Spot = serde_json::from_str(&std::fs::read_to_string(spot_file()).ok()?).ok()?;
    Some((spot.x, spot.y))
}

struct Float {
    allowed: bool,
    state: KevoHudState,
}

/// The "Show Kevo float" setting and Kevo's last state, as far as the window is concerned.
pub struct KevoFloat(Mutex<Float>);

impl Default for KevoFloat {
    fn default() -> Self {
        Self(Mutex::new(Float {
            allowed: true,
            state: KevoHudState::Off,
        }))
    }
}

fn lock(app: &AppHandle) -> std::sync::MutexGuard<'_, Float> {
    app.state::<KevoFloat>()
        .inner()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

/// Called by `kevo_hud_set` with each state: shows or hides the window when that changes.
pub fn follow(app: &AppHandle, state: KevoHudState) {
    let changed = {
        let mut float = lock(app);
        let before = wanted(float.allowed, float.state);
        float.state = state;
        before != wanted(float.allowed, float.state)
    };
    if changed {
        sync(app);
    }
}

/// "Show Kevo float" in Kevo's settings (on by default).
#[tauri::command]
pub fn kevo_float_show(app: AppHandle, float: State<KevoFloat>, show: bool) {
    float.0.lock().unwrap_or_else(|e| e.into_inner()).allowed = show;
    sync(&app);
}

/// Shows or hides the window to match. A window is created off the main thread: creating one inside a
/// synchronous command can deadlock on Windows. Each run reads the newest state, so the last one wins.
fn sync(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let show = {
            let float = lock(&app);
            wanted(float.allowed, float.state)
        };
        match (app.get_webview_window(LABEL), show) {
            (Some(win), true) => {
                let _ = win.show();
            }
            (Some(win), false) => {
                let _ = win.hide();
            }
            (None, true) => {
                if let Err(e) = open(&app) {
                    crate::log::line(format!("Kevo float unavailable: {e}"));
                }
            }
            (None, false) => {}
        }
    });
}

fn open(app: &AppHandle) -> Result<(), String> {
    let mut url = crate::settings_page_url(app);
    match &mut url {
        WebviewUrl::App(path) => *path = "kevo-float.html".into(),
        WebviewUrl::External(u) => u.set_path("/kevo-float.html"),
        _ => {}
    }
    let win = WebviewWindowBuilder::new(app, LABEL, url)
        .additional_browser_args(crate::BROWSER_ARGS)
        .data_directory(crate::settings::local_dir().join("webview-v014"))
        .title("Kevo — AnF")
        .inner_size(SIZE.0, SIZE.1)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focusable(false)
        .focused(false)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;
    let monitors: Vec<_> = app
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let (p, s) = (m.position(), m.size());
            (p.x, p.y, s.width, s.height)
        })
        .collect();
    match remembered().filter(|&p| on_screen(p, &monitors)) {
        Some((x, y)) => {
            let _ = win.set_position(PhysicalPosition::new(x, y));
        }
        None => {
            let pref = app
                .state::<crate::Shared>()
                .settings
                .lock()
                .unwrap()
                .screen
                .clone();
            let (x, y) = default_spot(&crate::island::screen_info(app, &pref));
            let _ = win.set_position(tauri::LogicalPosition::new(x, y));
        }
    }
    // Remember where the owner drags it.
    win.on_window_event(|event| {
        if let tauri::WindowEvent::Moved(p) = event {
            if let Ok(text) = serde_json::to_string(&Spot { x: p.x, y: p.y }) {
                let _ = std::fs::write(spot_file(), text);
            }
        }
    });
    win.show().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ScreenInfo;
    use KevoHudState::*;

    #[test]
    fn shown_only_while_kevo_is_on_and_the_setting_is_ticked() {
        for state in [Idle, Listening, Thinking, Speaking, Alert, Sleeping] {
            assert!(wanted(true, state), "{state:?}");
            assert!(!wanted(false, state), "{state:?} with the setting off");
        }
        assert!(!wanted(true, Off));
        assert!(
            KevoFloat::default().0.lock().unwrap().allowed,
            "on by default"
        );
    }

    #[test]
    fn first_spot_is_centred_just_below_the_island() {
        let screen = ScreenInfo {
            x: -1920.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
            scale: 1.5,
        };
        let (x, y) = default_spot(&screen);
        assert_eq!(x + SIZE.0 / 2.0, -960.0, "centred on the island's screen");
        // The island's closed notch is 32 px tall (`NOTCH_H` in src/core/layout.ts): never cover it.
        assert!((32.0..=48.0).contains(&y), "{y}");
    }

    #[test]
    fn a_remembered_spot_counts_only_on_a_screen_that_is_still_there() {
        let screens = [(0, 0, 1920, 1080), (1920, 0, 2560, 1440)];
        assert!(on_screen((900, 40), &screens));
        assert!(on_screen((3000, 1000), &screens));
        assert!(!on_screen((-500, 40), &screens), "monitor unplugged");
        assert!(!on_screen((100, 1100), &screens));
        assert!(!on_screen((100, 40), &[]));
    }
}
