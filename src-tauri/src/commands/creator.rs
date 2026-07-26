use super::state::AppState;
use crate::creator::{
    self, BindableInput, CapturedWorkflow, EmbeddedModel, SuggestedControl, SuggestedModel,
};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub fn creator_ensure_comfy(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    creator::ensure_comfy_url(&app, &state.db, &state.processes)
}

#[tauri::command]
pub async fn creator_open_comfy(app: AppHandle) -> Result<String, String> {
    // reqwest::blocking (health/start) must not run on the async runtime.
    let app_ensure = app.clone();
    let url = tauri::async_runtime::spawn_blocking(move || {
        let state = app_ensure.state::<AppState>();
        creator::ensure_comfy_url(&app_ensure, &state.db, &state.processes)
    })
    .await
    .map_err(|e| format!("failed to start ComfyUI: {e}"))??;

    creator::open_comfy_window(app, url.clone()).await?;
    Ok(url)
}

#[tauri::command]
pub async fn creator_capture_workflow(app: AppHandle) -> Result<CapturedWorkflow, String> {
    creator::capture_workflow(app).await
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagingSuggestions {
    pub models: Vec<SuggestedModel>,
    pub controls: Vec<SuggestedControl>,
    pub bindable_inputs: Vec<BindableInput>,
}

#[tauri::command]
pub fn creator_suggest_packaging(
    workflow: Value,
    embedded_models: Option<Vec<EmbeddedModel>>,
) -> Result<PackagingSuggestions, String> {
    let mut embedded = embedded_models.unwrap_or_default();
    // File imports of Comfy UI-format JSON may carry URLs on nodes.
    if embedded.is_empty() {
        embedded = creator::extract_embedded_from_ui(&workflow);
    }
    let bindable_inputs = creator::list_bindable_inputs(&workflow);
    let mut models = creator::suggest_models(&workflow, &embedded);
    creator::mark_gated_models(&mut models);
    Ok(PackagingSuggestions {
        models,
        controls: creator::suggest_controls_from_bindable(&bindable_inputs),
        bindable_inputs,
    })
}
