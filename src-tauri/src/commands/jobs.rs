use super::state::AppState;
use crate::db::Job;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
#[specta::specta]
pub fn list_jobs(state: State<'_, AppState>) -> Result<Vec<Job>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_jobs()
}

#[tauri::command]
#[specta::specta]
pub fn create_job(
    app: AppHandle,
    state: State<'_, AppState>,
    kind: String,
    params_json: Option<String>,
) -> Result<Job, String> {
    let params = params_json.unwrap_or_else(|| "{}".into());
    let job = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.create_job(&kind, &params)?
    };
    let _ = app.emit("jobs://updated", &job);
    Ok(job)
}

#[tauri::command]
#[specta::specta]
pub fn update_job_status(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    status: String,
    error: Option<String>,
) -> Result<Job, String> {
    let job = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_job_status(&id, &status, error.as_deref())?
    };
    let _ = app.emit("jobs://updated", &job);
    Ok(job)
}
