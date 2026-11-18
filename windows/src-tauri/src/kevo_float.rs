//! Kevo float: a micro-pill and telemetry window that shows Kevo's state (`docs/kevo-briefs/hud.md`, H.2 & H.3).
//! Built like `companion.rs`: no decorations, transparent, no shadow, always on top, skip taskbar, not focusable.
//! Resizing between State 1 (48 × 28 px) and State 2 (420 × 110 px) goes through `kevo_float_resize` / `kevo_float_compact`.
//! The view changes only on `kevo://state` events (AGENTS.md rule 4). No timers or polling except the single 4s fold timeout.
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "kevo-float";
/// State 1 (micro-pill): 48 × 28 px.
/// State 2 (telemetry pill): 420 × 110 px.
pub const SIZES: [(f64, f64); 2] = [(48.0, 28.0), (420.0, 110.0)];
pub const SIZE: (f64, f64) = SIZES[0];

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
        .inner_size(SIZES[0].0, SIZES[0].1)
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

#[tauri::command]
pub fn kevo_float_resize(app: AppHandle, expanded: bool) -> Result<(), String> {
    let (w, h) = SIZES[usize::from(expanded)];
    match app.get_webview_window(LABEL) {
        Some(win) => win.set_size(tauri::LogicalSize::new(w, h)).map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

#[tauri::command]
pub fn kevo_float_compact(app: AppHandle, compact: bool) -> Result<(), String> {
    kevo_float_resize(app, !compact)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sizes_match_spec() {
        assert_eq!(SIZES[0], (48.0, 28.0));
        assert_eq!(SIZES[1], (420.0, 110.0));
        assert_eq!(SIZE, (48.0, 28.0));
    }

    #[test]
    fn label_is_kevo_float() {
        assert_eq!(LABEL, "kevo-float");
    }
}
