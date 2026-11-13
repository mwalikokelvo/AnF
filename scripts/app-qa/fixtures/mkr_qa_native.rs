// Compiled ONLY into the disposable engineering snapshot, never production AnF.
use tauri::Manager;
use std::sync::{Mutex,atomic::{AtomicU8,Ordering}};
static ACK_MODE: AtomicU8=AtomicU8::new(0);
static DEFERRED: Mutex<Option<(String,bool)>>=Mutex::new(None);
static HOLD_PAUSE_REPLY: AtomicU8=AtomicU8::new(0);
static PAUSE_REPLY: Mutex<Option<tokio::sync::oneshot::Sender<()>>>=Mutex::new(None);
// The actual pause has ALREADY completed. Delay only its real result, not the
// pause, capability, decoder state or success value. Always bounded to 10s.
pub async fn hold_completed_pause_reply()->Result<(),String>{
    if HOLD_PAUSE_REPLY.swap(0,Ordering::AcqRel)!=1{return Ok(());}
    let (send,receive)=tokio::sync::oneshot::channel();
    *PAUSE_REPLY.lock().map_err(|_|"QA pause reply unavailable")?=Some(send);
    let result=tokio::time::timeout(std::time::Duration::from_secs(10),receive).await;
    PAUSE_REPLY.lock().map_err(|_|"QA pause reply unavailable")?.take();
    match result{Ok(Ok(()))=>Ok(()),_=>Err("QA pause reply was not released".into())}
}
#[tauri::command]
pub fn qa_native_pause_reply_arm(window:tauri::WebviewWindow)->Result<(),String>{
    if window.label()!="workspace"{return Err("QA belongs to workspace".into());}
    if PAUSE_REPLY.lock().map_err(|_|"QA pause reply unavailable")?.is_some(){return Err("QA pause reply already held".into());}
    HOLD_PAUSE_REPLY.store(1,Ordering::Release);Ok(())
}
#[tauri::command]
pub fn qa_native_pause_reply_waiting(window:tauri::WebviewWindow)->Result<bool,String>{
    if window.label()!="workspace"{return Err("QA belongs to workspace".into());}
    Ok(PAUSE_REPLY.lock().map_err(|_|"QA pause reply unavailable")?.is_some())
}
#[tauri::command]
pub fn qa_native_pause_reply_release(window:tauri::WebviewWindow)->Result<(),String>{
    if window.label()!="workspace"{return Err("QA belongs to workspace".into());}
    HOLD_PAUSE_REPLY.store(0,Ordering::Release);
    if let Some(send)=PAUSE_REPLY.lock().map_err(|_|"QA pause reply unavailable")?.take(){let _=send.send(());}
    Ok(())
}
pub fn capture_ack(token:&str,paused:bool)->Result<bool,String> {
    if ACK_MODE.load(Ordering::Acquire)!=2 {return Ok(false);}
    *DEFERRED.lock().map_err(|_| "QA fault state unavailable")?=Some((token.into(),paused));
    Ok(true)
}
pub fn pause_ack_value(paused:bool)->bool {
    if ACK_MODE.compare_exchange(1,0,Ordering::AcqRel,Ordering::Acquire).is_ok(){false}else{paused}
}
#[tauri::command]
pub fn qa_native_ack_mode(window:tauri::WebviewWindow,mode:u8)->Result<(),String>{
    if window.label()!="workspace" || mode>2{return Err("Invalid QA fault mode".into());}
    *DEFERRED.lock().map_err(|_| "QA fault state unavailable")?=None;
    ACK_MODE.store(mode,Ordering::Release);Ok(())
}
#[tauri::command]
pub fn qa_native_ack_waiting(window:tauri::WebviewWindow)->Result<bool,String>{
    if window.label()!="workspace" {return Err("QA belongs to workspace".into());}
    Ok(DEFERRED.lock().map_err(|_| "QA fault state unavailable")?.is_some())
}
#[tauri::command]
pub fn qa_native_release_ack(window:tauri::WebviewWindow,state:tauri::State<'_,crate::mkr_native::Managed>)->Result<(),String>{
    if window.label()!="workspace" {return Err("QA belongs to workspace".into());}
    ACK_MODE.store(0,Ordering::Release);
    let (token,paused)=DEFERRED.lock().map_err(|_| "QA fault state unavailable")?.take().ok_or("No deferred QA acknowledgement")?;
    crate::mkr_native::mkr_ack(window,state,token,paused)
}
#[tauri::command]
pub fn qa_native_info(window: tauri::WebviewWindow) -> Result<serde_json::Value,String> {
    if window.label()!="workspace" {return Err("QA belongs to workspace".into());}
    let root=window.app_handle().path().resolve("mkr-runtime",tauri::path::BaseDirectory::Resource).map_err(|_| "No resource root")?;
    let verified=anf_mkr_windows_audio::resources::VerifiedRuntime::verify(&root,include_str!("../mkr-engineering-manifest.json")).is_ok();
    Ok(serde_json::json!({"resourceRoot":root,"exists":root.is_dir(),"verified":verified}))
}
#[tauri::command]
pub fn qa_native_result(window: tauri::WebviewWindow, payload: serde_json::Value) -> Result<(), String> {
    if window.label() != "workspace" { return Err("QA belongs to workspace".into()); }
    let bytes=serde_json::to_vec_pretty(&payload).map_err(|_| "Invalid QA result")?;
    if bytes.len()>65536 || payload.get("engineeringOnly") != Some(&serde_json::Value::Bool(true)) {
        return Err("Invalid engineering result".into());
    }
    let path=crate::settings::local_dir().join("mkr-native-selftest-result.json");
    std::fs::write(path,bytes).map_err(|_| "Could not save QA result".into())
}
