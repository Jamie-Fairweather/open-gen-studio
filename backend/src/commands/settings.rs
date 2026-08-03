use super::state::AppState;
use crate::blueprints;
use crate::download;
use crate::gpu::{
    self, GpuVendor, NvidiaVariant, SETTING_GPU_VENDOR, SETTING_NVIDIA_PORTABLE_OVERRIDE,
};
use std::collections::HashMap;
use tauri::{AppHandle, State};

#[tauri::command]
#[specta::specta]
pub fn list_settings(state: State<'_, AppState>) -> Result<HashMap<String, String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok(db.list_settings()?.into_iter().collect())
}

#[tauri::command]
#[specta::specta]
pub fn set_setting(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    if key == SETTING_GPU_VENDOR {
        let vendor =
            GpuVendor::parse(&value).ok_or_else(|| format!("Invalid gpu_vendor: {value}"))?;
        let info = gpu::detect_gpus();
        if info.available && !info.adapters.iter().any(|a| a.vendor == vendor) {
            return Err(format!(
                "GPU vendor {} is not present on this machine",
                vendor.as_str()
            ));
        }
    } else if key == SETTING_NVIDIA_PORTABLE_OVERRIDE {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            let parsed = NvidiaVariant::parse(trimmed).ok_or_else(|| {
                format!(
                    "Invalid nvidia_portable_override: {value} (use {}, {}, or empty)",
                    NvidiaVariant::Modern.as_str(),
                    NvidiaVariant::Cu126.as_str()
                )
            })?;
            let _ = parsed.as_str();
        }
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_setting(&key, &value)?;
    if key == download::SETTING_HF_TOKEN {
        download::set_stored_hf_token(Some(value));
        // Gated sizes often fail HEAD before a token exists - re-probe with auth.
        blueprints::clear_remote_size_cache();
        blueprints::enqueue_size_probe(&app);
    } else if key == download::SETTING_CIVITAI_TOKEN {
        download::set_stored_civitai_token(Some(value));
        blueprints::clear_remote_size_cache();
        blueprints::enqueue_size_probe(&app);
    }
    Ok(())
}
