use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

use crate::comfy;
use crate::download;
use crate::providers::{self, ProviderKind};

use super::install::{model_is_ready, validate_model_paths};
use super::paths::{official_dir, path_for_asset_protocol, user_dir, validate_blueprint_id};
use super::types::{
    BlueprintDetail, BlueprintModelInfo, ManifestFile, ModelEntry, RecipeCapabilities,
};

pub fn get_detail(app: &AppHandle, blueprint_id: &str) -> Result<BlueprintDetail, String> {
    let models_root = comfy::models_dir(app)?;
    let (dir, manifest) = load_manifest(app, blueprint_id)?;
    if manifest.arch.trim().is_empty() {
        return Err(format!(
            "Blueprint '{blueprint_id}' is missing arch - only recipe blueprints are supported"
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
        .map(|m| {
            let gated = if m.gated {
                true
            } else if !m.url.trim().is_empty() {
                download::url_is_gated(&m.url)
            } else {
                false
            };
            BlueprintModelInfo {
                filename: m.filename.clone(),
                path: m.path.clone(),
                url: m.url.clone(),
                sha256: m.sha256.clone(),
                gated,
                role: m.role.clone(),
                ready: model_is_ready(m, &models_root),
            }
        })
        .collect();

    Ok(BlueprintDetail {
        id: manifest.id.clone(),
        name: manifest.name.clone(),
        category: manifest.category.clone(),
        description: manifest.description.clone(),
        runtime: manifest.runtime.clone(),
        minimum_vram_gb: manifest.minimum_vram_gb,
        model_count: manifest.models.len() as u32,
        models_ready: models_ready as u32,
        controls: crate::recipe::synthetic_controls(&manifest),
        flow_type: manifest.flow_type.clone(),
        arch: manifest.arch.clone(),
        capabilities: manifest.capabilities.clone(),
        source: source.into(),
        sampler: manifest.sampler.clone(),
        scheduler: manifest.scheduler.clone(),
        models,
        defaults: manifest.defaults.clone(),
        thumbnail_path: crate::thumbnails::find_in_dir(&dir).map(path_for_asset_protocol),
    })
}

/// Write or replace the user blueprint thumbnail. Official packs are rejected.
pub fn set_user_blueprint_thumbnail(
    app: &AppHandle,
    id: &str,
    bytes: Vec<u8>,
    ext: &str,
) -> Result<String, String> {
    validate_blueprint_id(id)?;
    if official_has_id(app, id) {
        return Err("cannot change Official blueprint thumbnails".into());
    }
    let dir = user_dir(app)?.join(id);
    if !dir.join("manifest.json").is_file() {
        return Err(format!("User blueprint not found: {id}"));
    }
    let path = crate::thumbnails::write_in_dir(&dir, &bytes, ext)?;
    let _ = app.emit("blueprints://updated", id);
    Ok(path_for_asset_protocol(path))
}

pub fn clear_user_blueprint_thumbnail(app: &AppHandle, id: &str) -> Result<(), String> {
    validate_blueprint_id(id)?;
    if official_has_id(app, id) {
        return Err("cannot change Official blueprint thumbnails".into());
    }
    let dir = user_dir(app)?.join(id);
    if !dir.join("manifest.json").is_file() {
        return Err(format!("User blueprint not found: {id}"));
    }
    crate::thumbnails::clear_in_dir(&dir)?;
    let _ = app.emit("blueprints://updated", id);
    Ok(())
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
/// Does not write `controls` or `workflow.api.json` - UI controls are synthesized from `arch`.
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
            "id '{id}' is reserved by an Official blueprint - choose another id"
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
        model.url = providers::sanitize_url_for_storage(&model.url);
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
