//! Desktop companion: a small always-on-top window with volume and media buttons.
//! It is opened only from Settings. It does not capture the screen or the microphone.
//! Windows only for now; other systems get a plain error.
use tauri::{AppHandle,Manager,WebviewUrl,WebviewWindowBuilder};
const LABEL:&str="companion";
// Measured content size of companion.html: 340x120 in full mode (buttons on one row), 190x54 folded; +2 px of margin.
const SIZES:[(f64,f64);2]=[(340.0,122.0),(190.0,56.0)];
#[cfg(windows)]
fn press(vk:u16)->Result<(),String>{
    use windows::Win32::UI::Input::KeyboardAndMouse::{SendInput,INPUT,INPUT_0,INPUT_KEYBOARD,KEYBDINPUT,KEYBD_EVENT_FLAGS,KEYEVENTF_KEYUP,VIRTUAL_KEY};
    let key=|flags:KEYBD_EVENT_FLAGS|INPUT{r#type:INPUT_KEYBOARD,Anonymous:INPUT_0{ki:KEYBDINPUT{wVk:VIRTUAL_KEY(vk),wScan:0,dwFlags:flags,time:0,dwExtraInfo:0}}};
    let inputs=[key(KEYBD_EVENT_FLAGS(0)),key(KEYEVENTF_KEYUP)];
    if unsafe{SendInput(&inputs,std::mem::size_of::<INPUT>() as i32)}==2{Ok(())}else{Err("Windows did not accept the key press.".into())}
}
#[cfg(not(windows))]
fn press(_:u16)->Result<(),String>{Err("The companion's controls are only available on Windows.".into())}
/// Windows virtual-key codes for the media keys.
pub fn key_for(direction:&str)->Option<u16>{match direction{"down"=>Some(0xAE),"up"=>Some(0xAF),"mute"=>Some(0xAD),"play"=>Some(0xB3),_=>None}}
#[tauri::command]pub fn companion_key(direction:String)->Result<(),String>{press(key_for(&direction).ok_or("Unknown control.")?)}
#[tauri::command]pub fn companion_open(app:AppHandle)->Result<(),String>{
    if !cfg!(windows){return Err("The companion is only available on Windows for now.".into());}
    if let Some(win)=app.get_webview_window(LABEL){win.show().map_err(|e|e.to_string())?;return win.set_focus().map_err(|e|e.to_string());}
    let mut url=crate::settings_page_url(&app);
    match &mut url{WebviewUrl::App(path)=>*path="companion.html".into(),WebviewUrl::External(u)=>u.set_path("/companion.html"),_=>{}}
    WebviewWindowBuilder::new(&app,LABEL,url).additional_browser_args(crate::BROWSER_ARGS).data_directory(crate::settings::local_dir().join("webview-v014"))
        .title("Companion — AnF").inner_size(SIZES[0].0,SIZES[0].1).resizable(false).decorations(false).transparent(true).shadow(false).always_on_top(true).skip_taskbar(true).build().map(|_|()).map_err(|e|e.to_string())
}
#[tauri::command]pub fn companion_close(app:AppHandle)->Result<(),String>{match app.get_webview_window(LABEL){Some(win)=>win.close().map_err(|e|e.to_string()),None=>Ok(())}}
#[tauri::command]pub fn companion_compact(app:AppHandle,compact:bool)->Result<(),String>{
    let (w,h)=SIZES[usize::from(compact)];
    match app.get_webview_window(LABEL){Some(win)=>win.set_size(tauri::LogicalSize::new(w,h)).map_err(|e|e.to_string()),None=>Ok(())}
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn only_known_controls_map_to_media_keys(){assert_eq!(key_for("down"),Some(0xAE));assert_eq!(key_for("up"),Some(0xAF));assert_eq!(key_for("mute"),Some(0xAD));assert_eq!(key_for("play"),Some(0xB3));for bad in["","UP","next","alt+f4"]{assert_eq!(key_for(bad),None,"{bad}");}}
    #[test]fn compact_is_smaller_than_full(){assert!(SIZES[1].0<SIZES[0].0&&SIZES[1].1<SIZES[0].1);}
}
