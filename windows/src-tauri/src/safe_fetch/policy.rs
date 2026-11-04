//! Pure, std-only rules for `safe_fetch`: which URLs, addresses and content
//! types the webview may reach through the Rust fetcher. No I/O, so these
//! rules can be unit-tested (and compiled with plain `rustc --test`) anywhere.
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// What the caller expects back. Decides the content-type allowlist and size cap.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// RSS / Atom / JSON Feed or small JSON metadata. Text, capped at `TEXT_CAP`.
    Feed,
    /// A podcast enclosure. Binary, capped at `AUDIO_CAP`.
    Audio,
    /// Podcast / stream cover art. Binary, capped at `IMAGE_CAP`.
    Image,
}

pub const TEXT_CAP: usize = 2_000_000;
pub const IMAGE_CAP: usize = 2_000_000;
pub const AUDIO_CAP: usize = 200_000_000;
pub const MAX_REDIRECTS: usize = 3;

impl Kind {
    pub fn parse(value: &str) -> Option<Kind> {
        match value {
            "feed" | "json" | "text" => Some(Kind::Feed),
            "audio" => Some(Kind::Audio),
            "image" => Some(Kind::Image),
            _ => None,
        }
    }
    pub fn cap(self) -> usize {
        match self {
            Kind::Feed => TEXT_CAP,
            Kind::Audio => AUDIO_CAP,
            Kind::Image => IMAGE_CAP,
        }
    }
    pub fn timeout_secs(self) -> u64 {
        match self {
            Kind::Feed => 20,
            Kind::Audio => 300,
            Kind::Image => 20,
        }
    }
}

/// Validate the already-parsed pieces of a URL. `host` is as printed by a URL
/// parser: IPv6 literals keep their brackets.
pub fn check_url_parts(
    scheme: &str,
    username: &str,
    has_password: bool,
    host: Option<&str>,
    port: Option<u16>,
) -> Result<(), &'static str> {
    if scheme != "https" {
        return Err("Only https:// addresses can be fetched.");
    }
    if !username.is_empty() || has_password {
        return Err("Addresses with embedded login details are not allowed.");
    }
    if port.is_some_and(|p| p != 443) {
        return Err("Only the standard https port (443) is allowed.");
    }
    let host = host.filter(|h| !h.is_empty()).ok_or("The address has no host.")?;
    check_host(host)
}

pub fn check_host(host: &str) -> Result<(), &'static str> {
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = bare.parse::<IpAddr>() {
        return if is_public_ip(ip) { Ok(()) } else { Err("That address is not a public internet host.") };
    }
    let lower = bare.trim_end_matches('.').to_ascii_lowercase();
    if lower.is_empty()
        || !lower.contains('.')
        || lower == "localhost"
        || [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet", ".localdomain"]
            .iter()
            .any(|s| lower.ends_with(s))
    {
        return Err("That address is not a public internet host.");
    }
    Ok(())
}

/// True only for globally routable unicast addresses. Everything reserved,
/// private, loopback, link-local (including the 169.254.169.254 cloud metadata
/// endpoint), shared/CGNAT, multicast, documentation or transition-mechanism
/// space is refused.
pub fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => public_v4(v4),
        IpAddr::V6(v6) => public_v6(v6),
    }
}

fn public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !(a == 0                                   // 0.0.0.0/8 "this network"
        || a == 10                             // private
        || (a == 100 && (64..128).contains(&b)) // 100.64/10 CGNAT (Alibaba metadata 100.100.100.200)
        || a == 127                            // loopback
        || (a == 169 && b == 254)              // link-local, 169.254.169.254 metadata
        || (a == 172 && (16..32).contains(&b)) // private
        || (a == 192 && b == 0 && c == 0)      // IETF protocol assignments
        || (a == 192 && b == 0 && c == 2)      // TEST-NET-1
        || (a == 192 && b == 88 && c == 99)    // 6to4 relay anycast
        || (a == 192 && b == 168)              // private
        || (a == 198 && (b == 18 || b == 19))  // benchmarking
        || (a == 198 && b == 51 && c == 100)   // TEST-NET-2
        || (a == 203 && b == 0 && c == 113)    // TEST-NET-3
        || a >= 224)                           // multicast, reserved, broadcast
}

fn public_v6(ip: Ipv6Addr) -> bool {
    if let Some(v4) = ip.to_ipv4_mapped() {
        return public_v4(v4);
    }
    let s = ip.segments();
    // Embedded IPv4 in NAT64 (64:ff9b::/96) and 6to4 (2002::/16) must itself be public.
    if s[0] == 0x0064 && s[1] == 0xff9b && s[2..6] == [0, 0, 0, 0] {
        let o = ip.octets();
        return public_v4(Ipv4Addr::new(o[12], o[13], o[14], o[15]));
    }
    if s[0] == 0x2002 {
        let o = ip.octets();
        return public_v4(Ipv4Addr::new(o[2], o[3], o[4], o[5]));
    }
    // Only global unicast 2000::/3, minus special-purpose blocks inside it.
    if (s[0] & 0xe000) != 0x2000 {
        return false; // ::, ::1, ::/96 compat, fc00::/7, fe80::/10, fec0::/10, ff00::/8, 100::/64 ...
    }
    !(s[0] == 0x2001 && s[1] == 0x0000)        // Teredo
        && !(s[0] == 0x2001 && s[1] == 0x0db8) // documentation
        && !(s[0] == 0x2001 && s[1] < 0x0200)  // IETF protocol assignments 2001::/23
        && !(s[0] == 0x3fff)                   // documentation 3fff::/20
}

/// Feed/metadata responses: XML or JSON only. Audio: audio containers or the
/// generic binary types podcast hosts commonly send for enclosures.
pub fn content_type_allowed(kind: Kind, header: Option<&str>) -> bool {
    let Some(raw) = header else { return false };
    let essence = raw.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
    match kind {
        Kind::Feed => {
            matches!(
                essence.as_str(),
                "application/xml" | "text/xml" | "application/json" | "text/json"
            ) || (essence.starts_with("application/") || essence.starts_with("text/"))
                && (essence.ends_with("+xml") || essence.ends_with("+json"))
        }
        Kind::Audio => {
            essence.starts_with("audio/")
                || matches!(
                    essence.as_str(),
                    "application/ogg" | "application/octet-stream" | "binary/octet-stream"
                )
        }
        Kind::Image => {
            matches!(
                essence.as_str(),
                "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif"
            )
        }
    }
}

pub fn is_redirect(status: u16) -> bool {
    matches!(status, 301 | 302 | 303 | 307 | 308)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }
    fn ok(url_host: &str) -> Result<(), &'static str> {
        check_url_parts("https", "", false, Some(url_host), None)
    }

    #[test]
    fn blocks_private_loopback_link_local_and_metadata_v4() {
        for s in [
            "0.0.0.0", "0.1.2.3", "10.0.0.1", "10.255.255.255", "100.64.0.1", "100.100.100.200",
            "100.127.255.255", "127.0.0.1", "127.255.0.9", "169.254.0.1", "169.254.169.254",
            "172.16.0.1", "172.31.255.255", "192.0.0.8", "192.0.2.1", "192.168.1.1", "198.18.0.1",
            "198.19.255.255", "198.51.100.7", "203.0.113.9", "224.0.0.1", "239.255.255.255",
            "240.0.0.1", "255.255.255.255",
        ] {
            assert!(!is_public_ip(ip(s)), "{s} must be blocked");
        }
    }

    #[test]
    fn allows_ordinary_public_v4() {
        for s in ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.0.1", "172.32.0.1", "100.63.255.255", "100.128.0.1", "198.17.0.1", "198.20.0.1", "223.255.255.255"] {
            assert!(is_public_ip(ip(s)), "{s} must be allowed");
        }
    }

    #[test]
    fn blocks_reserved_v6() {
        for s in [
            "::", "::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "::ffff:192.168.0.1",
            "::7f00:1", "fe80::1", "fc00::1", "fd00:ec2::254", "fec0::1", "ff02::1", "100::1",
            "2001::1", "2001:db8::1", "2001:1::1", "64:ff9b::7f00:1", "64:ff9b::a9fe:a9fe", "2002:7f00:1::1",
            "2002:a9fe:a9fe::1", "2002:c0a8:101::", "3fff::1",
        ] {
            assert!(!is_public_ip(ip(s)), "{s} must be blocked");
        }
    }

    #[test]
    fn allows_global_unicast_v6_and_mapped_public_v4() {
        for s in ["2606:4700:4700::1111", "2a00:1450:4001:81b::200e", "::ffff:8.8.8.8", "2001:4860:4860::8888", "64:ff9b::808:808", "2002:808:808::1"] {
            assert!(is_public_ip(ip(s)), "{s} must be allowed");
        }
    }

    #[test]
    fn url_parts_require_plain_https() {
        assert!(check_url_parts("https", "", false, Some("example.com"), None).is_ok());
        assert!(check_url_parts("https", "", false, Some("example.com"), Some(443)).is_ok());
        assert!(check_url_parts("http", "", false, Some("example.com"), None).is_err());
        assert!(check_url_parts("file", "", false, Some("example.com"), None).is_err());
        assert!(check_url_parts("ftp", "", false, Some("example.com"), None).is_err());
        assert!(check_url_parts("https", "user", false, Some("example.com"), None).is_err());
        assert!(check_url_parts("https", "", true, Some("example.com"), None).is_err());
        assert!(check_url_parts("https", "", false, Some("example.com"), Some(8443)).is_err());
        assert!(check_url_parts("https", "", false, Some("example.com"), Some(22)).is_err());
        assert!(check_url_parts("https", "", false, None, None).is_err());
        assert!(check_url_parts("https", "", false, Some(""), None).is_err());
    }

    #[test]
    fn host_literals_and_internal_names_are_rejected() {
        for h in [
            "127.0.0.1", "[::1]", "[::ffff:7f00:1]", "169.254.169.254", "10.1.2.3", "[fe80::1]", "[fd00:ec2::254]",
            "localhost", "LOCALHOST.", "foo.localhost", "printer.local", "metadata.google.internal",
            "intranet", "router.lan", "nas.home", "a.localdomain",
        ] {
            assert!(ok(h).is_err(), "{h} must be rejected");
        }
        for h in ["example.com", "feeds.megaphone.fm", "[2606:4700:4700::1111]", "8.8.8.8", "EXAMPLE.org."] {
            assert!(ok(h).is_ok(), "{h} must be accepted");
        }
    }

    #[test]
    fn feed_content_types() {
        for t in [
            "application/rss+xml", "application/atom+xml; charset=utf-8", "text/xml", "TEXT/XML;charset=UTF-8",
            "application/xml", "application/json", "application/feed+json", "application/rdf+xml", "text/json",
        ] {
            assert!(content_type_allowed(Kind::Feed, Some(t)), "{t}");
        }
        for t in ["text/html", "text/plain", "application/octet-stream", "audio/mpeg", "image/png", "application/javascript", "text/xml-evil", ""] {
            assert!(!content_type_allowed(Kind::Feed, Some(t)), "{t}");
        }
        assert!(!content_type_allowed(Kind::Feed, None));
    }

    #[test]
    fn audio_content_types() {
        for t in ["audio/mpeg", "audio/mp4", "audio/x-m4a", "application/ogg", "application/octet-stream", "binary/octet-stream; foo=bar"] {
            assert!(content_type_allowed(Kind::Audio, Some(t)), "{t}");
        }
        for t in ["text/html", "application/json", "image/jpeg", "video/mp4", "application/xml"] {
            assert!(!content_type_allowed(Kind::Audio, Some(t)), "{t}");
        }
        assert!(!content_type_allowed(Kind::Audio, None));
    }

    #[test]
    fn image_content_types() {
        for t in [
            "image/jpeg",
            "image/png",
            "IMAGE/WEBP",
            "image/gif; charset=binary",
            "image/avif",
        ] {
            assert!(content_type_allowed(Kind::Image, Some(t)), "{t}");
        }
        for t in ["text/html", "application/json", "audio/mpeg", "image/svg+xml", "video/mp4"] {
            assert!(!content_type_allowed(Kind::Image, Some(t)), "{t}");
        }
        assert!(!content_type_allowed(Kind::Image, None));
    }

    #[test]
    fn kinds_and_limits() {
        assert_eq!(Kind::parse("feed"), Some(Kind::Feed));
        assert_eq!(Kind::parse("json"), Some(Kind::Feed));
        assert_eq!(Kind::parse("audio"), Some(Kind::Audio));
        assert_eq!(Kind::parse("image"), Some(Kind::Image));
        assert_eq!(Kind::parse("html"), None);
        assert_eq!(Kind::Feed.cap(), 2_000_000);
        assert_eq!(Kind::Image.cap(), 2_000_000);
        assert_eq!(Kind::Image.timeout_secs(), 20);
        assert_eq!(MAX_REDIRECTS, 3);
    }

    #[test]
    fn redirect_statuses() {
        for s in [301, 302, 303, 307, 308] { assert!(is_redirect(s)); }
        for s in [200, 204, 300, 304, 305, 400, 404] { assert!(!is_redirect(s)); }
    }
}
