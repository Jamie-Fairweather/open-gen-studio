mod blueprints;
mod comfy;
mod commands;
mod creator;
mod db;
mod download;
mod generate;
mod gpu;

use comfy::ProcessState;
use commands::AppState;
use db::Db;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, RunEvent};

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
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let db = Db::open(&data_dir)?;
            if let Ok(token) = db.get_setting(download::SETTING_HF_TOKEN) {
                download::set_stored_hf_token(token);
            }
            app.manage(AppState {
                db: Mutex::new(db),
                processes: Mutex::new(ProcessState::default()),
                comfy_install_busy: Mutex::new(false),
                blueprint_install_busy: Mutex::new(None),
                cancelled_jobs: Mutex::new(Default::default()),
            });

            // Blueprint thumbnails (Official + user app-data).
            if let Ok(dir) = blueprints::official_dir(app.handle()) {
                let canonical = dir.canonicalize().unwrap_or(dir);
                let _ = app
                    .asset_protocol_scope()
                    .allow_directory(&canonical, true);
            }
            if let Ok(dir) = blueprints::user_dir(app.handle()) {
                let canonical = dir.canonicalize().unwrap_or(dir);
                let _ = app
                    .asset_protocol_scope()
                    .allow_directory(&canonical, true);
            }

            // Auto-install ComfyUI portable in the background — most Blueprints need it.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(800));
                let state = handle.state::<AppState>();
                let needs = commands::comfy_needs_install(&state).unwrap_or(true);
                if needs {
                    let _ = commands::enqueue_comfy_install(&handle, &state);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_settings,
            commands::set_setting,
            commands::list_jobs,
            commands::create_job,
            commands::update_job_status,
            commands::list_gallery,
            commands::add_gallery_item,
            commands::delete_gallery_item,
            commands::detect_gpu,
            commands::download_url,
            commands::list_runtimes,
            commands::install_comfyui,
            commands::start_comfyui,
            commands::stop_comfyui,
            commands::comfyui_status,
            commands::list_official_blueprints,
            commands::list_blueprints,
            commands::install_official_blueprint,
            commands::get_official_blueprint,
            commands::get_blueprint,
            commands::save_user_blueprint,
            commands::delete_user_blueprint,
            commands::open_user_blueprints_dir,
            commands::open_external_url,
            commands::creator_ensure_comfy,
            commands::creator_open_comfy,
            commands::creator_capture_workflow,
            commands::creator_suggest_packaging,
            commands::generate_image,
            commands::cancel_job,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                shutdown_comfy(app);
            }
        });
}
