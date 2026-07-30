use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter};

use crate::comfy;
use crate::download;

use super::cache::{cached_remote_size, probe_remote_size};
use super::crud::load_manifest;
use super::types::{BlueprintProgress, CustomNodeDep, ModelEntry};

/// Download all models for a Blueprint into the shared models library.
/// Emits `blueprints://progress` (with overall byte totals) and reuses
/// `downloads://progress` per file for live transfer updates.
pub fn install_models(app: &AppHandle, blueprint_id: &str) -> Result<(), String> {
    download::clear_cancel();
    let (_dir, manifest) = load_manifest(app, blueprint_id)?;
    let models_root = comfy::models_dir(app)?;
    fs::create_dir_all(&models_root).map_err(|e| e.to_string())?;

    if !manifest.custom_nodes.is_empty() {
        emit_progress(
            app,
            blueprint_id,
            "deps",
            "Installing custom nodes…",
            0,
            manifest.models.len(),
            None,
            None,
            None,
        );
        install_custom_nodes(app, &manifest.custom_nodes)?;
    }

    let total = manifest.models.len();
    if total == 0 {
        emit_progress(
            app,
            blueprint_id,
            "done",
            "No models to download",
            0,
            0,
            Some(0),
            Some(0),
            None,
        );
        return Ok(());
    }

    // Probe with auth available so gated HF sizes are included in the overall total.
    let expected_sizes: Vec<Option<u64>> = manifest
        .models
        .iter()
        .map(|model| {
            if model.url.trim().is_empty() {
                let dest = models_root.join(&model.path).join(&model.filename);
                Some(download::local_file_len(&dest).unwrap_or(0))
            } else {
                probe_remote_size(&model.url)
            }
        })
        .collect();
    let mut bytes_total: Option<u64> = if expected_sizes.iter().all(|s| s.is_some()) {
        Some(expected_sizes.iter().filter_map(|s| *s).sum())
    } else {
        None
    };

    let mut bytes_done = 0u64;

    for (i, model) in manifest.models.iter().enumerate() {
        if download::is_cancelled() {
            return Err("cancelled".into());
        }
        validate_model_paths_allow_empty_url(model)?;
        let dest = models_root.join(&model.path).join(&model.filename);

        // Local-only entries (no URL) - skip download; just report presence.
        if model.url.trim().is_empty() {
            let local = download::local_file_len(&dest).unwrap_or(0);
            bytes_done += local;
            emit_progress(
                app,
                blueprint_id,
                if local > 0 { "skip" } else { "missing" },
                if local > 0 {
                    format!("Local model present: {}", model.filename)
                } else {
                    format!(
                        "No URL for {} - place file in models/{}/",
                        model.filename, model.path
                    )
                },
                i + 1,
                total,
                Some(bytes_done),
                bytes_total,
                Some(&model.filename),
            );
            continue;
        }

        let remote = expected_sizes[i].or_else(|| probe_remote_size(&model.url));
        let local = download::local_file_len(&dest).unwrap_or(0);

        if let Some(expected) = remote {
            if local == expected && download::local_file_usable(&dest) {
                bytes_done += local;
                emit_progress(
                    app,
                    blueprint_id,
                    "skip",
                    format!(
                        "Already present: {} ({})",
                        model.filename,
                        format_bytes(expected)
                    ),
                    i + 1,
                    total,
                    Some(bytes_done),
                    bytes_total,
                    Some(&model.filename),
                );
                continue;
            }
            // Size matched but file is HTML/corrupt (classic HF resume bug) - re-download.
            if local == expected && !download::local_file_usable(&dest) {
                let _ = fs::remove_file(&dest);
            }
            // Offset before this file - UI adds live per-file downloaded on top.
            emit_progress(
                app,
                blueprint_id,
                "download",
                format!("Downloading {}", model.filename),
                i + 1,
                total,
                Some(bytes_done),
                bytes_total,
                Some(&model.filename),
            );
        } else {
            emit_progress(
                app,
                blueprint_id,
                "download",
                format!("Downloading {}", model.filename),
                i + 1,
                total,
                Some(bytes_done),
                bytes_total,
                Some(&model.filename),
            );
        }

        download::download_file(app, &model.url, &dest, model.sha256.as_deref())?;

        let after = download::local_file_len(&dest).unwrap_or(0);
        if after == 0 {
            return Err(format!("download produced empty file: {}", model.filename));
        }
        if let Some(expected) = remote.or_else(|| probe_remote_size(&model.url)) {
            if after != expected {
                return Err(format!(
                    "size mismatch for {}: local {after} bytes, remote {expected} bytes",
                    model.filename
                ));
            }
        }
        bytes_done += after;
        if let Some(t) = bytes_total.as_mut() {
            *t = (*t).max(bytes_done);
        } else {
            bytes_total = Some(bytes_done);
        }
        emit_progress(
            app,
            blueprint_id,
            "download",
            format!("Downloaded {}", model.filename),
            i + 1,
            total,
            Some(bytes_done),
            bytes_total,
            Some(&model.filename),
        );
    }

    emit_progress(
        app,
        blueprint_id,
        "done",
        format!("Installed {}", manifest.name),
        total,
        total,
        Some(bytes_done),
        bytes_total.or(Some(bytes_done)),
        None,
    );
    Ok(())
}

pub(crate) fn install_custom_nodes(app: &AppHandle, nodes: &[CustomNodeDep]) -> Result<(), String> {
    if nodes.is_empty() {
        return Ok(());
    }
    let portable =
        comfy::find_portable_root(&comfy::runtimes_dir(app)?.join("portable")).map_err(|_| {
            "ComfyUI portable not found - install the runtime before custom nodes".to_string()
        })?;
    let custom_dir = portable.join("ComfyUI").join("custom_nodes");
    fs::create_dir_all(&custom_dir).map_err(|e| e.to_string())?;

    for node in nodes {
        if download::is_cancelled() {
            return Err("cancelled".into());
        }
        let name = node.name.trim();
        let url = node.url.trim();
        if name.is_empty() || url.is_empty() {
            return Err("custom node entries need both name and url".into());
        }
        if name.contains('/') || name.contains('\\') || name.contains("..") {
            return Err(format!("invalid custom node name: {name}"));
        }
        let dest = custom_dir.join(name);
        if dest.is_dir() {
            continue;
        }
        let status = crate::process_cmd::new("git")
            .args(["clone", "--depth", "1", url])
            .arg(&dest)
            .status()
            .map_err(|e| format!("git clone failed for {name} (is git installed?): {e}"))?;
        if !status.success() {
            return Err(format!("git clone failed for {name} ({url})"));
        }
    }
    Ok(())
}

pub(crate) fn model_is_ready(model: &ModelEntry, models_root: &Path) -> bool {
    let dest = models_root.join(&model.path).join(&model.filename);
    match download::local_file_len(&dest) {
        Some(n) if n > 0 => {
            if model.url.trim().is_empty() {
                true
            } else if let Some(remote) = cached_remote_size(&model.url) {
                n == remote
            } else {
                // Cache miss (cold start / probe in flight): trust a usable file.
                download::local_file_usable(&dest)
            }
        }
        _ => false,
    }
}

pub(crate) fn validate_model_paths(model: &ModelEntry) -> Result<(), String> {
    validate_model_paths_allow_empty_url(model)?;
    if model.url.trim().is_empty() {
        return Err(format!(
            "model '{}' is missing a download url",
            model.filename
        ));
    }
    Ok(())
}

pub(crate) fn validate_model_paths_allow_empty_url(model: &ModelEntry) -> Result<(), String> {
    if model.filename.is_empty()
        || model.path.is_empty()
        || model.filename.contains("..")
        || model.path.contains("..")
        || model.filename.contains('/')
        || model.filename.contains('\\')
        || Path::new(&model.path).is_absolute()
    {
        return Err(format!("invalid model entry: {}", model.filename));
    }
    Ok(())
}

fn format_bytes(n: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    let n = n as f64;
    if n >= GB {
        format!("{:.2} GB", n / GB)
    } else if n >= MB {
        format!("{:.1} MB", n / MB)
    } else if n >= KB {
        format!("{:.1} KB", n / KB)
    } else {
        format!("{n} B")
    }
}

fn emit_progress(
    app: &AppHandle,
    blueprint_id: &str,
    stage: &str,
    message: impl Into<String>,
    model_index: usize,
    model_total: usize,
    downloaded: Option<u64>,
    total: Option<u64>,
    filename: Option<&str>,
) {
    let _ = app.emit(
        "blueprints://progress",
        BlueprintProgress {
            blueprint_id: blueprint_id.into(),
            stage: stage.into(),
            message: message.into(),
            model_index: model_index as u32,
            model_total: model_total as u32,
            filename: filename.map(|s| s.to_string()),
            downloaded,
            total,
        },
    );
}
