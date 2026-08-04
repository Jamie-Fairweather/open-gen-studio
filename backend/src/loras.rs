//! Official + user LoRA packs (multi-arch variants).
//! Files live in the shared `models/loras/` library; manifests are metadata only.

use crate::comfy;
use crate::download;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LoraVariant {
    pub arch: String,
    pub filename: String,
    #[serde(default = "default_loras_path")]
    pub path: String,
    #[serde(default)]
    pub url: String,
}

fn default_loras_path() -> String {
    "loras".into()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoraManifestFile {
    id: String,
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    trigger_words: Vec<String>,
    #[serde(default = "default_strength")]
    default_strength: f64,
    #[serde(default = "default_strength_min")]
    strength_min: f64,
    #[serde(default = "default_strength_max")]
    strength_max: f64,
    #[serde(default)]
    variants: Vec<LoraVariant>,
}

fn default_strength() -> f64 {
    1.0
}
fn default_strength_min() -> f64 {
    0.0
}
fn default_strength_max() -> f64 {
    2.0
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LoraVariantInfo {
    pub arch: String,
    pub filename: String,
    pub path: String,
    pub url: String,
    pub ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LoraPack {
    pub id: String,
    pub name: String,
    pub description: String,
    /// `"official"` | `"user"`
    pub source: String,
    pub trigger_words: Vec<String>,
    pub default_strength: f64,
    pub strength_min: f64,
    pub strength_max: f64,
    pub arches: Vec<String>,
    pub variants: Vec<LoraVariantInfo>,
    /// Count of variants whose file is on disk.
    pub variants_ready: u32,
    pub variant_count: u32,
    /// Absolute path to pack `thumbnail.*` when present.
    #[serde(default)]
    pub thumbnail_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SaveUserLoraArgs {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub trigger_words: Vec<String>,
    #[serde(default = "default_strength")]
    pub default_strength: f64,
    #[serde(default = "default_strength_min")]
    pub strength_min: f64,
    #[serde(default = "default_strength_max")]
    pub strength_max: f64,
    pub variants: Vec<LoraVariant>,
}

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

fn validate_id(id: &str) -> Result<(), String> {
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

fn validate_variant(v: &LoraVariant) -> Result<(), String> {
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

fn variant_ready(models_root: &Path, v: &LoraVariant) -> bool {
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

fn load_manifest(app: &AppHandle, id: &str) -> Result<(PathBuf, LoraManifestFile, String), String> {
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

fn variant_for_arch<'a>(
    manifest: &'a LoraManifestFile,
    arch: &str,
) -> Result<&'a LoraVariant, String> {
    manifest
        .variants
        .iter()
        .find(|v| v.arch == arch)
        .ok_or_else(|| format!("LoRA '{}' has no variant for arch '{arch}'", manifest.id))
}

pub struct VariantDownload {
    pub url: String,
    pub dest: PathBuf,
    pub filename: String,
}

/// Resolve URL + on-disk dest for one LoRA arch variant.
pub fn variant_download(app: &AppHandle, id: &str, arch: &str) -> Result<VariantDownload, String> {
    let (_dir, manifest, _source) = load_manifest(app, id)?;
    let variant = variant_for_arch(&manifest, arch)?;
    validate_variant(variant)?;
    if variant.url.trim().is_empty() {
        return Err(format!(
            "LoRA '{}' ({arch}) has no download URL - place {} in models/loras/",
            id, variant.filename
        ));
    }

    let models_root = comfy::models_dir(app)?;
    let path = if variant.path.trim().is_empty() {
        "loras"
    } else {
        variant.path.trim()
    };
    let dest = models_root.join(path).join(&variant.filename);
    Ok(VariantDownload {
        url: variant.url.clone(),
        dest,
        filename: variant.filename.clone(),
    })
}

/// Download one arch variant into the shared models library.
pub fn install_variant(app: &AppHandle, id: &str, arch: &str) -> Result<(), String> {
    let arch_id = crate::recipe::RecipeArch::parse(arch)
        .ok_or_else(|| format!("unknown LoRA arch: {arch}"))?;
    let plan = variant_download(app, id, arch)?;

    let _ = app.emit(
        "loras://progress",
        crate::ipc::LoraProgress {
            lora_id: id.into(),
            arch: arch_id,
            stage: "download".into(),
            message: format!("Downloading {}", plan.filename),
            filename: Some(plan.filename.clone()),
        },
    );

    download::clear_cancel();
    download::download_file(app, &plan.url, &plan.dest, None)?;

    if !download::local_file_usable(&plan.dest) {
        return Err(format!(
            "download produced unusable file: {}",
            plan.filename
        ));
    }

    let _ = app.emit(
        "loras://progress",
        crate::ipc::LoraProgress {
            lora_id: id.into(),
            arch: arch_id,
            stage: "done".into(),
            message: format!("Ready: {}", plan.filename),
            filename: Some(plan.filename.clone()),
        },
    );
    let _ = app.emit("loras://updated", id);
    Ok(())
}

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
