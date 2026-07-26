//! Temp image staging and Comfy VRAM helpers.

use super::ensure::ensure_comfy_running;
use crate::comfy::{self, ProcessState};
use crate::db::Db;
use crate::generate;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

fn comfy_input_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let portable = comfy::find_portable_root(&comfy::runtimes_dir(app)?.join("portable"))
        .map_err(|_| "ComfyUI portable not found — install the runtime first".to_string())?;
    let dir = portable.join("ComfyUI").join("input");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub(crate) fn stage_input_image(app: &AppHandle, image_path: &str) -> Result<String, String> {
    let src = PathBuf::from(image_path);
    if !src.is_file() {
        return Err(format!("image not found: {image_path}"));
    }
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase();
    let filename = format!("oga_prompt_{}.{}", Uuid::new_v4().simple(), ext);
    let dest = comfy_input_dir(app)?.join(&filename);
    fs::copy(&src, &dest).map_err(|e| format!("failed to stage image: {e}"))?;
    Ok(filename)
}

/// Persist bytes from the webview (upload / paste) into app temp for Comfy staging.
pub fn save_temp_image(app: &AppHandle, bytes: Vec<u8>, ext: &str) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("empty image data".into());
    }
    let ext_lower = ext.trim().trim_start_matches('.').to_ascii_lowercase();
    let safe_ext = match ext_lower.as_str() {
        "jpg" | "jpeg" => "jpg",
        "webp" => "webp",
        "png" | "" => "png",
        other if other.len() <= 8 && other.chars().all(|c| c.is_ascii_alphanumeric()) => other,
        _ => "png",
    };
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("prompt-tools");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("upload_{}.{}", Uuid::new_v4().simple(), safe_ext));
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

/// Free Comfy VRAM if the runtime is up (no-op if unhealthy).
pub fn free_comfy_vram(
    app: &AppHandle,
    db: &Mutex<Db>,
    processes: &Mutex<ProcessState>,
) -> Result<(), String> {
    let runtime = {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
            .ok_or_else(|| "ComfyUI is not installed".to_string())?
    };
    let port = ensure_comfy_running(app, db, processes, &runtime)?;
    generate::free_vram(port)?;
    Ok(())
}
