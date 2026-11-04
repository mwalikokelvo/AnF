//! Tauri commands the webview calls instead of `fetch()` for user-entered hosts.
use super::{
    fetch::fetch,
    policy::Kind,
};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextResponse {
    pub final_url: String,
    pub content_type: String,
    pub body: String,
}

/// Fetch a feed or small JSON/XML document. `kind` is "feed" (default) or "json".
#[tauri::command]
pub async fn safe_fetch_text(url: String, kind: Option<String>) -> Result<TextResponse, String> {
    let kind = match kind.as_deref() {
        None => Kind::Feed,
        Some(k) => Kind::parse(k).filter(|k| *k == Kind::Feed).ok_or("Unsupported fetch kind.")?,
    };
    let got = fetch(&url, kind).await?;
    Ok(TextResponse {
        final_url: got.final_url,
        content_type: got.content_type,
        body: String::from_utf8_lossy(&got.body).into_owned(),
    })
}

/// Fetch a podcast enclosure as raw bytes (audio content types only, size capped).
#[tauri::command]
pub async fn safe_fetch_audio(url: String) -> Result<tauri::ipc::Response, String> {
    let got = fetch(&url, Kind::Audio).await?;
    Ok(tauri::ipc::Response::new(got.body))
}

/// Fetch cover art as raw bytes (image content types only, size capped).
#[tauri::command]
pub async fn safe_fetch_image(url: String) -> Result<tauri::ipc::Response, String> {
    let got = fetch(&url, Kind::Image).await?;
    Ok(tauri::ipc::Response::new(got.body))
}
