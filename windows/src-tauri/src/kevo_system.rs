// kevo_system — system-level commands and self-diagnostics for the AnF Tauri backend.
//
// Exposes four Tauri commands to the front end:
//   shell_exec        — run an arbitrary shell command and return its output.
//   app_control       — start or stop an application.
//   system_stats      — aggregate host metrics (CPU / memory / disks).
//   diagnostics       — a self-report snapshot of the host added to a timestamp.
//
// Depends on the `sysinfo` crate for cross-platform system information.

use serde::Serialize;
use sysinfo::{Disk, Disks, System};
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
            crate::platform::windows::no_console(&mut cmd);
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
