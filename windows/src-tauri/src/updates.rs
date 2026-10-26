//! "Check for updates": one click asks GitHub's public releases list whether a newer Windows release exists.
//! Nothing runs in the background and nothing is downloaded or installed; the person opens the release page.
//! (The installer is large and, until it is signed, must not be swapped in silently.)
use serde::Serialize;
use serde_json::Value;

const RELEASES: &str = "https://api.github.com/repos/mwalikokelvo/AnF/releases?per_page=100&page=";
// shortcut: looks at the newest 300 releases, newest first; raise it if Android/macOS tags ever bury the Windows ones.
const MAX_PAGES: usize = 3;
const PAGE_SIZE: usize = 100;
const PAGE_PREFIX: &str = "https://github.com/mwalikokelvo/AnF/releases/";
const MAX_BODY: usize = 1_000_000;

#[derive(Serialize, Debug, PartialEq)]
pub struct UpdateInfo { current: String, latest: Option<String>, url: Option<String>, newer: bool }

/// "windows-v0.1.21", "v0.1.21" or "0.1.21" -> (0, 1, 21). Anything else (suffixes, extra parts) is not a release we offer.
fn parse_version(tag: &str) -> Option<(u64, u64, u64)> {
    let v = tag.strip_prefix("windows-").unwrap_or(tag);
    let v = v.strip_prefix('v').unwrap_or(v);
    let mut parts = v.split('.').map(|p| if !p.is_empty() && p.bytes().all(|c| c.is_ascii_digit()) { p.parse::<u64>().ok() } else { None });
    let version = (parts.next()??, parts.next()??, parts.next()??);
    if parts.next().is_some() { None } else { Some(version) }
}

fn parse_list(body: &str) -> Result<Vec<Value>, String> {
    serde_json::from_str(body).map_err(|_| "GitHub sent an unexpected answer.".to_string())
}

/// The newest published, non-prerelease Windows release among `releases`, compared with `current`.
fn pick_latest(releases: &[Value], current: &str) -> Result<UpdateInfo, String> {
    let have = parse_version(current).ok_or("This app's version number is not recognised.")?;
    let mut best: Option<((u64, u64, u64), String)> = None;
    for r in releases {
        if r["draft"] == true || r["prerelease"] == true { continue; }
        // Only tags made for the Windows app; the page address must be this project's own release page.
        let (Some(tag), Some(url)) = (r["tag_name"].as_str(), r["html_url"].as_str()) else { continue };
        let Some(rest) = tag.strip_prefix("windows-v") else { continue };
        let Some(version) = parse_version(rest) else { continue };
        if !url.starts_with(PAGE_PREFIX) || url.contains(['?', '#', ' ']) { continue; }
        if best.as_ref().map_or(true, |(b, _)| version > *b) { best = Some((version, url.to_string())); }
    }
    let current_text = current.to_string();
    Ok(match best {
        Some(((a, b, c), url)) => UpdateInfo { newer: (a, b, c) > have, latest: Some(format!("{a}.{b}.{c}")), url: Some(url), current: current_text },
        None => UpdateInfo { current: current_text, latest: None, url: None, newer: false },
    })
}

/// One page of releases, read in chunks so an oversized answer is dropped instead of buffered.
async fn fetch_page(client: &reqwest::Client, page: usize) -> Result<String, String> {
    let mut response = client.get(format!("{RELEASES}{page}")).header("User-Agent", "AnF update check").header("Accept", "application/vnd.github+json")
        .send().await.map_err(|_| "GitHub could not be reached. Check your connection and try again.".to_string())?;
    if !response.status().is_success() { return Err(format!("GitHub answered {}. Try again later.", response.status())); }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "The update check was interrupted.".to_string())? {
        if body.len() + chunk.len() > MAX_BODY { return Err("GitHub's answer was larger than expected, so it was ignored.".into()); }
        body.extend_from_slice(&chunk);
    }
    Ok(String::from_utf8_lossy(&body).into_owned())
}

#[tauri::command]
pub async fn update_check() -> Result<UpdateInfo, String> {
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).redirect(reqwest::redirect::Policy::none())
        .build().map_err(|e| e.to_string())?;
    let current = env!("CARGO_PKG_VERSION");
    let mut seen = Vec::new();
    for page in 1..=MAX_PAGES {
        let list = parse_list(&fetch_page(&client, page).await?)?;
        let full = list.len() >= PAGE_SIZE;
        seen.extend(list);
        // Newest first: stop as soon as a page holds a Windows release, or when there are no more pages.
        if !full || pick_latest(&seen, current)?.latest.is_some() { break; }
    }
    pick_latest(&seen, current)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn release(tag: &str, url: &str, extra: &str) -> String { format!(r#"{{"tag_name":"{tag}","html_url":"{url}"{extra}}}"#) }
    pub(super) fn list(items: &[String]) -> Vec<Value> { parse_list(&format!("[{}]", items.join(","))).unwrap() }
    fn page(tag: &str) -> String { format!("{PAGE_PREFIX}tag/{tag}") }
    #[test] fn versions_parse_strictly() {
        assert_eq!(parse_version("windows-v0.1.21"), Some((0, 1, 21)));
        assert_eq!(parse_version("v1.2.3"), Some((1, 2, 3)));
        assert_eq!(parse_version("0.1.9"), Some((0, 1, 9)));
        for bad in ["", "v1", "1.2", "1.2.3.4", "1.2.x", "1.2.3-beta", "v-1.2.3", "1..3", "android-v1.2.3 "] { assert_eq!(parse_version(bad), None, "{bad}"); }
    }
    #[test] fn ten_is_newer_than_nine() {
        let info = pick_latest(&list(&[release("windows-v0.1.10", &page("windows-v0.1.10"), "")]), "0.1.9").unwrap();
        assert!(info.newer);
        assert_eq!(info.latest.as_deref(), Some("0.1.10"));
    }
    #[test] fn same_or_older_is_not_an_update() {
        let l = list(&[release("windows-v0.1.21", &page("windows-v0.1.21"), "")]);
        assert!(!pick_latest(&l, "0.1.21").unwrap().newer);
        assert!(!pick_latest(&l, "0.2.0").unwrap().newer);
    }
    #[test] fn only_published_windows_releases_from_this_project_count() {
        let list = [
            release("windows-v9.0.0", &page("x"), r#","draft":true"#),
            release("windows-v9.0.1", &page("x"), r#","prerelease":true"#),
            release("android-v9.0.2", &page("android-v9.0.2"), ""),
            release("windows-v9.0.3", "https://evil.example/releases/", ""),
            release("windows-v9.0.4", &format!("{PAGE_PREFIX}tag/x?next=https://evil.example"), ""),
            release("windows-v9.0.5-beta", &page("x"), ""),
            release("windows-v0.1.22", &page("windows-v0.1.22"), ""),
        ];
        let info = pick_latest(&self::list(&list), "0.1.21").unwrap();
        assert_eq!(info.latest.as_deref(), Some("0.1.22"));
        assert_eq!(info.url, Some(page("windows-v0.1.22")));
    }
    #[test] fn a_windows_release_beyond_many_other_releases_is_still_found() {
        let mut items: Vec<String> = (0..250).map(|i| release(&format!("android-v1.0.{i}"), &page("a"), "")).collect();
        items.push(release("windows-v0.1.30", &page("windows-v0.1.30"), ""));
        assert_eq!(pick_latest(&list(&items), "0.1.21").unwrap().latest.as_deref(), Some("0.1.30"));
    }
    #[test] fn no_release_and_bad_answers_are_handled() {
        let none = pick_latest(&[], "0.1.21").unwrap();
        assert_eq!((none.latest, none.url, none.newer), (None, None, false));
        assert!(parse_list("not json").is_err());
        assert!(parse_list(r#"{"message":"rate limited"}"#).is_err());
        assert!(pick_latest(&[], "garbage").is_err());
    }
}
