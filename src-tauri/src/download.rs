use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const USER_AGENT: &str = "OpenGenAI/0.1 (local; +https://github.com/open-gen-ai)";

/// Settings key for the user's Hugging Face access token (gated model downloads).
pub const SETTING_HF_TOKEN: &str = "huggingface_token";

static STORED_HF_TOKEN: Mutex<Option<String>> = Mutex::new(None);
/// Cache of URL → gated (unauthenticated probe). Avoids re-HEADing during packaging/list.
static GATED_URL_CACHE: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();
/// Cooperative cancel for in-flight `download_file` / blueprint installs.
static DOWNLOAD_CANCEL: AtomicBool = AtomicBool::new(false);

/// Request cancel of the current download(s). Cleared when a new install starts.
pub fn request_cancel() {
    DOWNLOAD_CANCEL.store(true, Ordering::SeqCst);
}

pub fn clear_cancel() {
    DOWNLOAD_CANCEL.store(false, Ordering::SeqCst);
}

pub fn is_cancelled() -> bool {
    DOWNLOAD_CANCEL.load(Ordering::SeqCst)
}

fn gated_url_cache() -> &'static Mutex<HashMap<String, bool>> {
    GATED_URL_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Sync token from Settings DB (or clear it). Called on launch and when saved.
pub fn set_stored_hf_token(token: Option<String>) {
    let cleaned = token
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());
    if let Ok(mut guard) = STORED_HF_TOKEN.lock() {
        *guard = cleaned;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub url: String,
    pub dest: String,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub done: bool,
    pub error: Option<String>,
}

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())
}

/// Hugging Face gated repos need a token after accepting the model license.
/// Prefers Settings → Hugging Face token, then HF_TOKEN / HUGGING_FACE_HUB_TOKEN env.
fn hf_auth_header() -> Option<String> {
    if let Ok(guard) = STORED_HF_TOKEN.lock() {
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

fn apply_auth(mut req: reqwest::blocking::RequestBuilder, url: &str) -> reqwest::blocking::RequestBuilder {
    if url.contains("huggingface.co") || url.contains("hf.co") {
        if let Some(auth) = hf_auth_header() {
            req = req.header(reqwest::header::AUTHORIZATION, auth);
        }
    }
    req
}

fn http_status_error(status: reqwest::StatusCode, url: &str) -> String {
    if status.as_u16() == 401
        && (url.contains("huggingface.co") || url.contains("hf.co"))
    {
        return format!(
            "download failed: HTTP 401 — gated Hugging Face model. \
Accept the license on the model page, then add your Hugging Face token in Settings and retry. \
URL: {url}"
        );
    }
    format!("download failed: HTTP {status} ({url})")
}

fn is_hf_url(url: &str) -> bool {
    url.contains("huggingface.co") || url.contains("hf.co")
}

/// Probe whether a URL requires auth when fetched anonymously.
/// Always probes without the stored HF token so gated models stay detectable.
pub fn url_is_gated(url: &str) -> bool {
    let url = url.trim();
    if url.is_empty() || !is_hf_url(url) {
        return false;
    }

    if let Ok(cache) = gated_url_cache().lock() {
        if let Some(known) = cache.get(url) {
            return *known;
        }
    }

    let gated = probe_gated_uncached(url);
    if let Ok(mut cache) = gated_url_cache().lock() {
        cache.insert(url.to_string(), gated);
    }
    gated
}

fn probe_gated_uncached(url: &str) -> bool {
    let Ok(client) = http_client() else {
        return false;
    };
    // Intentionally no Authorization header.
    let Ok(res) = client.head(url).send() else {
        return false;
    };
    if res.status().as_u16() == 401 {
        return true;
    }
    if let Some(code) = res.headers().get("x-error-code").and_then(|v| v.to_str().ok()) {
        if code.eq_ignore_ascii_case("GatedRepo") {
            return true;
        }
    }
    false
}

/// Probe remote object size via HEAD (Content-Length), with a Range GET fallback.
pub fn remote_content_length(url: &str) -> Result<Option<u64>, String> {
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

    // Some CDNs omit Content-Length on HEAD — ask for one byte and read Content-Range.
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

fn parse_content_range_total(header: Option<&str>) -> Option<u64> {
    // e.g. "bytes 0-0/123456789"
    let value = header?;
    let total = value.rsplit('/').next()?;
    if total == "*" {
        return None;
    }
    total.parse().ok()
}

pub fn local_file_len(path: &Path) -> Option<u64> {
    fs::metadata(path).ok().map(|m| m.len())
}

/// Download with resume (HTTP Range) and optional SHA-256 verify.
/// On HTTP 416 (stale partial / GitHub redirect), deletes the partial and retries once.
pub fn download_file(
    app: &AppHandle,
    url: &str,
    dest: &Path,
    expected_sha256: Option<&str>,
) -> Result<(), String> {
    match download_once(app, url, dest, expected_sha256, true) {
        Err(err) if err.contains("416") => {
            let _ = fs::remove_file(dest);
            download_once(app, url, dest, expected_sha256, false)
        }
        other => other,
    }
}

fn download_once(
    app: &AppHandle,
    url: &str,
    dest: &Path,
    expected_sha256: Option<&str>,
    allow_resume: bool,
) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let existing = if allow_resume && dest.exists() {
        fs::metadata(dest).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    let client = http_client()?;

    let mut request = apply_auth(client.get(url), url);
    if existing > 0 {
        request = request.header("Range", format!("bytes={existing}-"));
    }

    let mut response = request.send().map_err(|e| e.to_string())?;
    let status = response.status();

    // Partial file already complete, or Range past end of object.
    if status.as_u16() == 416 {
        return Err(format!("download failed: HTTP {status}"));
    }

    if !(status.is_success() || status.as_u16() == 206) {
        return Err(http_status_error(status, url));
    }

    let resume = status.as_u16() == 206;
    let total = response.content_length().map(|len| {
        if resume {
            existing + len
        } else {
            len
        }
    });

    // If we asked to resume but got a full 200, rewrite from scratch.
    let mut file = if resume {
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(dest)
            .map_err(|e| e.to_string())?
    } else {
        File::create(dest).map_err(|e| e.to_string())?
    };

    let mut downloaded = if resume { existing } else { 0 };
    let mut buf = [0u8; 64 * 1024];
    let dest_str = dest.display().to_string();
    let mut last_emit = Instant::now()
        .checked_sub(Duration::from_secs(1))
        .unwrap_or_else(Instant::now);

    loop {
        if is_cancelled() {
            let _ = app.emit(
                "downloads://progress",
                DownloadProgress {
                    url: url.into(),
                    dest: dest_str,
                    downloaded,
                    total,
                    done: true,
                    error: Some("cancelled".into()),
                },
            );
            return Err("cancelled".into());
        }
        let n = response.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        downloaded += n as u64;

        if last_emit.elapsed() >= Duration::from_millis(300) {
            let _ = app.emit(
                "downloads://progress",
                DownloadProgress {
                    url: url.into(),
                    dest: dest_str.clone(),
                    downloaded,
                    total,
                    done: false,
                    error: None,
                },
            );
            last_emit = Instant::now();
        }
    }

    if let Some(expected) = expected_sha256 {
        let actual = sha256_file(dest)?;
        if !actual.eq_ignore_ascii_case(expected.trim()) {
            let err = format!("checksum mismatch: expected {expected}, got {actual}");
            let _ = app.emit(
                "downloads://progress",
                DownloadProgress {
                    url: url.into(),
                    dest: dest_str,
                    downloaded,
                    total,
                    done: true,
                    error: Some(err.clone()),
                },
            );
            return Err(err);
        }
    }

    let _ = app.emit(
        "downloads://progress",
        DownloadProgress {
            url: url.into(),
            dest: dest_str,
            downloaded,
            total,
            done: true,
            error: None,
        },
    );

    Ok(())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}
