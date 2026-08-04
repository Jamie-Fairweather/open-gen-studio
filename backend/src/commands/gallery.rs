use super::state::AppState;
use crate::db::GalleryItem;
use crate::generate;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};

#[tauri::command]
#[specta::specta]
pub fn list_gallery(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<GalleryItem>, String> {
    let items = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.list_gallery()?
    };
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
