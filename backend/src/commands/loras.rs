use super::state::AppState;
use crate::blueprints::UninstallSummary;
use crate::download_manager::{self, DownloadSpec, EnsureOpts};
use crate::loras::{self, LoraPack, SaveUserLoraArgs};
use tauri::{AppHandle, State};

#[tauri::command]
#[specta::specta]
pub fn list_loras(app: AppHandle) -> Result<Vec<LoraPack>, String> {
    loras::list_loras(&app)
}

#[tauri::command]
#[specta::specta]
pub fn get_lora(app: AppHandle, id: String) -> Result<LoraPack, String> {
    loras::get_lora(&app, &id)
}

/// Enqueue LoRA variant install via Download Manager.
#[tauri::command]
#[specta::specta]
pub fn install_lora_variant(
    app: AppHandle,
    _state: State<'_, AppState>,
    id: String,
    arch: crate::recipe::RecipeArch,
) -> Result<(), String> {
    let _ = download_manager::ensure(
        &app,
        DownloadSpec::Lora { id, arch },
        EnsureOpts {
            wait: false,
            ..Default::default()
        },
    )?;
    Ok(())
}

/// Remove a LoRA variant weight file if unused by other ready variants.
#[tauri::command]
#[specta::specta]
pub fn uninstall_lora_variant(
    app: AppHandle,
    id: String,
    arch: crate::recipe::RecipeArch,
) -> Result<UninstallSummary, String> {
    loras::uninstall_variant(&app, &id, arch.as_str())
}

#[tauri::command]
#[specta::specta]
pub fn save_user_lora(app: AppHandle, args: SaveUserLoraArgs) -> Result<LoraPack, String> {
    loras::save_user_lora(&app, args)
}

#[tauri::command]
#[specta::specta]
pub fn delete_user_lora(app: AppHandle, id: String) -> Result<(), String> {
    loras::delete_user_lora(&app, &id)
}

#[tauri::command]
#[specta::specta]
pub fn open_user_loras_dir(app: AppHandle) -> Result<String, String> {
    loras::open_user_loras_dir(&app)
}

#[tauri::command]
#[specta::specta]
pub fn set_user_lora_thumbnail(
    app: AppHandle,
    id: String,
    bytes: Vec<u8>,
    ext: String,
) -> Result<String, String> {
    loras::set_user_lora_thumbnail(&app, &id, bytes, &ext)
}

#[tauri::command]
#[specta::specta]
pub fn clear_user_lora_thumbnail(app: AppHandle, id: String) -> Result<(), String> {
    loras::clear_user_lora_thumbnail(&app, &id)
}
