//! Shared-safe blueprint weight uninstall.
//! Deletes model files only when no other *installed* blueprint still lists them.

use std::collections::HashSet;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter};

use crate::comfy;

use super::crud::load_manifest;
use super::install::model_is_ready;
use super::list::list_blueprints;
use super::paths::validate_blueprint_id;
use super::types::{ManifestFile, UninstallSummary};

pub(crate) fn file_key(path: &str, filename: &str) -> String {
    let path = path.trim().trim_matches(|c| c == '/' || c == '\\');
    format!("{path}/{filename}")
}

/// Delete candidate weight files that are not in `protected`.
pub(crate) fn gc_model_files(
    models_root: &Path,
    candidates: impl IntoIterator<Item = (String, String)>,
    protected: &HashSet<String>,
) -> Result<UninstallSummary, String> {
    let mut removed = 0u32;
    let mut kept = 0u32;
    let mut seen = HashSet::new();
    for (path, filename) in candidates {
        let key = file_key(&path, &filename);
        if !seen.insert(key.clone()) {
            continue;
        }
        let dest = models_root.join(&path).join(&filename);
        if !dest.is_file() {
            continue;
        }
        if protected.contains(&key) {
            kept += 1;
            continue;
        }
        fs::remove_file(&dest).map_err(|e| format!("failed to remove {}: {e}", dest.display()))?;
        removed += 1;
    }
    Ok(UninstallSummary { removed, kept })
}

fn model_candidates(manifest: &ManifestFile) -> Vec<(String, String)> {
    manifest
        .models
        .iter()
        .map(|m| (m.path.clone(), m.filename.clone()))
        .collect()
}

fn protect_keys_for_installed(
    models_root: &Path,
    exclude_id: &str,
    packs: &[(String, ManifestFile)],
) -> HashSet<String> {
    let mut protected = HashSet::new();
    for (id, manifest) in packs {
        if id == exclude_id {
            continue;
        }
        let model_count = manifest.models.len() as u32;
        let models_ready = manifest
            .models
            .iter()
            .filter(|m| model_is_ready(m, models_root))
            .count() as u32;
        // Match frontend `isInstalled`: empty model list counts as installed.
        if model_count == 0 || models_ready >= model_count {
            for m in &manifest.models {
                protected.insert(file_key(&m.path, &m.filename));
            }
        }
    }
    protected
}

/// Remove this blueprint's weight files that are unused by other installed blueprints.
pub fn uninstall_models(app: &AppHandle, blueprint_id: &str) -> Result<UninstallSummary, String> {
    validate_blueprint_id(blueprint_id)?;
    let (_dir, target) = load_manifest(app, blueprint_id)?;
    let models_root = comfy::models_dir(app)?;

    let listed = list_blueprints(app, false)?;
    let mut packs: Vec<(String, ManifestFile)> = Vec::new();
    for bp in listed {
        if bp.id == blueprint_id {
            continue;
        }
        if let Ok((_, m)) = load_manifest(app, &bp.id) {
            packs.push((bp.id, m));
        }
    }

    let protected = protect_keys_for_installed(&models_root, blueprint_id, &packs);
    let summary = gc_model_files(&models_root, model_candidates(&target), &protected)?;
    let _ = app.emit("blueprints://updated", blueprint_id);
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blueprints::types::ModelEntry;
    use std::io::Write;

    fn touch(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut f = fs::File::create(path).unwrap();
        f.write_all(b"x").unwrap();
    }

    fn entry(path: &str, filename: &str) -> ModelEntry {
        ModelEntry {
            filename: filename.into(),
            path: path.into(),
            url: String::new(),
            sha256: None,
            gated: false,
            role: "unet".into(),
        }
    }

    fn manifest(id: &str, models: Vec<ModelEntry>) -> ManifestFile {
        ManifestFile {
            id: id.into(),
            name: id.into(),
            category: "test".into(),
            description: String::new(),
            runtime: "comfy".into(),
            minimum_vram_gb: None,
            models,
            custom_nodes: vec![],
            flow_type: String::new(),
            arch: "flux".into(),
            sampler: String::new(),
            scheduler: String::new(),
            capabilities: Default::default(),
            defaults: Default::default(),
        }
    }

    #[test]
    fn gc_keeps_shared_file_when_protected() {
        let root = std::env::temp_dir().join(format!("oga-bp-gc-keep-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();

        let shared = root.join("vae").join("ae.safetensors");
        let unique = root.join("unet").join("a.safetensors");
        touch(&shared);
        touch(&unique);

        let mut protected = HashSet::new();
        protected.insert(file_key("vae", "ae.safetensors"));

        let summary = gc_model_files(
            &root,
            vec![
                ("vae".into(), "ae.safetensors".into()),
                ("unet".into(), "a.safetensors".into()),
            ],
            &protected,
        )
        .unwrap();

        assert_eq!(summary.removed, 1);
        assert_eq!(summary.kept, 1);
        assert!(shared.is_file());
        assert!(!unique.is_file());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn protect_only_installed_packs() {
        let root = std::env::temp_dir().join(format!("oga-bp-protect-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("vae")).unwrap();
        touch(&root.join("vae").join("ae.safetensors"));
        touch(&root.join("unet").join("b.safetensors")); // B fully present
                                                         // A is missing its unet → not installed

        let a = manifest(
            "a",
            vec![
                entry("vae", "ae.safetensors"),
                entry("unet", "a.safetensors"),
            ],
        );
        let b = manifest(
            "b",
            vec![
                entry("vae", "ae.safetensors"),
                entry("unet", "b.safetensors"),
            ],
        );

        // Uninstalling a fictional pack C; only B is installed → ae protected.
        let packs = vec![("a".into(), a), ("b".into(), b)];
        let protected = protect_keys_for_installed(&root, "c", &packs);
        assert!(protected.contains(&file_key("vae", "ae.safetensors")));
        assert!(protected.contains(&file_key("unet", "b.safetensors")));
        assert!(!protected.contains(&file_key("unet", "a.safetensors")));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn gc_removes_all_when_nothing_protects() {
        let root = std::env::temp_dir().join(format!("oga-bp-gc-all-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let f = root.join("unet").join("solo.safetensors");
        touch(&f);
        let summary = gc_model_files(
            &root,
            vec![("unet".into(), "solo.safetensors".into())],
            &HashSet::new(),
        )
        .unwrap();
        assert_eq!(summary.removed, 1);
        assert_eq!(summary.kept, 0);
        assert!(!f.is_file());
        let _ = fs::remove_dir_all(&root);
    }
}
