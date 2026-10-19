//! User-triggered public update checks and an allowlisted support report.
use serde::Serialize;
use serde_json::{json, Value};
use std::io::Write;
use tauri::{Manager, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo { current: String, latest: Option<String>, available: bool, url: String, message: String }

fn version(tag: &str) -> Option<(u64,u64,u64)> {
    let tag=tag.strip_prefix("anf-v").or_else(||tag.strip_prefix('v')).unwrap_or(tag);
    if tag.contains('-') { return None; }
    let parts=tag.split('+').next()?.split('.').map(str::parse::<u64>).collect::<Result<Vec<_>,_>>().ok()?;
    (parts.len()==3).then(||(parts[0],parts[1],parts[2]))
}

#[tauri::command]
pub async fn app_check_updates() -> Result<UpdateInfo,String> {
    let current=env!("CARGO_PKG_VERSION").to_string();
    let releases="https://github.com/mwalikokelvo/AnF/releases".to_string();
    let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none()).build().map_err(|_|"Could not start the update check.")?;
    let mut response=client.get("https://api.github.com/repos/mwalikokelvo/AnF/releases/latest")
        .header("User-Agent",format!("AnF/{current}"))
        .header("Accept","application/vnd.github+json").send().await
        .map_err(|_|"Could not connect to GitHub. Try again when online.")?;
    if response.status()==reqwest::StatusCode::NOT_FOUND {
        return Ok(UpdateInfo{current,latest:None,available:false,url:releases,message:"No public release is available from this repository. Local builds may be newer.".into()});
    }
    if !response.status().is_success(){return Err("GitHub could not check releases. Try again later.".into());}
    let mut bytes=Vec::new();
    while let Some(chunk)=response.chunk().await.map_err(|_|"Update check was interrupted.")? {
        if bytes.len()+chunk.len()>256_000{return Err("Release information exceeded the size limit.".into());}
        bytes.extend_from_slice(&chunk);
    }
    let release:Value=serde_json::from_slice(&bytes).map_err(|_|"GitHub returned invalid release information.")?;
    let tag=release["tag_name"].as_str().filter(|s|s.len()<100).ok_or("Release version is missing.")?;
    let latest=version(tag).ok_or("The public release uses an unrecognized version. Open releases to review it.")?;
    let installed=version(&current).ok_or("Installed version could not be compared.")?;
    let available=latest>installed;
    let message=if available {format!("{tag} is available. Open the release page to review and download it.")}
        else if latest<installed {format!("This local build is newer than the latest public release ({tag}).")}
        else {"You have the latest public release.".into()};
    Ok(UpdateInfo{current,latest:Some(tag.into()),available,url:releases,message})
}

#[tauri::command]
pub fn app_export_diagnostics(app:tauri::AppHandle,chat:State<crate::ai::Chat>) -> Result<String,String> {
    // Do not attach logs, paths, names, documents, cookies or provider data.
    let state=crate::workspace_commands::workspace_diagnostics(chat);
    let music=app.path().resolve("spotube/spotube.exe",tauri::path::BaseDirectory::Resource).ok().is_some_and(|p|p.is_file());
    let report=support_report(&state,music);
    let dir=crate::settings::local_dir().join("documents");
    crate::platform::ensure_private_dir(&dir).map_err(|_|"Could not create the support report folder.")?;
    let path=dir.join(format!("AnF-diagnostics-{}.json",crate::local_ai::random_key()?));
    let mut file=std::fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|_|"Could not save the support report.")?;
    file.write_all(serde_json::to_string_pretty(&report).map_err(|_|"Could not format the report.")?.as_bytes()).and_then(|_|file.sync_all()).map_err(|_|"Could not finish saving the report.")?;
    Ok(path.to_string_lossy().into())
}

fn support_report(state:&Value,music:bool)->Value {
    json!({"application":"AnF","version":env!("CARGO_PKG_VERSION"),"platform":std::env::consts::OS,
        "architecture":std::env::consts::ARCH,"offlineRuntime":state["runtime"].as_bool().unwrap_or(false),"fastModel":state["fast"].as_bool().unwrap_or(false),
        "balancedModel":state["balanced"].as_bool().unwrap_or(false),"ocr":state["ocr"].as_bool().unwrap_or(false),"totalRamBytes":state["totalRam"].as_u64().unwrap_or(0),
        "freeRamBytes":state["freeRam"].as_u64().unwrap_or(0),"embeddedMusic":music})
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn compares_numeric_versions_and_rejects_preview_tags(){
        assert!(version("anf-v0.1.100")>version("0.1.25"));
        assert_eq!(version("v1.2.3+build"),Some((1,2,3)));
        assert_eq!(version("v1.2.3-preview"),None);
        assert_eq!(version("unexpected"),None);
    }
    #[test]fn support_export_excludes_private_and_unexpected_data(){
        let state=json!({"runtime":true,"fast":true,"ocr":true,"log":"secret-token","documents":"private-path","cookies":"session-token","version":"untrusted","totalRam":"private-text"});
        let report=support_report(&state,true);let text=report.to_string();
        for value in ["secret-token","private-path","session-token","untrusted","private-text"]{assert!(!text.contains(value));}
        assert_eq!(report["offlineRuntime"],true);assert_eq!(report["totalRamBytes"],0);
    }
}
