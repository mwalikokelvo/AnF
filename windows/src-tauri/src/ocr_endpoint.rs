//! Pure endpoint logic for the OCR service (std only, so it can be unit-tested in isolation).
//!
//! Threat model (security review M1): the webview must never talk to a fixed, guessable
//! loopback port, because another local process could squat it and receive documents.
//! AnF therefore (a) lets the OS choose a free ephemeral loopback port for the OCR process
//! it spawns itself, (b) keeps that port in Rust and forwards requests through a Rust
//! command, so the webview CSP needs no loopback source at all, and (c) only talks to a
//! user-supplied external server after the user explicitly confirmed that exact endpoint.

use std::net::TcpListener;

pub const LOOPBACK: &str = "127.0.0.1";

/// Ask the OS for a free ephemeral port on the loopback interface only.
/// There is an unavoidable gap between releasing the probe socket and the child binding it;
/// the caller must treat the endpoint as ready only while the spawned child is still alive
/// (a child that lost the race exits because it cannot bind).
pub fn pick_free_port() -> std::io::Result<u16> {
    let listener = TcpListener::bind((LOOPBACK, 0))?;
    Ok(listener.local_addr()?.port())
}

/// Arguments for the owned OCR process: always loopback, always the chosen port.
pub fn owned_args(port: u16) -> Vec<String> {
    vec!["--host".into(), LOOPBACK.into(), "--port".into(), port.to_string()]
}

pub fn endpoint_for(port: u16) -> String {
    format!("http://{LOOPBACK}:{port}/v1")
}

/// Accept only `http://127.0.0.1:<port>/v1` (optional trailing slash), port >= 1024.
/// No hostnames, no `localhost`, no other interfaces, no credentials, no query.
pub fn parse_external(endpoint: &str) -> Result<u16, String> {
    let rest = endpoint
        .trim()
        .strip_prefix(&format!("http://{LOOPBACK}:"))
        .ok_or_else(|| format!("External OCR endpoint must look like http://{LOOPBACK}:<port>/v1"))?;
    let rest = rest.strip_suffix('/').unwrap_or(rest);
    let port_text = rest
        .strip_suffix("/v1")
        .ok_or_else(|| "External OCR endpoint must end in /v1".to_string())?;
    if port_text.is_empty() || !port_text.bytes().all(|b| b.is_ascii_digit()) {
        return Err("External OCR endpoint has an invalid port".into());
    }
    let port: u16 = port_text.parse().map_err(|_| "External OCR endpoint has an invalid port".to_string())?;
    if port < 1024 {
        return Err("External OCR endpoint must use a port of 1024 or above".into());
    }
    Ok(port)
}

/// Canonical form shown to the user and compared against the stored confirmation.
pub fn canonical_external(endpoint: &str) -> Result<String, String> {
    parse_external(endpoint).map(endpoint_for)
}

/// The external server is usable only when the stored confirmation equals the stored endpoint.
pub fn external_port(endpoint: &str, confirmed: &str) -> Option<u16> {
    if endpoint.is_empty() || endpoint != confirmed {
        return None;
    }
    parse_external(endpoint).ok()
}

/// The webview may only reach these two OpenAI-compatible routes.
pub fn is_allowed_request(method: &str, path: &str) -> bool {
    matches!((method, path), ("GET", "models") | ("POST", "chat/completions"))
}

pub fn request_url(port: u16, path: &str) -> String {
    format!("{}/{}", endpoint_for(port), path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn free_port_is_ephemeral_and_not_the_old_fixed_ports() {
        let mut seen = std::collections::HashSet::new();
        for _ in 0..8 {
            let p = pick_free_port().unwrap();
            assert!(p >= 1024);
            assert!(p != 8000 && p != 3900, "must not fall back to the guessable ports");
            seen.insert(p);
        }
        assert!(!seen.is_empty());
    }

    #[test]
    fn free_port_is_actually_free_and_loopback_only() {
        let p = pick_free_port().unwrap();
        let l = TcpListener::bind((LOOPBACK, p)).expect("picked port can be bound");
        assert!(l.local_addr().unwrap().ip().is_loopback());
    }

    #[test]
    fn owned_args_bind_loopback_and_chosen_port() {
        assert_eq!(owned_args(41234), ["--host", "127.0.0.1", "--port", "41234"]);
        assert!(!owned_args(41234).iter().any(|a| a == "0.0.0.0" || a == "8000"));
    }

    #[test]
    fn external_endpoint_accepts_only_explicit_loopback() {
        assert_eq!(parse_external("http://127.0.0.1:9001/v1"), Ok(9001));
        assert_eq!(parse_external(" http://127.0.0.1:9001/v1/ "), Ok(9001));
        for bad in [
            "http://localhost:9001/v1",
            "http://0.0.0.0:9001/v1",
            "http://127.0.0.1.evil.test:9001/v1",
            "http://127.0.0.1@evil.test:9001/v1",
            "https://127.0.0.1:9001/v1",
            "http://192.168.1.5:9001/v1",
            "http://127.0.0.1:80/v1",
            "http://127.0.0.1:/v1",
            "http://127.0.0.1:99999/v1",
            "http://127.0.0.1:9001/v1?x=1",
            "http://127.0.0.1:9001/other",
            "http://127.0.0.1:9001",
            "",
        ] {
            assert!(parse_external(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn external_needs_matching_confirmation() {
        let ep = "http://127.0.0.1:9001/v1";
        assert_eq!(external_port(ep, ep), Some(9001));
        assert_eq!(external_port(ep, ""), None);
        assert_eq!(external_port(ep, "http://127.0.0.1:9002/v1"), None);
        assert_eq!(external_port("", ""), None);
        assert_eq!(canonical_external("http://127.0.0.1:9001/v1/").unwrap(), ep);
    }

    #[test]
    fn only_two_routes_are_forwarded() {
        assert!(is_allowed_request("GET", "models"));
        assert!(is_allowed_request("POST", "chat/completions"));
        for (m, p) in [("POST", "models"), ("GET", "chat/completions"), ("GET", "../x"), ("GET", "models?x"), ("DELETE", "models"), ("GET", "/models"), ("POST", "completions")] {
            assert!(!is_allowed_request(m, p), "{m} {p}");
        }
        assert_eq!(request_url(4000, "models"), "http://127.0.0.1:4000/v1/models");
    }
}
