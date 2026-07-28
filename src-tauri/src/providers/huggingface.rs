use super::{ProviderKind, ResolvedModelUrl};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

pub const SETTING_HF_TOKEN: &str = "huggingface_token";

static STORED_TOKEN: Mutex<Option<String>> = Mutex::new(None);
static GATED_CACHE: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();

pub fn is_url(url: &str) -> bool {
    url.contains("huggingface.co") || url.contains("hf.co")
}

pub fn set_stored_token(token: Option<String>) {
    let cleaned = token
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());
    if let Ok(mut guard) = STORED_TOKEN.lock() {
        *guard = cleaned;
    }
}

pub fn auth_header() -> Option<String> {
    if let Ok(guard) = STORED_TOKEN.lock() {
        if let Some(ref token) = *guard {
            return Some(format!("Bearer {token}"));
        }
    }
    for key in ["HF_TOKEN", "HUGGING_FACE_HUB_TOKEN"] {
        if let Ok(token) = std::env::var(key) {
            let token = token.trim();
            if !token.is_empty() {
                return Some(format!("Bearer {token}"));
            }
        }
    }
    None
}

/// HF resolve URLs are already direct file links - pass through.
pub fn resolve(url: &str) -> Result<ResolvedModelUrl, String> {
    Ok(ResolvedModelUrl {
        provider: ProviderKind::HuggingFace,
        source_url: url.to_string(),
        download_url: url.to_string(),
        filename: super::filename_from_url_path(url),
        requires_auth: url_is_gated(url),
    })
}

pub fn url_is_gated(url: &str) -> bool {
    let url = url.trim();
    if url.is_empty() || !is_url(url) {
        return false;
    }
    let cache = GATED_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(guard) = cache.lock() {
        if let Some(known) = guard.get(url) {
            return *known;
        }
    }
    let gated = probe_gated_uncached(url);
    if let Ok(mut guard) = cache.lock() {
        guard.insert(url.to_string(), gated);
    }
    gated
}

fn probe_gated_uncached(url: &str) -> bool {
    let Ok(client) = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent(
            "OpenGenStudio/0.1 (local; +https://github.com/Jamie-Fairweather/open-gen-studio)",
        )
        .timeout(Duration::from_secs(30))
        .build()
    else {
        return false;
    };
    let Ok(res) = client.head(url).send() else {
        return false;
    };
    if res.status().as_u16() == 401 {
        return true;
    }
    if let Some(code) = res
        .headers()
        .get("x-error-code")
        .and_then(|v| v.to_str().ok())
    {
        if code.eq_ignore_ascii_case("GatedRepo") {
            return true;
        }
    }
    false
}
