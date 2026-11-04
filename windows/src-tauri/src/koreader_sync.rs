//! HTTPS PUT/GET for KOReader kosync — same host rules as `safe_fetch`, auth
//! headers set in Rust so the webview never needs the stored user key again.

use crate::safe_fetch::fetch::{next_url, validate_url};
use crate::safe_fetch::policy::{is_public_ip, is_redirect, MAX_REDIRECTS};
use crate::secrets;
use reqwest::Url;
use serde::Serialize;
use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

pub const BODY_CAP: usize = 65_536;
const ACCEPT: &str = "application/vnd.koreader.v1+json";
const TIMEOUT_SECS: u64 = 25;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KoreaderSyncResponse {
    pub status: u16,
    pub body: String,
}

fn header_value(value: &str, label: &str) -> Result<String, String> {
    if value.contains('\r') || value.contains('\n') {
        return Err(format!("{label} cannot contain a line break."));
    }
    if value.is_empty() {
        return Err(format!("{label} is missing."));
    }
    if value.len() > 512 {
        return Err(format!("{label} is too long."));
    }
    Ok(value.to_string())
}

async fn resolve_public(url: &Url) -> Result<Vec<SocketAddr>, String> {
    let host = url.host_str().ok_or("The address has no host.")?;
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    let addrs: Vec<SocketAddr> = if let Ok(ip) = bare.parse::<IpAddr>() {
        vec![SocketAddr::new(ip, 443)]
    } else {
        tokio::time::timeout(Duration::from_secs(10), tokio::net::lookup_host((bare, 443u16)))
            .await
            .map_err(|_| "Website lookup timed out.".to_string())?
            .map_err(|_| "Could not find that website.".to_string())?
            .collect()
    };
    if addrs.is_empty() || addrs.iter().any(|a| !is_public_ip(a.ip())) {
        return Err("Only public internet hosts can be fetched.".into());
    }
    Ok(addrs)
}

async fn request_inner(
    method: &str,
    url: &str,
    username: &str,
    userkey: &str,
    body: Option<&str>,
) -> Result<KoreaderSyncResponse, String> {
    let user = header_value(username, "Sync username")?;
    let key = header_value(userkey, "Sync user key")?;
    let mut current = Url::parse(url.trim()).map_err(|_| "Enter a complete https:// address.".to_string())?;
    let method = method.trim().to_ascii_uppercase();
    if method != "GET" && method != "PUT" {
        return Err("Only GET and PUT are supported for sync.".into());
    }
    if method == "PUT" {
        let raw = body.ok_or("PUT requests need a JSON body.")?;
        if raw.len() > BODY_CAP {
            return Err("The sync body is too large.".into());
        }
        if raw.trim().is_empty() {
            return Err("PUT requests need a JSON body.".into());
        }
    }

    for hop in 0..=MAX_REDIRECTS {
        validate_url(&current).map_err(|why| why.to_string())?;
        let addrs = resolve_public(&current).await?;
        let mut builder = reqwest::Client::builder()
            .no_proxy()
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .user_agent("AnF KOReader sync");
        let host = current.host_str().unwrap_or_default();
        if host.parse::<IpAddr>().is_err() && !host.starts_with('[') {
            builder = builder.resolve_to_addrs(host.trim_end_matches('.'), &addrs);
        }
        let client = builder.build().map_err(|_| "Could not start the sync request.".to_string())?;
        let mut req = client
            .request(
                reqwest::Method::from_bytes(method.as_bytes()).map_err(|_| "Unsupported method.")?,
                current.clone(),
            )
            .header("Accept", ACCEPT)
            .header("X-Auth-User", &user)
            .header("X-Auth-Key", &key);
        if method == "PUT" {
            req = req
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .body(body.unwrap().to_string());
        }
        let mut response = req
            .send()
            .await
            .map_err(|_| "Could not reach the sync server.".to_string())?;
        let status = response.status().as_u16();
        if is_redirect(status) {
            if hop == MAX_REDIRECTS {
                return Err(format!("Too many redirects (more than {MAX_REDIRECTS})."));
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or("The server redirected without saying where.")?;
            current = next_url(&current, location)?;
            continue;
        }
        if response.content_length().is_some_and(|n| n > BODY_CAP as u64) {
            return Err("The sync response is too large.".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| "The sync response stopped early.")? {
            if bytes.len() + chunk.len() > BODY_CAP {
                return Err("The sync response is too large.".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let body = String::from_utf8_lossy(&bytes).into_owned();
        return Ok(KoreaderSyncResponse { status, body });
    }
    Err(format!("Too many redirects (more than {MAX_REDIRECTS})."))
}

#[tauri::command]
pub async fn koreader_sync_request(
    method: String,
    url: String,
    username: String,
    body: Option<String>,
) -> Result<KoreaderSyncResponse, String> {
    let userkey = secrets::get("koreader-userkey").ok_or("Save your KOReader user key in Settings first.")?;
    tokio::time::timeout(
        Duration::from_secs(TIMEOUT_SECS),
        request_inner(&method, &url, &username, &userkey, body.as_deref()),
    )
    .await
    .map_err(|_| "The sync request took too long and was stopped.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::safe_fetch::fetch::validate_url;
    use reqwest::Url;

    #[test]
    fn refuses_unsafe_sync_urls_without_network() {
        for url in [
            "http://sync.example.com/syncs/progress",
            "https://127.0.0.1/syncs/progress",
            "https://localhost/syncs/progress",
            "https://user:pw@sync.example.com/syncs/progress",
            "https://sync.example.com:8443/syncs/progress",
            "not a url",
        ] {
            let parsed = Url::parse(url);
            if let Ok(u) = parsed {
                assert!(validate_url(&u).is_err(), "{url} must be refused");
            } else {
                assert!(Url::parse(url).is_err());
            }
        }
        assert!(validate_url(&Url::parse("https://sync.example.com/syncs/progress").unwrap()).is_ok());
    }

    #[test]
    fn header_values_reject_crlf() {
        assert!(header_value("ada", "Sync username").is_ok());
        assert!(header_value("ada\r\nX:1", "Sync username").is_err());
        assert!(header_value("", "Sync user key").is_err());
    }
}
