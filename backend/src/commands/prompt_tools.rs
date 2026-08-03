use super::state::AppState;
use crate::comfy_queue;
use crate::db::Job;
use crate::download_manager::{self, DownloadSpec, EnsureOpts};
use crate::prompt_tools::{self, PromptToolResult, PromptToolWeightInfo};
use tauri::{AppHandle, Emitter, Manager, State};

#[tauri::command]
#[specta::specta]
pub fn list_prompt_tool_weights(app: AppHandle) -> Result<Vec<PromptToolWeightInfo>, String> {
    prompt_tools::list_weights(&app)
}

/// Enqueue Prompt Tools provider install via Download Manager.
#[tauri::command]
#[specta::specta]
pub fn ensure_prompt_tools_provider(
    app: AppHandle,
    _state: State<'_, AppState>,
    provider_id: String,
) -> Result<(), String> {
    let _ = download_manager::ensure(
        &app,
        DownloadSpec::PromptTools {
            provider: provider_id,
        },
        EnsureOpts {
            wait: false,
            ..Default::default()
        },
    )?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn save_temp_tool_image(app: AppHandle, bytes: Vec<u8>, ext: String) -> Result<String, String> {
    prompt_tools::save_temp_image(&app, bytes, &ext)
}

/// Queue image→prompt utility job; returns job immediately; result via jobs://progress.
#[tauri::command]
#[specta::specta]
pub fn run_image_to_prompt(
    app: AppHandle,
    state: State<'_, AppState>,
    args: prompt_tools::RunImageToPromptArgs,
) -> Result<Job, String> {
    let runtime = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(crate::comfy::ENGINE)?
            .ok_or_else(|| "ComfyUI is not installed - open Settings to install".to_string())?
    };
    if runtime.install_path.is_empty()
        || runtime.status == "error"
        || runtime.status == "installing"
    {
        return Err("ComfyUI install is not ready - open Settings".into());
    }

    let params = serde_json::to_string(&args).unwrap_or_else(|_| "{}".into());
    let job = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.create_job("prompt-tool", &params)?
    };
    let _ = app.emit("jobs://updated", &job);
    {
        let mut cancelled = state.cancelled_jobs.lock().map_err(|e| e.to_string())?;
        cancelled.remove(&job.id);
    }

    let app_bg = app.clone();
    let job_bg = job.clone();
    let runtime_bg = runtime.clone();
    std::thread::spawn(move || {
        let state = app_bg.state::<AppState>();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            comfy_queue::run_with_slot(
                &app_bg,
                &job_bg.id,
                "prompt-tool",
                "Image to Prompt",
                || {
                    prompt_tools::run_image_to_prompt(
                        &app_bg,
                        &state.db,
                        &state.processes,
                        &state.cancelled_jobs,
                        &job_bg,
                        &args,
                        &runtime_bg,
                    )
                },
            )
        }))
        .unwrap_or_else(|_| Err("Prompt Tools worker crashed".into()));
        finish_prompt_tool_job(&app_bg, &state, &job_bg, result);
    });

    Ok(job)
}

#[tauri::command]
#[specta::specta]
pub fn run_prompt_enhance(
    app: AppHandle,
    state: State<'_, AppState>,
    args: prompt_tools::RunPromptEnhanceArgs,
) -> Result<Job, String> {
    let runtime = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(crate::comfy::ENGINE)?
            .ok_or_else(|| "ComfyUI is not installed - open Settings to install".to_string())?
    };
    if runtime.install_path.is_empty()
        || runtime.status == "error"
        || runtime.status == "installing"
    {
        return Err("ComfyUI install is not ready - open Settings".into());
    }

    let params = serde_json::to_string(&args).unwrap_or_else(|_| "{}".into());
    let job = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.create_job("prompt-tool", &params)?
    };
    let _ = app.emit("jobs://updated", &job);
    {
        let mut cancelled = state.cancelled_jobs.lock().map_err(|e| e.to_string())?;
        cancelled.remove(&job.id);
    }

    let app_bg = app.clone();
    let job_bg = job.clone();
    let runtime_bg = runtime.clone();
    std::thread::spawn(move || {
        let state = app_bg.state::<AppState>();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            comfy_queue::run_with_slot(
                &app_bg,
                &job_bg.id,
                "prompt-tool",
                "Prompt Enhancer",
                || {
                    prompt_tools::run_prompt_enhance(
                        &app_bg,
                        &state.db,
                        &state.processes,
                        &state.cancelled_jobs,
                        &job_bg,
                        &args,
                        &runtime_bg,
                    )
                },
            )
        }))
        .unwrap_or_else(|_| Err("Prompt Tools worker crashed".into()));
        finish_prompt_tool_job(&app_bg, &state, &job_bg, result);
    });

    Ok(job)
}

fn finish_prompt_tool_job(
    app: &AppHandle,
    state: &AppState,
    job: &Job,
    result: Result<PromptToolResult, String>,
) {
    let updated = match result {
        Ok(payload) => {
            let _ = app.emit(
                "jobs://progress",
                serde_json::json!({
                    "jobId": job.id,
                    "stage": "done",
                    "message": "Done",
                    "result": payload,
                }),
            );
            if let Ok(db) = state.db.lock() {
                db.update_job_status(&job.id, "completed", None).ok()
            } else {
                None
            }
        }
        Err(err) if err == "cancelled" => {
            let _ = app.emit(
                "jobs://progress",
                serde_json::json!({
                    "jobId": job.id,
                    "stage": "cancelled",
                    "message": "Cancelled",
                }),
            );
            if let Ok(db) = state.db.lock() {
                db.update_job_status(&job.id, "cancelled", Some("Cancelled by user"))
                    .ok()
            } else {
                None
            }
        }
        Err(err) => {
            let _ = app.emit(
                "jobs://progress",
                serde_json::json!({
                    "jobId": job.id,
                    "stage": "error",
                    "message": err,
                }),
            );
            if let Ok(db) = state.db.lock() {
                db.update_job_status(&job.id, "failed", Some(&err)).ok()
            } else {
                None
            }
        }
    };
    if let Ok(mut cancelled) = state.cancelled_jobs.lock() {
        cancelled.remove(&job.id);
    }
    if let Some(job) = updated {
        let _ = app.emit("jobs://updated", &job);
    }
}
