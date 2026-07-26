use super::state::AppState;
use crate::blueprints;
use crate::download;
use std::collections::HashMap;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_settings(state: State<'_, AppState>) -> Result<HashMap<String, String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok(db.list_settings()?.into_iter().collect())
}

#[tauri::command]
pub fn set_setting(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_setting(&key, &value)?;
    if key == download::SETTING_HF_TOKEN {
        download::set_stored_hf_token(Some(value));
        // Gated sizes often fail HEAD before a token exists — re-probe with auth.
        blueprints::clear_remote_size_cache();
        blueprints::enqueue_size_probe(&app);
    } else if key == download::SETTING_CIVITAI_TOKEN {
        download::set_stored_civitai_token(Some(value));
        blueprints::clear_remote_size_cache();
        blueprints::enqueue_size_probe(&app);
    }
    Ok(())
}
