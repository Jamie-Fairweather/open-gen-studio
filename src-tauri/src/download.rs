use crate::providers::{self, ProviderKind};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const USER_AGENT: &str = "OpenGenAI/0.1 (local; +https://github.com/open-gen-ai)";

pub use crate::providers::{SETTING_CIVITAI_TOKEN, SETTING_HF_TOKEN};

/// Cooperative cancel / pause for the active HTTP transfer (single-flight worker).
static DOWNLOAD_CANCEL: AtomicBool = AtomicBool::new(false);
static DOWNLOAD_PAUSE: AtomicBool = AtomicBool::new(false);

/// Request cancel of the current download(s). Cleared when a new install starts.
pub fn request_cancel() {
    DOWNLOAD_CANCEL.store(true, Ordering::SeqCst);
}

pub fn clear_cancel() {
    DOWNLOAD_CANCEL.store(false, Ordering::SeqCst);
    DOWNLOAD_PAUSE.store(false, Ordering::SeqCst);
}

pub fn is_cancelled() -> bool {
    DOWNLOAD_CANCEL.load(Ordering::SeqCst)
}

pub fn request_pause() {
    DOWNLOAD_PAUSE.store(true, Ordering::SeqCst);
}

pub fn clear_pause() {
    DOWNLOAD_PAUSE.store(false, Ordering::SeqCst);
}

pub fn is_paused() -> bool {
    DOWNLOAD_PAUSE.load(Ordering::SeqCst)
}

/// Clear both signals before the worker starts a job.
pub fn clear_transfer_controls() {
    clear_cancel();
}

/// Sync Hugging Face token from Settings DB (or clear it).
pub fn set_stored_hf_token(token: Option<String>) {
    providers::set_stored_token(ProviderKind::HuggingFace, token);
}

/// Sync CivitAI API key from Settings DB (or clear it).
pub fn set_stored_civitai_token(token: Option<String>) {
    providers::set_stored_token(ProviderKind::CivitAi, token);
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

fn apply_auth(mut req: reqwest::blocking::RequestBuilder, url: &str) -> reqwest::blocking::RequestBuilder {
    if let Some(auth) = providers::auth_header_for(url) {
        req = req.header(reqwest::header::AUTHORIZATION, auth);
    }
    req
}

fn http_status_error(status: reqwest::StatusCode, url: &str) -> String {
    if let Some(hint) = providers::http_status_hint(status, url) {
        return format!("{hint} URL: {url}");
    }
    format!("download failed: HTTP {status} ({url})")
}

/// Probe whether a Hugging Face URL requires auth when fetched anonymously.
pub fn url_is_gated(url: &str) -> bool {
    matches!(providers::detect(url), ProviderKind::HuggingFace) && providers::requires_auth(url)
}

/// Resolve a user URL (page or direct) to the HTTP download URL.
pub fn resolve_download_url(url: &str) -> Result<String, String> {
    Ok(providers::resolve(url)?.download_url)
}

/// Probe remote object size via HEAD (Content-Length), with a Range GET fallback.
/// Accepts page URLs (e.g. CivitAI model pages) — resolves first.
pub fn remote_content_length(url: &str) -> Result<Option<u64>, String> {
    let download_url = resolve_download_url(url).unwrap_or_else(|_| url.trim().to_string());
    remote_content_length_direct(&download_url)
}

fn remote_content_length_direct(url: &str) -> Result<Option<u64>, String> {
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

/// True when a local model file looks like real weights (not an HTML error page).
/// Size-only skip is unsafe: a resumed HF HTML gate + Range can match remote length.
/// Note: truncated safetensors still pass — use [`local_file_complete`] before skipping downloads.
pub fn local_file_usable(path: &Path) -> bool {
    let Ok(mut file) = File::open(path) else {
        return false;
    };
    let mut head = [0u8; 16];
    let Ok(n) = file.read(&mut head) else {
        return false;
    };
    if n == 0 {
        return false;
    }
    if looks_like_html(&head[..n]) {
        return false;
    }
    let is_st = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("safetensors"));
    if !is_st {
        return true;
    }
    if n < 8 {
        return false;
    }
    let header_len = u64::from_le_bytes(head[0..8].try_into().unwrap());
    // Real safetensors JSON headers are small; HTML-as-u64 is huge garbage.
    if !(2..=16 * 1024 * 1024).contains(&header_len) {
        return false;
    }
    // JSON starts at byte 8 — already in `head` when we read ≥9 bytes.
    if n > 8 {
        return head[8] == b'{';
    }
    let mut first = [0u8; 1];
    matches!(file.read_exact(&mut first), Ok(())) && first[0] == b'{'
}

/// Usable **and** fully present. Truncated safetensors keep a valid header but miss tensor bytes.
pub fn local_file_complete(path: &Path) -> bool {
    if !local_file_usable(path) {
        return false;
    }
    let is_st = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("safetensors"));
    if !is_st {
        return true;
    }
    safetensors_payload_complete(path)
}

/// Verify file length covers every tensor listed in the safetensors JSON header.
fn safetensors_payload_complete(path: &Path) -> bool {
    let Ok(mut file) = File::open(path) else {
        return false;
    };
    let Ok(meta) = file.metadata() else {
        return false;
    };
    let file_len = meta.len();
    let mut len_buf = [0u8; 8];
    if file.read_exact(&mut len_buf).is_err() {
        return false;
    }
    let header_len = u64::from_le_bytes(len_buf);
    if !(2..=16 * 1024 * 1024).contains(&header_len) {
        return false;
    }
    if file_len < 8 + header_len {
        return false;
    }
    let mut header = vec![0u8; header_len as usize];
    if file.read_exact(&mut header).is_err() {
        return false;
    }
    let Ok(serde_json::Value::Object(map)) = serde_json::from_slice::<serde_json::Value>(&header)
    else {
        return false;
    };
    let mut max_end = 0u64;
    for (key, val) in &map {
        if key == "__metadata__" {
            continue;
        }
        let Some(offsets) = val.get("data_offsets").and_then(|o| o.as_array()) else {
            continue;
        };
        if offsets.len() != 2 {
            return false;
        }
        let Some(end) = offsets[1].as_u64() else {
            return false;
        };
        max_end = max_end.max(end);
    }
    file_len >= 8 + header_len + max_end
}

fn looks_like_html(bytes: &[u8]) -> bool {
    let lower: Vec<u8> = bytes
        .iter()
        .map(|b| b.to_ascii_lowercase())
        .take(64)
        .collect();
    lower.starts_with(b"<!doctype")
        || lower.starts_with(b"<html")
        || lower.windows(6).any(|w| w == b"<html ")
}

/// Download with resume (HTTP Range) and optional SHA-256 verify.
/// `url` may be a provider page URL (CivitAI model page, etc.).
/// On HTTP 416 (stale partial / GitHub redirect), deletes the partial and retries once.
pub fn download_file(
    app: &AppHandle,
    url: &str,
    dest: &Path,
    expected_sha256: Option<&str>,
) -> Result<(), String> {
    let download_url = resolve_download_url(url)?;
    match download_once(app, &download_url, dest, expected_sha256, true) {
        Err(err) if err.contains("416") => {
            let _ = fs::remove_file(dest);
            download_once(app, &download_url, dest, expected_sha256, false)
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

    // Don't Range-resume over an HTML / corrupt partial — that yields size-correct junk.
    let existing = if allow_resume && dest.exists() {
        if local_file_usable(dest) {
            fs::metadata(dest).map(|m| m.len()).unwrap_or(0)
        } else {
            let _ = fs::remove_file(dest);
            0
        }
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

    // HF (and others) often return 200 text/html for login / gate pages.
    if status.as_u16() == 200 {
        if let Some(ct) = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
        {
            if ct.to_ascii_lowercase().contains("text/html") {
                return Err(format!(
                    "download returned HTML instead of model weights (auth/gate page?). URL: {url}"
                ));
            }
        }
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
        if is_paused() {
            let _ = app.emit(
                "downloads://progress",
                DownloadProgress {
                    url: url.into(),
                    dest: dest_str,
                    downloaded,
                    total,
                    done: true,
                    error: Some("paused".into()),
                },
            );
            return Err("paused".into());
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

    if !local_file_usable(dest) {
        let _ = fs::remove_file(dest);
        let err = format!(
            "downloaded file is not valid model weights (got HTML or corrupt data). URL: {url}"
        );
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

    // Interrupted transfers leave a valid safetensors header with a short payload.
    if let Some(expected) = total {
        if downloaded != expected {
            let err = format!(
                "download incomplete: got {downloaded} bytes, expected {expected}. URL: {url}"
            );
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
    } else if !local_file_complete(dest) {
        let err = format!("download incomplete (truncated weights). URL: {url}");
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn rejects_html_prefix_as_unusable() {
        let dir = std::env::temp_dir().join(format!("oga-dl-html-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("fake.safetensors");
        let mut f = File::create(&path).unwrap();
        f.write_all(b"<!doctype html><html><body>login</body></html>")
            .unwrap();
        drop(f);
        assert!(!local_file_usable(&path));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn accepts_minimal_safetensors_header() {
        let dir = std::env::temp_dir().join(format!("oga-dl-ok-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("ok.safetensors");
        let header = br#"{"a":{"dtype":"F32","shape":[1],"data_offsets":[0,4]}}"#;
        let mut f = File::create(&path).unwrap();
        f.write_all(&(header.len() as u64).to_le_bytes()).unwrap();
        f.write_all(header).unwrap();
        f.write_all(&[0u8; 4]).unwrap();
        drop(f);
        assert!(local_file_usable(&path));
        assert!(local_file_complete(&path));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_truncated_safetensors_payload() {
        let dir = std::env::temp_dir().join(format!("oga-dl-trunc-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("trunc.safetensors");
        let header = br#"{"a":{"dtype":"F32","shape":[1],"data_offsets":[0,4]}}"#;
        let mut f = File::create(&path).unwrap();
        f.write_all(&(header.len() as u64).to_le_bytes()).unwrap();
        f.write_all(header).unwrap();
        // Missing the 4 payload bytes.
        drop(f);
        assert!(local_file_usable(&path));
        assert!(!local_file_complete(&path));
        let _ = fs::remove_dir_all(&dir);
    }
}
