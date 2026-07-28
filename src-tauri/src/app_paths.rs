//! App data lives under a human-readable folder, not the reverse-DNS identifier.
//! Tauri's `app_data_dir()` resolves to `{dataDir}/{identifier}` (e.g. `com.open-gen-studio`);
//! we use `{dataDir}/Open Gen Studio` instead.

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Folder name under the OS data directory (Windows: `%APPDATA%`).
pub const APP_DATA_FOLDER: &str = "Open Gen Studio";

pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .data_dir()
        .map_err(|e| e.to_string())?
        .join(APP_DATA_FOLDER);
    Ok(dir)
}
