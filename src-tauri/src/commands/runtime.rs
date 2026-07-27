use super::state::AppState;
use super::util::now_secs;
use crate::comfy;
use crate::db::RuntimeInstall;
use crate::download_manager::{self, DownloadSpec, EnsureOpts};
use crate::prompt_tools;
use crate::upscale;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager, State};

#[tauri::command]
#[specta::specta]
pub fn list_runtimes(state: State<'_, AppState>) -> Result<Vec<RuntimeInstall>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_runtimes()
}

/// Returns immediately with status=installing; heavy work runs on a background thread.
/// Always force-reinstalls the **pinned** portable (Settings → Reinstall).
#[tauri::command]
#[specta::specta]
pub fn install_comfyui(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<RuntimeInstall, String> {
    enqueue_comfy_install(&app, &state, true)
}

pub fn comfy_needs_install(state: &AppState) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    match db.get_runtime_by_engine(comfy::ENGINE)? {
        Some(r) => {
            let path = Path::new(&r.install_path);
            let path_ok = !r.install_path.is_empty()
                && path.join("ComfyUI").is_dir()
                && path.join("python_embeded").join("python.exe").is_file();
            let pin_ok = path_ok && comfy::portable_pin_matches(path);
            // "installing" after a crash means a stalled job — retry.
            // Pin mismatch → migrate to the version this app release requires.
            Ok(!path_ok || !pin_ok || r.status == "error" || r.status == "installing")
        }
        None => Ok(true),
    }
}

/// `force` = wipe/reinstall even when already on the pin (user Reinstall).
pub fn enqueue_comfy_install(
    app: &AppHandle,
    state: &AppState,
    force: bool,
) -> Result<RuntimeInstall, String> {
    if !force {
        let _ = download_manager::ensure(
            app,
            DownloadSpec::Runtime {
                engine: comfy::ENGINE.into(),
            },
            EnsureOpts { wait: false },
        )?;
        let db = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(r) = db.get_runtime_by_engine(comfy::ENGINE)? {
            return Ok(r);
        }
        // Row may appear after install completes; return a placeholder installing row.
        return Ok(RuntimeInstall {
            id: uuid::Uuid::new_v4().to_string(),
            engine: comfy::ENGINE.into(),
            version: comfy::pinned_version().into(),
            install_path: String::new(),
            port: Some(comfy::DEFAULT_PORT as i64),
            status: "installing".into(),
            error: None,
            created_at: now_secs(),
            updated_at: now_secs(),
        });
    }

    {
        let mut busy = state.comfy_install_busy.lock().map_err(|e| e.to_string())?;
        if *busy {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            if let Some(r) = db.get_runtime_by_engine(comfy::ENGINE)? {
                return Ok(r);
            }
            return Err("ComfyUI install already in progress".into());
        }
        *busy = true;
    }

    let existing = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
    };

    let installing = if let Some(runtime) = existing.clone() {
        let updated = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.update_runtime_status(&runtime.id, "installing", None, None)?
        };
        let _ = app.emit("runtimes://updated", &updated);
        updated
    } else {
        let row = RuntimeInstall {
            id: uuid::Uuid::new_v4().to_string(),
            engine: comfy::ENGINE.into(),
            version: comfy::pinned_version().into(),
            install_path: String::new(),
            port: Some(comfy::DEFAULT_PORT as i64),
            status: "installing".into(),
            error: None,
            created_at: now_secs(),
            updated_at: now_secs(),
        };
        {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.upsert_runtime(&row)?;
        }
        let _ = app.emit("runtimes://updated", &row);
        row
    };

    let app_bg = app.clone();
    let job = installing.clone();
    std::thread::spawn(move || {
        let result = comfy::install_portable(&app_bg, Some(&job), force);
        let state = app_bg.state::<AppState>();
        match result {
            Ok(runtime) => {
                if let Ok(db) = state.db.lock() {
                    let _ = db.upsert_runtime(&runtime);
                }
                let _ = app_bg.emit("runtimes://updated", &runtime);
                let _ = app_bg.emit(
                    "runtimes://progress",
                    comfy::RuntimeProgress {
                        engine: comfy::ENGINE.into(),
                        stage: "done".into(),
                        message: format!("ComfyUI {} ready", comfy::pinned_version()),
                    },
                );
            }
            Err(err) => {
                let failed = if let Ok(db) = state.db.lock() {
                    db.update_runtime_status(&job.id, "error", None, Some(&err))
                        .unwrap_or_else(|_| RuntimeInstall {
                            id: job.id.clone(),
                            engine: comfy::ENGINE.into(),
                            version: job.version.clone(),
                            install_path: String::new(),
                            port: job.port,
                            status: "error".into(),
                            error: Some(err.clone()),
                            created_at: job.created_at,
                            updated_at: now_secs(),
                        })
                } else {
                    RuntimeInstall {
                        id: job.id.clone(),
                        engine: comfy::ENGINE.into(),
                        version: job.version.clone(),
                        install_path: String::new(),
                        port: job.port,
                        status: "error".into(),
                        error: Some(err.clone()),
                        created_at: job.created_at,
                        updated_at: now_secs(),
                    }
                };
                let _ = app_bg.emit("runtimes://updated", &failed);
                let _ = app_bg.emit(
                    "runtimes://progress",
                    comfy::RuntimeProgress {
                        engine: comfy::ENGINE.into(),
                        stage: "error".into(),
                        message: err,
                    },
                );
            }
        }
        {
            let mut busy = state.comfy_install_busy.lock().ok();
            if let Some(ref mut b) = busy {
                **b = false;
            }
        }
    });

    Ok(installing)
}

/// Spawns ComfyUI and returns immediately; health wait runs in a background thread.
#[tauri::command]
#[specta::specta]
pub fn start_comfyui(app: AppHandle, state: State<'_, AppState>) -> Result<RuntimeInstall, String> {
    let runtime = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
            .ok_or_else(|| "ComfyUI is not installed".to_string())?
    };
    if runtime.install_path.is_empty()
        || runtime.status == "error"
        || runtime.status == "installing"
    {
        return Err("ComfyUI install is not ready — run install first".into());
    }
    if (runtime.status == "starting" || runtime.status == "running")
        && comfy::is_process_alive(&state.processes)?
    {
        return Ok(runtime);
    }

    let port = runtime.port.unwrap_or(comfy::DEFAULT_PORT as i64) as u16;
    comfy::start(&app, &state.processes, &runtime, port)?;

    let starting = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_runtime_status(&runtime.id, "starting", Some(port as i64), None)?
    };
    let _ = app.emit("runtimes://updated", &starting);
    let _ = app.emit(
        "runtimes://progress",
        comfy::RuntimeProgress {
            engine: comfy::ENGINE.into(),
            stage: "start".into(),
            message: "Waiting for runtime…".into(),
        },
    );

    let app_bg = app.clone();
    let runtime_id = runtime.id.clone();
    std::thread::spawn(move || {
        let state = app_bg.state::<AppState>();
        match comfy::wait_until_healthy(port, 60) {
            Ok(()) => {
                if let Ok(db) = state.db.lock() {
                    if let Ok(updated) =
                        db.update_runtime_status(&runtime_id, "running", Some(port as i64), None)
                    {
                        let _ = app_bg.emit("runtimes://updated", &updated);
                    }
                }
                let _ = app_bg.emit(
                    "runtimes://progress",
                    comfy::RuntimeProgress {
                        engine: comfy::ENGINE.into(),
                        stage: "ready".into(),
                        message: "Runtime is ready".into(),
                    },
                );
            }
            Err(err) => {
                let _ = comfy::stop(&state.processes);
                if let Ok(db) = state.db.lock() {
                    if let Ok(updated) = db.update_runtime_status(
                        &runtime_id,
                        "error",
                        Some(port as i64),
                        Some(&err),
                    ) {
                        let _ = app_bg.emit("runtimes://updated", &updated);
                    }
                }
                let _ = app_bg.emit(
                    "runtimes://progress",
                    comfy::RuntimeProgress {
                        engine: comfy::ENGINE.into(),
                        stage: "error".into(),
                        message: err,
                    },
                );
            }
        }
    });

    Ok(starting)
}

#[tauri::command]
#[specta::specta]
pub fn stop_comfyui(app: AppHandle, state: State<'_, AppState>) -> Result<RuntimeInstall, String> {
    comfy::stop(&state.processes)?;
    let runtime = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
            .ok_or_else(|| "ComfyUI is not installed".to_string())?
    };
    let updated = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_runtime_status(&runtime.id, "ready", runtime.port, None)?
    };
    let _ = app.emit("runtimes://updated", &updated);
    Ok(updated)
}

#[tauri::command]
#[specta::specta]
pub fn comfyui_status(state: State<'_, AppState>) -> Result<crate::ipc::ComfyStatus, String> {
    let runtime = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
    };
    let process_alive = comfy::is_process_alive(&state.processes)?;
    let port = runtime
        .as_ref()
        .and_then(|r| r.port)
        .unwrap_or(comfy::DEFAULT_PORT as i64) as u16;
    let healthy = if process_alive {
        comfy::health(port)?
    } else {
        false
    };

    Ok(crate::ipc::ComfyStatus {
        process_alive,
        healthy,
        port,
        runtime,
    })
}

/// Expected vs installed pins for ComfyUI + managed custom nodes (Settings).
#[tauri::command]
#[specta::specta]
pub fn runtime_pins_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<crate::pins::RuntimePinsStatus, String> {
    let runtime = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
    };
    Ok(crate::pins::RuntimePinsStatus {
        comfy: comfy::comfy_pin_status(&app, runtime.as_ref()),
        nodes: upscale::managed_nodes_pin_status(&app),
    })
}

#[tauri::command]
#[specta::specta]
pub fn free_comfy_vram(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    prompt_tools::free_comfy_vram(&app, &state.db, &state.processes)
}
