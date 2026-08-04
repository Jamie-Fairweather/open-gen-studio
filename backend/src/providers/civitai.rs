use super::{ProviderKind, ResolvedModelUrl};
use crate::recipe::RecipeArch;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

pub const SETTING_CIVITAI_TOKEN: &str = "civitai_api_key";

static STORED_TOKEN: Mutex<Option<String>> = Mutex::new(None);

pub fn is_url(url: &str) -> bool {
    let url = url.trim();
    if let Ok(parsed) = url::Url::parse(url) {
        let host = parsed.host_str().unwrap_or("").to_ascii_lowercase();
        return host == "civitai.com"
            || host == "civitai.red"
            || host.ends_with(".civitai.com")
            || host.ends_with(".civitai.red");
    }
    let lower = url.to_ascii_lowercase();
    lower.contains("civitai.com") || lower.contains("civitai.red")
}

/// Prefer the same front door (.com / .red) as the source URL for download links.
fn download_origin(source_url: &str) -> &'static str {
    if let Ok(parsed) = url::Url::parse(source_url.trim()) {
        let host = parsed.host_str().unwrap_or("").to_ascii_lowercase();
        if host == "civitai.red" || host.ends_with(".civitai.red") {
            return "https://civitai.red";
        }
    }
    "https://civitai.com"
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
    raw_token().map(|token| format!("Bearer {token}"))
}

fn raw_token() -> Option<String> {
    if let Ok(guard) = STORED_TOKEN.lock() {
        if let Some(ref token) = *guard {
            if !token.is_empty() {
                return Some(token.clone());
            }
        }
    }
    std::env::var("CIVITAI_API_KEY")
        .ok()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
}

/// Append `?token=` so auth survives CDN redirects that strip Authorization.
/// Only use at download time — never persist the result.
pub fn url_with_token(url: &str) -> String {
    let Some(token) = raw_token() else {
        return strip_token(url);
    };
    let Ok(mut parsed) = url::Url::parse(url) else {
        return url.to_string();
    };
    // Drop any existing token first so we always use the stored key.
    {
        let pairs: Vec<(String, String)> = parsed
            .query_pairs()
            .filter(|(k, _)| k != "token")
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        parsed.query_pairs_mut().clear().extend_pairs(pairs);
    }
    parsed.query_pairs_mut().append_pair("token", &token);
    parsed.to_string()
}

/// Remove `token` query params so API keys never land in manifests / UI fields.
pub fn strip_token(url: &str) -> String {
    let Ok(mut parsed) = url::Url::parse(url.trim()) else {
        return url.to_string();
    };
    if !parsed.query_pairs().any(|(k, _)| k == "token") {
        return parsed.to_string();
    }
    let pairs: Vec<(String, String)> = parsed
        .query_pairs()
        .filter(|(k, _)| k != "token")
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    if pairs.is_empty() {
        parsed.set_query(None);
    } else {
        parsed.query_pairs_mut().clear().extend_pairs(pairs);
    }
    parsed.to_string()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionResponse {
    id: u64,
    model_id: Option<u64>,
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
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelResponse {
    id: Option<u64>,
    name: Option<String>,
    #[serde(rename = "type")]
    model_type: Option<String>,
    model_versions: Option<Vec<ModelVersionEntry>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelVersionEntry {
    id: u64,
    name: Option<String>,
    base_model: Option<String>,
    published_at: Option<String>,
    download_url: Option<String>,
    files: Option<Vec<VersionFile>>,
}

/// One downloadable file suggested for a RecipeArch (latest published version).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CivitaiExpandedVariant {
    pub arch: RecipeArch,
    /// CivitAI download URL (no API token — auth is applied at download time).
    pub url: String,
    pub filename: Option<String>,
    pub base_model: String,
    pub version_name: String,
    pub version_id: u64,
    pub published_at: Option<String>,
}

/// Expand a CivitAI model page into latest-per-architecture download rows.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CivitaiLoraExpand {
    pub model_id: u64,
    pub name: String,
    pub model_type: Option<String>,
    pub variants: Vec<CivitaiExpandedVariant>,
    /// CivitAI `baseModel` values we could not map to a RecipeArch.
    pub skipped_base_models: Vec<String>,
}

/// Resolve a CivitAI model page or download URL to an API download URL + filename.
pub fn resolve(url: &str) -> Result<ResolvedModelUrl, String> {
    let version_id = parse_version_id(url)?
        .or_else(|| fetch_latest_version_id(url).ok())
        .ok_or_else(|| {
            "could not find a CivitAI model version - open a model page with ?modelVersionId=… \
or pick a specific version on the site"
                .to_string()
        })?;

    let meta = fetch_version(version_id)?;
    let origin = download_origin(url);
    let download_url = meta
        .download_url
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| format!("{origin}/api/download/models/{version_id}"));
    let download_url = strip_token(&download_url);

    let filename = primary_filename(&meta.files).or_else(|| {
        meta.files
            .as_ref()
            .and_then(|files| files.first())
            .and_then(|f| f.name.clone())
    });

    Ok(ResolvedModelUrl {
        provider: ProviderKind::CivitAi,
        source_url: strip_token(url),
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
        .user_agent(
            "OpenGenStudio/0.1 (local; +https://github.com/Jamie-Fairweather/open-gen-studio)",
        )
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
    let model = fetch_model(resolve_model_id(page_url)?)?;
    model
        .model_versions
        .and_then(|v| v.into_iter().next())
        .map(|v| v.id)
        .ok_or_else(|| "CivitAI model has no versions".to_string())
}

fn resolve_model_id(url: &str) -> Result<u64, String> {
    if let Some(id) = parse_model_id(url) {
        return Ok(id);
    }
    let version_id = parse_version_id(url)?.ok_or_else(|| {
        "CivitAI url must be a model page (/models/…) or include modelVersionId".to_string()
    })?;
    let meta = fetch_version(version_id)?;
    meta.model_id
        .ok_or_else(|| format!("CivitAI model version {version_id} did not include a model id"))
}

fn fetch_model(model_id: u64) -> Result<ModelResponse, String> {
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
    let mut model: ModelResponse = res.json().map_err(|e| e.to_string())?;
    if model.id.is_none() {
        model.id = Some(model_id);
    }
    Ok(model)
}

/// Map CivitAI `baseModel` (+ optional version name) onto our RecipeArch allowlist.
fn map_base_model_to_arch(base_model: &str, version_name: &str) -> Option<RecipeArch> {
    let bm = base_model.trim().to_ascii_lowercase();
    let vn = version_name.trim().to_ascii_lowercase();
    if bm.is_empty() {
        return None;
    }

    // Exact / prefix matches first (CivitAI strings vary by spacing/punctuation).
    if bm.contains("krea") {
        return Some(RecipeArch::Krea2);
    }
    if bm.contains("zimage") || bm.contains("z-image") || bm.contains("z image") {
        return Some(RecipeArch::ZImage);
    }
    if bm.contains("pony") {
        return Some(RecipeArch::Pony);
    }
    if bm.contains("illustrious") {
        return Some(RecipeArch::Illustrious);
    }
    if bm.contains("chroma") {
        return Some(RecipeArch::Chroma);
    }
    if bm.contains("ideogram") {
        return Some(RecipeArch::Ideogram4);
    }
    if bm.contains("qwen") {
        return Some(RecipeArch::QwenImage);
    }
    if bm.contains("flux.2") || bm.contains("flux2") || bm.starts_with("flux 2") {
        return Some(RecipeArch::Flux2);
    }
    if bm.contains("flux") {
        return Some(RecipeArch::Flux);
    }
    if bm.contains("sd 3.5") || bm.contains("sd3.5") || bm == "sd3" || bm.starts_with("sd 3") {
        return Some(RecipeArch::Sd35);
    }
    if bm.contains("sdxl") {
        return Some(RecipeArch::Sdxl);
    }
    if bm.contains("sd 1.5")
        || bm.contains("sd1.5")
        || bm == "sd1"
        || bm.starts_with("sd 1")
        || bm.contains("stable diffusion 1")
    {
        return Some(RecipeArch::Sd15);
    }

    // Fallback: version title sometimes encodes the family when baseModel is vague.
    if vn.contains("krea") {
        return Some(RecipeArch::Krea2);
    }
    if vn.contains("pony") {
        return Some(RecipeArch::Pony);
    }

    None
}

/// Fetch a CivitAI model and return the newest published file per supported arch.
pub fn expand_lora_url(url: &str) -> Result<CivitaiLoraExpand, String> {
    let source = url.trim();
    if source.is_empty() {
        return Err("empty model url".into());
    }
    if !is_url(source) {
        return Err("not a CivitAI url".into());
    }

    let model_id = resolve_model_id(source)?;
    let model = fetch_model(model_id)?;
    let origin = download_origin(source);
    let versions = model.model_versions.unwrap_or_default();
    if versions.is_empty() {
        return Err(format!("CivitAI model {model_id} has no versions"));
    }

    let mut best: HashMap<RecipeArch, CivitaiExpandedVariant> = HashMap::new();
    let mut skipped: Vec<String> = Vec::new();

    for v in versions {
        let base_model = v.base_model.as_deref().unwrap_or("").trim().to_string();
        let version_name = v.name.as_deref().unwrap_or("").trim().to_string();
        let Some(arch) = map_base_model_to_arch(&base_model, &version_name) else {
            if !base_model.is_empty() && !skipped.iter().any(|s| s == &base_model) {
                skipped.push(base_model);
            }
            continue;
        };

        let published_at = v.published_at.clone();
        let replace = match best.get(&arch) {
            None => true,
            Some(prev) => {
                let prev_at = prev.published_at.as_deref().unwrap_or("");
                let next_at = published_at.as_deref().unwrap_or("");
                next_at > prev_at
            }
        };
        if !replace {
            continue;
        }

        let download_url = v
            .download_url
            .filter(|u| !u.is_empty())
            .unwrap_or_else(|| format!("{origin}/api/download/models/{}", v.id));
        let download_url = strip_token(&download_url);
        let filename = primary_filename(&v.files).or_else(|| {
            v.files
                .as_ref()
                .and_then(|files| files.first())
                .and_then(|f| f.name.clone())
        });

        best.insert(
            arch,
            CivitaiExpandedVariant {
                arch,
                url: download_url,
                filename,
                base_model,
                version_name,
                version_id: v.id,
                published_at,
            },
        );
    }

    let mut variants: Vec<_> = best.into_values().collect();
    variants.sort_by(|a, b| a.arch.as_str().cmp(b.arch.as_str()));
    skipped.sort();

    if variants.is_empty() {
        return Err(format!(
            "no supported architectures found on CivitAI model {model_id}{}",
            if skipped.is_empty() {
                String::new()
            } else {
                format!(" (saw: {})", skipped.join(", "))
            }
        ));
    }

    Ok(CivitaiLoraExpand {
        model_id: model.id.unwrap_or(model_id),
        name: model.name.unwrap_or_default(),
        model_type: model.model_type,
        variants,
        skipped_base_models: skipped,
    })
}
