use super::state::AppState;
use crate::download_manager::{self, DownloadSpec, EnsureOpts};
use crate::loras::{self, LoraPack, SaveUserLoraArgs};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_loras(app: AppHandle) -> Result<Vec<LoraPack>, String> {
    loras::list_loras(&app)
}

#[tauri::command]
pub fn get_lora(app: AppHandle, id: String) -> Result<LoraPack, String> {
    loras::get_lora(&app, &id)
}

/// Enqueue LoRA variant install via Download Manager.
#[tauri::command]
pub fn install_lora_variant(
    app: AppHandle,
    _state: State<'_, AppState>,
    id: String,
    arch: String,
) -> Result<(), String> {
    let _ = download_manager::ensure(
        &app,
        DownloadSpec::Lora { id, arch },
        EnsureOpts { wait: false },
    )?;
    Ok(())
}

#[tauri::command]
pub fn save_user_lora(app: AppHandle, args: SaveUserLoraArgs) -> Result<LoraPack, String> {
    loras::save_user_lora(&app, args)
}

#[tauri::command]
pub fn delete_user_lora(app: AppHandle, id: String) -> Result<(), String> {
    loras::delete_user_lora(&app, &id)
}
