//! LoRA variant download and install.

use crate::comfy;
use crate::download;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

use super::catalog::{load_manifest, validate_variant, variant_for_arch};

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
