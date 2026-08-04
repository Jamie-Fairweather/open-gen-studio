use std::fs;
use std::path::{Path, PathBuf};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

/// Resolve the Official blueprints directory (bundled resources, with repo fallback in dev).
pub fn official_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // In dev, prefer the live repo folder so newly added files (e.g. thumbnail.png)
    // show up without waiting for Tauri to re-copy bundled resources into target/.
    #[cfg(debug_assertions)]
    {
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("content")
                .join("blueprints"),
        );
    }

    for rel in ["blueprints", "_up_/blueprints"] {
        if let Ok(p) = app.path().resolve(rel, BaseDirectory::Resource) {
            candidates.push(p);
        }
    }
    if let Ok(resource) = app.path().resource_dir() {
        candidates.push(resource.join("_up_").join("blueprints"));
        candidates.push(resource.join("blueprints"));
    }

    #[cfg(not(debug_assertions))]
    {
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("content")
                .join("blueprints"),
        );
    }

    for path in candidates {
        if path.is_dir() {
            return Ok(path);
        }
    }
    Err("Official blueprints directory not found".into())
}

/// User-created blueprints live under app data - never under Official.
pub fn user_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = crate::app_paths::app_data_dir(app)?
        .join("blueprints")
        .join("user");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub(crate) fn validate_blueprint_id(blueprint_id: &str) -> Result<(), String> {
    if blueprint_id.is_empty()
        || blueprint_id.contains("..")
        || blueprint_id.contains('/')
        || blueprint_id.contains('\\')
        || !blueprint_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(
            "invalid blueprint id (use lowercase letters, numbers, hyphen, underscore)".into(),
        );
    }
    Ok(())
}

pub fn open_user_blueprints_dir(app: &AppHandle) -> Result<String, String> {
    let dir = user_dir(app)?;
    open_dir_in_os(&dir)?;
    Ok(path_for_asset_protocol(dir))
}

pub(crate) fn open_dir_in_os(dir: &Path) -> Result<(), String> {
    open_path_in_os(dir)
}

/// Open a directory, or reveal a file in the OS file manager.
pub(crate) fn open_path_in_os(path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        if path.is_file() {
            // `/select,` highlights the file; path must not be quoted separately.
            let arg = format!("/select,{}", path.display());
            crate::process_cmd::new("explorer")
                .arg(arg)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            crate::process_cmd::new("explorer")
                .arg(path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    #[cfg(target_os = "macos")]
    {
        if path.is_file() {
            crate::process_cmd::new("open")
                .args(["-R", &path.display().to_string()])
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            crate::process_cmd::new("open")
                .arg(path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    #[cfg(target_os = "linux")]
    {
        let target = if path.is_file() {
            path.parent().unwrap_or(path)
        } else {
            path
        };
        crate::process_cmd::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Normalize paths for `convertFileSrc` (strip Windows `\\?\` canonicalize prefix).
pub(crate) fn path_for_asset_protocol(path: PathBuf) -> String {
    let path = path.canonicalize().unwrap_or(path);
    let s = path.display().to_string();
    s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
}
