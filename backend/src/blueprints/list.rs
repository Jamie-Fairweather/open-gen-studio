use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

use crate::comfy;
use crate::download;
use crate::providers::{self, ProviderKind};

use super::cache::{cached_remote_size, probe_remote_size, save_remote_size_cache};
use super::paths::{official_dir, path_for_asset_protocol, user_dir};
use super::types::{Blueprint, BlueprintProgress, ManifestFile};

static SIZE_PROBE_BUSY: AtomicBool = AtomicBool::new(false);
static SIZE_PROBE_PENDING: AtomicBool = AtomicBool::new(false);

/// List Official + user blueprints (`probe_remote` runs HEAD/Range size probes).
pub fn list_blueprints(app: &AppHandle, probe_remote: bool) -> Result<Vec<Blueprint>, String> {
    let models_root = comfy::models_dir(app)?;
    let mut out = Vec::new();

    if let Ok(root) = official_dir(app) {
        push_from_root(&root, "official", &models_root, probe_remote, &mut out);
    }
    if let Ok(root) = user_dir(app) {
        push_from_root(&root, "user", &models_root, probe_remote, &mut out);
    }

    // User entries win on id collision (insert order: official first, then user overwrites).
    let mut by_id: HashMap<String, Blueprint> = HashMap::new();
    for bp in out {
        by_id.insert(bp.id.clone(), bp);
    }
    let mut merged: Vec<Blueprint> = by_id.into_values().collect();
    merged.sort_by(|a, b| {
        let by_name = a.name.to_lowercase().cmp(&b.name.to_lowercase());
        if by_name != std::cmp::Ordering::Equal {
            return by_name;
        }
        match (a.source.as_str(), b.source.as_str()) {
            ("user", "official") => std::cmp::Ordering::Less,
            ("official", "user") => std::cmp::Ordering::Greater,
            _ => std::cmp::Ordering::Equal,
        }
    });
    Ok(merged)
}

fn push_from_root(
    root: &Path,
    source: &str,
    models_root: &Path,
    probe_remote: bool,
    out: &mut Vec<Blueprint>,
) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let folder = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
        if folder.starts_with('_') {
            continue;
        }
        if let Some(mut bp) = read_blueprint(&path, models_root, probe_remote) {
            bp.source = source.into();
            out.push(bp);
        }
    }
}

/// Kick a background size probe; emits `blueprints://probe` + `blueprints://sizes`.
pub fn enqueue_size_probe(app: &AppHandle) {
    if SIZE_PROBE_BUSY.swap(true, Ordering::SeqCst) {
        // Another probe is running (e.g. token saved mid-check) - rerun when it finishes.
        SIZE_PROBE_PENDING.store(true, Ordering::SeqCst);
        return;
    }
    SIZE_PROBE_PENDING.store(false, Ordering::SeqCst);
    let _ = app.emit(
        "blueprints://probe",
        BlueprintProgress {
            blueprint_id: String::new(),
            stage: "start".into(),
            message: "Checking remote file sizes…".into(),
            model_index: 0,
            model_total: 0,
            filename: None,
            downloaded: None,
            total: None,
        },
    );
    let app_bg = app.clone();
    std::thread::spawn(move || {
        let result = list_blueprints(&app_bg, true);
        match result {
            Ok(list) => {
                save_remote_size_cache(&app_bg);
                let _ = app_bg.emit("blueprints://sizes", &list);
                let _ = app_bg.emit(
                    "blueprints://probe",
                    BlueprintProgress {
                        blueprint_id: String::new(),
                        stage: "done".into(),
                        message: "Remote file sizes updated".into(),
                        model_index: 0,
                        model_total: 0,
                        filename: None,
                        downloaded: None,
                        total: None,
                    },
                );
            }
            Err(err) => {
                let _ = app_bg.emit(
                    "blueprints://probe",
                    BlueprintProgress {
                        blueprint_id: String::new(),
                        stage: "error".into(),
                        message: err,
                        model_index: 0,
                        model_total: 0,
                        filename: None,
                        downloaded: None,
                        total: None,
                    },
                );
            }
        }
        SIZE_PROBE_BUSY.store(false, Ordering::SeqCst);
        if SIZE_PROBE_PENDING.swap(false, Ordering::SeqCst) {
            enqueue_size_probe(&app_bg);
        }
    });
}

fn read_blueprint(dir: &Path, models_root: &Path, probe_remote: bool) -> Option<Blueprint> {
    let manifest_path = dir.join("manifest.json");
    if !manifest_path.is_file() {
        return None;
    }

    let raw = match fs::read_to_string(&manifest_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!(
                "skipping blueprint {}: failed to read manifest ({e})",
                dir.display()
            );
            return None;
        }
    };
    let manifest: ManifestFile = match serde_json::from_str(&raw) {
        Ok(m) => m,
        Err(e) => {
            eprintln!(
                "skipping blueprint {}: invalid manifest ({e})",
                dir.display()
            );
            return None;
        }
    };
    // Skip non-recipe packs and the `_example` template folder.
    if manifest.arch.trim().is_empty() || manifest.id.starts_with('_') {
        return None;
    }

    let mut models_ready = 0usize;
    let mut local_size_bytes = 0u64;
    let mut remote_sizes: Vec<u64> = Vec::new();
    let mut requires_hf_token = false;
    let mut requires_civitai_token = false;

    for model in &manifest.models {
        let dest = models_root.join(&model.path).join(&model.filename);
        let local = download::local_file_len(&dest).unwrap_or(0);
        local_size_bytes += local;

        if !model.url.trim().is_empty()
            && matches!(providers::detect(&model.url), ProviderKind::CivitAi)
        {
            requires_civitai_token = true;
        }

        let gated = if model.gated {
            true
        } else if probe_remote && !model.url.trim().is_empty() {
            download::url_is_gated(&model.url)
        } else {
            false
        };
        if gated {
            requires_hf_token = true;
        }

        if model.url.trim().is_empty() {
            if local > 0 {
                models_ready += 1;
            }
            continue;
        }

        let remote = if probe_remote {
            probe_remote_size(&model.url)
        } else {
            cached_remote_size(&model.url)
        };

        if let Some(remote) = remote {
            remote_sizes.push(remote);
            if local == remote {
                models_ready += 1;
            }
        } else if local > 0 && download::local_file_usable(&dest) {
            // No cached remote size yet - still treat a usable local file as ready
            // so Generate works before the background size probe finishes.
            models_ready += 1;
        }
    }

    // Only expose a total when every downloadable model has a known size.
    // Partial sums (e.g. gated HF files failing HEAD without a token) looked like
    // a complete blueprint total and disagreed with live download Content-Length.
    let downloadable = manifest
        .models
        .iter()
        .filter(|m| !m.url.trim().is_empty())
        .count();
    let total_size_bytes = if downloadable > 0 && remote_sizes.len() == downloadable {
        Some(remote_sizes.iter().sum())
    } else {
        None
    };

    let thumbnail_path = crate::thumbnails::find_in_dir(dir).map(path_for_asset_protocol);

    Some(Blueprint {
        id: manifest.id,
        name: manifest.name,
        category: manifest.category,
        description: manifest.description,
        arch: manifest.arch,
        runtime: manifest.runtime,
        source: "official".into(), // overwritten by caller
        minimum_vram_gb: manifest.minimum_vram_gb,
        model_count: manifest.models.len() as u32,
        models_ready: models_ready as u32,
        total_size_bytes,
        local_size_bytes,
        dir: path_for_asset_protocol(dir.to_path_buf()),
        thumbnail_path,
        requires_hf_token,
        requires_civitai_token,
    })
}
