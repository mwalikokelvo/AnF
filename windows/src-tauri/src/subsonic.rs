//! Minimal Subsonic / Navidrome client.
//!
//! Requests run in Rust because the webview CSP cannot reach an arbitrary user
//! server. The password never enters the front end: it lives in the OS secret
//! store and is only read here. Token auth (salt + MD5) is used so the password
//! is not sent on the wire.

use md5::{Digest, Md5};
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;
use tauri::ipc::Response;

const API_VERSION: &str = "1.16.1";
const CLIENT_NAME: &str = "AnF";
const MAX_AUDIO: usize = 64 * 1024 * 1024;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SubsonicTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    /// Seconds, as the server reports it.
    pub duration: u64,
    pub suffix: String,
}

/// Accept only a plain http(s) origin. A path prefix is allowed (servers are
/// sometimes mounted under one), but credentials, a query and a fragment are not.
pub fn normalize_server(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Enter your Subsonic server address.".into());
    }
    let url = reqwest::Url::parse(trimmed)
        .map_err(|_| "Enter a complete http:// or https:// server address.".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("The server address must start with http:// or https://.".into());
    }
    if url.host_str().is_none() {
        return Err("The server address has no host.".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Do not put a username or password in the server address.".into());
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("The server address must not contain a query or fragment.".into());
    }
    Ok(trimmed.to_string())
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn auth_params(username: &str, password: &str) -> Result<Vec<(String, String)>, String> {
    use ring::rand::{SecureRandom, SystemRandom};
    let mut salt = [0u8; 8];
    SystemRandom::new()
        .fill(&mut salt)
        .map_err(|_| "Could not generate a login salt.".to_string())?;
    let salt = hex(&salt);
    let mut digest = Md5::new();
    digest.update(password.as_bytes());
    digest.update(salt.as_bytes());
    Ok(vec![
        ("u".into(), username.trim().into()),
        ("t".into(), hex(&digest.finalize())),
        ("s".into(), salt),
        ("v".into(), API_VERSION.into()),
        ("c".into(), CLIENT_NAME.into()),
        ("f".into(), "json".into()),
    ])
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::limited(3))
        .build()
        .map_err(|_| "Could not start the server request.".to_string())
}

fn server_error(value: &Value) -> Option<String> {
    let root = value.get("subsonic-response").unwrap_or(value);
    let status = root.get("status").and_then(Value::as_str).unwrap_or("");
    if status.eq_ignore_ascii_case("ok") {
        return None;
    }
    let message = root
        .pointer("/error/message")
        .and_then(Value::as_str)
        .or_else(|| root.get("error").and_then(Value::as_str))
        .unwrap_or("The server refused the request.");
    Some(message.to_string())
}

async fn call(
    server: &str,
    username: &str,
    password: &str,
    endpoint: &str,
    extra: Vec<(String, String)>,
) -> Result<Value, String> {
    if username.trim().is_empty() {
        return Err("Enter your Subsonic username.".into());
    }
    let base = normalize_server(server)?;
    let mut params = auth_params(username, password)?;
    params.extend(extra);
    let url = format!("{base}/rest/{endpoint}.view");
    let response = client()?
        .get(url)
        .query(&params)
        .send()
        .await
        .map_err(|_| "Could not reach the Subsonic server.".to_string())?;
    if !response.status().is_success() {
        return Err(format!("The server answered {}.", response.status().as_u16()));
    }
    let value: Value = response
        .json()
        .await
        .map_err(|_| "The server did not return Subsonic JSON.".to_string())?;
    if let Some(error) = server_error(&value) {
        return Err(error);
    }
    Ok(value)
}

pub fn parse_search(value: &Value) -> Vec<SubsonicTrack> {
    let root = value.get("subsonic-response").unwrap_or(value);
    let songs = root
        .pointer("/searchResult3/song")
        .or_else(|| root.pointer("/searchResult2/song"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    songs
        .iter()
        .filter_map(|song| {
            Some(SubsonicTrack {
                id: song.get("id")?.as_str()?.to_string(),
                title: song
                    .get("title")
                    .and_then(Value::as_str)
                    .unwrap_or("Untitled")
                    .to_string(),
                artist: song
                    .get("artist")
                    .and_then(Value::as_str)
                    .unwrap_or("Unknown artist")
                    .to_string(),
                album: song
                    .get("album")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                duration: song.get("duration").and_then(Value::as_u64).unwrap_or(0),
                suffix: song
                    .get("suffix")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
            })
        })
        .collect()
}

pub async fn search(
    server: &str,
    username: &str,
    password: &str,
    query: &str,
    limit: u32,
) -> Result<Vec<SubsonicTrack>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let value = call(
        server,
        username,
        password,
        "search3",
        vec![
            ("query".into(), query.to_string()),
            ("songCount".into(), limit.clamp(1, 100).to_string()),
            ("artistCount".into(), "0".into()),
            ("albumCount".into(), "0".into()),
        ],
    )
    .await?;
    Ok(parse_search(&value))
}

pub async fn stream(
    server: &str,
    username: &str,
    password: &str,
    id: &str,
) -> Result<Vec<u8>, String> {
    if id.trim().is_empty() {
        return Err("That track has no server id.".into());
    }
    let base = normalize_server(server)?;
    let mut params = auth_params(username, password)?;
    params.push(("id".into(), id.to_string()));
    let url = format!("{base}/rest/stream.view");
    let mut response = client()?
        .get(url)
        .query(&params)
        .send()
        .await
        .map_err(|_| "Could not reach the Subsonic server.".to_string())?;
    if !response.status().is_success() {
        return Err(format!("The server answered {}.", response.status().as_u16()));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !(content_type.starts_with("audio/") || content_type == "application/octet-stream") {
        return Err("That server response is not audio.".into());
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_AUDIO as u64)
    {
        return Err("That track is larger than 64 MB.".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "The audio download stopped early.".to_string())?
    {
        if bytes.len() + chunk.len() > MAX_AUDIO {
            return Err("That track is larger than 64 MB.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() {
        return Err("The server returned an empty track.".into());
    }
    Ok(bytes)
}

fn password() -> Result<String, String> {
    crate::secrets::get("subsonic-password")
        .ok_or_else(|| "Save your Subsonic password in Settings first.".to_string())
}

#[tauri::command]
pub async fn subsonic_search(
    server: String,
    username: String,
    query: String,
) -> Result<Vec<SubsonicTrack>, String> {
    let password = password()?;
    search(&server, &username, &password, &query, 50).await
}

#[tauri::command]
pub async fn subsonic_stream(
    server: String,
    username: String,
    id: String,
) -> Result<Response, String> {
    let password = password()?;
    Ok(Response::new(stream(&server, &username, &password, &id).await?))
}

#[tauri::command]
pub async fn subsonic_test(server: String, username: String) -> Result<String, String> {
    let password = password()?;
    call(&server, &username, &password, "ping", Vec::new()).await?;
    Ok(format!("Connected to {}.", normalize_server(&server)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_plain_servers_and_path_prefixes() {
        assert_eq!(
            normalize_server(" https://music.example.com/ ").unwrap(),
            "https://music.example.com"
        );
        assert_eq!(
            normalize_server("http://192.168.1.20:4533/navidrome").unwrap(),
            "http://192.168.1.20:4533/navidrome"
        );
    }

    #[test]
    fn refuses_credentials_queries_and_other_schemes() {
        for bad in [
            "ftp://music.example.com",
            "https://user:pass@music.example.com",
            "https://music.example.com/?u=ada",
            "https://music.example.com/#x",
            "not a url",
            "",
        ] {
            assert!(normalize_server(bad).is_err(), "{bad} must be refused");
        }
    }

    #[test]
    fn parses_search_results() {
        let value = serde_json::json!({
            "subsonic-response": {
                "status": "ok",
                "searchResult3": { "song": [
                    {"id":"42","title":"Morning Light","artist":"Elise Monroe","album":"QA","duration":245,"suffix":"flac"},
                    {"id":"43","title":"Untitled Sketch"}
                ]}
            }
        });
        let tracks = parse_search(&value);
        assert_eq!(tracks.len(), 2);
        assert_eq!(tracks[0].id, "42");
        assert_eq!(tracks[0].duration, 245);
        assert_eq!(tracks[0].suffix, "flac");
        assert_eq!(tracks[1].artist, "Unknown artist");
    }

    #[test]
    fn reports_server_errors() {
        let value = serde_json::json!({
            "subsonic-response": {"status":"failed","error":{"code":40,"message":"Wrong username or password"}}
        });
        assert_eq!(
            server_error(&value).as_deref(),
            Some("Wrong username or password")
        );
        assert_eq!(
            server_error(&serde_json::json!({"subsonic-response":{"status":"ok"}})),
            None
        );
    }
}
