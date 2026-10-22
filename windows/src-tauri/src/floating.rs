//! Remember a bounded floating-panel position independently on each display.
use serde::{Deserialize,Serialize};
use std::collections::BTreeMap;
use tauri::PhysicalPosition;
use std::sync::{Mutex,OnceLock};

#[derive(Clone,Copy,Serialize,Deserialize)]
pub struct Anchor { pub x:f64,pub y:f64 }
fn path()->std::path::PathBuf {crate::settings::config_dir().join("floating-positions.json")}
fn positions()-> &'static Mutex<BTreeMap<String,Anchor>> {
    static CACHE:OnceLock<Mutex<BTreeMap<String,Anchor>>>=OnceLock::new();
    CACHE.get_or_init(||Mutex::new(std::fs::read(path()).ok().and_then(|bytes|serde_json::from_slice(&bytes).ok()).unwrap_or_default()))
}
fn monitor_cache()-> &'static Mutex<Option<String>>{
    static LAST:OnceLock<Mutex<Option<String>>>=OnceLock::new();
    LAST.get_or_init(||Mutex::new(std::fs::read_to_string(crate::settings::config_dir().join("floating-display.txt")).ok()))
}
pub fn last_monitor()->Option<String>{monitor_cache().lock().unwrap().clone()}
pub fn remember_monitor(name:Option<String>){
    let path=crate::settings::config_dir().join("floating-display.txt");
    if let Some(value)=&name{let _=std::fs::write(&path,value);}else{let _=std::fs::remove_file(path);}
    *monitor_cache().lock().unwrap()=name;
}
fn key(m:&tauri::Monitor)->String {m.name().cloned().unwrap_or_else(||format!("{}x{}",m.size().width,m.size().height))}
pub fn anchor(m:&tauri::Monitor)->Anchor {
    let anchor=positions().lock().unwrap().get(&key(m)).copied().unwrap_or(Anchor{x:0.5,y:0.0});
    Anchor{x:bounded(anchor.x,0.5),y:bounded(anchor.y,0.0)}
}
fn bounded(n:f64,default:f64)->f64 {if n.is_finite(){n.clamp(0.0,1.0)}else{default}}
fn save(m:&tauri::Monitor,anchor:Anchor)->Result<(),String>{
    let mut positions=positions().lock().unwrap();positions.insert(key(m),anchor);
    crate::platform::ensure_private_dir(&crate::settings::config_dir()).map_err(|_|"Could not save the floating position.")?;
    std::fs::write(path(),serde_json::to_vec(&*positions).map_err(|_|"Could not format floating positions.")?).map_err(|_|"Could not save the floating position.".into())
}

#[tauri::command]
pub fn floating_reset(app:tauri::AppHandle)->Result<(),String>{
    let win=crate::island::window(&app).ok_or("Floating panel unavailable.")?;
    let monitor=win.current_monitor().map_err(|_|"Display unavailable.")?.ok_or("Display unavailable.")?;
    save(&monitor,Anchor{x:0.5,y:0.0})?;
    let size=win.outer_size().map_err(|_|"Floating size unavailable.")?;
    win.set_position(PhysicalPosition::new(monitor.position().x+(monitor.size().width as i32-size.width as i32)/2,monitor.position().y))
        .map_err(|_|"Could not reset the floating position.".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn floating_move(app:tauri::AppHandle,window:tauri::WebviewWindow)->Result<(),String>{
    if window.label()!=crate::island::WINDOW_LABEL{return Err("Move the floating panel from its handle.".into());}
    window.start_dragging().map_err(|_|"Could not start moving the floating panel.".to_string())?;
    std::thread::spawn(move||{
        std::thread::sleep(std::time::Duration::from_millis(300));
        for _ in 0..300 {if !crate::platform::left_button_down(){break;}std::thread::sleep(std::time::Duration::from_millis(50));}
        let (Ok(Some(m)),Ok(p),Ok(size))=(window.current_monitor(),window.outer_position(),window.outer_size())else{return;};
        let available_x=m.size().width.saturating_sub(size.width) as f64;
        let available_y=m.size().height.saturating_sub(size.height) as f64;
        let anchor=Anchor{x:bounded((p.x-m.position().x)as f64/available_x.max(1.0),0.5),y:bounded((p.y-m.position().y)as f64/available_y.max(1.0),0.0)};
        let _=save(&m,anchor);
        remember_monitor(m.name().cloned());
        // The next boot remembers the new display; clamp this move in place now.
        let _=window.set_position(PhysicalPosition::new(m.position().x+(available_x*anchor.x).round() as i32,m.position().y+(available_y*anchor.y).round() as i32));
        let _=app;
    });Ok(())
}

#[cfg(test)]mod tests {
    use super::*;
    #[test]fn clamps_invalid_and_offscreen_anchors(){assert_eq!(bounded(f64::NAN,0.5),0.5);assert_eq!(bounded(-2.0,0.5),0.0);assert_eq!(bounded(4.0,0.5),1.0);}
}
