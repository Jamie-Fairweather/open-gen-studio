use super::state::AppState;
use crate::db::GalleryItem;
use crate::generate;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn list_gallery(state: State<'_, AppState>) -> Result<Vec<GalleryItem>, String> {
    let items = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.list_gallery()?
    };
    // Backfill missing thumbs without holding the DB lock (decode can be slow once).
    let (items, updates) = generate::ensure_gallery_thumbnails(items);
    if !updates.is_empty() {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        for (id, path) in updates {
            let _ = db.set_gallery_thumbnail(&id, &path);
        }
    }
    Ok(items)
}

#[tauri::command]
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

#[tauri::command]
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
        let path = PathBuf::from(&item.path);
        if path.is_file() {
            let _ = fs::remove_file(&path);
        }
        if let Some(thumb) = item.thumbnail_path.as_deref() {
            let thumb = PathBuf::from(thumb);
            if thumb.is_file() {
                let _ = fs::remove_file(&thumb);
            }
        } else {
            // Sidecar naming used before thumbnail_path was stored.
            let sidecar = path.with_file_name(format!(
                "{}.thumb.jpg",
                path.file_stem().and_then(|s| s.to_str()).unwrap_or("image")
            ));
            if sidecar.is_file() {
                let _ = fs::remove_file(&sidecar);
            }
        }
        // Remove empty day folder (YYYY-MM-DD) or legacy job folder (gallery/<job_id>/).
        if let Some(parent) = path.parent() {
            let name = parent.file_name().and_then(|s| s.to_str()).unwrap_or("");
            let is_job_folder = item.job_id.as_deref() == Some(name);
            let is_day_folder = name.len() == 10
                && name.as_bytes().get(4) == Some(&b'-')
                && name.as_bytes().get(7) == Some(&b'-')
                && name.bytes().all(|b| b.is_ascii_digit() || b == b'-');
            if is_job_folder || is_day_folder {
                let _ = fs::remove_dir(parent);
            }
        }
        let _ = app.emit("gallery://deleted", &id);
    }
    Ok(())
}
