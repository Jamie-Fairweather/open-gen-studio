mod app_paths;
mod archive_zip;
mod blueprints;
mod comfy;
mod comfy_queue;
mod commands;
mod creator;
mod db;
mod download;
mod download_manager;
mod generate;
mod gpu;
pub mod ipc;
mod job_spawn;
mod json_any;
mod loras;
mod pins;
mod process_cmd;
mod prompt_tools;
mod providers;
mod recipe;
mod secrets;
mod spellcheck;
mod thumbnails;
mod upscale;

pub use json_any::{JsonMap, JsonValue};

use comfy::ProcessState;
use commands::AppState;
use db::Db;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

fn shutdown_comfy(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let _ = comfy::stop(&state.processes);
    // Keep DB in sync so next launch doesn't think Comfy is still running.
    let Ok(db) = state.db.lock() else {
        return;
    };
    let Ok(Some(rt)) = db.get_runtime_by_engine(comfy::ENGINE) else {
        return;
    };
    if rt.status == "running" || rt.status == "starting" {
        let _ = db.update_runtime_status(&rt.id, "ready", rt.port, None);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Avoid Windows "python313.dll was not found" message boxes hanging install.
    process_cmd::suppress_win32_error_dialogs();
    let builder = commands::specta_builder();

    #[cfg(debug_assertions)]
    {
        // Avoid exporting into a path that Next.js hot-reloads on every keystroke
        // during `tauri dev` - prefer `npm run ipc:types` / the unit test.
        // Uncomment to auto-export on each debug launch:
        // let _ = ipc::export_typescript_bindings();
    }

    #[allow(unused_mut)]
    let mut tauri_builder = tauri::Builder::default();

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        // Don't persist visibility — `visible: false` in tauri.conf is for splash
        // handoff; restoring a hidden window makes fresh Store installs look dead.
        use tauri_plugin_window_state::{Builder as WindowStateBuilder, StateFlags};
        tauri_builder = tauri_builder.plugin(
            WindowStateBuilder::default()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        );
    }

    tauri_builder
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let data_dir = app_paths::app_data_dir(app.handle())?;
            log::info!(
                "app data dir ({}): {}",
                app_paths::APP_DATA_FOLDER,
                data_dir.display()
            );
            let db = Db::open(&data_dir)?;
            download::migrate_and_load_provider_tokens(&db);
            app.manage(AppState {
                db: Mutex::new(db),
                processes: Mutex::new(ProcessState::default()),
                cancelled_jobs: Mutex::new(Default::default()),
                paused_jobs: Mutex::new(Default::default()),
                active_generate_jobs: std::sync::Arc::new(Mutex::new(Default::default())),
            });

            // Background job threads do not survive process exit — rehydrate instead.
            if let Err(e) = job_spawn::rehydrate_jobs_on_startup(app.handle()) {
                log::warn!("job rehydrate: {e}");
            }

            // Restore remote model sizes so installed blueprints look ready immediately.
            blueprints::load_remote_size_cache(app.handle());

            download_manager::start_worker(app.handle().clone());

            // Gallery / previews / tmp / user blueprints live under the human-readable data dir.
            let canonical_data = data_dir.canonicalize().unwrap_or(data_dir);
            let _ = app
                .asset_protocol_scope()
                .allow_directory(&canonical_data, true);

            // Stale live-preview frames from crashed/interrupted jobs.
            generate::clear_preview_dir(app.handle());

            // Blueprint thumbnails (Official + user app-data).
            if let Ok(dir) = blueprints::official_dir(app.handle()) {
                let canonical = dir.canonicalize().unwrap_or(dir);
                let _ = app.asset_protocol_scope().allow_directory(&canonical, true);
            }
            if let Ok(dir) = blueprints::user_dir(app.handle()) {
                let canonical = dir.canonicalize().unwrap_or(dir);
                let _ = app.asset_protocol_scope().allow_directory(&canonical, true);
            }
            if let Ok(dir) = loras::user_dir(app.handle()) {
                let canonical = dir.canonicalize().unwrap_or(dir);
                let _ = app.asset_protocol_scope().allow_directory(&canonical, true);
            }

            // Auto-install ComfyUI portable in the background - most Blueprints need it.
            // Skips when mixed GPU vendors and no gpu_vendor setting yet (user must pick).
            // Also waits until the user has confirmed a data folder (or legacy data exists).
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(800));
                let locator = match app_paths::locator_dir(&handle) {
                    Ok(p) => p,
                    Err(_) => return,
                };
                if !app_paths::storage_chosen(&locator) {
                    return;
                }
                let state = handle.state::<AppState>();
                let needs = commands::comfy_needs_install(&handle, &state).unwrap_or(true);
                if needs {
                    let _ = commands::enqueue_comfy_install(&handle, &state, false);
                }
            });

            // Window starts `visible: false` (splash). Fresh installs (Store cert) have no
            // window-state file — without an explicit show the process looks crashed.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if app_paths::is_move_in_progress() {
                    api.prevent_close();
                    let _ = window.app_handle().emit(
                        "data-dir://close-blocked",
                        "Wait for the data folder move to finish before closing.",
                    );
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                shutdown_comfy(app);
            }
        });
}
