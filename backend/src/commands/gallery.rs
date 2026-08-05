use super::state::AppState;
use crate::blueprints::{open_path_in_os, path_for_asset_protocol};
use crate::db::GalleryItem;
use crate::generate;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager, State};

fn gallery_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = generate::gallery_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Ensure `path` resolves inside the gallery directory (not arbitrary FS).
fn ensure_under_gallery(app: &AppHandle, path: &Path) -> Result<PathBuf, String> {
    let root = gallery_root(app)?
        .canonicalize()
        .map_err(|e| format!("gallery dir: {e}"))?;
    let resolved = path
        .canonicalize()
        .map_err(|e| format!("gallery path missing: {e}"))?;
    if !resolved.starts_with(&root) {
        return Err("path is outside the gallery folder".into());
    }
    Ok(resolved)
}

fn repair_stale_gallery_paths(app: &AppHandle, items: &mut [GalleryItem]) -> Result<(), String> {
    let root = gallery_root(app)?;
    let mut updates: Vec<(String, String, Option<String>)> = Vec::new();
    for item in items.iter_mut() {
        let mut changed = false;
        if let Some(next) = crate::db::remap_gallery_file(&item.path, &root) {
            item.path = next.to_string_lossy().into_owned();
            changed = true;
        }
        if let Some(thumb) = item.thumbnail_path.clone() {
            if let Some(next) = crate::db::remap_gallery_file(&thumb, &root) {
                item.thumbnail_path = Some(next.to_string_lossy().into_owned());
                changed = true;
            }
        }
        if changed {
            updates.push((
                item.id.clone(),
                item.path.clone(),
                item.thumbnail_path.clone(),
            ));
        }
    }
    if updates.is_empty() {
        return Ok(());
    }
    let state = app.state::<AppState>();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    for (id, path, thumb) in updates {
        db.set_gallery_paths(&id, &path, thumb.as_deref())?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn list_gallery(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<GalleryItem>, String> {
    let mut items = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.list_gallery()?
    };
    let _ = repair_stale_gallery_paths(&app, &mut items);
    // Return DB rows immediately; decode/migrate thumbs off the critical path.
    let app_bg = app.clone();
    let items_bg = items.clone();
    std::thread::spawn(move || {
        let (updated_items, updates) = generate::ensure_gallery_thumbnails(&app_bg, items_bg);
        if updates.is_empty() {
            return;
        }
        let updated_ids: HashSet<String> = updates.iter().map(|(id, _)| id.clone()).collect();
        {
            let state = app_bg.state::<AppState>();
            if let Ok(db) = state.db.lock() {
                for (id, path) in updates {
                    let _ = db.set_gallery_thumbnail(&id, &path);
                }
            };
        }
        for item in updated_items {
            if updated_ids.contains(&item.id) {
                let _ = app_bg.emit("gallery://updated", &item);
            }
        }
    });
    Ok(items)
}

#[tauri::command]
#[specta::specta]
pub fn add_gallery_item(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    job_id: Option<String>,
    thumbnail_path: Option<String>,
    metadata_json: Option<String>,
) -> Result<GalleryItem, String> {
    let meta = metadata_json.unwrap_or_else(|| "{}".into());
    let item = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.add_gallery_item(job_id.as_deref(), &path, thumbnail_path.as_deref(), &meta)?
    };
    let _ = app.emit("gallery://updated", &item);
    Ok(item)
}

fn remove_empty_gallery_folder(path: &std::path::Path, job_id: Option<&str>) {
    let Some(parent) = path.parent() else {
        return;
    };
    let name = parent.file_name().and_then(|s| s.to_str()).unwrap_or("");
    let is_job_folder = job_id == Some(name);
    let is_day_folder = name.len() == 10
        && name.as_bytes().get(4) == Some(&b'-')
        && name.as_bytes().get(7) == Some(&b'-')
        && name.bytes().all(|b| b.is_ascii_digit() || b == b'-');
    if is_job_folder || is_day_folder {
        let _ = fs::remove_dir(parent);
    }
}

pub(crate) fn remove_gallery_files(item: &GalleryItem) {
    let path = PathBuf::from(&item.path);
    if path.is_file() {
        let _ = fs::remove_file(&path);
    }
    if let Some(thumb) = item.thumbnail_path.as_deref() {
        let thumb = PathBuf::from(thumb);
        if thumb.is_file() {
            let _ = fs::remove_file(&thumb);
        }
        remove_empty_gallery_folder(&thumb, item.job_id.as_deref());
    }
    // Legacy sidecar next to the image (before thumbs lived under `previews/`).
    let sidecar = path.with_file_name(format!(
        "{}.thumb.jpg",
        path.file_stem().and_then(|s| s.to_str()).unwrap_or("image")
    ));
    if sidecar.is_file() {
        let _ = fs::remove_file(&sidecar);
    }
    // Remove empty day folder (YYYY-MM-DD) or legacy job folder (gallery/<job_id>/).
    remove_empty_gallery_folder(&path, item.job_id.as_deref());
}

#[tauri::command]
#[specta::specta]
pub fn delete_gallery_item(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let item = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.delete_gallery_item(&id)?
    };
    if let Some(item) = item {
        // Two-way link: removing a gallery image drops the completed job history row.
        if let Some(job_id) = item.job_id.as_deref() {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let _ = db.delete_job_by_id_if_history(job_id);
            let _ = app.emit("jobs://history", true);
        }
        // Notify UI before disk I/O so deletes feel instant.
        let _ = app.emit("gallery://deleted", &id);
        std::thread::spawn(move || remove_gallery_files(&item));
    }
    Ok(())
}

/// Reveal a gallery file in the OS file manager, or open the gallery folder.
#[tauri::command]
#[specta::specta]
pub fn reveal_gallery_item(
    app: AppHandle,
    state: State<'_, AppState>,
    id: Option<String>,
) -> Result<String, String> {
    if let Some(id) = id.as_deref().filter(|s| !s.is_empty()) {
        let item = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.get_gallery_item(id)?
                .ok_or_else(|| format!("gallery item not found: {id}"))?
        };
        let path = ensure_under_gallery(&app, Path::new(&item.path))?;
        if !path.is_file() {
            return Err(format!("gallery image missing: {}", path.display()));
        }
        open_path_in_os(&path)?;
        return Ok(path_for_asset_protocol(path));
    }

    let dir = gallery_root(&app)?;
    open_path_in_os(&dir)?;
    Ok(path_for_asset_protocol(dir))
}

/// Copy a gallery image (full resolution) to the system clipboard.
#[tauri::command]
#[specta::specta]
pub fn copy_gallery_image_to_clipboard(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let item = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_gallery_item(&id)?
            .ok_or_else(|| format!("gallery item not found: {id}"))?
    };
    let path = ensure_under_gallery(&app, Path::new(&item.path))?;
    if !path.is_file() {
        return Err(format!("gallery image missing: {}", path.display()));
    }

    let img = image::open(&path).map_err(|e| format!("open gallery image: {e}"))?;
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("clipboard unavailable: {e}"))?;
    clipboard
        .set_image(arboard::ImageData {
            width: width as usize,
            height: height as usize,
            bytes: rgba.into_raw().into(),
        })
        .map_err(|e| format!("copy image failed: {e}"))?;
    Ok(())
}
