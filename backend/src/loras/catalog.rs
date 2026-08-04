//! LoRA catalog listing and manifest loading.

use crate::comfy;
use crate::download;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{path::BaseDirectory, AppHandle, Manager};

use super::types::{LoraManifestFile, LoraPack, LoraVariant, LoraVariantInfo};

pub fn official_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    #[cfg(debug_assertions)]
    {
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("content")
                .join("loras"),
        );
    }

    for rel in ["loras", "_up_/loras"] {
        if let Ok(p) = app.path().resolve(rel, BaseDirectory::Resource) {
            candidates.push(p);
        }
    }
    if let Ok(resource) = app.path().resource_dir() {
        candidates.push(resource.join("_up_").join("loras"));
        candidates.push(resource.join("loras"));
    }

    #[cfg(not(debug_assertions))]
    {
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("content")
                .join("loras"),
        );
    }

    for path in candidates {
        if path.is_dir() {
            return Ok(path);
        }
    }
    Err("Official LoRAs directory not found".into())
}

pub fn user_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = crate::app_paths::app_data_dir(app)?
        .join("loras")
        .join("user");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn open_user_loras_dir(app: &AppHandle) -> Result<String, String> {
    let dir = user_dir(app)?;
    crate::blueprints::open_dir_in_os(&dir)?;
    Ok(crate::blueprints::path_for_asset_protocol(dir))
}

pub(crate) fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.starts_with('_')
        || id.contains("..")
        || id.contains('/')
        || id.contains('\\')
        || id.contains(':')
    {
        return Err(format!("invalid LoRA id: {id}"));
    }
    Ok(())
}

pub(crate) fn validate_variant(v: &LoraVariant) -> Result<(), String> {
    if v.arch.trim().is_empty() {
        return Err("variant missing arch".into());
    }
    if v.filename.is_empty()
        || v.filename.contains("..")
        || v.filename.contains('/')
        || v.filename.contains('\\')
    {
        return Err(format!("invalid LoRA filename: {}", v.filename));
    }
    let path = if v.path.trim().is_empty() {
        "loras"
    } else {
        v.path.trim()
    };
    if path.contains("..") || Path::new(path).is_absolute() {
        return Err(format!("invalid LoRA path: {path}"));
    }
    Ok(())
}

pub(crate) fn variant_ready(models_root: &Path, v: &LoraVariant) -> bool {
    let path = if v.path.trim().is_empty() {
        "loras"
    } else {
        v.path.trim()
    };
    let dest = models_root.join(path).join(&v.filename);
    download::local_file_usable(&dest)
}

fn read_pack(dir: &Path, source: &str, models_root: &Path) -> Option<LoraPack> {
    let raw = fs::read_to_string(dir.join("manifest.json")).ok()?;
    let m: LoraManifestFile = serde_json::from_str(&raw).ok()?;
    if m.id.starts_with('_') || m.variants.is_empty() {
        return None;
    }
    let variants: Vec<LoraVariantInfo> = m
        .variants
        .iter()
        .map(|v| {
            let path = if v.path.trim().is_empty() {
                "loras".into()
            } else {
                v.path.clone()
            };
            LoraVariantInfo {
                arch: v.arch.clone(),
                filename: v.filename.clone(),
                path,
                url: v.url.clone(),
                ready: variant_ready(models_root, v),
            }
        })
        .collect();
    let variants_ready = variants.iter().filter(|v| v.ready).count();
    let mut arches: Vec<String> = variants.iter().map(|v| v.arch.clone()).collect();
    arches.sort();
    arches.dedup();
    Some(LoraPack {
        id: m.id,
        name: m.name,
        description: m.description,
        source: source.into(),
        trigger_words: m.trigger_words,
        default_strength: m.default_strength,
        strength_min: m.strength_min,
        strength_max: m.strength_max,
        arches,
        variant_count: variants.len() as u32,
        variants_ready: variants_ready as u32,
        variants,
        thumbnail_path: crate::thumbnails::find_in_dir(dir)
            .map(crate::blueprints::path_for_asset_protocol),
    })
}

pub fn list_loras(app: &AppHandle) -> Result<Vec<LoraPack>, String> {
    let models_root = comfy::models_dir(app)?;
    let mut out = Vec::new();

    if let Ok(official) = official_dir(app) {
        for entry in fs::read_dir(&official).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                if let Some(pack) = read_pack(&path, "official", &models_root) {
                    out.push(pack);
                }
            }
        }
    }

    let user = user_dir(app)?;
    for entry in fs::read_dir(&user).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            if let Some(pack) = read_pack(&path, "user", &models_root) {
                out.push(pack);
            }
        }
    }

    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

pub fn get_lora(app: &AppHandle, id: &str) -> Result<LoraPack, String> {
    validate_id(id)?;
    list_loras(app)?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("LoRA not found: {id}"))
}

pub(crate) fn load_manifest(
    app: &AppHandle,
    id: &str,
) -> Result<(PathBuf, LoraManifestFile, String), String> {
    validate_id(id)?;
    let user = user_dir(app)?.join(id);
    if user.join("manifest.json").is_file() {
        let raw = fs::read_to_string(user.join("manifest.json")).map_err(|e| e.to_string())?;
        let m: LoraManifestFile = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        return Ok((user, m, "user".into()));
    }
    let official = official_dir(app)?.join(id);
    if official.join("manifest.json").is_file() {
        let raw = fs::read_to_string(official.join("manifest.json")).map_err(|e| e.to_string())?;
        let m: LoraManifestFile = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        return Ok((official, m, "official".into()));
    }
    Err(format!("LoRA not found: {id}"))
}

pub(crate) fn variant_for_arch<'a>(
    manifest: &'a LoraManifestFile,
    arch: &str,
) -> Result<&'a LoraVariant, String> {
    manifest
        .variants
        .iter()
        .find(|v| v.arch == arch)
        .ok_or_else(|| format!("LoRA '{}' has no variant for arch '{arch}'", manifest.id))
}
