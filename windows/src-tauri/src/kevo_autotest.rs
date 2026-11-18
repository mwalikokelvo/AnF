//! Kevo automatic test builds and self-test (Phase 0 step 0.4b).
//!
//! When the opt-in setting "Run Kevo test builds and Kevo's self-test automatically" is on:
//! 1. Every 2 hours and at start, queries GitHub Releases API for the newest `kevo-test-v*` prerelease.
//! 2. Verifies the tag commit is on `main` via the GitHub compare API, and asset uploader is `github-actions[bot]`.
//! 3. Downloads the zip and `.sha256`, verifies the SHA-256 hash.
//! 4. Extracts to `~/AnF-Kevo/builds/<version>/`, keeping only the newest two builds.
//! 5. Records `<version>` in `~/AnF-Kevo/last-tested.json` before launch.
//! 6. Launches a small detached helper and exits AnF (with `llama-server`).
//! 7. The helper runs the test build with `--kevo-selftest`, then restarts the installed AnF.
//! 8. If the test build cannot start (e.g. Defender quarantined it), writes `selftest-<version>.json`
//!    with `{"result": "could_not_start", "reason": "..."}`.
//! Under `--kevo-selftest`, AnF never polls for test builds, whatever the setting says.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager};

const GITHUB_RELEASES_API: &str =
    "https://api.github.com/repos/mwalikokelvo/AnF/releases?per_page=30";
const GITHUB_COMPARE_API: &str =
    "https://api.github.com/repos/mwalikokelvo/AnF/compare/main...";
const DOWNLOAD_PREFIX: &str =
    "https://github.com/mwalikokelvo/AnF/releases/download/";
const USER_AGENT: &str = "AnF-Kevo-Autotest";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastTested {
    pub last_tested_version: String,
    pub timestamp: u64,
}

/// Directory `~/AnF-Kevo` where builds and self-test reports are kept.
pub fn kevo_dir() -> Result<PathBuf, String> {
    let home = crate::platform::home_dir();
    let path = home.join("AnF-Kevo");
    std::fs::create_dir_all(&path).map_err(|e| format!("Could not create AnF-Kevo folder: {e}"))?;
    Ok(path)
}

/// Parse version from "kevo-test-v0.1.59" or "0.1.59" -> (0, 1, 59).
pub fn parse_kevo_version(tag: &str) -> Option<(u64, u64, u64)> {
    let v = tag.strip_prefix("kevo-test-v").unwrap_or(tag);
    let v = v.strip_prefix('v').unwrap_or(v);
    let mut parts = v.split('.').map(|p| {
        if !p.is_empty() && p.bytes().all(|c| c.is_ascii_digit()) {
            p.parse::<u64>().ok()
        } else {
            None
        }
    });
    let version = (parts.next()??, parts.next()??, parts.next()??);
    if parts.next().is_some() {
        None
    } else {
        Some(version)
    }
}

/// Returns the last tested version string if recorded.
pub fn read_last_tested() -> Option<String> {
    let file = kevo_dir().ok()?.join("last-tested.json");
    let bytes = std::fs::read(file).ok()?;
    let record: LastTested = serde_json::from_slice(&bytes).ok()?;
    Some(record.last_tested_version)
}

/// Records the last tested version before launching a build.
pub fn write_last_tested(version: &str) -> Result<(), String> {
    let file = kevo_dir()?.join("last-tested.json");
    let record = LastTested {
        last_tested_version: version.to_string(),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    };
    let json = serde_json::to_vec_pretty(&record).map_err(|e| e.to_string())?;
    std::fs::write(file, json).map_err(|e| format!("Could not write last-tested.json: {e}"))?;
    Ok(())
}

/// Sanitizes any occurrence of the user's home directory to `~`.
pub fn sanitize_home_paths(text: &str) -> String {
    let home = crate::platform::home_dir();
    let home_str = home.to_string_lossy();
    let home_forward = home_str.replace('\\', "/");
    let text = text.replace(&*home_str, "~");
    text.replace(&home_forward, "~")
}

/// Returns true if AnF was started with `--kevo-selftest`.
#[tauri::command]
pub fn is_kevo_selftest() -> bool {
    std::env::args().any(|a| a == "--kevo-selftest")
}

/// Finds the `resources/kevo-selftest` directory across dev, packaged, or portable layouts.
pub fn find_selftest_resource_dir(app: &AppHandle) -> Option<PathBuf> {
    // 1. Packaged resource directory
    if let Ok(res) = app.path().resource_dir() {
        let p = res.join("resources").join("kevo-selftest");
        if p.join("clips.json").is_file() {
            return Some(p);
        }
        let p2 = res.join("kevo-selftest");
        if p2.join("clips.json").is_file() {
            return Some(p2);
        }
    }
    // 2. Next to executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let p = parent.join("resources").join("kevo-selftest");
            if p.join("clips.json").is_file() {
                return Some(p);
            }
        }
    }
    // 3. Cargo manifest dir in dev
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/kevo-selftest");
    if dev.join("clips.json").is_file() {
        return Some(dev);
    }
    None
}

/// Reads `clips.json` for the self-test runner.
#[tauri::command]
pub fn kevo_selftest_get_clips(app: AppHandle) -> Result<String, String> {
    let dir = find_selftest_resource_dir(&app)
        .ok_or("Could not locate kevo-selftest resource directory.")?;
    let path = dir.join("clips.json");
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Could not read clips.json at {}: {e}", path.display()))
}

/// Reads an individual WAV audio clip by file name. Prevents path traversal.
#[tauri::command]
pub fn kevo_selftest_read_clip(app: AppHandle, file: String) -> Result<Vec<u8>, String> {
    if file.contains("..") || file.contains('/') || file.contains('\\') {
        return Err("Invalid clip file name.".into());
    }
    let dir = find_selftest_resource_dir(&app)
        .ok_or("Could not locate kevo-selftest resource directory.")?;
    let path = dir.join(&file);
    std::fs::read(&path)
        .map_err(|e| format!("Could not read clip file {}: {e}", path.display()))
}

/// Saves the self-test report JSON into `~/AnF-Kevo/selftest-<version>.json`.
/// Replaces any occurrences of the user's home folder with `~`.
#[tauri::command]
pub fn kevo_selftest_save_result(result_json: String) -> Result<String, String> {
    let sanitized = sanitize_home_paths(&result_json);
    let dir = kevo_dir()?;
    let version = env!("CARGO_PKG_VERSION");
    let out_file = dir.join(format!("selftest-{version}.json"));
    std::fs::write(&out_file, sanitized.as_bytes())
        .map_err(|e| format!("Could not write self-test report to {}: {e}", out_file.display()))?;
    Ok(out_file.to_string_lossy().into_owned())
}

/// Returns the primary graphics card name.
#[tauri::command]
pub fn kevo_graphics_card() -> Result<String, String> {
    #[cfg(windows)]
    {
        let out = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_VideoController | Select-Object -First 1).Name",
            ])
            .output();
        if let Ok(output) = out {
            let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !name.is_empty() {
                return Ok(name);
            }
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(output) = std::process::Command::new("sh")
            .args(["-c", "lspci | grep -i vga | head -n 1"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !text.is_empty() {
                return Ok(text);
            }
        }
    }
    Ok("Standard Graphics Adapter".into())
}

/// Measures average host CPU usage percentage over `seconds` of idle time (default 60s).
#[tauri::command]
pub async fn kevo_measure_idle_cpu(seconds: Option<u64>) -> Result<f32, String> {
    let secs = seconds.unwrap_or(60).max(1);
    let mut system = sysinfo::System::new_all();
    system.refresh_cpu_all();
    let sample_interval = std::time::Duration::from_millis(500);
    let total_samples = (secs * 2).max(1);
    let mut sum_cpu = 0.0;

    for _ in 0..total_samples {
        tokio::time::sleep(sample_interval).await;
        system.refresh_cpu_all();
        sum_cpu += system.global_cpu_usage();
    }

    Ok(sum_cpu / total_samples as f32)
}

/// Checks GitHub releases API, verifies the prerelease, downloads, extracts, and runs the test build.
pub async fn check_and_run_test_build(app: &AppHandle) -> Result<Option<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;

    // 1. Fetch releases
    let resp = client
        .get(GITHUB_RELEASES_API)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Releases API error: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Releases API returned status {}", resp.status()));
    }

    let releases: Vec<Value> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse releases JSON: {e}"))?;

    let last_tested = read_last_tested();
    let last_tested_v = last_tested
        .as_deref()
        .and_then(parse_kevo_version)
        .unwrap_or((0, 0, 0));

    // Find newest kevo-test-v* prerelease newer than last_tested
    let mut candidate: Option<((u64, u64, u64), String, Value)> = None;
    for r in &releases {
        if r["prerelease"] != true {
            continue;
        }
        let Some(tag) = r["tag_name"].as_str() else {
            continue;
        };
        if !tag.starts_with("kevo-test-v") {
            continue;
        }
        let Some(ver_tuple) = parse_kevo_version(tag) else {
            continue;
        };
        if ver_tuple <= last_tested_v {
            continue;
        }
        if candidate
            .as_ref()
            .map_or(true, |(best_v, _, _)| ver_tuple > *best_v)
        {
            candidate = Some((ver_tuple, tag.to_string(), r.clone()));
        }
    }

    let Some((_v, tag, release_data)) = candidate else {
        return Ok(None);
    };

    let version_str = tag
        .strip_prefix("kevo-test-v")
        .unwrap_or(&tag)
        .to_string();

    // 2. Verify tag commit is on main via GitHub compare API
    let compare_url = format!("{GITHUB_COMPARE_API}{tag}");
    let comp_resp = client
        .get(&compare_url)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Compare API error: {e}"))?;

    if !comp_resp.status().is_success() {
        return Err(format!("Compare API returned status {}", comp_resp.status()));
    }

    let comp_data: Value = comp_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse compare JSON: {e}"))?;

    let status = comp_data["status"].as_str().unwrap_or("");
    let ahead_by = comp_data["ahead_by"].as_u64().unwrap_or(1);
    // In GitHub compare API main...tag: if tag is on main, status is "identical" or "behind", and ahead_by is 0
    if (status != "identical" && status != "behind") || ahead_by != 0 {
        return Err(format!(
            "Rejecting prerelease {tag}: commit is not on main (status: {status}, ahead_by: {ahead_by})"
        ));
    }

    // 3. Find asset and sha256 asset
    let assets = release_data["assets"]
        .as_array()
        .ok_or("Release has no assets.")?;

    let zip_name = format!("AnF-Windows-{version_str}-kevo-test.zip");
    let sha_name = format!("AnF-Windows-{version_str}-kevo-test.zip.sha256");

    let zip_asset = assets
        .iter()
        .find(|a| a["name"].as_str() == Some(&zip_name))
        .ok_or(format!("Asset {zip_name} not found in release {tag}."))?;

    let sha_asset = assets
        .iter()
        .find(|a| a["name"].as_str() == Some(&sha_name))
        .ok_or(format!("Asset {sha_name} not found in release {tag}."))?;

    // Check uploader is github-actions[bot]
    let uploader = zip_asset["uploader"]["login"].as_str().unwrap_or("");
    if !uploader.contains("github-actions") {
        return Err(format!(
            "Rejecting asset {zip_name}: uploader is '{uploader}', expected github-actions[bot]."
        ));
    }

    let zip_url = zip_asset["browser_download_url"]
        .as_str()
        .ok_or("Missing zip download URL.")?;
    let sha_url = sha_asset["browser_download_url"]
        .as_str()
        .ok_or("Missing sha256 download URL.")?;

    if !zip_url.starts_with(DOWNLOAD_PREFIX) || !sha_url.starts_with(DOWNLOAD_PREFIX) {
        return Err("Download URL is not from this project's release repository.".into());
    }

    // 4. Download SHA-256 and zip bytes
    let sha_text = client
        .get(sha_url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Failed to download sha256: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Failed to read sha256 text: {e}"))?;

    let expected_hash = sha_text
        .split_whitespace()
        .next()
        .ok_or("Invalid sha256 file format.")?
        .to_lowercase();

    let zip_bytes = client
        .get(zip_url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Failed to download zip: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("Failed to read zip bytes: {e}"))?;

    // Verify SHA-256
    let computed_hash = crate::hashing::sha256_hex(&zip_bytes);
    if computed_hash != expected_hash {
        return Err(format!(
            "SHA-256 mismatch for {zip_name}: expected {expected_hash}, computed {computed_hash}"
        ));
    }

    // 5. Extract to ~/AnF-Kevo/builds/<version>/
    let k_dir = kevo_dir()?;
    let builds_dir = k_dir.join("builds");
    let version_dir = builds_dir.join(&version_str);
    std::fs::create_dir_all(&version_dir)
        .map_err(|e| format!("Failed to create build folder: {e}"))?;

    extract_zip(&zip_bytes, &version_dir)?;

    // Keep only newest 2 builds
    prune_old_builds(&builds_dir, &version_str)?;

    // 6. Record version as last tested before launch to prevent retry loops
    write_last_tested(&version_str)?;

    // 7. Start detached helper and exit
    launch_detached_helper_and_exit(app, &version_dir, &version_str, &k_dir)?;

    Ok(Some(version_str))
}

/// Extracts zip bytes safely into target directory.
fn extract_zip(zip_bytes: &[u8], target_dir: &Path) -> Result<(), String> {
    use std::io::Cursor;
    let reader = Cursor::new(zip_bytes);
    let mut archive =
        zip::ZipArchive::new(reader).map_err(|e| format!("Invalid zip archive: {e}"))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Zip entry read error: {e}"))?;
        let outpath = match file.enclosed_name() {
            Some(path) => target_dir.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            std::fs::create_dir_all(&outpath)
                .map_err(|e| format!("Failed to create directory in zip: {e}"))?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    std::fs::create_dir_all(p)
                        .map_err(|e| format!("Failed to create parent dir: {e}"))?;
                }
            }
            let mut outfile = std::fs::File::create(&outpath)
                .map_err(|e| format!("Failed to extract file: {e}"))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to write extracted file: {e}"))?;
        }
    }
    Ok(())
}

/// Prunes older builds in `~/AnF-Kevo/builds/`, keeping only the newest 2 builds.
fn prune_old_builds(builds_dir: &Path, current_version: &str) -> Result<(), String> {
    let entries = match std::fs::read_dir(builds_dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };

    let mut versions: Vec<((u64, u64, u64), PathBuf)> = Vec::new();
    for entry in entries.flatten() {
        if entry.path().is_dir() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if let Some(v) = parse_kevo_version(&name) {
                versions.push((v, entry.path()));
            }
        }
    }

    versions.sort_by(|a, b| b.0.cmp(&a.0)); // newest first

    // Keep top 2, delete rest
    if versions.len() > 2 {
        for (_v, path) in versions.iter().skip(2) {
            // Do not delete current being unpacked
            if !path.ends_with(current_version) {
                let _ = std::fs::remove_dir_all(path);
            }
        }
    }
    Ok(())
}

/// Writes and starts the detached helper, then exits AnF.
fn launch_detached_helper_and_exit(
    app: &AppHandle,
    version_dir: &Path,
    version_str: &str,
    kevo_dir: &Path,
) -> Result<(), String> {
    let installed_exe = std::env::current_exe()
        .unwrap_or_else(|_| crate::settings::local_dir().join("AnF.exe"));

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x00000008;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let test_exe = version_dir.join("AnF.exe");
        let helper_bat = kevo_dir.join(format!("run-selftest-{version_str}.bat"));

        let bat_content = format!(
            r#"@echo off
setlocal
:wait_anf
tasklist /FI "IMAGENAME eq AnF.exe" 2>NUL | find /I /N "AnF.exe">NUL
if "%ERRORLEVEL%"=="0" (
    timeout /T 1 /NOBREAK >NUL
    goto wait_anf
)
:wait_llama
tasklist /FI "IMAGENAME eq llama-server.exe" 2>NUL | find /I /N "llama-server.exe">NUL
if "%ERRORLEVEL%"=="0" (
    timeout /T 1 /NOBREAK >NUL
    goto wait_llama
)

if not exist "{test_exe_str}" (
    echo {{"version":"{version_str}","result":"could_not_start","reason":"Executable not found (possibly quarantined by Windows Defender)"}} > "{report_str}"
    goto restart_installed
)

"{test_exe_str}" --kevo-selftest
if errorlevel 1 (
    if not exist "{report_str}" (
        echo {{"version":"{version_str}","result":"could_not_start","reason":"Process exited with error code before producing report"}} > "{report_str}"
    )
)

:restart_installed
if exist "{installed_exe_str}" (
    start "" "{installed_exe_str}"
)
"#,
            test_exe_str = test_exe.to_string_lossy(),
            version_str = version_str,
            report_str = kevo_dir.join(format!("selftest-{version_str}.json")).to_string_lossy(),
            installed_exe_str = installed_exe.to_string_lossy(),
        );

        std::fs::write(&helper_bat, bat_content)
            .map_err(|e| format!("Failed to write helper script: {e}"))?;

        let status = std::process::Command::new("cmd.exe")
            .args(["/C", &helper_bat.to_string_lossy()])
            .creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW)
            .spawn();

        if let Err(e) = status {
            return Err(format!("Failed to spawn detached helper: {e}"));
        }
    }

    #[cfg(not(windows))]
    {
        let test_exe = version_dir.join("AnF");
        let helper_sh = kevo_dir.join(format!("run-selftest-{version_str}.sh"));
        let report_file = kevo_dir.join(format!("selftest-{version_str}.json"));

        let sh_content = format!(
            r#"#!/bin/sh
while pgrep -x AnF > /dev/null 2>&1; do sleep 1; done
if [ ! -f "{test_exe_str}" ]; then
    echo '{{"version":"{version_str}","result":"could_not_start","reason":"Executable not found"}}' > "{report_str}"
else
    "{test_exe_str}" --kevo-selftest || {{
        if [ ! -f "{report_str}" ]; then
            echo '{{"version":"{version_str}","result":"could_not_start","reason":"Process exited with failure"}}' > "{report_str}"
        fi
    }}
fi
if [ -f "{installed_exe_str}" ]; then
    "{installed_exe_str}" &
fi
"#,
            test_exe_str = test_exe.to_string_lossy(),
            version_str = version_str,
            report_str = report_file.to_string_lossy(),
            installed_exe_str = installed_exe.to_string_lossy(),
        );

        std::fs::write(&helper_sh, sh_content)
            .map_err(|e| format!("Failed to write helper script: {e}"))?;

        let _ = std::process::Command::new("chmod")
            .args(["+x", &helper_sh.to_string_lossy()])
            .status();

        let status = std::process::Command::new("sh")
            .arg(&helper_sh)
            .spawn();

        if let Err(e) = status {
            return Err(format!("Failed to spawn detached helper: {e}"));
        }
    }

    // Exit this AnF process
    app.exit(0);
    Ok(())
}

/// Spawns the autotest loop. Runs at startup and every 2 hours while `kevo_auto_test` is true.
/// Does NOT spawn if `--kevo-selftest` is present.
pub fn spawn_autotest_loop(app: AppHandle) {
    if is_kevo_selftest() {
        // Rule 6: Under --kevo-selftest, AnF never polls for test builds
        return;
    }

    tauri::async_runtime::spawn(async move {
        // Initial delay after startup
        tokio::time::sleep(Duration::from_secs(10)).await;

        loop {
            let settings = crate::settings::load();
            if settings.kevo_auto_test {
                crate::log::line("Checking for Kevo test builds on GitHub...");
                if let Err(e) = check_and_run_test_build(&app).await {
                    crate::log::line(format!("Kevo autotest check error: {e}"));
                }
            }

            // Every 2 hours
            tokio::time::sleep(Duration::from_secs(2 * 60 * 60)).await;
        }
    });
}

/// Manual trigger command to immediately run check.
#[tauri::command]
pub async fn kevo_autotest_check_now(app: AppHandle) -> Result<String, String> {
    match check_and_run_test_build(&app).await? {
        Some(v) => Ok(format!("Dispatched test build for version {v}")),
        None => Ok("No newer test builds found.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_kevo_versions_accurately() {
        assert_eq!(parse_kevo_version("kevo-test-v0.1.59"), Some((0, 1, 59)));
        assert_eq!(parse_kevo_version("v0.1.60"), Some((0, 1, 60)));
        assert_eq!(parse_kevo_version("0.2.0"), Some((0, 2, 0)));
        assert_eq!(parse_kevo_version("kevo-test-v0.1.58-beta"), None);
        assert_eq!(parse_kevo_version("invalid"), None);
    }

    #[test]
    fn sanitize_home_paths_replaces_home_dir() {
        let home = crate::platform::home_dir();
        let raw = format!("{}/AnF-Kevo/selftest.json", home.display());
        let clean = sanitize_home_paths(&raw);
        assert!(clean.starts_with("~/AnF-Kevo"));
        assert!(!clean.contains(&home.to_string_lossy().into_owned()));
    }
}
