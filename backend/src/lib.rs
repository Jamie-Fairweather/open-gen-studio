mod app_paths;
mod blueprints;
mod comfy;
mod commands;
mod creator;
mod db;
mod download;
mod download_manager;
mod generate;
mod gpu;
pub mod ipc;
mod json_any;
mod loras;
mod pins;
mod process_cmd;
mod prompt_tools;
mod providers;
mod recipe;
mod upscale;

pub use json_any::{JsonMap, JsonValue};

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
    let builder = commands::specta_builder();

    #[cfg(debug_assertions)]
    {
        // Avoid exporting into a path that Next.js hot-reloads on every keystroke
        // during `tauri dev` - prefer `npm run ipc:types` / the unit test.
        // Uncomment to auto-export on each debug launch:
        // let _ = ipc::export_typescript_bindings();
    }

    tauri::Builder::default()
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
            let db = Db::open(&data_dir)?;
            if let Ok(token) = db.get_setting(download::SETTING_HF_TOKEN) {
                download::set_stored_hf_token(token);
            }
            if let Ok(token) = db.get_setting(download::SETTING_CIVITAI_TOKEN) {
                download::set_stored_civitai_token(token);
            }
            app.manage(AppState {
                db: Mutex::new(db),
                processes: Mutex::new(ProcessState::default()),
                comfy_install_busy: Mutex::new(false),
                cancelled_jobs: Mutex::new(Default::default()),
            });

            // Restore remote model sizes so installed blueprints look ready immediately.
            blueprints::load_remote_size_cache(app.handle());

            download_manager::start_worker(app.handle().clone());

            // Gallery / previews / user blueprints live under the human-readable data dir.
            let canonical_data = data_dir.canonicalize().unwrap_or(data_dir);
            let _ = app
                .asset_protocol_scope()
                .allow_directory(&canonical_data, true);

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
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(800));
                let state = handle.state::<AppState>();
                let needs = commands::comfy_needs_install(&state).unwrap_or(true);
                if needs {
                    let _ = commands::enqueue_comfy_install(&handle, &state, false);
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                shutdown_comfy(app);
            }
        });
}
