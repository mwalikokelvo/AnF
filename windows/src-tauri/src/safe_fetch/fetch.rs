//! The network half of `safe_fetch`: manual redirects, DNS pinning, size and
//! time limits. Depends only on reqwest/tokio so it builds without Tauri.
use super::policy::{check_url_parts, content_type_allowed, is_public_ip, is_redirect, Kind, MAX_REDIRECTS};
use reqwest::Url;
use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

pub struct Fetched {
    pub final_url: String,
    pub content_type: String,
    pub body: Vec<u8>,
}

pub fn validate_url(url: &Url) -> Result<(), &'static str> {
    check_url_parts(url.scheme(), url.username(), url.password().is_some(), url.host_str(), url.port())
}

/// Resolve a `Location` header against the current URL and re-validate the result.
pub fn next_url(current: &Url, location: &str) -> Result<Url, String> {
    let next = current.join(location.trim()).map_err(|_| "The server sent an invalid redirect.".to_string())?;
    validate_url(&next).map_err(|why| format!("Redirect refused: {why}"))?;
    Ok(next)
}

/// Resolve the host and require every address to be public. Returns the
/// addresses so the connection can be pinned to exactly what was checked.
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

pub async fn fetch(url: &str, kind: Kind) -> Result<Fetched, String> {
    tokio::time::timeout(Duration::from_secs(kind.timeout_secs()), fetch_inner(url, kind))
        .await
        .map_err(|_| "The download took too long and was stopped.".to_string())?
}

async fn fetch_inner(url: &str, kind: Kind) -> Result<Fetched, String> {
    let mut current = Url::parse(url.trim()).map_err(|_| "Enter a complete https:// address.".to_string())?;
    let accept = match kind {
        Kind::Feed => "application/rss+xml, application/atom+xml, application/feed+json, application/xml, text/xml, application/json;q=0.9",
        Kind::Audio => "audio/*, application/octet-stream;q=0.8",
        Kind::Image => "image/jpeg, image/png, image/webp, image/gif, image/avif, image/*;q=0.8",
        Kind::Document => "application/epub+zip, application/pdf, application/octet-stream;q=0.4",
    };
    for hop in 0..=MAX_REDIRECTS {
        validate_url(&current).map_err(|why| why.to_string())?;
        let addrs = resolve_public(&current).await?;
        let mut builder = reqwest::Client::builder()
            .no_proxy() // a proxy would resolve the name itself and bypass the pinned, checked addresses
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none()) // redirects are followed below, each re-validated
            .connect_timeout(Duration::from_secs(10))
            .user_agent("AnF podcast fetch");
        let host = current.host_str().unwrap_or_default();
        if host.parse::<IpAddr>().is_err() && !host.starts_with('[') {
            builder = builder.resolve_to_addrs(host.trim_end_matches('.'), &addrs);
        }
        // reqwest is built without its cookie feature, so no cookie jar exists to send or store anything.
        let client = builder.build().map_err(|_| "Could not start the download.".to_string())?;
        let mut response = client
            .get(current.clone())
            .header("Accept", accept)
            .header("Accept-Encoding", "identity")
            .send()
            .await
            .map_err(|_| "Could not reach that website.".to_string())?;
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
        if !response.status().is_success() {
            return Err(format!("The server answered {status}."));
        }
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        if !content_type_allowed(kind, content_type.as_deref(), Some(current.as_str())) {
            return Err(match kind {
                Kind::Feed => "That address did not return a feed (XML or JSON).".into(),
                Kind::Audio => "That address did not return audio.".into(),
                Kind::Image => "That address did not return an image.".into(),
                Kind::Document => "That address did not return a document.".into(),
            });
        }
        let cap = kind.cap();
        if response.content_length().is_some_and(|n| n > cap as u64) {
            return Err("The file is larger than the allowed size.".into());
        }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| "The download stopped early.".to_string())? {
            if body.len() + chunk.len() > cap {
                return Err("The file is larger than the allowed size.".into());
            }
            body.extend_from_slice(&chunk);
        }
        return Ok(Fetched { final_url: current.to_string(), content_type: content_type.unwrap_or_default(), body });
    }
    Err(format!("Too many redirects (more than {MAX_REDIRECTS})."))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }
    fn block_on<F: std::future::Future>(f: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(f)
    }

    #[test]
    fn redirects_resolve_relative_and_stay_https() {
        let base = u("https://feeds.example.com/a/b.xml");
        assert_eq!(next_url(&base, "/c.xml").unwrap().as_str(), "https://feeds.example.com/c.xml");
        assert_eq!(next_url(&base, "c.xml").unwrap().as_str(), "https://feeds.example.com/a/c.xml");
        assert_eq!(next_url(&base, "//cdn.example.net/x.xml").unwrap().as_str(), "https://cdn.example.net/x.xml");
        assert_eq!(next_url(&base, "https://other.example.org/f").unwrap().as_str(), "https://other.example.org/f");
    }

    #[test]
    fn redirects_to_unsafe_targets_are_refused() {
        let base = u("https://feeds.example.com/a.xml");
        for loc in [
            "http://example.com/f",
            "https://127.0.0.1/f",
            "https://169.254.169.254/latest/meta-data/",
            "https://[::1]/f",
            "https://[::ffff:7f00:1]/f",
            "https://10.0.0.5/f",
            "https://localhost/f",
            "https://metadata.google.internal/computeMetadata/v1/",
            "https://user:pw@example.com/f",
            "https://example.com:8443/f",
            "https://2130706433/f",   // decimal 127.0.0.1
            "https://0x7f.1/f",       // hex shorthand
            "https://0177.0.0.1/f",   // octal
            "file:///etc/passwd",
            "ftp://example.com/f",
            "javascript:alert(1)",
        ] {
            assert!(next_url(&base, loc).is_err(), "{loc} must be refused");
        }
    }

    #[test]
    fn initial_urls_are_validated_without_touching_the_network() {
        for url in [
            "http://example.com/feed",
            "https://127.0.0.1/feed",
            "https://localhost/feed",
            "https://169.254.169.254/latest/meta-data/",
            "https://user@example.com/feed",
            "https://[fd00:ec2::254]/",
            "not a url",
            "",
        ] {
            assert!(block_on(fetch(url, Kind::Feed)).is_err(), "{url} must be refused");
        }
    }

    #[test]
    fn literal_ips_never_reach_dns_and_private_ones_fail() {
        assert!(block_on(resolve_public(&u("https://10.1.2.3/"))).is_err());
        assert!(block_on(resolve_public(&u("https://[fe80::1]/"))).is_err());
        let ok = block_on(resolve_public(&u("https://8.8.8.8/"))).unwrap();
        assert_eq!(ok, vec!["8.8.8.8:443".parse().unwrap()]);
    }
}
