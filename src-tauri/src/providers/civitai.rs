use super::{ProviderKind, ResolvedModelUrl};
use serde::Deserialize;
use std::sync::Mutex;
use std::time::Duration;

pub const SETTING_CIVITAI_TOKEN: &str = "civitai_api_key";

static STORED_TOKEN: Mutex<Option<String>> = Mutex::new(None);

pub fn is_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.contains("civitai.com")
}

pub fn set_stored_token(token: Option<String>) {
    let cleaned = token
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());
    if let Ok(mut guard) = STORED_TOKEN.lock() {
        *guard = cleaned;
    }
}

pub fn has_stored_token() -> bool {
    if let Ok(guard) = STORED_TOKEN.lock() {
        if guard.as_ref().is_some_and(|t| !t.is_empty()) {
            return true;
        }
    }
    std::env::var("CIVITAI_API_KEY")
        .map(|t| !t.trim().is_empty())
        .unwrap_or(false)
}

pub fn auth_header() -> Option<String> {
    if let Ok(guard) = STORED_TOKEN.lock() {
        if let Some(ref token) = *guard {
            return Some(format!("Bearer {token}"));
        }
    }
    if let Ok(token) = std::env::var("CIVITAI_API_KEY") {
        let token = token.trim();
        if !token.is_empty() {
            return Some(format!("Bearer {token}"));
        }
    }
    None
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionResponse {
    id: u64,
    download_url: Option<String>,
    files: Option<Vec<VersionFile>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionFile {
    name: Option<String>,
    primary: Option<bool>,
    #[serde(rename = "type")]
    file_type: Option<String>,
    download_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelResponse {
    model_versions: Option<Vec<VersionSummary>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionSummary {
    id: u64,
}

/// Resolve a CivitAI model page or download URL to an API download URL + filename.
pub fn resolve(url: &str) -> Result<ResolvedModelUrl, String> {
    let version_id = parse_version_id(url)?
        .or_else(|| fetch_latest_version_id(url).ok())
        .ok_or_else(|| {
            "could not find a CivitAI model version — open a model page with ?modelVersionId=… \
or pick a specific version on the site"
                .to_string()
        })?;

    let meta = fetch_version(version_id)?;
    let download_url = meta
        .download_url
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| format!("https://civitai.com/api/download/models/{version_id}"));

    let filename = primary_filename(&meta.files)
        .or_else(|| {
            meta.files
                .as_ref()
                .and_then(|files| files.first())
                .and_then(|f| f.name.clone())
        });

    Ok(ResolvedModelUrl {
        provider: ProviderKind::CivitAi,
        source_url: url.to_string(),
        download_url,
        filename,
        requires_auth: true,
    })
}

fn primary_filename(files: &Option<Vec<VersionFile>>) -> Option<String> {
    let files = files.as_ref()?;
    files
        .iter()
        .find(|f| f.primary.unwrap_or(false))
        .or_else(|| {
            files.iter().find(|f| {
                f.file_type
                    .as_deref()
                    .is_some_and(|t| t.eq_ignore_ascii_case("Model"))
            })
        })
        .and_then(|f| f.name.clone())
}

fn parse_version_id(url: &str) -> Result<Option<u64>, String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("invalid CivitAI url: {e}"))?;
    if let Some((_, v)) = parsed.query_pairs().find(|(k, _)| k == "modelVersionId") {
        let id = v
            .parse::<u64>()
            .map_err(|_| format!("invalid modelVersionId '{v}'"))?;
        return Ok(Some(id));
    }
    // https://civitai.com/api/download/models/3081104
    let segments: Vec<_> = parsed
        .path_segments()
        .map(|s| s.collect())
        .unwrap_or_default();
    if segments.len() >= 3
        && segments[0].eq_ignore_ascii_case("api")
        && segments[1].eq_ignore_ascii_case("download")
        && segments[2].eq_ignore_ascii_case("models")
    {
        if let Some(id) = segments.get(3).and_then(|s| s.parse().ok()) {
            return Ok(Some(id));
        }
    }
    Ok(None)
}

fn parse_model_id(url: &str) -> Option<u64> {
    let parsed = url::Url::parse(url).ok()?;
    let mut segs = parsed.path_segments()?;
    if segs.next()? != "models" {
        return None;
    }
    segs.next()?.parse().ok()
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent("OpenGenAI/0.1 (local; +https://github.com/open-gen-ai)")
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())
}

fn apply_auth(mut req: reqwest::blocking::RequestBuilder) -> reqwest::blocking::RequestBuilder {
    if let Some(auth) = auth_header() {
        req = req.header(reqwest::header::AUTHORIZATION, auth);
    }
    req
}

fn fetch_version(version_id: u64) -> Result<VersionResponse, String> {
    let client = client()?;
    let url = format!("https://civitai.com/api/v1/model-versions/{version_id}");
    let res = apply_auth(client.get(&url))
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!(
            "CivitAI API error HTTP {} for model version {version_id}",
            res.status()
        ));
    }
    let mut meta: VersionResponse = res.json().map_err(|e| e.to_string())?;
    if meta.id == 0 {
        meta.id = version_id;
    }
    Ok(meta)
}

fn fetch_latest_version_id(page_url: &str) -> Result<u64, String> {
    let model_id = parse_model_id(page_url).ok_or_else(|| {
        "CivitAI url must be a model page (/models/…) or include modelVersionId".to_string()
    })?;
    let client = client()?;
    let url = format!("https://civitai.com/api/v1/models/{model_id}");
    let res = apply_auth(client.get(&url))
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!(
            "CivitAI API error HTTP {} for model {model_id}",
            res.status()
        ));
    }
    let model: ModelResponse = res.json().map_err(|e| e.to_string())?;
    model
        .model_versions
        .and_then(|v| v.into_iter().next())
        .map(|v| v.id)
        .ok_or_else(|| format!("CivitAI model {model_id} has no versions"))
}
