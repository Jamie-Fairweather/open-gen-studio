//! App data lives under a human-readable folder, not the reverse-DNS identifier.
//! Tauri's `app_data_dir()` resolves to `{dataDir}/{identifier}` (e.g. `com.open-gen-studio`);
//! we use `{dataDir}/Open Gen Studio` instead (or `Open Gen Studio Dev` in debug builds).
//!
//! Users may relocate the heavy data root (models, runtimes, gallery, DB) via a pointer file
//! that always lives under the fixed locator dir:
//! `{locator}/data-root.json` → `{ "path": "D:\\…" }` (custom or MSIX default) or
//! `{ "path": null }` (unpackaged default, where preferred == locator).

use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};

static MOVE_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

pub fn is_move_in_progress() -> bool {
    MOVE_IN_PROGRESS.load(Ordering::SeqCst)
}

pub fn set_move_in_progress(active: bool) {
    MOVE_IN_PROGRESS.store(active, Ordering::SeqCst);
}

/// Folder name under the OS data directory (Windows: `%APPDATA%`).
/// Debug builds use a separate folder so `tauri dev` never touches release data.
pub const APP_DATA_FOLDER: &str = if cfg!(debug_assertions) {
    "Open Gen Studio Dev"
} else {
    "Open Gen Studio"
};

const POINTER_FILE: &str = "data-root.json";

/// Top-level names moved when relocating the data root.
const MIGRATE_NAMES: &[&str] = &[
    "open-gen-studio.db",
    "open-gen-studio.db-wal",
    "open-gen-studio.db-shm",
    "models",
    "runtimes",
    "gallery",
    "previews",
    "blueprints",
    "loras",
    "prompt-tools",
    "downloads",
    "tmp",
    "remote-size-cache.json",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DataRootPointer {
    /// Absolute library root. `null` only when default == locator (unpackaged).
    /// MSIX default is an explicit `%USERPROFILE%\Open Gen Studio` path, not null.
    path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DataDirInfo {
    pub path: String,
    pub is_custom: bool,
    /// Where `data-root.json` lives (may be a long MSIX AppData path).
    pub locator_path: String,
    /// Recommended default library root (short profile path under MSIX).
    pub default_path: String,
    pub storage_chosen: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SetDataDirResult {
    pub path: String,
    pub needs_restart: bool,
    pub migrated: bool,
}

/// `data-dir://progress` payload while relocating the library.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DataDirProgress {
    pub stage: String,
    pub message: String,
    pub current: u32,
    pub total: u32,
}

fn emit_progress(app: &AppHandle, stage: &str, message: &str, current: u32, total: u32) {
    let _ = app.emit(
        "data-dir://progress",
        DataDirProgress {
            stage: stage.into(),
            message: message.into(),
            current,
            total,
        },
    );
}

/// Fixed AppData locator — pointer file always lives here.
pub fn locator_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .data_dir()
        .map_err(|e| e.to_string())?
        .join(APP_DATA_FOLDER))
}

fn path_looks_msix_virtualized(s: &str) -> bool {
    let lower = s.to_ascii_lowercase();
    lower.contains(r"\packages\") && lower.contains(r"\localcache\")
}

/// True when this process has MSIX/AppX package identity (Store / sideload).
pub fn is_msix_packaged() -> bool {
    #[cfg(windows)]
    {
        use windows::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;
        let mut len = 0u32;
        let err = unsafe { GetCurrentPackageFullName(&mut len, None) };
        // 15700 = APPMODEL_ERROR_NO_PACKAGE. Anything else (incl. buffer-too-small) is packaged.
        err.0 != 15700
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// MSIX virtualizes `%APPDATA%` under `Packages\…\LocalCache\Roaming\…`.
/// Tauri often returns the friendly `AppData\Roaming\…` view — canonicalize to see the real path.
pub fn is_msix_virtualized_path(path: &Path) -> bool {
    if path_looks_msix_virtualized(&path.to_string_lossy()) {
        return true;
    }
    fs::canonicalize(path)
        .map(|c| path_looks_msix_virtualized(&c.to_string_lossy()))
        .unwrap_or(false)
}

/// Recommended default library root. Under MSIX, prefer `%USERPROFILE%\Open Gen Studio`
/// so Comfy/pip paths stay under MAX_PATH without requiring admin long-path policy.
pub fn preferred_default_root(locator: &Path) -> PathBuf {
    if !is_msix_packaged() && !is_msix_virtualized_path(locator) {
        return locator.to_path_buf();
    }
    match std::env::var_os("USERPROFILE") {
        Some(home) => PathBuf::from(home).join(APP_DATA_FOLDER),
        None => locator.to_path_buf(),
    }
}

/// Path unpackaged processes (portable Python / Comfy) can open.
/// Strips `\\?\` and expands MSIX AppData redirection.
pub fn path_visible_outside_msix(path: &Path) -> PathBuf {
    let canon = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let s = canon.to_string_lossy();
    let stripped = s
        .strip_prefix(r"\\?\UNC\")
        .map(|rest| format!(r"\\{rest}"))
        .or_else(|| s.strip_prefix(r"\\?\").map(|rest| rest.to_string()))
        .unwrap_or_else(|| s.into_owned());
    PathBuf::from(stripped)
}

fn pointer_path(locator: &Path) -> PathBuf {
    locator.join(POINTER_FILE)
}

fn read_pointer(locator: &Path) -> Option<DataRootPointer> {
    let raw = fs::read_to_string(pointer_path(locator)).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_pointer(locator: &Path, path: Option<&Path>) -> Result<(), String> {
    fs::create_dir_all(locator).map_err(|e| e.to_string())?;
    let pointer = DataRootPointer {
        path: path.map(|p| p.to_string_lossy().into_owned()),
    };
    let json = serde_json::to_string_pretty(&pointer).map_err(|e| e.to_string())?;
    let dest = pointer_path(locator);
    let mut file = fs::File::create(&dest).map_err(|e| e.to_string())?;
    file.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

/// True when the user confirmed a storage location, or legacy library data exists.
///
/// Do **not** treat `open-gen-studio.db` alone as chosen — `Db::open` creates it on
/// every cold start before onboarding can ask, which would skip the storage step.
pub fn storage_chosen(locator: &Path) -> bool {
    if pointer_path(locator).is_file() {
        return true;
    }
    // Pre-pointer installs already had weights / Comfy under the locator.
    locator.join("models").is_dir() || locator.join("runtimes").is_dir()
}

pub(crate) fn paths_equal(a: &Path, b: &Path) -> bool {
    if a == b {
        return true;
    }
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(ca), Ok(cb)) => ca == cb,
        _ => false,
    }
}

/// Resolve the active data root from a locator + optional pointer.
pub fn resolve_data_dir(locator: &Path) -> PathBuf {
    let preferred = preferred_default_root(locator);
    match read_pointer(locator) {
        Some(DataRootPointer { path: Some(custom) }) => {
            let custom = PathBuf::from(custom.trim());
            if custom.is_absolute() {
                custom
            } else {
                preferred
            }
        }
        // Explicit default (`path: null`): keep locator if library data already
        // lives there (pre-MSIX-short-path installs); otherwise use preferred.
        Some(DataRootPointer { path: None }) => {
            if dir_has_migrate_payload(locator) {
                locator.to_path_buf()
            } else {
                preferred
            }
        }
        // No pointer yet: prefer short root under MSIX; preserve locator when
        // legacy models/runtimes already exist there.
        None => {
            if dir_has_migrate_payload(locator) {
                locator.to_path_buf()
            } else {
                preferred
            }
        }
    }
}

pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let locator = locator_dir(app)?;
    Ok(resolve_data_dir(&locator))
}

pub fn data_dir_info(app: &AppHandle) -> Result<DataDirInfo, String> {
    let locator = locator_dir(app)?;
    let path = resolve_data_dir(&locator);
    let default_path = preferred_default_root(&locator);
    let is_custom = !paths_equal(&path, &default_path);
    Ok(DataDirInfo {
        path: path.to_string_lossy().into_owned(),
        is_custom,
        locator_path: locator.to_string_lossy().into_owned(),
        default_path: default_path.to_string_lossy().into_owned(),
        storage_chosen: storage_chosen(&locator),
    })
}

fn dir_has_migrate_payload(root: &Path) -> bool {
    MIGRATE_NAMES.iter().any(|name| root.join(name).exists())
}

fn target_is_empty_enough(target: &Path) -> bool {
    if !target.exists() {
        return true;
    }
    let Ok(mut entries) = fs::read_dir(target) else {
        return false;
    };
    !entries.any(|e| e.is_ok())
}

fn move_entry(src: &Path, dest: &Path) -> Result<(), String> {
    if !src.exists() {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    match fs::rename(src, dest) {
        Ok(()) => Ok(()),
        Err(_) => {
            // Cross-volume rename fails — copy then remove.
            if src.is_dir() {
                copy_dir_recursive(src, dest)?;
                fs::remove_dir_all(src).map_err(|err| err.to_string())?;
            } else {
                fs::copy(src, dest).map_err(|err| err.to_string())?;
                fs::remove_file(src).map_err(|err| err.to_string())?;
            }
            Ok(())
        }
    }
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let from = entry.path();
        let to = dest.join(entry.file_name());
        if from.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            if let Some(parent) = to.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(&from, &to).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
fn migrate_data_root(from: &Path, to: &Path) -> Result<bool, String> {
    migrate_data_root_with_progress(from, to, None)
}

pub fn migrate_data_root_with_progress(
    from: &Path,
    to: &Path,
    app: Option<&AppHandle>,
) -> Result<bool, String> {
    if paths_equal(from, to) {
        return Ok(false);
    }
    if !dir_has_migrate_payload(from) {
        fs::create_dir_all(to).map_err(|e| e.to_string())?;
        return Ok(false);
    }
    if to.exists() && !target_is_empty_enough(to) && dir_has_migrate_payload(to) {
        return Err(format!(
            "Destination already has Open Gen Studio data: {}",
            to.display()
        ));
    }
    fs::create_dir_all(to).map_err(|e| e.to_string())?;

    let to_move: Vec<&str> = MIGRATE_NAMES
        .iter()
        .copied()
        .filter(|name| from.join(name).exists())
        .collect();
    let total = to_move.len().max(1) as u32;
    let mut moved = false;
    for (idx, name) in to_move.iter().enumerate() {
        let current = (idx + 1) as u32;
        if let Some(app) = app {
            emit_progress(app, "moving", &format!("Moving {name}…"), current, total);
        }
        let src = from.join(name);
        let dest = to.join(name);
        if dest.exists() {
            return Err(format!(
                "Destination already contains '{name}': {}",
                dest.display()
            ));
        }
        move_entry(&src, &dest)?;
        moved = true;
    }
    Ok(moved)
}

/// Where a Default (`None`) or custom confirm will actually write.
/// The Tauri command's "are we moving?" check must use this — not `locator_dir`.
/// Under MSIX, Default is `%USERPROFILE%\Open Gen Studio`, not the Packages path.
pub fn set_data_dir_destination(
    locator: &Path,
    requested: Option<&Path>,
) -> Result<PathBuf, String> {
    match requested {
        None => Ok(preferred_default_root(locator)),
        Some(p) => {
            if !p.is_absolute() {
                return Err("Data directory must be an absolute path".into());
            }
            Ok(p.to_path_buf())
        }
    }
}

/// Confirm default or custom data root. Returns whether the app should relaunch.
/// Caller must pause/stop runtimes and close the live DB before calling when `moving`.
pub fn set_data_dir(
    app: &AppHandle,
    requested: Option<&Path>,
    with_progress: bool,
) -> Result<SetDataDirResult, String> {
    let locator = locator_dir(app)?;
    let current = resolve_data_dir(&locator);
    let preferred = preferred_default_root(&locator);
    let target = set_data_dir_destination(&locator, requested)?;

    let same = paths_equal(&current, &target);
    let mut migrated = false;
    if !same {
        if with_progress {
            emit_progress(app, "moving", "Copying library files…", 0, 1);
        }
        migrated = migrate_data_root_with_progress(
            &current,
            &target,
            if with_progress { Some(app) } else { None },
        )?;
        if with_progress {
            emit_progress(app, "rewriting", "Updating saved file paths…", 1, 1);
        }
        let db_path = target.join("open-gen-studio.db");
        crate::db::rewrite_data_root_paths_at(&db_path, &current, &target)?;
    } else {
        fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    }

    if paths_equal(&target, &preferred) && paths_equal(&preferred, &locator) {
        // Classic non-MSIX default: pointer null means locator.
        write_pointer(&locator, None)?;
    } else {
        // Custom folder, or MSIX short default outside the Packages path.
        write_pointer(&locator, Some(&target))?;
    }

    // Restart when the live session opened a different root (DB / downloads).
    let needs_restart = !same;

    Ok(SetDataDirResult {
        path: target.to_string_lossy().into_owned(),
        needs_restart,
        migrated,
    })
}

pub fn pick_data_dir(app: &AppHandle) -> Result<Option<String>, String> {
    let start = app_data_dir(app).or_else(|_| locator_dir(app))?;
    let picked = rfd::FileDialog::new()
        .set_title("Choose Open Gen Studio data folder")
        .set_directory(&start)
        .pick_folder();
    Ok(picked.map(|p| p.to_string_lossy().into_owned()))
}

pub fn open_data_dir(app: &AppHandle) -> Result<String, String> {
    let dir = app_data_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    crate::blueprints::open_dir_in_os(&dir)?;
    Ok(dir.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn tmp(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "oga-data-{}-{}-{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn touch_file(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut f = fs::File::create(path).unwrap();
        f.write_all(b"x").unwrap();
    }

    #[test]
    fn resolve_defaults_to_locator_without_pointer() {
        let loc = tmp("loc-default");
        assert_eq!(resolve_data_dir(&loc), loc);
        assert!(!storage_chosen(&loc));
        let _ = fs::remove_dir_all(&loc);
    }

    #[test]
    fn msix_virtualized_path_detection() {
        let msix = PathBuf::from(
            r"C:\Users\user\AppData\Local\Packages\JamieFairweather.OpenGenStudio_wcqg2dr9399ny\LocalCache\Roaming\Open Gen Studio",
        );
        assert!(is_msix_virtualized_path(&msix));
        // Friendly Roaming string is not enough — only canonicalize (when the
        // folder exists under Packages) or an explicit Packages path counts.
        let normal = PathBuf::from(r"C:\Users\user\AppData\Roaming\Open Gen Studio");
        assert!(!is_msix_virtualized_path(&normal));
    }

    #[test]
    fn path_visible_strips_verbatim_prefix() {
        let dir = tmp("visible");
        let visible = path_visible_outside_msix(&dir);
        let s = visible.to_string_lossy();
        assert!(!s.starts_with(r"\\?\"), "{s}");
        assert!(visible.is_absolute());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn set_destination_none_is_preferred_not_locator() {
        let msix = PathBuf::from(
            r"C:\Users\user\AppData\Local\Packages\App_pubid\LocalCache\Roaming\Open Gen Studio",
        );
        let dest = set_data_dir_destination(&msix, None).unwrap();
        assert_eq!(dest, preferred_default_root(&msix));
        if std::env::var_os("USERPROFILE").is_some() {
            assert_ne!(dest, msix);
        }
        let custom = PathBuf::from(r"D:\Open Gen Studio");
        assert_eq!(
            set_data_dir_destination(&msix, Some(&custom)).unwrap(),
            custom
        );
        let rel = PathBuf::from("relative");
        assert!(set_data_dir_destination(&msix, Some(&rel)).is_err());
    }

    #[test]
    fn preferred_default_uses_profile_under_msix() {
        let msix = PathBuf::from(
            r"C:\Users\user\AppData\Local\Packages\App_pubid\LocalCache\Roaming\Open Gen Studio",
        );
        let preferred = preferred_default_root(&msix);
        if let Some(home) = std::env::var_os("USERPROFILE") {
            assert_eq!(preferred, PathBuf::from(home).join(APP_DATA_FOLDER));
        }
        let normal = tmp("not-msix");
        assert_eq!(preferred_default_root(&normal), normal);
        let _ = fs::remove_dir_all(&normal);
    }

    #[test]
    fn storage_not_chosen_for_db_only_locator() {
        let loc = tmp("db-only");
        touch_file(&loc.join("open-gen-studio.db"));
        assert!(!storage_chosen(&loc));
        let _ = fs::remove_dir_all(&loc);
    }

    #[test]
    fn storage_chosen_when_legacy_models_present() {
        let loc = tmp("legacy-models");
        fs::create_dir_all(loc.join("models")).unwrap();
        assert!(storage_chosen(&loc));
        let _ = fs::remove_dir_all(&loc);
    }

    #[test]
    fn resolve_reads_custom_pointer() {
        let loc = tmp("loc-custom");
        let custom = tmp("custom-root");
        write_pointer(&loc, Some(&custom)).unwrap();
        assert!(storage_chosen(&loc));
        assert_eq!(resolve_data_dir(&loc), custom);
        write_pointer(&loc, None).unwrap();
        assert_eq!(resolve_data_dir(&loc), loc);
        let _ = fs::remove_dir_all(&loc);
        let _ = fs::remove_dir_all(&custom);
    }

    fn msix_looking_locator(name: &str) -> (PathBuf, PathBuf) {
        let root = tmp(name);
        let loc = root
            .join("Packages")
            .join("App_pubid")
            .join("LocalCache")
            .join("Roaming")
            .join(APP_DATA_FOLDER);
        fs::create_dir_all(&loc).unwrap();
        (root, loc)
    }

    #[test]
    fn resolve_msix_empty_uses_preferred() {
        let (root, loc) = msix_looking_locator("msix-empty");
        let preferred = preferred_default_root(&loc);
        assert_ne!(preferred, loc);
        assert_eq!(resolve_data_dir(&loc), preferred);
        write_pointer(&loc, None).unwrap();
        assert_eq!(resolve_data_dir(&loc), preferred);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn resolve_msix_legacy_models_stay_on_locator() {
        let (root, loc) = msix_looking_locator("msix-legacy");
        fs::create_dir_all(loc.join("models")).unwrap();
        assert_eq!(resolve_data_dir(&loc), loc);
        write_pointer(&loc, None).unwrap();
        assert_eq!(resolve_data_dir(&loc), loc);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn resolve_msix_db_only_stays_on_locator_until_confirm() {
        let (root, loc) = msix_looking_locator("msix-db");
        touch_file(&loc.join("open-gen-studio.db"));
        assert!(!storage_chosen(&loc));
        assert_eq!(resolve_data_dir(&loc), loc);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn migrate_moves_known_entries() {
        let from = tmp("from");
        let to = tmp("to-empty");
        fs::remove_dir_all(&to).unwrap();
        touch_file(&from.join("open-gen-studio.db"));
        fs::create_dir_all(from.join("models")).unwrap();
        touch_file(&from.join("models").join("a.safetensors"));
        assert!(migrate_data_root(&from, &to).unwrap());
        assert!(to.join("open-gen-studio.db").is_file());
        assert!(to.join("models").join("a.safetensors").is_file());
        assert!(!from.join("open-gen-studio.db").exists());
        let _ = fs::remove_dir_all(&from);
        let _ = fs::remove_dir_all(&to);
    }

    #[test]
    fn migrate_rejects_occupied_destination() {
        let from = tmp("from-busy");
        let to = tmp("to-busy");
        touch_file(&from.join("open-gen-studio.db"));
        touch_file(&to.join("models").join("x.bin"));
        let err = migrate_data_root(&from, &to).unwrap_err();
        assert!(err.contains("already has"), "{err}");
        let _ = fs::remove_dir_all(&from);
        let _ = fs::remove_dir_all(&to);
    }
}
