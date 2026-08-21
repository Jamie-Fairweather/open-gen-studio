mod install;
mod manager;
mod paths;
mod process;
mod vc_redist;

#[allow(unused_imports)]
pub use install::{
    comfy_pin_status, configure_portable_core, download_portable_archive, effective_gpu_choice,
    extract_portable_core, install_portable, install_portable_core, pinned_version,
    portable_archive_path, portable_kind_for_app, resolve_portable_url,
};
pub use manager::ensure_comfy_manager;
#[allow(unused_imports)]
pub use paths::{
    command_portable_python, find_portable_root, live_portable_root, live_portable_root_for_app,
    models_dir, path_too_long_for_pip, portable_pin_matches, portable_python_exe,
    process_portable_root, read_pin_marker, runtimes_dir, stage_requirements_for_pip,
    unblock_embedded_python, ProcessState, RuntimeProgress, DEFAULT_PORT, ENGINE,
};

/// Progress for UI during install / start (Downloads panel + settings).
pub fn emit_runtime_progress(app: &tauri::AppHandle, stage: &str, message: &str) {
    paths::emit_progress(app, stage, message);
}
#[allow(unused_imports)]
pub use process::{
    health, is_process_alive, kill_portable_python, start, stop, wait_until_healthy,
};
