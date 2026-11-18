//! Kevo float: a micro-pill window that shows Kevo's state (`docs/kevo-briefs/hud.md`, H.2).
//! Built like `companion.rs`: no decorations, transparent, no shadow, always on top, skip taskbar, not focusable.
//! The view changes only on `kevo://state` events (AGENTS.md rule 4). No timers or polling.
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "kevo-float";
/// State 1 (micro-pill): 48 × 28 px.
pub const SIZE: (f64, f64) = (48.0, 28.0);

#[tauri::command]
pub fn kevo_float_open(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(LABEL) {
        win.show().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let mut url = crate::settings_page_url(&app);
    match &mut url {
        WebviewUrl::App(path) => *path = "kevo-float.html".into(),
        WebviewUrl::External(u) => u.set_path("/kevo-float.html"),
        _ => {}
    }
    let win = WebviewWindowBuilder::new(&app, LABEL, url)
        .additional_browser_args(crate::BROWSER_ARGS)
        .data_directory(crate::settings::local_dir().join("webview-v014"))
        .title("Kevo")
        .inner_size(SIZE.0, SIZE.1)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .build()
        .map_err(|e| e.to_string())?;

    crate::platform::make_non_activating(&win);
    Ok(())
}

#[tauri::command]
pub fn kevo_float_close(app: AppHandle) -> Result<(), String> {
    match app.get_webview_window(LABEL) {
        Some(win) => win.close().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pill_size_is_48_by_28() {
        assert_eq!(SIZE, (48.0, 28.0));
    }

    #[test]
    fn label_is_kevo_float() {
        assert_eq!(LABEL, "kevo-float");
    }
}
