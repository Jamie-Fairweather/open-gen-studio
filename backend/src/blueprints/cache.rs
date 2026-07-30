use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

use crate::download;

/// Process-local cache of URL → Content-Length (from HEAD / Range probe).
/// Also persisted to app data so cold start knows installed models immediately.
static REMOTE_SIZE_CACHE: OnceLock<Mutex<HashMap<String, u64>>> = OnceLock::new();

fn remote_size_cache() -> &'static Mutex<HashMap<String, u64>> {
    REMOTE_SIZE_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn remote_size_cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::app_paths::app_data_dir(app)?.join("remote-size-cache.json"))
}

/// Load persisted URL sizes before the first blueprint list (call from setup).
pub fn load_remote_size_cache(app: &AppHandle) {
    let Ok(path) = remote_size_cache_path(app) else {
        return;
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return;
    };
    let Ok(map) = serde_json::from_str::<HashMap<String, u64>>(&raw) else {
        return;
    };
    if let Ok(mut cache) = remote_size_cache().lock() {
        for (k, v) in map {
            cache.entry(k).or_insert(v);
        }
    }
}

pub(crate) fn save_remote_size_cache(app: &AppHandle) {
    let Ok(path) = remote_size_cache_path(app) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let snapshot = match remote_size_cache().lock() {
        Ok(cache) => cache.clone(),
        Err(_) => return,
    };
    if let Ok(raw) = serde_json::to_string(&snapshot) {
        let _ = fs::write(path, raw);
    }
}

/// Drop cached remote sizes (e.g. after an HF token is saved so gated files can be re-probed).
pub fn clear_remote_size_cache() {
    if let Ok(mut cache) = remote_size_cache().lock() {
        cache.clear();
    }
}

pub(crate) fn cached_remote_size(url: &str) -> Option<u64> {
    remote_size_cache()
        .lock()
        .ok()
        .and_then(|cache| cache.get(url).copied())
}

pub(crate) fn probe_remote_size(url: &str) -> Option<u64> {
    if let Some(n) = cached_remote_size(url) {
        return Some(n);
    }
    let size = download::remote_content_length(url).ok().flatten()?;
    if let Ok(mut cache) = remote_size_cache().lock() {
        cache.insert(url.to_string(), size);
    }
    Some(size)
}
