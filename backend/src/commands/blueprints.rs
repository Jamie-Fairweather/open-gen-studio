use super::state::AppState;
use crate::blueprints::{
    self, Blueprint, BlueprintDetail, ModelEntry, ModelFileEntry, RecipeCapabilities,
};
use crate::download;
use crate::download_manager::{self, DownloadSpec, EnsureOpts};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, State};

#[tauri::command]
#[specta::specta]
pub fn list_official_blueprints(app: AppHandle) -> Result<Vec<Blueprint>, String> {
    list_blueprints(app)
}

#[tauri::command]
#[specta::specta]
pub fn list_blueprints(app: AppHandle) -> Result<Vec<Blueprint>, String> {
    // Instant: manifests + local sizes (+ cached remote sizes). Network probe is async.
    let list = blueprints::list_blueprints(&app, false)?;
    blueprints::enqueue_size_probe(&app);
    Ok(list)
}

#[tauri::command]
#[specta::specta]
pub fn get_official_blueprint(app: AppHandle, id: String) -> Result<BlueprintDetail, String> {
    blueprints::get_detail(&app, &id)
}

#[tauri::command]
#[specta::specta]
pub fn get_blueprint(app: AppHandle, id: String) -> Result<BlueprintDetail, String> {
    blueprints::get_detail(&app, &id)
}

#[derive(Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SaveUserBlueprintArgs {
    pub id: String,
    pub name: String,
    pub category: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub runtime: String,
    #[serde(default)]
    pub models: Vec<ModelEntry>,
    #[serde(default)]
    pub flow_type: String,
    pub arch: crate::recipe::RecipeArch,
    #[serde(default)]
    pub sampler: String,
    #[serde(default)]
    pub scheduler: String,
    #[serde(default)]
    pub capabilities: RecipeCapabilities,
    #[serde(default)]
    #[specta(type = specta_typescript::Any)]
    pub defaults: serde_json::Map<String, Value>,
}

#[tauri::command]
#[specta::specta]
pub fn save_user_blueprint(app: AppHandle, args: SaveUserBlueprintArgs) -> Result<String, String> {
    let dir = blueprints::save_user_blueprint(
        &app,
        &args.id,
        &args.name,
        &args.category,
        &args.description,
        &args.runtime,
        args.models,
        &args.flow_type,
        args.arch.as_str(),
        &args.sampler,
        &args.scheduler,
        args.capabilities,
        args.defaults,
    )?;
    Ok(dir.display().to_string())
}

#[tauri::command]
#[specta::specta]
pub fn delete_user_blueprint(app: AppHandle, id: String) -> Result<(), String> {
    blueprints::delete_user_blueprint(&app, &id)
}

#[tauri::command]
#[specta::specta]
pub fn open_user_blueprints_dir(app: AppHandle) -> Result<String, String> {
    blueprints::open_user_blueprints_dir(&app)
}

/// Enqueue blueprint install via Download Manager (soft / non-blocking).
#[tauri::command]
#[specta::specta]
pub fn install_official_blueprint(
    app: AppHandle,
    _state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let _ = download_manager::ensure(
        &app,
        DownloadSpec::Blueprint { id },
        EnsureOpts {
            wait: false,
            ..Default::default()
        },
    )?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn cancel_blueprint_install(app: AppHandle) -> Result<(), String> {
    if let Ok(snap) = download_manager::snapshot(&app) {
        if let Some(active) = snap.active {
            return download_manager::cancel_job(&app, &active.id);
        }
    }
    download::request_cancel();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn list_model_files(app: AppHandle) -> Result<Vec<ModelFileEntry>, String> {
    blueprints::list_model_files(&app)
}

#[tauri::command]
#[specta::specta]
pub fn open_models_dir(app: AppHandle) -> Result<String, String> {
    blueprints::open_models_dir(&app)
}
