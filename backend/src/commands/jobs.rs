use super::gallery::remove_gallery_files;
use super::state::AppState;
use crate::comfy;
use crate::comfy_queue;
use crate::db::Job;
use crate::generate;
use crate::ipc::JobHistoryItem;
use crate::job_spawn;
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

#[tauri::command]
#[specta::specta]
pub fn list_job_history(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<JobHistoryItem>, String> {
    let (jobs, gallery_by_job) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let jobs = db.list_history_jobs()?;
        let mut gallery_by_job: std::collections::HashMap<String, Vec<_>> =
            std::collections::HashMap::new();
        for item in db.list_gallery_with_job()? {
            if let Some(job_id) = item.job_id.clone() {
                gallery_by_job.entry(job_id).or_default().push(item);
            }
        }
        (jobs, gallery_by_job)
    };
    let mut gallery_by_job = gallery_by_job;
    let mut label_cache: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let mut out = Vec::with_capacity(jobs.len());
    for job in jobs {
        let gallery_items = gallery_by_job.remove(&job.id).unwrap_or_default();
        let label = job_spawn::label_for_job_cached(&app, &job, &mut label_cache);
        out.push(JobHistoryItem {
            job_id: job.id,
            kind: job.kind,
            label,
            status: job.status,
            error: job.error,
            params_json: job.params_json,
            created_at: job.created_at,
            updated_at: job.updated_at,
            gallery_items,
        });
    }
    Ok(out)
}

#[tauri::command]
#[specta::specta]
pub fn pause_job(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<Job, String> {
    let snap = comfy_queue::snapshot();
    let active = snap.items.first();
    let is_running = active
        .map(|i| i.job_id == id && i.status == "running")
        .unwrap_or(false);
    let is_paused = active
        .map(|i| i.job_id == id && i.status == "paused")
        .unwrap_or(false);
    if is_paused {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        return db
            .get_job(&id)?
            .ok_or_else(|| format!("job not found: {id}"));
    }
    if !is_running {
        return Err("only the running job can be paused".into());
    }

    {
        let mut paused = state.paused_jobs.lock().map_err(|e| e.to_string())?;
        paused.insert(id.clone());
    }
    {
        let mut cancelled = state.cancelled_jobs.lock().map_err(|e| e.to_string())?;
        cancelled.insert(id.clone());
    }

    let port = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
            .and_then(|r| r.port)
            .unwrap_or(comfy::DEFAULT_PORT as i64) as u16
    };
    let _ = generate::interrupt(port);

    let job = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_job_status(&id, "paused", None)?
    };
    let _ = app.emit("jobs://updated", &job);
    let _ = app.emit(
        "jobs://progress",
        serde_json::json!({
            "jobId": id,
            "stage": "paused",
            "message": "Paused",
        }),
    );
    Ok(job)
}

#[tauri::command]
#[specta::specta]
pub fn resume_job(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<Job, String> {
    let job = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_job(&id)?
            .ok_or_else(|| format!("job not found: {id}"))?
    };
    if job.status != "paused" {
        return Err("job is not paused".into());
    }

    let _ = comfy_queue::take_paused_holder(&app, &id);
    {
        let mut paused = state.paused_jobs.lock().map_err(|e| e.to_string())?;
        paused.remove(&id);
    }
    {
        let mut cancelled = state.cancelled_jobs.lock().map_err(|e| e.to_string())?;
        cancelled.remove(&id);
    }

    let job = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_job_status(&id, "queued", None)?
    };
    let _ = app.emit("jobs://updated", &job);

    job_spawn::spawn_existing_job(&app, &job, true)?;
    Ok(job)
}

#[tauri::command]
#[specta::specta]
pub fn reorder_job_queue(
    app: AppHandle,
    state: State<'_, AppState>,
    ordered_ids: Vec<String>,
) -> Result<crate::ipc::JobQueueSnapshot, String> {
    comfy_queue::reorder_waiting(&app, &ordered_ids)?;
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.set_queue_orders(&ordered_ids)?;
    }
    Ok(comfy_queue::snapshot())
}

#[tauri::command]
#[specta::specta]
pub fn clear_job_queue(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let mut ids: Vec<String> = comfy_queue::snapshot()
        .items
        .into_iter()
        .map(|i| i.job_id)
        .collect();
    // Also cancel durable active rows — covers UI/memory drift after a missed queue event.
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        for job in db.list_active_jobs()? {
            if !ids.iter().any(|id| id == &job.id) {
                ids.push(job.id);
            }
        }
    }

    // Mark every id cancelled *before* freeing the lane. Cancelling one-by-one via
    // release() lets the next waiting job promote and briefly reappear in the UI.
    {
        let mut paused = state.paused_jobs.lock().map_err(|e| e.to_string())?;
        for id in &ids {
            paused.remove(id);
        }
    }
    {
        let mut cancelled = state.cancelled_jobs.lock().map_err(|e| e.to_string())?;
        for id in &ids {
            cancelled.insert(id.clone());
        }
    }

    // One empty snapshot — no intermediate "next job is running" emit.
    comfy_queue::clear_all(&app);

    let port = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
            .and_then(|r| r.port)
            .unwrap_or(comfy::DEFAULT_PORT as i64) as u16
    };
    let _ = generate::interrupt(port);

    for id in &ids {
        if let Ok(db) = state.db.lock() {
            if let Ok(job) = db.update_job_status(id, "cancelled", Some("Cancelled by user")) {
                let _ = app.emit("jobs://updated", &job);
            }
        }
        let _ = app.emit(
            "jobs://progress",
            serde_json::json!({
                "jobId": id,
                "stage": "cancelled",
                "message": "Cancelled",
            }),
        );
    }
    if !ids.is_empty() {
        let _ = app.emit("jobs://history", true);
    }
    Ok(())
}

fn delete_history_inner(
    app: &AppHandle,
    state: &AppState,
    id: &str,
    delete_gallery: bool,
) -> Result<(), String> {
    let gallery_items = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        if delete_gallery {
            db.delete_gallery_by_job(id)?
        } else {
            db.clear_gallery_job_link(id)?;
            vec![]
        }
    };

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        if !db.delete_job_by_id_if_history(id)? {
            return Err("history job not found".into());
        }
    }

    for item in gallery_items {
        let _ = app.emit("gallery://deleted", &item.id);
        std::thread::spawn(move || {
            remove_gallery_files(&item);
        });
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn delete_job_history_item(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    delete_gallery: bool,
) -> Result<(), String> {
    delete_history_inner(&app, &state, &id, delete_gallery)?;
    let _ = app.emit("jobs://history", true);
    Ok(())
}

/// Remove cancelled / failed history rows only. Completed jobs are never bulk-deleted.
#[tauri::command]
#[specta::specta]
pub fn clear_job_history(
    app: AppHandle,
    state: State<'_, AppState>,
    delete_gallery: bool,
) -> Result<(), String> {
    let ids: Vec<String> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.list_history_jobs()?
            .into_iter()
            .filter(|j| j.status == "cancelled" || j.status == "failed")
            .map(|j| j.id)
            .collect()
    };
    for id in ids {
        let _ = delete_history_inner(&app, &state, &id, delete_gallery);
    }
    let _ = app.emit("jobs://history", true);
    Ok(())
}
