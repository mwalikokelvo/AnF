//! Pure, std-only rules for the verified model download: the pinned manifest,
//! which hosts a download may touch, how a partial file is resumed or
//! discarded, and how a response is accepted. No I/O, so it can be unit-tested
//! (and compiled with plain `rustc --test`) anywhere.
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// One model the app may download. The webview only ever sends `id`; the URL,
/// size and hash below are the single source of truth and live in Rust.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModelSpec {
    pub id: &'static str,
    /// File name under `local-ai/models/`. Never taken from the network.
    pub file: &'static str,
    pub url: &'static str,
    /// Lower-case hex SHA-256 of the complete file, from the Hub's LFS/Xet pointer.
    pub sha256: &'static str,
    /// Exact size in bytes. Also the hard cap for the transfer.
    pub size: u64,
}

// Values were read on 2026-11-01 from the Hub's raw LFS pointers
// (huggingface.co/Qwen/<repo>/raw/main/<file>) and cross-checked against the
// blob pages' "SHA256:" field and the tree listing's size.
pub const MODELS: [ModelSpec; 2] = [
    ModelSpec {
        id: "qwen3-0.6b-fast",
        file: "Qwen3-0.6B-Q8_0.gguf",
        url: "https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf",
        sha256: "9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031",
        size: 639_446_688,
    },
    ModelSpec {
        id: "qwen3-1.7b-balanced",
        file: "Qwen3-1.7B-Q8_0.gguf",
        url: "https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf",
        sha256: "061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a",
        size: 1_834_426_016,
    },
];

pub fn spec(id: &str) -> Option<&'static ModelSpec> {
    MODELS.iter().find(|m| m.id == id)
}

/// Runtime slot a model serves (`fast` or `balanced`), matching `local_ai.rs`.
pub fn slot_of(spec: &ModelSpec) -> &'static str {
    if spec.id == "qwen3-0.6b-fast" { "fast" } else { "balanced" }
}

pub const MAX_REDIRECTS: usize = 5;

pub fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// True only when the computed digest equals the pinned hash.
pub fn digest_matches(expected_hex: &str, actual: &[u8]) -> bool {
    is_sha256_hex(expected_hex) && actual.len() == 32 && hex(actual) == expected_hex
}

/// Hosts a download may contact. The first request must go to `huggingface.co`;
/// redirects may additionally reach the Hub's storage CDNs (LFS and Xet bridge).
pub fn host_allowed(host: &str, first_hop: bool) -> bool {
    let h = host.trim_end_matches('.').to_ascii_lowercase();
    if h == "huggingface.co" {
        return true;
    }
    if first_hop {
        return false;
    }
    if h == "cdn-lfs.huggingface.co" || h == "cas-bridge.xethub.hf.co" {
        return true;
    }
    // cdn-lfs-us-1.hf.co, cdn-lfs-eu-1.hf.co, cas-server/transfer hosts under xethub.hf.co
    let label_ok = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-');
    if let Some(prefix) = h.strip_suffix(".hf.co") {
        if prefix.starts_with("cdn-lfs") && label_ok(prefix) {
            return true;
        }
        if let Some(sub) = prefix.strip_suffix(".xethub") {
            return label_ok(sub);
        }
    }
    false
}

/// Validate a parsed URL's pieces. `host` as printed by a URL parser (IPv6 keeps brackets).
pub fn check_url_parts(
    scheme: &str,
    username: &str,
    has_password: bool,
    host: Option<&str>,
    port: Option<u16>,
    first_hop: bool,
) -> Result<(), &'static str> {
    if scheme != "https" {
        return Err("Only https:// downloads are allowed.");
    }
    if !username.is_empty() || has_password {
        return Err("Addresses with embedded login details are not allowed.");
    }
    if port.is_some_and(|p| p != 443) {
        return Err("Only the standard https port (443) is allowed.");
    }
    let host = host.filter(|h| !h.is_empty()).ok_or("The address has no host.")?;
    if host.parse::<IpAddr>().is_ok() || host.starts_with('[') {
        return Err("Downloads by IP address are not allowed.");
    }
    if !host_allowed(host, first_hop) {
        return Err("That host is not an approved Hugging Face download host.");
    }
    Ok(())
}

pub fn is_redirect(status: u16) -> bool {
    matches!(status, 301 | 302 | 303 | 307 | 308)
}

/// True only for globally routable unicast addresses; used on the resolved
/// addresses so an allowed name cannot point the download at the local network.
pub fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => public_v4(v4),
        IpAddr::V6(v6) => public_v6(v6),
    }
}

fn public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !(a == 0
        || a == 10
        || (a == 100 && (64..128).contains(&b))
        || a == 127
        || (a == 169 && b == 254)
        || (a == 172 && (16..32).contains(&b))
        || (a == 192 && b == 0 && c == 0)
        || (a == 192 && b == 0 && c == 2)
        || (a == 192 && b == 88 && c == 99)
        || (a == 192 && b == 168)
        || (a == 198 && (b == 18 || b == 19))
        || (a == 198 && b == 51 && c == 100)
        || (a == 203 && b == 0 && c == 113)
        || a >= 224)
}

fn public_v6(ip: Ipv6Addr) -> bool {
    if let Some(v4) = ip.to_ipv4_mapped() {
        return public_v4(v4);
    }
    let s = ip.segments();
    if s[0] == 0x0064 && s[1] == 0xff9b && s[2..6] == [0, 0, 0, 0] {
        let o = ip.octets();
        return public_v4(Ipv4Addr::new(o[12], o[13], o[14], o[15]));
    }
    if s[0] == 0x2002 {
        let o = ip.octets();
        return public_v4(Ipv4Addr::new(o[2], o[3], o[4], o[5]));
    }
    if (s[0] & 0xe000) != 0x2000 {
        return false;
    }
    !(s[0] == 0x2001 && s[1] == 0x0000)
        && !(s[0] == 0x2001 && s[1] == 0x0db8)
        && !(s[0] == 0x2001 && s[1] < 0x0200)
        && !(s[0] == 0x3fff)
}

/// What to do with a leftover `.part` file before asking the server for bytes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResumePlan {
    /// Nothing usable: truncate and start at byte 0.
    Fresh,
    /// Ask for `bytes=N-` and append.
    Resume(u64),
    /// Already the full size: skip the network, go straight to verification.
    Verify,
}

pub fn plan_resume(part_len: Option<u64>, total: u64) -> ResumePlan {
    match part_len {
        None | Some(0) => ResumePlan::Fresh,
        Some(n) if n > total => ResumePlan::Fresh,
        Some(n) if n == total => ResumePlan::Verify,
        Some(n) => ResumePlan::Resume(n),
    }
}

/// Parse `bytes START-END/TOTAL`.
pub fn parse_content_range(value: &str) -> Option<(u64, u64, u64)> {
    let rest = value.trim().strip_prefix("bytes ")?;
    let (range, total) = rest.split_once('/')?;
    let (start, end) = range.split_once('-')?;
    Some((start.trim().parse().ok()?, end.trim().parse().ok()?, total.trim().parse().ok()?))
}

/// Decide whether a final (non-redirect) response is acceptable, and from which
/// byte offset it writes. `offset` is how many bytes the part file already holds
/// (0 for a fresh request).
pub fn accept_response(
    status: u16,
    content_length: Option<u64>,
    content_range: Option<&str>,
    content_type: Option<&str>,
    offset: u64,
    total: u64,
) -> Result<u64, &'static str> {
    if content_type
        .map(|t| t.trim().to_ascii_lowercase())
        .is_some_and(|t| t.starts_with("text/") || t.contains("html") || t.contains("json"))
    {
        return Err("The server sent a web page instead of the model file.");
    }
    match status {
        200 => {
            if content_length.is_some_and(|n| n != total) {
                return Err("The server's file size does not match the expected model size.");
            }
            Ok(0) // a 200 to a Range request means the server ignored it: restart from zero
        }
        206 => {
            let (start, end, size) = parse_content_range(content_range.ok_or("The server sent a partial answer without a range.")?)
                .ok_or("The server sent an unreadable range.")?;
            if size != total || start != offset || end.checked_add(1) != Some(total) {
                return Err("The server resumed at the wrong place.");
            }
            if content_length.is_some_and(|n| n != total - start) {
                return Err("The server's partial size is inconsistent.");
            }
            Ok(start)
        }
        _ => Err("The server did not return the file."),
    }
}

/// Installed means: the final file has exactly the pinned size AND the sidecar
/// written after a successful verification records the pinned hash.
pub fn is_installed(spec: &ModelSpec, file_len: Option<u64>, sidecar: Option<&str>) -> bool {
    file_len == Some(spec.size) && sidecar.is_some_and(|s| s.trim() == spec.sha256)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_hashes_are_well_formed_and_ids_unique() {
        for m in MODELS {
            assert!(is_sha256_hex(m.sha256), "{}", m.id);
            assert!(m.size > 0 && m.file.ends_with(".gguf") && !m.file.contains('/') && !m.file.contains('\\'));
            assert!(check_url_parts("https", "", false, Some("huggingface.co"), None, true).is_ok());
            assert!(m.url.starts_with("https://huggingface.co/Qwen/"));
        }
        assert_ne!(MODELS[0].id, MODELS[1].id);
        assert!(spec("qwen3-0.6b-fast").is_some());
        assert!(spec("deepseek-v4.1-flash").is_none());
        assert_eq!(slot_of(&MODELS[0]), "fast");
        assert_eq!(slot_of(&MODELS[1]), "balanced");
    }

    #[test]
    fn digest_comparison_is_exact() {
        // SHA-256 of the empty input.
        let empty = [
            0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14, 0x9a, 0xfb, 0xf4, 0xc8, 0x99, 0x6f, 0xb9, 0x24, 0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c, 0xa4, 0x95, 0x99,
            0x1b, 0x78, 0x52, 0xb8, 0x55,
        ];
        let want = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        assert!(digest_matches(want, &empty));
        let mut bad = empty;
        bad[31] ^= 1;
        assert!(!digest_matches(want, &bad));
        assert!(!digest_matches(want, &empty[..31]));
        assert!(!digest_matches(&want.to_uppercase(), &empty), "pinned hashes are lower-case");
        assert!(!digest_matches("", &empty));
    }

    #[test]
    fn first_hop_is_huggingface_only_and_redirects_reach_known_cdns() {
        assert!(host_allowed("huggingface.co", true));
        assert!(!host_allowed("cdn-lfs.huggingface.co", true));
        assert!(!host_allowed("cas-bridge.xethub.hf.co", true));
        for h in ["huggingface.co", "cdn-lfs.huggingface.co", "cdn-lfs-us-1.hf.co", "cdn-lfs-eu-1.hf.co", "cas-bridge.xethub.hf.co", "transfer.xethub.hf.co", "HUGGINGFACE.CO."] {
            assert!(host_allowed(h, false), "{h}");
        }
        for h in [
            "evilhuggingface.co", "huggingface.co.evil.com", "hf.co", "www.huggingface.co", "evil.hf.co", "cdn-lfs.evil.com", "xethub.hf.co", "a.b.xethub.hf.co",
            "cdn-lfs-.evil.hf.co.com", "cdn-lfs.hf.co.evil.com", "localhost", "", "github.com", "cdn-lfs/x.hf.co",
        ] {
            assert!(!host_allowed(h, false), "{h:?} must be refused");
        }
    }

    #[test]
    fn url_parts_refuse_http_credentials_ports_and_ip_literals() {
        assert!(check_url_parts("https", "", false, Some("huggingface.co"), Some(443), true).is_ok());
        assert!(check_url_parts("http", "", false, Some("huggingface.co"), None, true).is_err());
        assert!(check_url_parts("https", "u", false, Some("huggingface.co"), None, true).is_err());
        assert!(check_url_parts("https", "", true, Some("huggingface.co"), None, true).is_err());
        assert!(check_url_parts("https", "", false, Some("huggingface.co"), Some(8443), true).is_err());
        assert!(check_url_parts("https", "", false, Some("127.0.0.1"), None, false).is_err());
        assert!(check_url_parts("https", "", false, Some("[::1]"), None, false).is_err());
        assert!(check_url_parts("https", "", false, Some("169.254.169.254"), None, false).is_err());
        assert!(check_url_parts("https", "", false, None, None, true).is_err());
        assert!(check_url_parts("file", "", false, Some("huggingface.co"), None, true).is_err());
        assert!(check_url_parts("https", "", false, Some("evil.com"), None, false).is_err());
    }

    #[test]
    fn resolved_addresses_must_be_public() {
        for ip in ["127.0.0.1", "10.0.0.1", "192.168.1.1", "169.254.169.254", "100.100.100.200", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1"] {
            assert!(!is_public_ip(ip.parse().unwrap()), "{ip}");
        }
        for ip in ["8.8.8.8", "13.224.0.1", "2606:4700::1111"] {
            assert!(is_public_ip(ip.parse().unwrap()), "{ip}");
        }
    }

    #[test]
    fn partial_files_resume_restart_or_go_straight_to_verification() {
        assert_eq!(plan_resume(None, 100), ResumePlan::Fresh);
        assert_eq!(plan_resume(Some(0), 100), ResumePlan::Fresh);
        assert_eq!(plan_resume(Some(40), 100), ResumePlan::Resume(40));
        assert_eq!(plan_resume(Some(100), 100), ResumePlan::Verify);
        assert_eq!(plan_resume(Some(101), 100), ResumePlan::Fresh, "an oversized part is garbage");
    }

    #[test]
    fn content_range_parsing() {
        assert_eq!(parse_content_range("bytes 40-99/100"), Some((40, 99, 100)));
        assert_eq!(parse_content_range(" bytes 0-0/1 "), Some((0, 0, 1)));
        for bad in ["", "bytes */100", "bytes 40-99", "items 1-2/3", "bytes a-b/c", "bytes 40-99/*"] {
            assert_eq!(parse_content_range(bad), None, "{bad}");
        }
    }

    #[test]
    fn responses_are_accepted_only_when_they_match_the_manifest() {
        // fresh 200 with the right length
        assert_eq!(accept_response(200, Some(100), None, Some("application/octet-stream"), 0, 100), Ok(0));
        // 200 without a length is allowed; the byte cap still applies while streaming
        assert_eq!(accept_response(200, None, None, None, 0, 100), Ok(0));
        // server ignored our Range and replied 200: restart from zero
        assert_eq!(accept_response(200, Some(100), None, None, 40, 100), Ok(0));
        // wrong size, error pages, other statuses
        assert!(accept_response(200, Some(101), None, None, 0, 100).is_err());
        assert!(accept_response(200, Some(100), None, Some("text/html; charset=utf-8"), 0, 100).is_err());
        assert!(accept_response(200, Some(100), None, Some("application/json"), 0, 100).is_err());
        for s in [204, 403, 404, 416, 500] {
            assert!(accept_response(s, Some(100), None, None, 0, 100).is_err(), "{s}");
        }
        // 206 resume
        assert_eq!(accept_response(206, Some(60), Some("bytes 40-99/100"), None, 40, 100), Ok(40));
        assert!(accept_response(206, Some(60), Some("bytes 41-99/100"), None, 40, 100).is_err(), "wrong start");
        assert!(accept_response(206, Some(50), Some("bytes 40-89/100"), None, 40, 100).is_err(), "stops early");
        assert!(accept_response(206, Some(60), Some("bytes 40-99/200"), None, 40, 100).is_err(), "wrong total");
        assert!(accept_response(206, Some(59), Some("bytes 40-99/100"), None, 40, 100).is_err(), "length lies");
        assert!(accept_response(206, Some(60), None, None, 40, 100).is_err(), "missing range");
        assert!(accept_response(206, Some(100), Some("bytes 0-99/100"), None, 40, 100).is_err(), "not where we asked");
    }

    #[test]
    fn installed_needs_exact_size_and_a_matching_sidecar() {
        let m = &MODELS[0];
        assert!(is_installed(m, Some(m.size), Some(m.sha256)));
        assert!(is_installed(m, Some(m.size), Some(&format!("{}\n", m.sha256))));
        assert!(!is_installed(m, Some(m.size - 1), Some(m.sha256)), "truncated");
        assert!(!is_installed(m, Some(m.size), None), "no verification record");
        assert!(!is_installed(m, Some(m.size), Some(MODELS[1].sha256)));
        assert!(!is_installed(m, None, Some(m.sha256)));
    }

    #[test]
    fn redirects_are_recognised() {
        for s in [301, 302, 303, 307, 308] { assert!(is_redirect(s)); }
        for s in [200, 206, 304, 404] { assert!(!is_redirect(s)); }
    }
}
