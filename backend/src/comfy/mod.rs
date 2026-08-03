mod install;
mod manager;
mod paths;
mod process;

#[allow(unused_imports)]
pub use install::{
    comfy_pin_status, configure_portable_core, download_portable_archive, effective_gpu_choice,
    extract_portable_core, install_portable, install_portable_core, pinned_version,
    portable_archive_path, portable_kind_for_app, resolve_portable_url,
};
#[allow(unused_imports)]
pub use paths::{
    find_portable_root, models_dir, portable_pin_matches, read_pin_marker, runtimes_dir,
    ProcessState, RuntimeProgress, DEFAULT_PORT, ENGINE,
};

/// Progress for UI during install / start (Downloads panel + settings).
pub fn emit_runtime_progress(app: &tauri::AppHandle, stage: &str, message: &str) {
    paths::emit_progress(app, stage, message);
}
#[allow(unused_imports)]
pub use process::{
    health, is_process_alive, kill_portable_python, start, stop, wait_until_healthy,
};
