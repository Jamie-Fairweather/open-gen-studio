use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub url: String,
    pub dest: String,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub done: bool,
    pub error: Option<String>,
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
    super::controls::sync_provider_tokens(app);
    let download_url = super::http::resolve_download_url(url)?;
    match download_once(app, &download_url, dest, expected_sha256, true) {
        Err(err) if err.contains("416") => {
            let _ = fs::remove_file(dest);
            download_once(app, &download_url, dest, expected_sha256, false)
        }
        other => other,
    }
}

pub(crate) fn download_once(
    app: &AppHandle,
    url: &str,
    dest: &Path,
    expected_sha256: Option<&str>,
    allow_resume: bool,
) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Don't Range-resume over an HTML / corrupt partial - that yields size-correct junk.
    let existing = if allow_resume && dest.exists() {
        if super::local::local_file_usable(dest) {
            fs::metadata(dest).map(|m| m.len()).unwrap_or(0)
        } else {
            let _ = fs::remove_file(dest);
            0
        }
    } else {
        0
    };

    let client = super::http::http_client()?;

    let mut request = super::http::apply_auth(client.get(url), url);
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
        return Err(super::http::http_status_error(status, url));
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
    let total = response
        .content_length()
        .map(|len| if resume { existing + len } else { len });

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
        if super::controls::is_cancelled() {
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
        if super::controls::is_paused() {
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

    if !super::local::local_file_usable(dest) {
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
    } else if !super::local::local_file_complete(dest) {
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

pub(crate) fn sha256_file(path: &Path) -> Result<String, String> {
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
