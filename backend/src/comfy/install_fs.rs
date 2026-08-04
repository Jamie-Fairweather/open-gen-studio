//! Filesystem helpers for Comfy portable install (backup, purge, retry delete).

use crate::comfy::paths;
use crate::pins;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Copy `custom_nodes` to `backup_parent` (must be **outside** the extract tree -
/// nested portable roots used to put the backup under `portable/`, which we then delete).
pub(crate) fn backup_custom_nodes(
    root: &Path,
    backup_parent: &Path,
) -> Result<Option<PathBuf>, String> {
    let src = root.join("ComfyUI").join("custom_nodes");
    if !src.is_dir() {
        return Ok(None);
    }
    fs::create_dir_all(backup_parent).map_err(|e| e.to_string())?;
    let dest = backup_parent.join(format!(".oga_custom_nodes_backup_{}", paths::now_secs()));
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    }
    copy_dir_recursive(&src, &dest)?;
    Ok(Some(dest))
}

pub(crate) fn restore_custom_nodes(root: &Path, backup: &Path) -> Result<(), String> {
    if !backup.is_dir() {
        return Err(format!(
            "custom nodes backup missing at {} - managed nodes will be re-pinned",
            backup.display()
        ));
    }
    let dest = root.join("ComfyUI").join("custom_nodes");
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    }
    copy_dir_recursive(backup, &dest)?;
    let _ = fs::remove_dir_all(backup);
    // Never carry over managed packs - they are re-pinned fresh (avoids restoring a
    // broken QwenVL/SUPIR tree that already matched HEAD and skipped re-clone).
    purge_managed_custom_nodes(root);
    Ok(())
}

/// Delete app-managed custom node folders so `ensure_managed_nodes` re-clones them.
pub(crate) fn purge_managed_custom_nodes(root: &Path) {
    let custom = root.join("ComfyUI").join("custom_nodes");
    purge_managed_folders(&custom);
}

/// Backup layout is the custom_nodes tree itself (no ComfyUI/ prefix).
pub(crate) fn purge_managed_custom_nodes_in_backup(backup: &Path) {
    purge_managed_folders(backup);
}

fn purge_managed_folders(custom_nodes_dir: &Path) {
    if !custom_nodes_dir.is_dir() {
        return;
    }
    for pin in pins::MANAGED_NODES {
        let _ = fs::remove_dir_all(custom_nodes_dir.join(pin.folder));
    }
}

/// Retry delete - Windows often holds locks for a few seconds after process kill.
pub(crate) fn remove_dir_retries(path: &Path, attempts: u32) -> Result<(), String> {
    for i in 0..attempts {
        if !path.exists() {
            return Ok(());
        }
        match fs::remove_dir_all(path) {
            Ok(()) => return Ok(()),
            Err(e) if i + 1 >= attempts => {
                return Err(format!(
                    "Could not delete ComfyUI folder (a file is still in use): {e}. \
                     Close anything using that folder, reboot if needed, then retry Reinstall."
                ));
            }
            Err(_) => {
                std::thread::sleep(Duration::from_secs(2));
            }
        }
    }
    Ok(())
}

pub(crate) fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let from = entry.path();
        let to = dest.join(entry.file_name());
        if from.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Stable backup dir for custom nodes across extract → configure download steps.
pub(crate) fn custom_nodes_backup_path(base: &Path) -> PathBuf {
    base.join(".oga_custom_nodes_backup")
}
