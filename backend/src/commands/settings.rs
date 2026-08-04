use super::state::AppState;
use crate::blueprints;
use crate::download;
use crate::gpu::{
    self, GpuVendor, NvidiaVariant, SETTING_GPU_VENDOR, SETTING_NVIDIA_PORTABLE_OVERRIDE,
};
use crate::providers::ProviderKind;
use crate::secrets::{self, TokenProvider};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use tauri::{AppHandle, State};

const SECRET_SETTING_KEYS: &[&str] = &[download::SETTING_HF_TOKEN, download::SETTING_CIVITAI_TOKEN];

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTokenStatus {
    pub huggingface: bool,
    pub civitai: bool,
}

fn provider_kind(provider: TokenProvider) -> ProviderKind {
    match provider {
        TokenProvider::HuggingFace => ProviderKind::HuggingFace,
        TokenProvider::CivitAi => ProviderKind::CivitAi,
    }
}

fn refresh_after_token_change(app: &AppHandle) {
    blueprints::clear_remote_size_cache();
    blueprints::enqueue_size_probe(app);
}

#[tauri::command]
#[specta::specta]
pub fn list_settings(state: State<'_, AppState>) -> Result<HashMap<String, String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok(db
        .list_settings()?
        .into_iter()
        .filter(|(key, _)| !SECRET_SETTING_KEYS.contains(&key.as_str()))
        .collect())
}

#[tauri::command]
#[specta::specta]
pub fn set_setting(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    if SECRET_SETTING_KEYS.contains(&key.as_str()) {
        return Err(
            "Provider tokens must be saved with set_provider_token (OS credential store)".into(),
        );
    }

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
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn set_provider_token(
    app: AppHandle,
    provider: TokenProvider,
    value: String,
) -> Result<(), String> {
    secrets::set(provider, &value)?;
    crate::providers::set_stored_token(provider_kind(provider), secrets::get(provider)?);
    refresh_after_token_change(&app);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn clear_provider_token(app: AppHandle, provider: TokenProvider) -> Result<(), String> {
    secrets::delete(provider)?;
    crate::providers::set_stored_token(provider_kind(provider), None);
    refresh_after_token_change(&app);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn provider_token_status() -> Result<ProviderTokenStatus, String> {
    Ok(ProviderTokenStatus {
        huggingface: secrets::has(TokenProvider::HuggingFace),
        civitai: secrets::has(TokenProvider::CivitAi),
    })
}
