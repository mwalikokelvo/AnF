//! All native windows share one WebView2 profile and exactly matching options.
use std::borrow::Cow;
pub const BASE_BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI --autoplay-policy=no-user-gesture-required";

#[cfg(debug_assertions)]
fn hosted_debug_arguments(request: &str, actions: &str, environment: &str) -> Cow<'static, str> {
    if request == "1" && actions == "true" && environment == "github-hosted" {
        Cow::Owned(format!("{BASE_BROWSER_ARGS} --remote-debugging-address=127.0.0.1 --remote-debugging-port=9223"))
    } else { Cow::Borrowed(BASE_BROWSER_ARGS) }
}

pub fn browser_arguments() -> Cow<'static, str> {
    // Elevated hosted workers ignore WebView2 environment overrides. Use the
    // documented programmatic option only for explicitly requested DEBUG QA.
    // Release builds compile out this branch and all diagnostic environment reads.
    #[cfg(debug_assertions)]
    {
        return hosted_debug_arguments(
            &std::env::var("ANF_NATIVE_QA_CDP").unwrap_or_default(),
            &std::env::var("GITHUB_ACTIONS").unwrap_or_default(),
            &std::env::var("RUNNER_ENVIRONMENT").unwrap_or_default());
    }
    #[cfg(not(debug_assertions))]
    Cow::Borrowed(BASE_BROWSER_ARGS)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn normal_options_keep_browser_protection() {
        assert!(!BASE_BROWSER_ARGS.contains("msSmartScreenProtection"));
        assert!(!BASE_BROWSER_ARGS.contains("remote-debugging"));
    }
    #[cfg(debug_assertions)]
    #[test] fn only_explicit_disposable_hosted_debug_requests_enable_loopback_cdp() {
        for (request,actions,environment) in [("","true","github-hosted"),("1","false","github-hosted"),("1","true","self-hosted"),("--disable-web-security","true","github-hosted")] {
            assert_eq!(hosted_debug_arguments(request,actions,environment),BASE_BROWSER_ARGS);
        }
        let args=hosted_debug_arguments("1","true","github-hosted");
        assert!(args.starts_with(BASE_BROWSER_ARGS));
        assert!(args.contains("--remote-debugging-address=127.0.0.1 --remote-debugging-port=9223"));
    }
    #[cfg(not(debug_assertions))]
    #[test] fn release_options_have_no_diagnostic_override() {
        assert_eq!(browser_arguments(),BASE_BROWSER_ARGS);
    }
}
