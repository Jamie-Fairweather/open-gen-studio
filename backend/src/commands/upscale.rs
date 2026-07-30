use super::state::AppState;
use crate::download_manager::{self, DownloadSpec, EnsureOpts};
use crate::upscale::{self, UpscaleModelInfo};
use tauri::{AppHandle, State};

#[tauri::command]
#[specta::specta]
pub fn list_upscalers(app: AppHandle) -> Result<Vec<UpscaleModelInfo>, String> {
    upscale::list_upscalers(&app)
}

#[tauri::command]
#[specta::specta]
pub fn usdu_node_ready(app: AppHandle) -> Result<bool, String> {
    Ok(upscale::usdu_installed(&app))
}

#[tauri::command]
#[specta::specta]
pub fn supir_node_ready(app: AppHandle) -> Result<bool, String> {
    Ok(upscale::supir_installed(&app))
}

/// Enqueue upscale weight install via Download Manager.
#[tauri::command]
#[specta::specta]
pub fn install_upscaler(
    app: AppHandle,
    _state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let _ = download_manager::ensure(
        &app,
        DownloadSpec::Upscale { id },
        EnsureOpts { wait: false },
    )?;
    Ok(())
}

/// Ensure Ultimate SD Upscale is at the app-pinned commit.
#[tauri::command]
#[specta::specta]
pub fn ensure_usdu_node(app: AppHandle, _state: State<'_, AppState>) -> Result<(), String> {
    let _ = download_manager::ensure(
        &app,
        DownloadSpec::Upscale { id: "usdu".into() },
        EnsureOpts { wait: false },
    )?;
    Ok(())
}

/// Ensure SUPIR custom node is at the app-pinned commit + deps.
#[tauri::command]
#[specta::specta]
pub fn ensure_supir_node(app: AppHandle, _state: State<'_, AppState>) -> Result<(), String> {
    let _ = download_manager::ensure(
        &app,
        DownloadSpec::Upscale { id: "supir".into() },
        EnsureOpts { wait: false },
    )?;
    Ok(())
}
