use super::state::AppState;
use crate::app_paths::{self, DataDirInfo, DataDirProgress, SetDataDirResult};
use crate::comfy;
use crate::comfy_queue;
use crate::download_manager;
use crate::generate;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

/// Pause studio + download work and stop Comfy so the data root can move safely.
fn prepare_for_relocate(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let _ = app.emit(
        "data-dir://progress",
        DataDirProgress {
            stage: "preparing".into(),
            message: "Pausing queue and stopping ComfyUI…".into(),
            current: 0,
            total: 1,
        },
    );
    pause_all_studio_jobs(app, state)?;
    pause_all_downloads(app)?;
    stop_runtime(app, state)?;
    wait_workers_idle(state, Duration::from_secs(8))?;
    Ok(())
}

fn pause_all_studio_jobs(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let jobs = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.list_active_jobs()?
    };
    if jobs.is_empty() {
        comfy_queue::clear_all(app);
        return Ok(());
    }

    {
        let mut paused = state.paused_jobs.lock().map_err(|e| e.to_string())?;
        for job in &jobs {
            paused.insert(job.id.clone());
        }
    }
    {
        let mut cancelled = state.cancelled_jobs.lock().map_err(|e| e.to_string())?;
        for job in &jobs {
            cancelled.insert(job.id.clone());
        }
    }

    let port = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
            .and_then(|r| r.port)
            .unwrap_or(comfy::DEFAULT_PORT as i64) as u16
    };
    let _ = generate::interrupt(port);

    // Drop in-memory queue immediately so nothing promotes while we stop the runtime.
    comfy_queue::clear_all(app);

    for job in &jobs {
        if job.status == "paused" {
            continue;
        }
        if let Ok(db) = state.db.lock() {
            if let Ok(updated) = db.update_job_status(&job.id, "paused", None) {
                let _ = app.emit("jobs://updated", &updated);
            }
        }
        let _ = app.emit(
            "jobs://progress",
            serde_json::json!({
                "jobId": job.id,
                "stage": "paused",
                "message": "Paused — changing data folder",
            }),
        );
    }
    Ok(())
}

fn pause_all_downloads(app: &AppHandle) -> Result<(), String> {
    let snap = download_manager::snapshot(app)?;
    let mut ids: Vec<String> = Vec::new();
    if let Some(active) = snap.active {
        ids.push(active.id);
    }
    for job in snap.queued {
        ids.push(job.id);
    }
    for id in ids {
        let _ = download_manager::pause_job(app, &id);
    }
    Ok(())
}

fn stop_runtime(app: &AppHandle, state: &AppState) -> Result<(), String> {
    comfy::stop(&state.processes)?;
    let runtime = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
    };
    if let Some(rt) = runtime {
        if matches!(rt.status.as_str(), "running" | "starting") {
            let updated = {
                let db = state.db.lock().map_err(|e| e.to_string())?;
                db.update_runtime_status(&rt.id, "ready", rt.port, None)?
            };
            let _ = app.emit("runtimes://updated", &updated);
        }
    }
    Ok(())
}

fn wait_workers_idle(state: &AppState, timeout: Duration) -> Result<(), String> {
    let started = Instant::now();
    loop {
        let active = state
            .active_generate_jobs
            .lock()
            .map_err(|e| e.to_string())?;
        if active.is_empty() {
            return Ok(());
        }
        if started.elapsed() >= timeout {
            drop(active);
            if let Ok(mut jobs) = state.active_generate_jobs.lock() {
                jobs.clear();
            }
            return Ok(());
        }
        drop(active);
        thread::sleep(Duration::from_millis(100));
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_data_dir_info(app: AppHandle) -> Result<DataDirInfo, String> {
    app_paths::data_dir_info(&app)
}

#[tauri::command]
#[specta::specta]
pub fn pick_data_dir(app: AppHandle) -> Result<Option<String>, String> {
    app_paths::pick_data_dir(&app)
}

#[tauri::command]
#[specta::specta]
pub fn is_data_dir_moving() -> bool {
    app_paths::is_move_in_progress()
}

#[tauri::command]
#[specta::specta]
pub async fn set_data_dir(
    app: AppHandle,
    state: State<'_, AppState>,
    path: Option<String>,
) -> Result<SetDataDirResult, String> {
    let requested = match path {
        None => None,
        Some(p) => {
            let trimmed = p.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(PathBuf::from(trimmed))
            }
        }
    };

    let locator = app_paths::locator_dir(&app)?;
    let current = app_paths::resolve_data_dir(&locator);
    let target = match &requested {
        None => locator.clone(),
        Some(p) => p.clone(),
    };
    let moving = current != target
        && match (current.canonicalize(), target.canonicalize()) {
            (Ok(a), Ok(b)) => a != b,
            _ => true,
        };

    if !moving {
        return app_paths::set_data_dir(&app, requested.as_deref(), false);
    }

    if app_paths::is_move_in_progress() {
        return Err("A data folder move is already in progress".into());
    }
    app_paths::set_move_in_progress(true);

    let prep_result = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || {
            let state = app.state::<AppState>();
            prepare_for_relocate(&app, &state)
        }
    })
    .await
    .map_err(|e| e.to_string());

    if let Err(e) = prep_result {
        app_paths::set_move_in_progress(false);
        return Err(e);
    }
    if let Err(e) = prep_result.unwrap() {
        app_paths::set_move_in_progress(false);
        return Err(e);
    }

    {
        let mut db = state.db.lock().map_err(|e| e.to_string())?;
        if let Err(e) = db.close_disk() {
            app_paths::set_move_in_progress(false);
            return Err(e);
        }
    }

    let move_app = app.clone();
    let requested_clone = requested.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        app_paths::set_data_dir(&move_app, requested_clone.as_deref(), true)
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|inner| inner);

    match &result {
        Ok(r) if r.needs_restart => {
            let _ = app.emit(
                "data-dir://progress",
                DataDirProgress {
                    stage: "done".into(),
                    message: "Move complete — restarting…".into(),
                    current: 1,
                    total: 1,
                },
            );
            // Keep move-in-progress until relaunch exits the process.
        }
        Ok(_) => {
            app_paths::set_move_in_progress(false);
        }
        Err(err) => {
            app_paths::set_move_in_progress(false);
            let _ = app.emit(
                "data-dir://progress",
                DataDirProgress {
                    stage: "error".into(),
                    message: err.clone(),
                    current: 0,
                    total: 1,
                },
            );
        }
    }

    result
}

#[tauri::command]
#[specta::specta]
pub fn open_data_dir(app: AppHandle) -> Result<String, String> {
    app_paths::open_data_dir(&app)
}

#[tauri::command]
#[specta::specta]
pub fn relaunch_app(app: AppHandle) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    // Don't use process_cmd::new — CREATE_NO_WINDOW would hide the relaunched GUI.
    std::process::Command::new(&exe)
        .spawn()
        .map_err(|e| format!("Failed to relaunch: {e}"))?;
    app.exit(0);
    Ok(())
}
