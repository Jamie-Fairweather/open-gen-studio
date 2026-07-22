use crate::comfy;
use crate::download;
use crate::providers::{self, ProviderKind};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager};

/// Process-local cache of URL → Content-Length (from HEAD / Range probe).
/// Also persisted to app data so cold start knows installed models immediately.
static REMOTE_SIZE_CACHE: OnceLock<Mutex<HashMap<String, u64>>> = OnceLock::new();
static SIZE_PROBE_BUSY: AtomicBool = AtomicBool::new(false);
static SIZE_PROBE_PENDING: AtomicBool = AtomicBool::new(false);

fn remote_size_cache() -> &'static Mutex<HashMap<String, u64>> {
    REMOTE_SIZE_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn remote_size_cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("remote-size-cache.json"))
}

/// Load persisted URL sizes before the first blueprint list (call from setup).
pub fn load_remote_size_cache(app: &AppHandle) {
    let Ok(path) = remote_size_cache_path(app) else {
        return;
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return;
    };
    let Ok(map) = serde_json::from_str::<HashMap<String, u64>>(&raw) else {
        return;
    };
    if let Ok(mut cache) = remote_size_cache().lock() {
        for (k, v) in map {
            cache.entry(k).or_insert(v);
        }
    }
}

fn save_remote_size_cache(app: &AppHandle) {
    let Ok(path) = remote_size_cache_path(app) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let snapshot = match remote_size_cache().lock() {
        Ok(cache) => cache.clone(),
        Err(_) => return,
    };
    if let Ok(raw) = serde_json::to_string(&snapshot) {
        let _ = fs::write(path, raw);
    }
}

/// Drop cached remote sizes (e.g. after an HF token is saved so gated files can be re-probed).
pub fn clear_remote_size_cache() {
    if let Ok(mut cache) = remote_size_cache().lock() {
        cache.clear();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Blueprint {
    pub id: String,
    pub name: String,
    pub category: String,
    pub description: String,
    pub runtime: String,
    /// `"official"` | `"user"`
    pub source: String,
    pub minimum_vram_gb: Option<u32>,
    pub model_count: usize,
    pub models_ready: usize,
    /// Sum of remote Content-Lengths when probes succeed.
    pub total_size_bytes: Option<u64>,
    /// Bytes already on disk for this blueprint's models.
    pub local_size_bytes: u64,
    pub dir: String,
    /// Absolute path to `thumbnail.png` / `.jpg` / `.webp` when present.
    pub thumbnail_path: Option<String>,
    /// True if any model URL is a gated Hugging Face repo (token required).
    #[serde(default)]
    pub requires_hf_token: bool,
    /// True if any model URL is from CivitAI (API key required).
    #[serde(default)]
    pub requires_civitai_token: bool,
}

/// Back-compat alias for IPC / older call sites.
pub type OfficialBlueprint = Blueprint;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintProgress {
    pub blueprint_id: String,
    pub stage: String,
    pub message: String,
    pub model_index: usize,
    pub model_total: usize,
    /// Current model filename when stage is download/skip/missing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    /// Bytes already accounted for (completed models, or offset before the current file).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub downloaded: Option<u64>,
    /// Expected total bytes for all models in this install (when known).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintControl {
    pub id: String,
    #[serde(rename = "type")]
    pub control_type: String,
    pub node_id: String,
    pub input: String,
    #[serde(default)]
    pub label: String,
    #[serde(default = "default_group")]
    pub group: String,
    #[serde(default)]
    pub default: Option<serde_json::Value>,
}

fn default_group() -> String {
    "default".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintModelInfo {
    pub filename: String,
    pub path: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub gated: bool,
    #[serde(default)]
    pub role: String,
    /// True when the file is already usable in the shared models library.
    pub ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintDetail {
    pub id: String,
    pub name: String,
    pub category: String,
    pub description: String,
    pub runtime: String,
    pub minimum_vram_gb: Option<u32>,
    pub model_count: usize,
    pub models_ready: usize,
    pub controls: Vec<BlueprintControl>,
    #[serde(default)]
    pub flow_type: String,
    #[serde(default)]
    pub arch: String,
    #[serde(default)]
    pub capabilities: RecipeCapabilities,
    /// `"official"` | `"user"`
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub sampler: String,
    #[serde(default)]
    pub scheduler: String,
    #[serde(default)]
    pub models: Vec<BlueprintModelInfo>,
    #[serde(default)]
    pub defaults: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RecipeCapabilities {
    #[serde(default)]
    pub negative: bool,
    #[serde(default)]
    pub loras: bool,
    #[serde(default)]
    pub controlnet: bool,
    #[serde(default)]
    pub upscale: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ManifestFile {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) category: String,
    #[serde(default)]
    pub(crate) description: String,
    pub(crate) runtime: String,
    pub(crate) minimum_vram_gb: Option<u32>,
    #[serde(default)]
    pub(crate) models: Vec<ModelEntry>,
    #[serde(default)]
    pub(crate) custom_nodes: Vec<CustomNodeDep>,
    #[serde(default)]
    pub(crate) flow_type: String,
    #[serde(default)]
    pub(crate) arch: String,
    #[serde(default)]
    pub(crate) sampler: String,
    #[serde(default)]
    pub(crate) scheduler: String,
    #[serde(default)]
    pub(crate) capabilities: RecipeCapabilities,
    #[serde(default)]
    pub(crate) defaults: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEntry {
    pub filename: String,
    pub path: String,
    /// Empty = local-only (no download).
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub sha256: Option<String>,
    /// Hugging Face gated repo — anonymous download returns 401.
    #[serde(default)]
    pub gated: bool,
    /// Recipe role: `unet` | `vae` | `text_encoder` | `checkpoint` | …
    #[serde(default)]
    pub role: String,
}

/// ComfyUI custom node repo to clone into `ComfyUI/custom_nodes/<name>`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomNodeDep {
    pub name: String,
    /// Git clone URL (https://github.com/…/….git).
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelFileEntry {
    pub relative_path: String,
    pub bytes: u64,
}

/// Resolve the Official blueprints directory (bundled resources, with repo fallback in dev).
pub fn official_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // In dev, prefer the live repo folder so newly added files (e.g. thumbnail.png)
    // show up without waiting for Tauri to re-copy bundled resources into target/.
    #[cfg(debug_assertions)]
    {
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("blueprints")
                .join("official"),
        );
    }

    for rel in ["blueprints/official", "_up_/blueprints/official", "official"] {
        if let Ok(p) = app.path().resolve(rel, BaseDirectory::Resource) {
            candidates.push(p);
        }
    }
    if let Ok(resource) = app.path().resource_dir() {
        candidates.push(resource.join("_up_").join("blueprints").join("official"));
        candidates.push(resource.join("blueprints").join("official"));
        candidates.push(resource.join("official"));
    }

    #[cfg(not(debug_assertions))]
    {
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("blueprints")
                .join("official"),
        );
    }

    for path in candidates {
        if path.is_dir() {
            return Ok(path);
        }
    }
    Err("Official blueprints directory not found".into())
}

/// User-created blueprints live under app data — never under Official.
pub fn user_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("blueprints")
        .join("user");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn validate_blueprint_id(blueprint_id: &str) -> Result<(), String> {
    if blueprint_id.is_empty()
        || blueprint_id.contains("..")
        || blueprint_id.contains('/')
        || blueprint_id.contains('\\')
        || !blueprint_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(
            "invalid blueprint id (use lowercase letters, numbers, hyphen, underscore)".into(),
        );
    }
    Ok(())
}

/// Fast list: Official + user (disk + in-memory size cache only).
pub fn list_official(app: &AppHandle) -> Result<Vec<Blueprint>, String> {
    list_blueprints(app, false)
}

/// Full list with remote HEAD/Range probes (may block — call off the UI thread).
pub fn list_official_probed(app: &AppHandle) -> Result<Vec<Blueprint>, String> {
    list_blueprints(app, true)
}

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
        let folder = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");
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
        // Another probe is running (e.g. token saved mid-check) — rerun when it finishes.
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
        let result = list_official_probed(&app_bg);
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

        // Local-only entries (no URL) — skip download; just report presence.
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
                        "No URL for {} — place file in models/{}/",
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
            // Size matched but file is HTML/corrupt (classic HF resume bug) — re-download.
            if local == expected && !download::local_file_usable(&dest) {
                let _ = fs::remove_file(&dest);
            }
            // Offset before this file — UI adds live per-file downloaded on top.
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

pub fn get_detail(app: &AppHandle, blueprint_id: &str) -> Result<BlueprintDetail, String> {
    let models_root = comfy::models_dir(app)?;
    let (_dir, manifest) = load_manifest(app, blueprint_id)?;
    if manifest.arch.trim().is_empty() {
        return Err(format!(
            "Blueprint '{blueprint_id}' is missing arch — only recipe blueprints are supported"
        ));
    }
    let models_ready = manifest
        .models
        .iter()
        .filter(|m| model_is_ready(m, &models_root))
        .count();
    let source = if user_dir(app)
        .map(|d| d.join(blueprint_id).join("manifest.json").is_file())
        .unwrap_or(false)
    {
        "user"
    } else {
        "official"
    };

    let models: Vec<BlueprintModelInfo> = manifest
        .models
        .iter()
        .map(|m| BlueprintModelInfo {
            filename: m.filename.clone(),
            path: m.path.clone(),
            url: m.url.clone(),
            sha256: m.sha256.clone(),
            gated: m.gated,
            role: m.role.clone(),
            ready: model_is_ready(m, &models_root),
        })
        .collect();

    Ok(BlueprintDetail {
        id: manifest.id.clone(),
        name: manifest.name.clone(),
        category: manifest.category.clone(),
        description: manifest.description.clone(),
        runtime: manifest.runtime.clone(),
        minimum_vram_gb: manifest.minimum_vram_gb,
        model_count: manifest.models.len(),
        models_ready,
        controls: crate::recipe::synthetic_controls(&manifest),
        flow_type: manifest.flow_type.clone(),
        arch: manifest.arch.clone(),
        capabilities: manifest.capabilities.clone(),
        source: source.into(),
        sampler: manifest.sampler.clone(),
        scheduler: manifest.scheduler.clone(),
        models,
        defaults: manifest.defaults.clone(),
    })
}

pub(crate) fn load_manifest(
    app: &AppHandle,
    blueprint_id: &str,
) -> Result<(PathBuf, ManifestFile), String> {
    validate_blueprint_id(blueprint_id)?;
    // User first, then Official.
    let candidates = [
        user_dir(app).ok().map(|d| d.join(blueprint_id)),
        official_dir(app).ok().map(|d| d.join(blueprint_id)),
    ];
    for dir in candidates.into_iter().flatten() {
        let manifest_path = dir.join("manifest.json");
        if !manifest_path.is_file() {
            continue;
        }
        let raw = fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
        let manifest: ManifestFile = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        if manifest.id != blueprint_id {
            return Err(format!(
                "manifest id '{}' does not match folder '{}'",
                manifest.id, blueprint_id
            ));
        }
        return Ok((dir, manifest));
    }
    Err(format!("Blueprint not found: {blueprint_id}"))
}

fn official_has_id(app: &AppHandle, blueprint_id: &str) -> bool {
    official_dir(app)
        .map(|d| d.join(blueprint_id).join("manifest.json").is_file())
        .unwrap_or(false)
}

/// Save a user recipe blueprint. Never writes to Official. Rejects Official id collisions.
/// Does not write `controls` or `workflow.api.json` — UI controls are synthesized from `arch`.
pub fn save_user_blueprint(
    app: &AppHandle,
    id: &str,
    name: &str,
    category: &str,
    description: &str,
    runtime: &str,
    models: Vec<ModelEntry>,
    flow_type: &str,
    arch: &str,
    sampler: &str,
    scheduler: &str,
    capabilities: RecipeCapabilities,
    defaults: serde_json::Map<String, serde_json::Value>,
) -> Result<PathBuf, String> {
    validate_blueprint_id(id)?;
    if name.trim().is_empty() {
        return Err("name is required".into());
    }
    if arch.trim().is_empty() {
        return Err("arch is required (recipe blueprint)".into());
    }
    if official_has_id(app, id) {
        return Err(format!(
            "id '{id}' is reserved by an Official blueprint — choose another id"
        ));
    }
    let mut models = models;
    for model in &mut models {
        // Creator packs always ship downloadable model URLs.
        validate_model_paths(model)?;
        // Resolve provider pages (CivitAI, …) so filename matches the real file.
        if let Ok(resolved) = providers::resolve(&model.url) {
            if let Some(name) = resolved.filename.filter(|n| !n.is_empty()) {
                if model.filename.trim().is_empty()
                    || !model.filename.contains('.')
                    || matches!(resolved.provider, ProviderKind::CivitAi)
                {
                    model.filename = name;
                }
            }
        }
        // Re-probe anonymously so the flag stays correct even if the UI skipped it.
        model.gated = download::url_is_gated(&model.url);
    }

    let dir = user_dir(app)?.join(id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let manifest = serde_json::json!({
        "id": id,
        "name": name.trim(),
        "category": if category.trim().is_empty() { "image" } else { category.trim() },
        "description": description,
        "runtime": if runtime.trim().is_empty() { "comfyui" } else { runtime.trim() },
        "flowType": if flow_type.trim().is_empty() { "txt2img" } else { flow_type.trim() },
        "arch": arch.trim(),
        "sampler": sampler,
        "scheduler": scheduler,
        "capabilities": capabilities,
        "defaults": defaults,
        "models": models,
        "customNodes": [],
    });
    fs::write(
        dir.join("manifest.json"),
        serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())? + "\n",
    )
    .map_err(|e| e.to_string())?;

    // Remove legacy workflow file if present from an older save.
    let legacy = dir.join("workflow.api.json");
    if legacy.is_file() {
        let _ = fs::remove_file(&legacy);
    }

    let _ = app.emit("blueprints://updated", id);
    Ok(dir)
}

pub fn delete_user_blueprint(app: &AppHandle, id: &str) -> Result<(), String> {
    validate_blueprint_id(id)?;
    let dir = user_dir(app)?.join(id);
    if !dir.is_dir() {
        return Err(format!("User blueprint not found: {id}"));
    }
    fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    let _ = app.emit("blueprints://updated", id);
    Ok(())
}

pub fn open_user_blueprints_dir(app: &AppHandle) -> Result<String, String> {
    let dir = user_dir(app)?;
    open_dir_in_os(&dir)?;
    Ok(path_for_asset_protocol(dir))
}

pub fn open_models_dir(app: &AppHandle) -> Result<String, String> {
    let dir = comfy::models_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    open_dir_in_os(&dir)?;
    Ok(path_for_asset_protocol(dir))
}

/// List files under the shared models library (relative path + size).
pub fn list_model_files(app: &AppHandle) -> Result<Vec<ModelFileEntry>, String> {
    let root = comfy::models_dir(app)?;
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    collect_model_files(&root, &root, &mut out)?;
    out.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(out)
}

fn collect_model_files(
    root: &Path,
    dir: &Path,
    out: &mut Vec<ModelFileEntry>,
) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_model_files(root, &path, out)?;
        } else if path.is_file() {
            let rel = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            let bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
            out.push(ModelFileEntry {
                relative_path: rel,
                bytes,
            });
        }
    }
    Ok(())
}

fn open_dir_in_os(dir: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn install_custom_nodes(app: &AppHandle, nodes: &[CustomNodeDep]) -> Result<(), String> {
    if nodes.is_empty() {
        return Ok(());
    }
    let portable = comfy::find_portable_root(&comfy::runtimes_dir(app)?.join("portable"))
        .map_err(|_| {
            "ComfyUI portable not found — install the runtime before custom nodes".to_string()
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
        let status = std::process::Command::new("git")
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

fn model_is_ready(model: &ModelEntry, models_root: &Path) -> bool {
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

fn read_blueprint(dir: &Path, models_root: &Path, probe_remote: bool) -> Option<Blueprint> {
    let manifest_path = dir.join("manifest.json");
    if !manifest_path.is_file() {
        return None;
    }

    let raw = fs::read_to_string(&manifest_path).ok()?;
    let manifest: ManifestFile = serde_json::from_str(&raw).ok()?;
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
            // No cached remote size yet — still treat a usable local file as ready
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
    let total_size_bytes =
        if downloadable > 0 && remote_sizes.len() == downloadable {
            Some(remote_sizes.iter().sum())
        } else {
            None
        };

    let thumbnail_path = ["thumbnail.png", "thumbnail.jpg", "thumbnail.jpeg", "thumbnail.webp"]
        .into_iter()
        .map(|name| dir.join(name))
        .find(|path| path.is_file())
        .map(path_for_asset_protocol);

    Some(Blueprint {
        id: manifest.id,
        name: manifest.name,
        category: manifest.category,
        description: manifest.description,
        runtime: manifest.runtime,
        source: "official".into(), // overwritten by caller
        minimum_vram_gb: manifest.minimum_vram_gb,
        model_count: manifest.models.len(),
        models_ready,
        total_size_bytes,
        local_size_bytes,
        dir: path_for_asset_protocol(dir.to_path_buf()),
        thumbnail_path,
        requires_hf_token,
        requires_civitai_token,
    })
}

/// Normalize paths for `convertFileSrc` (strip Windows `\\?\` canonicalize prefix).
fn path_for_asset_protocol(path: PathBuf) -> String {
    let path = path.canonicalize().unwrap_or(path);
    let s = path.display().to_string();
    s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
}

fn cached_remote_size(url: &str) -> Option<u64> {
    remote_size_cache()
        .lock()
        .ok()
        .and_then(|cache| cache.get(url).copied())
}

fn probe_remote_size(url: &str) -> Option<u64> {
    if let Some(n) = cached_remote_size(url) {
        return Some(n);
    }
    let size = download::remote_content_length(url).ok().flatten()?;
    if let Ok(mut cache) = remote_size_cache().lock() {
        cache.insert(url.to_string(), size);
    }
    Some(size)
}

fn validate_model_paths(model: &ModelEntry) -> Result<(), String> {
    validate_model_paths_allow_empty_url(model)?;
    if model.url.trim().is_empty() {
        return Err(format!("model '{}' is missing a download url", model.filename));
    }
    Ok(())
}

fn validate_model_paths_allow_empty_url(model: &ModelEntry) -> Result<(), String> {
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
            model_index,
            model_total,
            filename: filename.map(|s| s.to_string()),
            downloaded,
            total,
        },
    );
}
