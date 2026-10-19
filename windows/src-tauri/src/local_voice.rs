//! Optional private voice sidecar. Requests use stdin, never a shell or a network API.
use std::{path::PathBuf,process::{Command,Stdio},sync::{Mutex,Arc,atomic::{AtomicBool,Ordering}},time::{Instant,Duration},io::Write};
use tauri::{Manager,State};
#[derive(Default)]pub struct VoiceJobs(Mutex<Option<(String,Arc<AtomicBool>)>>);
fn workspace(label:&str)->Result<(),String>{if label!="workspace"{return Err("Open local voices in the workspace.".into());}Ok(())}
fn valid_request(id:&str,voice:&str,text:&str)->Result<(),String>{if id.is_empty()||id.len()>64||!id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-')||!["amazing","always-forever","burt-preview","serafina-preview","kelvin-preview"].contains(&voice)||text.trim().is_empty()||text.chars().count()>600{return Err("Voice requests require a registered voice and at most 600 characters.".into());}Ok(())}
fn ready(root:&std::path::Path)->bool{
 let required=["python/python.exe","worker.py","provenance.json","model/ve.safetensors","model/t3_nano_v1.safetensors","model/s3gen_meanflow.safetensors","model/tokenizer_config.json","source/chatterbox/tts_nano.py","references/amazing.wav","references/always-forever.wav","references/burt-preview.wav","references/serafina-preview.wav","references/kelvin-preview.wav"];
 if !required.iter().all(|p|root.join(p).is_file()){return false;}
 let bytes=match std::fs::read(root.join("ready.json")){Ok(b)if b.len()<16384=>b,_=>return false};
 let value:serde_json::Value=match serde_json::from_slice(&bytes){Ok(v)=>v,Err(_)=>return false};
 value["engine"]=="Chatterbox Nano CPU"&&value["offline"]==true&&["amazing","always-forever","burt-preview","serafina-preview","kelvin-preview"].iter().all(|voice|value["proof"].as_array().map(|items|items.iter().any(|p|p["voice"]==*voice&&p["sampleRate"]==24000&&p["seconds"].as_f64().map(|s|s>0.25&&s<=90.0).unwrap_or(false)&&p["sha256"].as_str().map(|s|s.len()==64&&s.bytes().all(|b|b.is_ascii_hexdigit())).unwrap_or(false))).unwrap_or(false))
}
fn home(app:&tauri::AppHandle)->Result<PathBuf,String>{
 let local=crate::settings::local_dir().join("local-voice");
 let bundled=app.path().resource_dir().map_err(|e|e.to_string())?.join("local-voice");
 let portable=std::env::current_exe().ok().and_then(|p|p.parent().map(|p|p.join("local-voice")));
 for p in [Some(local),Some(bundled),portable].into_iter().flatten(){if ready(&p){return p.canonicalize().map_err(|e|e.to_string());}}
 Err("Install the private local voice pack beside AnF.exe or in the AnF data folder, then refresh Reading assets. Choose an installed device voice while it is unavailable.".into())
}
#[tauri::command]pub fn local_voice_status(window:tauri::WebviewWindow,app:tauri::AppHandle)->Result<(),String>{workspace(window.label())?;home(&app).map(|_|())}
#[tauri::command]pub fn local_voice_cancel(window:tauri::WebviewWindow,jobs:State<VoiceJobs>,id:String)->Result<(),String>{workspace(window.label())?;if let Ok(job)=jobs.0.lock(){if let Some((key,cancel))=job.as_ref(){if key==&id{cancel.store(true,Ordering::Relaxed);}}}Ok(())}
#[tauri::command]pub async fn local_voice_speak(window:tauri::WebviewWindow,app:tauri::AppHandle,jobs:State<'_,VoiceJobs>,id:String,voice:String,text:String)->Result<Vec<u8>,String>{
 workspace(window.label())?;valid_request(&id,&voice,&text)?;
 let root=home(&app)?;let cancel=Arc::new(AtomicBool::new(false));
 {let mut lock=jobs.0.lock().map_err(|_|"Voice job lock unavailable.")?;if lock.is_some(){return Err("The previous local voice request is stopping. Try again shortly.".into());}*lock=Some((id,cancel.clone()));}
 let result=tokio::task::spawn_blocking(move||run(root,voice,text,cancel)).await.map_err(|_|"Local voice job stopped.".to_string()).and_then(|r|r);
 if let Ok(mut lock)=jobs.0.lock(){*lock=None;}result
}
fn run(root:PathBuf,voice:String,text:String,cancel:Arc<AtomicBool>)->Result<Vec<u8>,String>{
 let output=root.join("output.wav");let _=std::fs::remove_file(&output);
 let result=(||{
 let mut cmd=Command::new(root.join("python/python.exe"));cmd.arg(root.join("worker.py")).current_dir(&root).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null());
 #[cfg(windows)]{use std::os::windows::process::CommandExt;cmd.creation_flags(0x08000000);}
 let mut child=cmd.spawn().map_err(|_|"Local voice runtime could not start. Reinstall its private pack.")?;
 let payload=serde_json::json!({"voice":voice,"text":text}).to_string();
 if child.stdin.take().ok_or("Voice input unavailable.")?.write_all(payload.as_bytes()).is_err(){let _=child.kill();let _=child.wait();return Err("Local voice input failed.".into());}
 let started=Instant::now();loop{
 if cancel.load(Ordering::Relaxed)||started.elapsed()>Duration::from_secs(240){let _=child.kill();let _=child.wait();return Err("Local synthesis cancelled or exceeded four minutes.".into());}
 match child.try_wait(){Ok(Some(s))=>{if !s.success(){return Err("Local voice synthesis failed. Verify the private voice pack and choose an installed voice.".into());}break;},Ok(None)=>std::thread::sleep(Duration::from_millis(60)),Err(_)=>{let _=child.kill();let _=child.wait();return Err("Local voice runtime stopped unexpectedly.".into());}}
 }
 let size=output.metadata().map_err(|_|"The voice runtime produced no audio.")?.len();if !(44..=5_000_000).contains(&size){return Err("Local voice audio exceeded its size limit.".into());}
 let bytes=std::fs::read(&output).map_err(|_|"Local voice audio could not be read.")?;if bytes.get(..4)!=Some(b"RIFF")||bytes.get(8..12)!=Some(b"WAVE"){return Err("The voice runtime produced invalid audio.".into());}Ok(bytes)
 })();let _=std::fs::remove_file(output);result
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn only_workspace_can_access_voices(){assert!(workspace("workspace").is_ok());for label in ["island","settings",""]{assert!(workspace(label).is_err());}}
 #[test]fn voice_requests_are_bounded(){assert!(valid_request("abc-1","amazing","A new story.").is_ok());assert!(valid_request("abc","always-forever",&"🌻".repeat(600)).is_ok());for (id,voice,text) in [("../x","amazing","x"),("x","other","x"),("x","amazing"," ")]{assert!(valid_request(id,voice,text).is_err());}assert!(valid_request("x","amazing",&"a".repeat(601)).is_err());}
 #[test]fn missing_pack_never_claims_readiness(){assert!(!ready(&std::env::temp_dir().join("anf-no-such-voice-pack")));}
}
