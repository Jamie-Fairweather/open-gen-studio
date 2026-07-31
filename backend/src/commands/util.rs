use crate::gpu::{self, GpuInfo};
use crate::spellcheck;
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[tauri::command]
#[specta::specta]
pub fn detect_gpu() -> GpuInfo {
    gpu::detect_nvidia()
}

/// OS spell suggestions for the custom editable context menu (empty if correct / unavailable).
#[tauri::command]
#[specta::specta]
pub async fn spellcheck_suggestions(word: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || spellcheck::suggest(&word))
        .await
        .map_err(|e| format!("spellcheck join: {e}"))?
}

/// Open an http(s) URL in the user's default system browser.
#[tauri::command]
#[specta::specta]
pub fn open_external_url(url: String) -> Result<(), String> {
    let url = url.trim();
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("only http(s) URLs can be opened".into());
    }
    #[cfg(windows)]
    {
        // `start` treats the first quoted arg as the window title.
        crate::process_cmd::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        crate::process_cmd::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        crate::process_cmd::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
    }
    Ok(())
}
