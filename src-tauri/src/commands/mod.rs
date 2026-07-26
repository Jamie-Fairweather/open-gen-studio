//! Tauri IPC command handlers, split by domain (mirrors `providers/` layout).

mod blueprints;
mod creator;
mod downloads;
mod gallery;
mod generate;
mod jobs;
mod loras;
mod prompt_tools;
mod runtime;
mod settings;
mod state;
mod upscale;
mod util;

pub use state::AppState;

// Re-exports keep `commands::*` paths stable for callers; invoke_handler uses submodule paths.
#[allow(unused_imports)]
pub use blueprints::{
    cancel_blueprint_install, delete_user_blueprint, get_blueprint, get_official_blueprint,
    install_official_blueprint, list_blueprints, list_model_files, list_official_blueprints,
    open_models_dir, open_user_blueprints_dir, save_user_blueprint, SaveUserBlueprintArgs,
};
#[allow(unused_imports)]
pub use creator::{
    creator_capture_workflow, creator_ensure_comfy, creator_open_comfy, creator_suggest_packaging,
    PackagingSuggestions,
};
#[allow(unused_imports)]
pub use downloads::{
    cancel_download, download_url, ensure_download, list_downloads, pause_download,
    resolve_model_url, resume_download,
};
#[allow(unused_imports)]
pub use gallery::{add_gallery_item, delete_gallery_item, list_gallery};
#[allow(unused_imports)]
pub use generate::{cancel_job, generate_image};
#[allow(unused_imports)]
pub use jobs::{create_job, list_jobs, update_job_status};
#[allow(unused_imports)]
pub use loras::{delete_user_lora, get_lora, install_lora_variant, list_loras, save_user_lora};
#[allow(unused_imports)]
pub use prompt_tools::{
    ensure_prompt_tools_provider, list_prompt_tool_weights, read_image_embedded_prompt,
    run_image_to_prompt, run_prompt_enhance, save_temp_tool_image,
};
#[allow(unused_imports)]
pub use runtime::{
    comfy_needs_install, comfyui_status, enqueue_comfy_install, free_comfy_vram, install_comfyui,
    list_runtimes, runtime_pins_status, start_comfyui, stop_comfyui,
};
#[allow(unused_imports)]
pub use settings::{list_settings, set_setting};
#[allow(unused_imports)]
pub use upscale::{
    ensure_supir_node, ensure_usdu_node, install_upscaler, list_upscalers, supir_node_ready,
    usdu_node_ready,
};
#[allow(unused_imports)]
pub use util::{detect_gpu, open_external_url};

/// All Tauri IPC commands (must live here — `generate_handler!` needs submodule paths).
pub fn invoke_handler() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        settings::list_settings,
        settings::set_setting,
        jobs::list_jobs,
        jobs::create_job,
        jobs::update_job_status,
        gallery::list_gallery,
        gallery::add_gallery_item,
        gallery::delete_gallery_item,
        util::detect_gpu,
        downloads::download_url,
        runtime::list_runtimes,
        runtime::install_comfyui,
        runtime::start_comfyui,
        runtime::stop_comfyui,
        runtime::comfyui_status,
        runtime::runtime_pins_status,
        blueprints::list_official_blueprints,
        blueprints::list_blueprints,
        blueprints::install_official_blueprint,
        blueprints::cancel_blueprint_install,
        loras::list_loras,
        loras::get_lora,
        loras::install_lora_variant,
        loras::save_user_lora,
        loras::delete_user_lora,
        upscale::list_upscalers,
        upscale::install_upscaler,
        upscale::ensure_usdu_node,
        upscale::usdu_node_ready,
        upscale::ensure_supir_node,
        upscale::supir_node_ready,
        blueprints::list_model_files,
        blueprints::open_models_dir,
        blueprints::get_official_blueprint,
        blueprints::get_blueprint,
        blueprints::save_user_blueprint,
        blueprints::delete_user_blueprint,
        blueprints::open_user_blueprints_dir,
        util::open_external_url,
        creator::creator_ensure_comfy,
        creator::creator_open_comfy,
        creator::creator_capture_workflow,
        creator::creator_suggest_packaging,
        downloads::resolve_model_url,
        generate::generate_image,
        generate::cancel_job,
        runtime::free_comfy_vram,
        prompt_tools::list_prompt_tool_weights,
        prompt_tools::ensure_prompt_tools_provider,
        downloads::ensure_download,
        downloads::list_downloads,
        downloads::pause_download,
        downloads::resume_download,
        downloads::cancel_download,
        prompt_tools::read_image_embedded_prompt,
        prompt_tools::save_temp_tool_image,
        prompt_tools::run_image_to_prompt,
        prompt_tools::run_prompt_enhance,
    ]
}
