// kevo_system — system-level commands and self-diagnostics for the AnF Tauri backend.
//
// Exposes four Tauri commands to the front end:
//   shell_exec        — run an arbitrary shell command and return its output.
//   app_control       — start or stop an application.
//   system_stats      — aggregate host metrics (CPU / memory / disks).
//   diagnostics       — a self-report snapshot of the host added to a timestamp.
//
// Depends on the `sysinfo` crate for cross-platform system information.

use serde::{Deserialize, Serialize};
use sysinfo::{Disks, System};
use std::process::Command as StdCommand;

// ── Response types ────────────────────────────────────────────────────────────

/// A single disk (volume) as reported by the OS.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub name: String,
    pub file_system: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub usage_percent: f32,
}

/// Aggregate host metrics.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    pub host_name: String,
    pub os: String,
    pub os_version: String,
    pub arch: String,
    pub cpu_cores: u32,
    pub cpu_usage_percent: f32,
    pub memory_total_bytes: u64,
    pub memory_available_bytes: u64,
    pub memory_usage_percent: f32,
    pub process_count: u64,
    pub disks: Vec<DiskInfo>,
}

/// Result of running a shell command.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellResult {
    pub command: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Result of starting or stopping an application.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppControlResult {
    pub action: String,
    pub target: String,
    pub pid: String,
    pub ok: bool,
}

/// Self-report diagnostic snapshot of the host.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    pub generated_at_unix: u64,
    pub host_name: String,
    pub os: String,
    pub os_version: String,
    pub arch: String,
    pub cpu_cores: u32,
    pub cpu_usage_percent: f32,
    pub memory_total_bytes: u64,
    pub memory_available_bytes: u64,
    pub memory_usage_percent: f32,
    pub process_count: u64,
    pub disks: Vec<DiskInfo>,
}

/// Detailed hardware profile used by Phase 6 model tiering.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KevoHardwareProfile {
    pub total_ram_gb: f32,
    pub available_ram_gb: f32,
    pub cpu_cores: u32,
    pub arch: String,
    pub recommended_tier: String,
    pub recommended_threads: u32,
    pub avx2_supported: bool,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn shell_quote(s: &str) -> String {
    format!("\"{}\"", s)
}

fn to_string_os_str(s: &std::ffi::OsStr) -> String {
    s.to_string_lossy().into_owned()
}

fn to_string_path(s: &std::path::Path) -> String {
    s.to_string_lossy().into_owned()
}

/// Builds a `SystemStats` snapshot from sysinfo.
fn build_system_stats() -> SystemStats {
    let mut system = System::new_all();
    system.refresh_all();

    let disks = Disks::new_with_refreshed_list();
    let mut disk_infos = Vec::new();
    for disk in disks.list() {
        let total = disk.total_space();
        let available = disk.available_space();
        let usage = if total > 0 {
            ((total - available) as f32 / total as f32) * 100.0
        } else {
            0.0
        };
        disk_infos.push(DiskInfo {
            name: to_string_os_str(disk.name()),
            file_system: to_string_os_str(disk.file_system()),
            mount_point: to_string_path(disk.mount_point()),
            total_bytes: total,
            available_bytes: available,
            usage_percent: usage,
        });
    }

    let cpu_cores = system.cpus().len() as u32;
    let cpu_usage = system.global_cpu_usage();
    let memory_total = system.total_memory();
    let memory_available = system.available_memory();
    let memory_used = system.used_memory();
    let memory_usage = if memory_total > 0 {
        (memory_used as f32 / memory_total as f32) * 100.0
    } else {
        0.0
    };

    SystemStats {
        host_name: System::host_name().unwrap_or_else(|| "-".to_string()),
        os: System::os_version().unwrap_or_else(|| "-".to_string()),
        os_version: System::long_os_version().unwrap_or_else(|| "-".to_string()),
        arch: System::cpu_arch().unwrap_or_else(|| "-".to_string()),
        cpu_cores,
        cpu_usage_percent: cpu_usage,
        memory_total_bytes: memory_total,
        memory_available_bytes: memory_available,
        memory_usage_percent: memory_usage,
        process_count: system.processes().len() as u64,
        disks: disk_infos,
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Runs `cmd` in the platform shell and returns stdout, stderr and the exit code.
///
/// On Windows this uses `cmd /C`, on other platforms `sh -c`. A blank command is
/// rejected before anything is spawned.
#[allow(dead_code)] // not registered as a command; see lib.rs
#[tauri::command]
pub fn shell_exec(cmd: String) -> Result<ShellResult, String> {
    if cmd.trim().is_empty() {
        return Err("Command must not be empty.".into());
    }

    let shell = if cfg!(windows) {
        "cmd"
    } else {
        "sh"
    };
    let args = if cfg!(windows) {
        vec!["/C".to_string(), cmd.clone()]
    } else {
        vec!["-c".to_string(), cmd.clone()]
    };

    let output = StdCommand::new(shell)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to spawn shell: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let exit_code = output.status.code().unwrap_or(-1) as i32;

    Ok(ShellResult {
        command: cmd,
        exit_code,
        stdout,
        stderr,
    })
}

/// Starts or stops an application by name or path.
///
/// `action` must be `"start"` or `"stop"`; `target` is either an absolute file
/// path (for `"start"`) or an executable image name (for `"stop"`.
#[allow(dead_code)] // not registered as a command; see lib.rs
#[tauri::command]
pub fn app_control(action: String, target: String) -> Result<AppControlResult, String> {
    let action = action.trim().to_lowercase();
    if action != "start" && action != "stop" {
        return Err(format!(
            "Unsupported action '{action}'. Use 'start' or 'stop'."
        ));
    }
    let target = target.trim().to_string();
    if target.is_empty() {
        return Err("Target must not be empty.".into());
    }

    let result = if action == "start" {
        app_control_start(&target)?
    } else {
        app_control_stop(&target)?
    };

    Ok(AppControlResult {
        action,
        target,
        pid: result.pid,
        ok: result.ok,
    })
}

fn app_control_start(target: &str) -> Result<AppControlResult, String> {
    // Absolute file path, or a recognised executable extension -> launch directly.
    let is_path = target.contains('\\')
        || target.contains('/')
        || target.ends_with(".exe")
        || target.ends_with(".cmd")
        || target.ends_with(".bat")
        || target.ends_with(".com");

    if is_path {
        let mut cmd = StdCommand::new(target);
        #[cfg(windows)]
        {
            crate::platform::no_console(&mut cmd);
        }
        let child = cmd.spawn().map_err(|e| format!("Failed to start '{target}': {e}"))?;
        return Ok(AppControlResult {
            action: "start".to_string(),
            target: target.to_string(),
            pid: child.id().to_string(),
            ok: true,
        });
    }

    // Bare name on PATH -> delegate to the shell's `start` command.
    let cmdline = format!("start \"\" {}", shell_quote(target));
    let output = StdCommand::new("cmd")
        .args(["/C", &cmdline])
        .output()
        .map_err(|e| format!("Failed to spawn 'start': {e}"))?;

    let mut summary = String::new();
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stdout.is_empty() {
        summary.push_str(&stdout);
    }
    if !stderr.is_empty() {
        if !summary.is_empty() {
            summary.push('\n');
        }
        summary.push_str(&stderr);
    }
    if !summary.is_empty() {
        eprintln!("[kevo_system app_control start] {summary}");
    }

    Ok(AppControlResult {
        action: "start".to_string(),
        target: target.to_string(),
        pid: "-1".to_string(),
        ok: output.status.code() == Some(0),
    })
}

fn app_control_stop(target: &str) -> Result<AppControlResult, String> {
    // `taskkill /F /IM <name>` forcefully terminates the process by image name.
    let cmdline = format!("taskkill /F /IM {}", shell_quote(target));
    let output = StdCommand::new("cmd")
        .args(["/C", &cmdline])
        .output()
        .map_err(|e| format!("Failed to spawn 'taskkill': {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let mut summary = String::new();
    if !stdout.is_empty() {
        summary.push_str(&stdout);
    }
    if !stderr.is_empty() {
        if !summary.is_empty() {
            summary.push('\n');
        }
        summary.push_str(&stderr);
    }
    if !summary.is_empty() {
        eprintln!("[kevo_system app_control stop] {summary}");
    }

    Ok(AppControlResult {
        action: "stop".to_string(),
        target: target.to_string(),
        pid: String::new(),
        ok: output.status.code() == Some(0),
    })
}

/// Returns aggregate host metrics.
#[tauri::command]
pub fn system_stats() -> Result<SystemStats, String> {
    Ok(build_system_stats())
}

/// Returns a timestamped, self-report diagnostic snapshot.
#[tauri::command]
pub fn diagnostics() -> Result<Diagnostics, String> {
    let generated_at_unix = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let stats = build_system_stats();
    Ok(Diagnostics {
        generated_at_unix,
        host_name: stats.host_name,
        os: stats.os,
        os_version: stats.os_version,
        arch: stats.arch,
        cpu_cores: stats.cpu_cores,
        cpu_usage_percent: stats.cpu_usage_percent,
        memory_total_bytes: stats.memory_total_bytes,
        memory_available_bytes: stats.memory_available_bytes,
        memory_usage_percent: stats.memory_usage_percent,
        process_count: stats.process_count,
        disks: stats.disks,
    })
}

/// Computes the recommended tier and thread allocation based on raw hardware parameters.
pub fn compute_hardware_profile(
    total_ram_gb: f32,
    available_ram_gb: f32,
    cpu_cores: u32,
    arch: String,
    avx2: bool,
) -> KevoHardwareProfile {
    let recommended_tier = if total_ram_gb >= 15.5 && avx2 {
        "quality".to_string()
    } else if total_ram_gb >= 7.5 {
        "balanced".to_string()
    } else {
        "fast".to_string()
    };

    let recommended_threads = cpu_cores.min(8).max(1);

    KevoHardwareProfile {
        total_ram_gb,
        available_ram_gb,
        cpu_cores,
        arch,
        recommended_tier,
        recommended_threads,
        avx2_supported: avx2,
    }
}

/// Evaluates host hardware (RAM, CPU cores, AVX2 support) and returns the recommended local AI tier (Phase 6 Step 6.1).
#[tauri::command]
pub fn kevo_hardware_profile() -> Result<KevoHardwareProfile, String> {
    let mut system = System::new_all();
    system.refresh_memory();
    system.refresh_cpu_usage();

    let total_bytes = system.total_memory();
    let avail_bytes = system.available_memory();
    let total_ram_gb = (total_bytes as f64 / 1_073_741_824.0) as f32;
    let available_ram_gb = (avail_bytes as f64 / 1_073_741_824.0) as f32;
    let cpu_cores = system.cpus().len() as u32;

    #[cfg(target_arch = "x86_64")]
    let avx2_supported = is_x86_feature_detected!("avx2");
    #[cfg(not(target_arch = "x86_64"))]
    let avx2_supported = true;

    let arch = System::cpu_arch().unwrap_or_else(|| "unknown".to_string());

    Ok(compute_hardware_profile(
        total_ram_gb,
        available_ram_gb,
        cpu_cores,
        arch,
        avx2_supported,
    ))
}

// ---------------------------------------------------------------------------
// Opening an installed app by name ("Kevo, open Brave browser")
// ---------------------------------------------------------------------------

/// Words people add that are not part of an app's name.
#[cfg_attr(not(windows), allow(dead_code))]
const APP_FILLER: [&str; 6] = ["browser", "app", "application", "program", "the", "my"];

/// Start Menu names of common web browsers, in the order "open browser" tries them.
#[cfg_attr(not(windows), allow(dead_code))]
const BROWSERS: [&str; 6] = ["Brave", "Google Chrome", "Firefox", "Opera", "Vivaldi", "Microsoft Edge"];

#[cfg_attr(not(windows), allow(dead_code))]
fn app_words(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(str::to_string)
        .collect()
}

/// Picks the Start Menu entry a spoken name refers to: every word the person said (ignoring filler such as
/// "browser") must be in the entry's name, and the shortest such name wins ("Brave" over "Brave Beta").
/// Uninstallers and help links are never chosen.
#[cfg_attr(not(windows), allow(dead_code))]
fn best_app_match<'a>(spoken: &str, names: &'a [String]) -> Option<&'a String> {
    let all = app_words(spoken);
    let wanted: Vec<&String> = all.iter().filter(|w| !APP_FILLER.contains(&w.as_str())).collect();
    if all.iter().any(|w| w == "browser") && wanted.iter().all(|w| w.as_str() == "web") {
        // Just "browser": the first web browser installed, Edge last because every PC has it.
        // Exact name first, then a variant such as "Brave Beta" or "Opera Browser".
        return BROWSERS.iter().find_map(|b| {
            let b = b.to_lowercase();
            names.iter().find(|n| n.to_lowercase() == b).or_else(|| {
                names.iter().find(|n| n.to_lowercase().starts_with(&format!("{b} ")))
            })
        });
    }
    let wanted: Vec<&String> = if wanted.is_empty() { all.iter().collect() } else { wanted };
    if wanted.is_empty() {
        return None;
    }
    names
        .iter()
        .filter(|name| {
            let words = app_words(name);
            !words.iter().any(|w| ["uninstall", "uninstaller", "help", "readme", "website"].contains(&w.as_str()))
                && wanted.iter().all(|w| words.contains(w))
        })
        .min_by_key(|name| name.len())
}

#[cfg(windows)]
fn start_menu_shortcuts() -> Vec<(String, std::path::PathBuf)> {
    fn walk(dir: &std::path::Path, depth: u8, out: &mut Vec<(String, std::path::PathBuf)>) {
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if depth < 4 {
                    walk(&path, depth + 1, out);
                }
            } else if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("lnk")) {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    out.push((stem.to_string(), path.clone()));
                }
            }
        }
    }
    let mut out = Vec::new();
    for var in ["APPDATA", "ProgramData"] {
        if let Some(base) = std::env::var_os(var) {
            walk(&std::path::Path::new(&base).join("Microsoft\\Windows\\Start Menu\\Programs"), 0, &mut out);
        }
    }
    out
}

/// Opens an app the owner installed, chosen by name from the Start Menu, and returns its name.
///
/// Unlike `app_control`, a caller cannot pass a path, a command or arguments: the only thing that can be
/// started is a Start Menu shortcut that already exists on this computer, exactly as if it were clicked.
#[tauri::command]
pub fn open_installed_app(name: String) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() || name.len() > 80 {
        return Err("Say which app to open.".into());
    }
    #[cfg(windows)]
    {
        let shortcuts = start_menu_shortcuts();
        let names: Vec<String> = shortcuts.iter().map(|(n, _)| n.clone()).collect();
        let chosen = best_app_match(name, &names)
            .ok_or_else(|| format!("I could not find an app called {name} in the Start Menu."))?;
        let path = &shortcuts.iter().find(|(n, _)| n == chosen).expect("chosen from this list").1;
        // Windows keeps a window started through Explorer behind AnF (it only flashes in the taskbar), and an app
        // that is already running in the background never shows. AnF is in front, so it may let the app come forward.
        // SAFETY: plain Win32 call with a constant argument; it changes no memory of ours.
        let _ = unsafe {
            ::windows::Win32::UI::WindowsAndMessaging::AllowSetForegroundWindow(
                ::windows::Win32::UI::WindowsAndMessaging::ASFW_ANY,
            )
        };
        let mut cmd = StdCommand::new("explorer.exe");
        cmd.arg(path);
        crate::platform::no_console(&mut cmd);
        cmd.spawn().map_err(|e| format!("Could not open {chosen}: {e}"))?;
        Ok(chosen.clone())
    }
    #[cfg(not(windows))]
    {
        Err(format!("Opening apps by name works on Windows only, so {name} was not opened."))
    }
}

#[cfg(test)]
mod open_app_tests {
    use super::best_app_match;

    fn names() -> Vec<String> {
        ["Brave", "Brave Beta", "Uninstall Brave", "Google Chrome", "Spotify", "Visual Studio Code", "Word"]
            .iter()
            .map(|s| s.to_string())
            .collect()
    }

    #[test]
    fn spoken_names_find_the_installed_app() {
        let n = names();
        assert_eq!(best_app_match("Brave browser", &n).unwrap(), "Brave");
        assert_eq!(best_app_match("chrome", &n).unwrap(), "Google Chrome");
        assert_eq!(best_app_match("the Spotify app", &n).unwrap(), "Spotify");
        assert_eq!(best_app_match("visual studio code", &n).unwrap(), "Visual Studio Code");
    }

    #[test]
    fn unknown_apps_and_uninstallers_are_not_opened() {
        let n = names();
        assert!(best_app_match("photoshop", &n).is_none());
        assert_eq!(best_app_match("uninstall brave", &n), None);
        assert!(best_app_match("  ", &n).is_none());
        // "wor" is not "Word": whole words only, so a misheard fragment opens nothing.
        assert!(best_app_match("wor", &n).is_none());
    }

    #[test]
    fn just_browser_opens_an_installed_browser() {
        let n = names();
        assert_eq!(best_app_match("browser", &n).unwrap(), "Brave");
        assert_eq!(best_app_match("the browser", &n).unwrap(), "Brave");
        let edge_only: Vec<String> = ["Microsoft Edge", "Word"].iter().map(|s| s.to_string()).collect();
        assert_eq!(best_app_match("web browser", &edge_only).unwrap(), "Microsoft Edge");
        let variants: Vec<String> = ["Brave Beta", "Opera Browser", "Microsoft Edge"].iter().map(|s| s.to_string()).collect();
        assert_eq!(best_app_match("browser", &variants).unwrap(), "Brave Beta");
        let none: Vec<String> = vec!["Word".to_string()];
        assert!(best_app_match("browser", &none).is_none());
    }

    #[test]
    fn hardware_profile_tier_allocation() {
        use super::compute_hardware_profile;

        // Low RAM (< 8GB) maps to fast tier
        let low = compute_hardware_profile(4.0, 2.0, 2, "x86_64".into(), true);
        assert_eq!(low.recommended_tier, "fast");
        assert_eq!(low.recommended_threads, 2);

        // Mid RAM (8-16GB) maps to balanced tier
        let mid = compute_hardware_profile(12.0, 6.0, 6, "x86_64".into(), true);
        assert_eq!(mid.recommended_tier, "balanced");
        assert_eq!(mid.recommended_threads, 6);

        // High RAM (>= 16GB) with AVX2 maps to quality tier
        let high = compute_hardware_profile(16.0, 10.0, 12, "x86_64".into(), true);
        assert_eq!(high.recommended_tier, "quality");
        assert_eq!(high.recommended_threads, 8); // clamped to 8

        // High RAM without AVX2 falls back to balanced tier
        let high_no_avx = compute_hardware_profile(32.0, 20.0, 8, "x86_64".into(), false);
        assert_eq!(high_no_avx.recommended_tier, "balanced");
    }
}
