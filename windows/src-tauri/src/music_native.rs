use serde::Deserialize;
use tauri::Manager;

#[derive(Deserialize)]
pub struct MusicBounds { x: i32, y: i32, width: i32, height: i32 }
impl MusicBounds {
    fn validate(&self) -> Result<(), String> {
        if self.width < 1 || self.height < 1 || self.width > 16384 || self.height > 16384 || self.x.abs_diff(0) > 16384 || self.y.abs_diff(0) > 16384 {
            return Err("Invalid embedded music bounds.".into());
        }
        Ok(())
    }
}

fn executable(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().resolve("spotube/spotube.exe", tauri::path::BaseDirectory::Resource).map_err(|_| "Music runtime path unavailable.".into())
}

#[tauri::command]
pub fn music_available(app: tauri::AppHandle) -> bool {
    cfg!(all(windows, feature = "embedded-music")) && executable(&app).is_ok_and(|path| path.is_file())
}

#[cfg(all(windows, feature = "embedded-music"))]
mod native {
    use super::*;
    use std::{collections::HashMap, io::{BufRead, BufReader, Read, Write}, process::{Child, ChildStdin, Command, Stdio}, sync::{Mutex, OnceLock, atomic::{AtomicU64, Ordering}}};
    use std::os::windows::process::CommandExt;
    use tauri::Emitter;
    struct Runtime { child: Child, input: ChildStdin, generation: u64 }
    impl Drop for Runtime { fn drop(&mut self) { let _ = self.child.kill(); let _ = self.child.wait(); } }
    type Reply = tokio::sync::oneshot::Sender<Result<(), String>>;
    static RUNTIME: OnceLock<Mutex<Option<Runtime>>> = OnceLock::new();
    static PENDING: OnceLock<Mutex<HashMap<u64, (u64, Reply)>>> = OnceLock::new();
    static SEQUENCE: AtomicU64 = AtomicU64::new(1);
    fn runtime() -> &'static Mutex<Option<Runtime>> { RUNTIME.get_or_init(|| Mutex::new(None)) }
    fn pending() -> &'static Mutex<HashMap<u64, (u64, Reply)>> { PENDING.get_or_init(|| Mutex::new(HashMap::new())) }

    pub fn show(app: &tauri::AppHandle, window: &tauri::WebviewWindow, bounds: &MusicBounds) -> Result<(), String> {
        bounds.validate()?;
        if window.label() != "workspace" { return Err("Music belongs to the workspace window.".into()); }
        let mut guard=runtime().lock().map_err(|_| "Music runtime is busy.")?;
        if let Some(current)=guard.as_mut() { if current.child.try_wait().map_err(|_| "Music process unavailable.")?.is_some() { *guard=None; } }
        if guard.is_none() {
            let path=executable(app)?;
            if !path.is_file() { return Err("Embedded Spotube is not packaged in this build.".into()); }
            let hwnd=window.hwnd().map_err(|_| "Workspace window unavailable.")?;
            let generation=SEQUENCE.fetch_add(1,Ordering::Relaxed);
            let mut child=Command::new(&path).current_dir(path.parent().ok_or("Music folder unavailable.")?)
                .env("ANF_PARENT_HWND",format!("{}",hwnd.0 as usize)).env("ANF_PARENT_PID",std::process::id().to_string())
                .creation_flags(0x08000000).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
                .spawn().map_err(|_| "Embedded music could not start.")?;
            let input=child.stdin.take().ok_or("Music input unavailable.")?;
            let output=child.stdout.take().ok_or("Music output unavailable.")?;
            let app=app.clone();
            std::thread::spawn(move || {
                let mut reader=BufReader::new(output);
                loop {
                    let mut line=Vec::new();
                    // Bound even non-protocol plugin output. No third-party log text is retained.
                    match reader.by_ref().take(4097).read_until(b'\n',&mut line) { Ok(0)|Err(_)=>break, Ok(_)=>{} }
                    if line.len()>4096 { break; }
                    let Ok(text)=std::str::from_utf8(&line) else { continue };
                    let Some(reply)=text.strip_prefix("ANF_REPLY ") else { continue };
                    let mut parts=reply.split_whitespace();
                    if let Some(id)=parts.next() {
                        if id=="CLOSED" { let _=app.emit("spotube-closed",());continue; }
                        if let Ok(id)=id.parse::<u64>() {
                            if let Ok(mut pending)=pending().lock() {
                                if pending.get(&id).is_some_and(|entry| entry.0==generation) {
                                    if let Some((_,sender))=pending.remove(&id) { let _=sender.send(if parts.next()==Some("OK") {Ok(())}else{Err("Spotube could not pause playback.".into())}); }
                                }
                            }
                        }
                    }
                }
                if let Ok(mut pending)=pending().lock() {
                    let ids:Vec<_>=pending.iter().filter(|(_,entry)|entry.0==generation).map(|(id,_)|*id).collect();
                    for id in ids { if let Some((_,reply))=pending.remove(&id) { let _=reply.send(Err("Spotube stopped responding.".into())); } }
                }
                let _=app.emit("spotube-closed",());
            });
            *guard=Some(Runtime {child,input,generation});
        }
        let state=guard.as_mut().ok_or("Music runtime unavailable.")?;
        writeln!(state.input,"SHOW {} {} {} {}",bounds.x,bounds.y,bounds.width,bounds.height).and_then(|_|state.input.flush()).map_err(|_| "Music view could not open.".into())
    }

    pub fn hide() -> Result<(), String> {
        if let Some(state)=runtime().lock().map_err(|_| "Music runtime is busy.")?.as_mut() {
            writeln!(state.input,"HIDE").and_then(|_|state.input.flush()).map_err(|_| "Music view could not hide.")?;
        }
        Ok(())
    }

    pub async fn pause() -> Result<(), String> {
        let id=SEQUENCE.fetch_add(1,Ordering::Relaxed);
        let (sender,receiver)=tokio::sync::oneshot::channel();
        {
            let mut guard=runtime().lock().map_err(|_| "Music runtime is busy.")?;
            let Some(state)=guard.as_mut() else { return Ok(()) };
            pending().lock().map_err(|_| "Music requests are busy.")?.insert(id,(state.generation,sender));
            if writeln!(state.input,"PAUSE {id}").and_then(|_|state.input.flush()).is_err() {
                if let Ok(mut pending)=pending().lock(){pending.remove(&id);}
                return Err("Spotube could not pause playback.".into());
            }
        }
        let result=tokio::time::timeout(std::time::Duration::from_secs(12),receiver).await;
        if let Ok(mut pending)=pending().lock(){pending.remove(&id);}
        result.map_err(|_|"Spotube did not respond. Stop music before previewing audio.".to_string())?.map_err(|_|"Spotube stopped responding.".to_string())?
    }
    pub fn shutdown(){if let Ok(mut state)=runtime().lock(){*state=None;}}
}

#[tauri::command]
pub fn music_open(app: tauri::AppHandle, window: tauri::WebviewWindow, bounds: MusicBounds) -> Result<(),String> {
    bounds.validate()?;
    #[cfg(all(windows, feature = "embedded-music"))] { native::show(&app,&window,&bounds) }
    #[cfg(not(all(windows, feature = "embedded-music")))] { let _=(app,window);Err("Embedded Spotube requires the Windows native build.".into()) }
}
#[tauri::command]
pub fn music_hide() -> Result<(),String> {
    #[cfg(all(windows, feature = "embedded-music"))] { native::hide() }
    #[cfg(not(all(windows, feature = "embedded-music")))] { Ok(()) }
}
#[tauri::command]
pub async fn music_pause() -> Result<(),String> {
    #[cfg(all(windows, feature = "embedded-music"))] { native::pause().await }
    #[cfg(not(all(windows, feature = "embedded-music")))] { Ok(()) }
}
pub fn shutdown(){#[cfg(all(windows, feature = "embedded-music"))] native::shutdown();}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn rejects_zero_oversized_and_overflowing_native_view_bounds(){
        for (x,width,height) in [(0,0,1),(0,1,0),(0,16385,1),(i32::MIN,100,100)] {
            assert!(MusicBounds{x,y:0,width,height}.validate().is_err());
        }
        assert!(MusicBounds{x:10,y:20,width:900,height:700}.validate().is_ok());
    }
}
