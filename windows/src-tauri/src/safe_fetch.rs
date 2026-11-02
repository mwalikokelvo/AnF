//! Webview-facing fetcher for user-entered https URLs (podcast feeds, episode
//! audio). The desktop CSP only names enumerated hosts, so arbitrary feeds go
//! through here instead of a bare `https:` allowance. See `policy` for the
//! rules, `fetch` for the network code and `command` for the Tauri surface.
pub mod command;
pub mod fetch;
pub mod policy;
