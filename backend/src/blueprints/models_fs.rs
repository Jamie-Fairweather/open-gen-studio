use std::fs;
use std::path::Path;
use tauri::AppHandle;

use crate::comfy;

use super::paths::{open_dir_in_os, path_for_asset_protocol};
use super::types::ModelFileEntry;

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
