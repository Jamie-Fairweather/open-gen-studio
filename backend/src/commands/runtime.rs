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

/// Force-reinstall the pinned portable via the Download Manager (Settings → Reinstall).
/// Already-downloaded archives still appear as a completed download step.
#[tauri::command]
#[specta::specta]
pub fn install_comfyui(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<RuntimeInstall, String> {
    enqueue_comfy_install(&app, &state, true)
}

pub fn comfy_needs_install(app: &AppHandle, state: &AppState) -> Result<bool, String> {
    let kind = match comfy::portable_kind_for_app(app) {
        Ok(k) => k,
        // Mixed vendors unset — wait for first-run picker; do not auto-install.
        Err(_) => return Ok(false),
    };
    let db = state.db.lock().map_err(|e| e.to_string())?;
    match db.get_runtime_by_engine(comfy::ENGINE)? {
        Some(r) => {
            let path = Path::new(&r.install_path);
            let path_ok = !r.install_path.is_empty()
                && path.join("ComfyUI").is_dir()
                && comfy::portable_python_exe(path).is_ok();
            let pin_ok = path_ok && comfy::portable_pin_matches(path, kind.as_str());
            // "installing" after a crash means a stalled job - retry.
            // Pin mismatch → migrate to the version this app release requires.
            Ok(!path_ok || !pin_ok || r.status == "error" || r.status == "installing")
        }
        None => Ok(true),
    }
}

/// `force` = re-run Download Manager steps even when pin already matches (user Reinstall).
/// Jobs always appear in Downloads; HTTP steps mark complete when the archive is cached.
pub fn enqueue_comfy_install(
    app: &AppHandle,
    state: &AppState,
    force: bool,
) -> Result<RuntimeInstall, String> {
    let _ = download_manager::ensure(
        app,
        DownloadSpec::Runtime {
            engine: comfy::ENGINE.into(),
        },
        EnsureOpts { wait: false, force },
    )?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    if let Some(r) = db.get_runtime_by_engine(comfy::ENGINE)? {
        return Ok(r);
    }
    // Row may appear after install completes; return a placeholder installing row.
    Ok(RuntimeInstall {
        id: uuid::Uuid::new_v4().to_string(),
        engine: comfy::ENGINE.into(),
        version: comfy::pinned_version().into(),
        install_path: String::new(),
        port: Some(comfy::DEFAULT_PORT as i64),
        status: "installing".into(),
        error: None,
        created_at: now_secs(),
        updated_at: now_secs(),
    })
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
        return Err("ComfyUI install is not ready - run install first".into());
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
        // Cold start: CUDA + Manager + custom nodes can exceed 2 minutes on VMs.
        match comfy::wait_until_healthy(&state.processes, port, 90) {
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
