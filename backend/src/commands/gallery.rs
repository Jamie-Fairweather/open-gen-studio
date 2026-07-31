use super::state::AppState;
use crate::db::GalleryItem;
use crate::generate;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

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
    // Backfill / migrate thumbs without holding the DB lock (decode can be slow once).
    let (items, updates) = generate::ensure_gallery_thumbnails(&app, items);
    if !updates.is_empty() {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        for (id, path) in updates {
            let _ = db.set_gallery_thumbnail(&id, &path);
        }
    }
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

fn remove_gallery_files(item: &GalleryItem) {
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
        // Notify UI before disk I/O so deletes feel instant.
        let _ = app.emit("gallery://deleted", &id);
        std::thread::spawn(move || remove_gallery_files(&item));
    }
    Ok(())
}
