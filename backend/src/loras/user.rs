//! User LoRA CRUD and generate-time stack resolution.

use crate::comfy;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use tauri::{AppHandle, Emitter};

use super::catalog::{
    get_lora, load_manifest, official_dir, user_dir, validate_id, validate_variant,
    variant_for_arch, variant_ready,
};
use super::types::{LoraPack, SaveUserLoraArgs};

pub fn save_user_lora(app: &AppHandle, args: SaveUserLoraArgs) -> Result<LoraPack, String> {
    validate_id(&args.id)?;
    if args.name.trim().is_empty() {
        return Err("name is required".into());
    }
    if args.variants.is_empty() {
        return Err("at least one arch variant is required".into());
    }
    for v in &args.variants {
        validate_variant(v)?;
    }

    // Don't overwrite Official packs.
    if let Ok(official) = official_dir(app) {
        if official.join(&args.id).join("manifest.json").is_file() {
            return Err(format!(
                "id '{}' is reserved by an Official LoRA - pick another id",
                args.id
            ));
        }
    }

    let dir = user_dir(app)?.join(&args.id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let variants: Vec<Value> = args
        .variants
        .iter()
        .map(|v| {
            json!({
                "arch": v.arch,
                "filename": v.filename,
                "path": if v.path.trim().is_empty() { "loras" } else { v.path.trim() },
                "url": crate::providers::sanitize_url_for_storage(&v.url),
            })
        })
        .collect();

    let manifest = json!({
        "id": args.id,
        "name": args.name.trim(),
        "description": args.description,
        "triggerWords": args.trigger_words,
        "defaultStrength": args.default_strength,
        "strengthMin": args.strength_min,
        "strengthMax": args.strength_max,
        "variants": variants,
    });

    fs::write(
        dir.join("manifest.json"),
        serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())? + "\n",
    )
    .map_err(|e| e.to_string())?;

    let _ = app.emit("loras://updated", &args.id);
    get_lora(app, &args.id)
}

pub fn delete_user_lora(app: &AppHandle, id: &str) -> Result<(), String> {
    validate_id(id)?;
    let dir = user_dir(app)?.join(id);
    if !dir.is_dir() {
        return Err(format!("User LoRA not found: {id}"));
    }
    // GC weights while this pack still exists so it is excluded from protectors by id.
    let _ = super::uninstall::uninstall_all_variants(app, id)?;
    fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    let _ = app.emit("loras://updated", id);
    Ok(())
}

pub fn set_user_lora_thumbnail(
    app: &AppHandle,
    id: &str,
    bytes: Vec<u8>,
    ext: &str,
) -> Result<String, String> {
    validate_id(id)?;
    let dir = user_dir(app)?.join(id);
    if !dir.join("manifest.json").is_file() {
        return Err(format!("User LoRA not found: {id}"));
    }
    let path = crate::thumbnails::write_in_dir(&dir, &bytes, ext)?;
    let _ = app.emit("loras://updated", id);
    Ok(crate::blueprints::path_for_asset_protocol(path))
}

pub fn clear_user_lora_thumbnail(app: &AppHandle, id: &str) -> Result<(), String> {
    validate_id(id)?;
    let dir = user_dir(app)?.join(id);
    if !dir.join("manifest.json").is_file() {
        return Err(format!("User LoRA not found: {id}"));
    }
    crate::thumbnails::clear_in_dir(&dir)?;
    let _ = app.emit("loras://updated", id);
    Ok(())
}

/// Resolve User Mode `loras: [{id, strength}]` into compiler input
/// `[{id, filename, strength}]` (id kept for gallery reuse).
/// Errors if a pack/variant is missing or the file is not on disk.
pub fn resolve_stack_for_generate(
    app: &AppHandle,
    arch: &str,
    values: &mut HashMap<String, Value>,
) -> Result<(), String> {
    let Some(arr) = values.get("loras").cloned() else {
        return Ok(());
    };
    let Some(items) = arr.as_array() else {
        values.insert("loras".into(), json!([]));
        return Ok(());
    };
    if items.is_empty() {
        return Ok(());
    }

    let models_root = comfy::models_dir(app)?;
    let mut resolved = Vec::new();

    for item in items {
        let strength = item.get("strength").and_then(|v| v.as_f64()).unwrap_or(1.0);
        let id = item.get("id").and_then(|v| v.as_str());

        // Already resolved (filename present) - keep id when available for gallery reuse.
        if let Some(filename) = item.get("filename").and_then(|v| v.as_str()) {
            if !filename.is_empty() {
                let mut entry = json!({ "filename": filename, "strength": strength });
                if let Some(id) = id.filter(|s| !s.is_empty()) {
                    entry["id"] = json!(id);
                }
                resolved.push(entry);
                continue;
            }
        }

        let id = id
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "LoRA stack entry missing id".to_string())?;

        let (_dir, manifest, _) = load_manifest(app, id)?;
        let variant = variant_for_arch(&manifest, arch)?;
        if !variant_ready(&models_root, variant) {
            return Err(format!(
                "LoRA '{id}' ({arch}) is not installed - install it from the LoRA library first"
            ));
        }
        // Keep pack id alongside filename so gallery metadata can restore the stack.
        resolved.push(json!({
            "id": id,
            "filename": variant.filename,
            "strength": strength,
        }));
    }

    values.insert("loras".into(), Value::Array(resolved));
    Ok(())
}
