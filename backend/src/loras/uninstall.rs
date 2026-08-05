//! Shared-safe LoRA weight uninstall.
//! Deletes variant files only when no other *ready* LoRA variant still lists them.

use std::collections::HashSet;
use tauri::{AppHandle, Emitter};

use crate::blueprints::{file_key, gc_model_files, UninstallSummary};
use crate::comfy;

use super::catalog::{list_loras, load_manifest, validate_id, variant_for_arch};
use super::types::LoraVariant;

fn variant_path(v: &LoraVariant) -> String {
    if v.path.trim().is_empty() {
        "loras".into()
    } else {
        v.path.trim().to_string()
    }
}

/// Build protect set from ready variants on other packs.
/// When `exclude_arch` is `Some`, other ready arches on `exclude_id` still protect.
fn protect_ready_keys(
    app: &AppHandle,
    exclude_id: &str,
    exclude_arch: Option<&str>,
) -> Result<HashSet<String>, String> {
    let mut protected = HashSet::new();
    for pack in list_loras(app)? {
        if pack.id == exclude_id {
            if let Some(arch) = exclude_arch {
                for v in &pack.variants {
                    if v.arch == arch {
                        continue;
                    }
                    if v.ready {
                        protected.insert(file_key(&v.path, &v.filename));
                    }
                }
            }
            continue;
        }
        for v in &pack.variants {
            if v.ready {
                protected.insert(file_key(&v.path, &v.filename));
            }
        }
    }
    Ok(protected)
}

/// Remove one LoRA arch variant's weight file if unused by other ready variants.
pub fn uninstall_variant(
    app: &AppHandle,
    id: &str,
    arch: &str,
) -> Result<UninstallSummary, String> {
    validate_id(id)?;
    let (_dir, manifest, _source) = load_manifest(app, id)?;
    let variant = variant_for_arch(&manifest, arch)?;
    let path = variant_path(variant);
    let filename = variant.filename.clone();
    let models_root = comfy::models_dir(app)?;
    let protected = protect_ready_keys(app, id, Some(arch))?;
    let summary = gc_model_files(&models_root, vec![(path, filename)], &protected)?;
    let _ = app.emit("loras://updated", id);
    Ok(summary)
}

/// Remove every variant file on a pack that is unused by other ready LoRAs.
pub fn uninstall_all_variants(app: &AppHandle, id: &str) -> Result<UninstallSummary, String> {
    validate_id(id)?;
    let (_dir, manifest, _source) = load_manifest(app, id)?;
    let models_root = comfy::models_dir(app)?;
    let protected = protect_ready_keys(app, id, None)?;
    let candidates: Vec<(String, String)> = manifest
        .variants
        .iter()
        .map(|v| (variant_path(v), v.filename.clone()))
        .collect();
    let summary = gc_model_files(&models_root, candidates, &protected)?;
    let _ = app.emit("loras://updated", id);
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use std::path::Path;

    fn touch(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut f = fs::File::create(path).unwrap();
        f.write_all(b"x").unwrap();
    }

    #[test]
    fn gc_keeps_shared_lora_file() {
        let root = std::env::temp_dir().join(format!("oga-lora-gc-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let shared = root.join("loras").join("shared.safetensors");
        touch(&shared);
        let mut protected = HashSet::new();
        protected.insert(file_key("loras", "shared.safetensors"));
        let summary = gc_model_files(
            &root,
            vec![("loras".into(), "shared.safetensors".into())],
            &protected,
        )
        .unwrap();
        assert_eq!(summary.removed, 0);
        assert_eq!(summary.kept, 1);
        assert!(shared.is_file());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn gc_removes_unprotected_lora_file() {
        let root = std::env::temp_dir().join(format!("oga-lora-rm-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let f = root.join("loras").join("solo.safetensors");
        touch(&f);
        let summary = gc_model_files(
            &root,
            vec![("loras".into(), "solo.safetensors".into())],
            &HashSet::new(),
        )
        .unwrap();
        assert_eq!(summary.removed, 1);
        assert!(!f.is_file());
        let _ = fs::remove_dir_all(&root);
    }
}
