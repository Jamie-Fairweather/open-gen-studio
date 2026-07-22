//! Model download providers (Hugging Face, CivitAI, …).
//! Add a new provider by implementing parsing/auth here and registering in `detect`.

mod civitai;
mod huggingface;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

pub use civitai::SETTING_CIVITAI_TOKEN;
pub use huggingface::SETTING_HF_TOKEN;

static RESOLVE_CACHE: OnceLock<Mutex<HashMap<String, ResolvedModelUrl>>> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProviderKind {
    HuggingFace,
    CivitAi,
    /// Direct file URL (no special handling).
    Direct,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedModelUrl {
    pub provider: ProviderKind,
    /// Original URL the user pasted / stored in the manifest.
    pub source_url: String,
    /// URL to pass to the HTTP downloader.
    pub download_url: String,
    /// Suggested filename when the provider can resolve one.
    pub filename: Option<String>,
    /// True if downloads need a stored API token for this provider.
    pub requires_auth: bool,
}

pub fn detect(url: &str) -> ProviderKind {
    let url = url.trim();
    if huggingface::is_url(url) {
        ProviderKind::HuggingFace
    } else if civitai::is_url(url) {
        ProviderKind::CivitAi
    } else {
        ProviderKind::Direct
    }
}

/// Resolve a user-facing model URL (page or direct) into a downloadable URL + filename.
pub fn resolve(url: &str) -> Result<ResolvedModelUrl, String> {
    let source_url = url.trim().to_string();
    if source_url.is_empty() {
        return Err("empty model url".into());
    }
    if let Some(cached) = resolve_cache()
        .lock()
        .ok()
        .and_then(|c| c.get(&source_url).cloned())
    {
        return Ok(cached);
    }
    let resolved = match detect(&source_url) {
        ProviderKind::HuggingFace => huggingface::resolve(&source_url)?,
        ProviderKind::CivitAi => civitai::resolve(&source_url)?,
        ProviderKind::Direct => ResolvedModelUrl {
            provider: ProviderKind::Direct,
            download_url: source_url.clone(),
            filename: filename_from_url_path(&source_url),
            source_url: source_url.clone(),
            requires_auth: false,
        },
    };
    if let Ok(mut cache) = resolve_cache().lock() {
        cache.insert(source_url, resolved.clone());
    }
    Ok(resolved)
}

fn resolve_cache() -> &'static Mutex<HashMap<String, ResolvedModelUrl>> {
    RESOLVE_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn auth_header_for(url: &str) -> Option<String> {
    match detect(url) {
        ProviderKind::HuggingFace => huggingface::auth_header(),
        ProviderKind::CivitAi => civitai::auth_header(),
        ProviderKind::Direct => None,
    }
}

/// Whether this URL needs a provider token (HF gated probe, or any CivitAI URL).
pub fn requires_auth(url: &str) -> bool {
    let url = url.trim();
    if url.is_empty() {
        return false;
    }
    match detect(url) {
        ProviderKind::HuggingFace => huggingface::url_is_gated(url),
        ProviderKind::CivitAi => true,
        ProviderKind::Direct => false,
    }
}

pub fn set_stored_token(provider: ProviderKind, token: Option<String>) {
    match provider {
        ProviderKind::HuggingFace => huggingface::set_stored_token(token),
        ProviderKind::CivitAi => civitai::set_stored_token(token),
        ProviderKind::Direct => {}
    }
}

pub fn has_stored_token(provider: ProviderKind) -> bool {
    match provider {
        ProviderKind::HuggingFace => huggingface::has_stored_token(),
        ProviderKind::CivitAi => civitai::has_stored_token(),
        ProviderKind::Direct => true,
    }
}

pub fn http_status_hint(status: reqwest::StatusCode, url: &str) -> Option<String> {
    if status.as_u16() != 401 {
        return None;
    }
    match detect(url) {
        ProviderKind::HuggingFace => Some(
            "download failed: HTTP 401 — gated Hugging Face model. \
Accept the license on the model page, then add your Hugging Face token in Settings and retry."
                .into(),
        ),
        ProviderKind::CivitAi => Some(
            "download failed: HTTP 401 — CivitAI API key required. \
Create an API key at civitai.com/user/account (API Keys section), add it in Settings, and retry."
                .into(),
        ),
        ProviderKind::Direct => None,
    }
}

fn filename_from_url_path(url: &str) -> Option<String> {
    let parsed = url::Url::parse(url).ok()?;
    let segment = parsed.path_segments()?.next_back()?;
    let name = urlencoding_decode(segment);
    if name.is_empty() || !name.contains('.') {
        return None;
    }
    Some(name)
}

fn urlencoding_decode(s: &str) -> String {
    percent_encoding_decode(s).unwrap_or_else(|| s.to_string())
}

fn percent_encoding_decode(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let h = std::str::from_utf8(&bytes[i + 1..i + 3]).ok()?;
            let b = u8::from_str_radix(h, 16).ok()?;
            out.push(b);
            i += 3;
        } else if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}
