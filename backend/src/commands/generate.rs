use super::state::AppState;
use crate::blueprints;
use crate::comfy;
use crate::comfy_queue;
use crate::db::Job;
use crate::generate;
use tauri::{AppHandle, Emitter, Manager, State};

/// Queue a generate job: returns immediately, runs Comfy /prompt when the slot is free.
#[tauri::command]
#[specta::specta]
pub fn generate_image(
    app: AppHandle,
    state: State<'_, AppState>,
    blueprint_id: String,
    values: crate::JsonMap,
) -> Result<Job, String> {
    let values = values.0;
    let runtime = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
            .ok_or_else(|| "ComfyUI is not installed - open Settings to install".to_string())?
    };
    if runtime.install_path.is_empty()
        || runtime.status == "error"
        || runtime.status == "installing"
    {
        return Err("ComfyUI install is not ready - open Settings".into());
    }

    let detail = blueprints::get_detail(&app, &blueprint_id)?;
    if detail.model_count > 0 && detail.models_ready < detail.model_count {
        return Err(format!(
            "Install blueprint models first ({}/{})",
            detail.models_ready, detail.model_count
        ));
    }

    let params = serde_json::json!({
        "blueprintId": blueprint_id,
        "values": values,
    })
    .to_string();

    let label = if detail.name.is_empty() {
        "Generate image".into()
    } else {
        detail.name.clone()
    };

    let job = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.create_job("generate", &params)?
    };
    let _ = app.emit("jobs://updated", &job);

    {
        let mut cancelled = state.cancelled_jobs.lock().map_err(|e| e.to_string())?;
        cancelled.remove(&job.id);
    }
    let active_jobs = state.active_generate_jobs.clone();
    {
        let mut active = active_jobs.lock().map_err(|e| e.to_string())?;
        active.insert(job.id.clone());
    }

    let app_bg = app.clone();
    let job_bg = job.clone();
    let runtime_bg = runtime.clone();
    let blueprint_id_bg = blueprint_id.clone();
    std::thread::spawn(move || {
        struct ActiveGuard(
            std::sync::Arc<std::sync::Mutex<std::collections::HashSet<String>>>,
            String,
        );
        impl Drop for ActiveGuard {
            fn drop(&mut self) {
                if let Ok(mut active) = self.0.lock() {
                    active.remove(&self.1);
                }
            }
        }
        let _active = ActiveGuard(active_jobs, job_bg.id.clone());

        let state = app_bg.state::<AppState>();
        let result = comfy_queue::run_with_slot(&app_bg, &job_bg.id, "generate", &label, || {
            generate::run_generate(
                &app_bg,
                &state.db,
                &state.processes,
                &state.cancelled_jobs,
                &job_bg,
                &blueprint_id_bg,
                values,
                &runtime_bg,
            )
        });

        let updated = match result {
            Ok(_) => {
                if let Ok(db) = state.db.lock() {
                    db.update_job_status(&job_bg.id, "completed", None).ok()
                } else {
                    None
                }
            }
            Err(err) if err == "cancelled" => {
                let _ = app_bg.emit(
                    "jobs://progress",
                    serde_json::json!({
                        "jobId": job_bg.id,
                        "stage": "cancelled",
                        "message": "Cancelled",
                    }),
                );
                if let Ok(db) = state.db.lock() {
                    db.update_job_status(&job_bg.id, "cancelled", Some("Cancelled by user"))
                        .ok()
                } else {
                    None
                }
            }
            Err(err) => {
                let _ = app_bg.emit(
                    "jobs://progress",
                    serde_json::json!({
                        "jobId": job_bg.id,
                        "stage": "error",
                        "message": err,
                    }),
                );
                if let Ok(db) = state.db.lock() {
                    db.update_job_status(&job_bg.id, "failed", Some(&err)).ok()
                } else {
                    None
                }
            }
        };
        if let Ok(mut cancelled) = state.cancelled_jobs.lock() {
            cancelled.remove(&job_bg.id);
        }
        generate::cleanup_job_previews(&app_bg, &job_bg.id);
        if let Some(job) = updated {
            let _ = app_bg.emit("jobs://updated", &job);
        }
    });

    Ok(job)
}

#[tauri::command]
#[specta::specta]
pub fn cancel_job(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<Job, String> {
    {
        let mut cancelled = state.cancelled_jobs.lock().map_err(|e| e.to_string())?;
        cancelled.insert(id.clone());
    }
    comfy_queue::release(&app, &id);

    let port = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
            .and_then(|r| r.port)
            .unwrap_or(comfy::DEFAULT_PORT as i64) as u16
    };
    let _ = generate::interrupt(port);

    let job = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_job_status(&id, "cancelled", Some("Cancelled by user"))?
    };
    let _ = app.emit("jobs://updated", &job);
    let _ = app.emit(
        "jobs://progress",
        serde_json::json!({
            "jobId": id,
            "stage": "cancelled",
            "message": "Cancelled",
        }),
    );
    Ok(job)
}

#[tauri::command]
#[specta::specta]
pub fn list_job_queue() -> Result<crate::ipc::JobQueueSnapshot, String> {
    Ok(comfy_queue::snapshot())
}
