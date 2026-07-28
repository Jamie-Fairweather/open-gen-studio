use crate::providers::{self, ProviderKind};
use std::time::Duration;

pub(crate) const USER_AGENT: &str = "OpenGenAI/0.1 (local; +https://github.com/open-gen-ai)";

pub(crate) fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())
}

pub(crate) fn apply_auth(
    mut req: reqwest::blocking::RequestBuilder,
    url: &str,
) -> reqwest::blocking::RequestBuilder {
    if let Some(auth) = providers::auth_header_for(url) {
        req = req.header(reqwest::header::AUTHORIZATION, auth);
    }
    req
}

pub(crate) fn http_status_error(status: reqwest::StatusCode, url: &str) -> String {
    if let Some(hint) = providers::http_status_hint(status, url) {
        return format!("{hint} URL: {url}");
    }
    format!("download failed: HTTP {status} ({url})")
}

/// Probe whether a Hugging Face URL requires auth when fetched anonymously.
pub fn url_is_gated(url: &str) -> bool {
    matches!(providers::detect(url), ProviderKind::HuggingFace) && providers::requires_auth(url)
}

/// Resolve a user URL (page or direct) to the HTTP download URL (with provider auth applied).
pub fn resolve_download_url(url: &str) -> Result<String, String> {
    let resolved = providers::resolve(url)?.download_url;
    Ok(providers::authorize_download_url(&resolved))
}

/// Probe remote object size via HEAD (Content-Length), with a Range GET fallback.
/// Accepts page URLs (e.g. CivitAI model pages) - resolves first.
pub fn remote_content_length(url: &str) -> Result<Option<u64>, String> {
    let download_url = resolve_download_url(url).unwrap_or_else(|_| url.trim().to_string());
    remote_content_length_direct(&download_url)
}

pub(crate) fn remote_content_length_direct(url: &str) -> Result<Option<u64>, String> {
    let client = http_client()?;

    let head = apply_auth(client.head(url), url)
        .send()
        .map_err(|e| e.to_string())?;
    if head.status().as_u16() == 401 {
        return Err(http_status_error(head.status(), url));
    }
    if head.status().is_success() {
        if let Some(len) = head.content_length().filter(|n| *n > 0) {
            return Ok(Some(len));
        }
    }

    // Some CDNs omit Content-Length on HEAD - ask for one byte and read Content-Range.
    let ranged = apply_auth(client.get(url).header("Range", "bytes=0-0"), url)
        .send()
        .map_err(|e| e.to_string())?;
    if ranged.status().as_u16() == 401 {
        return Err(http_status_error(ranged.status(), url));
    }
    if ranged.status().as_u16() == 206 {
        if let Some(total) = parse_content_range_total(
            ranged
                .headers()
                .get(reqwest::header::CONTENT_RANGE)
                .and_then(|v| v.to_str().ok()),
        ) {
            return Ok(Some(total));
        }
    }
    if ranged.status().is_success() {
        if let Some(len) = ranged.content_length().filter(|n| *n > 0) {
            return Ok(Some(len));
        }
    }

    Ok(None)
}

pub(crate) fn parse_content_range_total(header: Option<&str>) -> Option<u64> {
    // e.g. "bytes 0-0/123456789"
    let value = header?;
    let total = value.rsplit('/').next()?;
    if total == "*" {
        return None;
    }
    total.parse().ok()
}
