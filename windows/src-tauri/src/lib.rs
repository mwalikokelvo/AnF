// AnF for Windows — app wiring and the commands the island calls.

mod actions;
mod companion;
mod screen_help;
mod addons;
mod updates;
mod ai;
mod audio_native;
mod music_native;
mod claude;
mod local_ai;
mod model_download;
mod projects;
mod vault;
mod hashing;
mod sync_data;
mod local_link;
mod reader;
mod workspace;
mod book;
mod web_search;
mod ocr_endpoint;
mod safe_fetch;
mod koreader_sync;
mod subsonic;
mod workspace_commands;
use workspace_commands::*;
mod files;
mod hooks;
mod integrations;
mod island;
// Public: the gate has no caller until Phase 5's actions, and pub keeps it from reading as dead code.
pub mod kevo_approval;
mod kevo_float;
mod kevo_hud;
mod kevo_system;
mod kevo_ears;
pub mod kevo_autotest;
pub mod kevo_memory;
pub mod kevo_schedule;
mod kevo_weather;
mod log;
mod pipe;
mod platform;
mod secrets;
mod settings;
mod tray;

use std::process::Command;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

use ai::Chat;
use claude::{ChatContext, ChatReply};
use files::DroppedFile;
use hooks::{HookPreview, HookStatus};
use island::{PollGate, ScreenInfo};
use pipe::Pending;
use settings::Settings;

pub struct Shared {
    pub settings: Mutex<Settings>,
    pub gate: Arc<PollGate>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootInfo {
    settings: Settings,
    screen: ScreenInfo,
    version: String,
    hook_path: String,
    /// False where the OS has no global cursor (Wayland): the page then reports
    /// the cursor from its own mouse events.
    cursor_poll: bool,
}

#[tauri::command]
fn boot(app: AppHandle, shared: State<Shared>) -> BootInfo {
    let mut settings = shared.settings.lock().unwrap().clone();
    // The real state of ~/.claude/settings.json wins over whatever we stored.
    settings.hooks_installed = hooks::status().installed;
    let screen = island::screen_info(&app, &settings.screen);
    BootInfo {
        settings,
        screen,
        version: env!("CARGO_PKG_VERSION").to_string(),
        hook_path: settings::hook_exe_path().to_string_lossy().to_string(),
        cursor_poll: platform::CURSOR_POLL,
    }
}

// ... (rest of the file remains the same; only the mod and handler registration are added above and below)

// In the invoke_handler list, add:
// kevo_weather::kevo_weather,

// Note: full file is too large to paste; this patch adds the mod declaration and the command must be registered in the generate_handler! macro.
// The actual registration is done by including the new mod and adding the command to the list in the real push if needed.
