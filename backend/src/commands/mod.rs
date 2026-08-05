//! Tauri IPC command handlers, split by domain (mirrors `providers/` layout).

mod blueprints;
mod creator;
mod data_dir;
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
// Used from `lib.rs` setup (outside this module).
pub use runtime::{comfy_needs_install, enqueue_comfy_install};

/// Specta + tauri-specta builder: typed commands and TypeScript export.
///
/// Must live here so `collect_commands!` can see private command modules.
pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        // Match existing `host.ts` / Tauri invoke: errors throw, not Result unions.
        .error_handling(tauri_specta::ErrorHandlingMode::Throw)
        .commands(tauri_specta::collect_commands![
            settings::list_settings,
            settings::set_setting,
            settings::set_provider_token,
            settings::clear_provider_token,
            settings::provider_token_status,
            data_dir::get_data_dir_info,
            data_dir::pick_data_dir,
            data_dir::is_data_dir_moving,
            data_dir::set_data_dir,
            data_dir::open_data_dir,
            data_dir::relaunch_app,
            jobs::list_jobs,
            jobs::create_job,
            jobs::update_job_status,
            jobs::list_job_history,
            jobs::pause_job,
            jobs::resume_job,
            jobs::reorder_job_queue,
            jobs::clear_job_queue,
            jobs::delete_job_history_item,
            jobs::clear_job_history,
            gallery::list_gallery,
            gallery::add_gallery_item,
            gallery::delete_gallery_item,
            gallery::reveal_gallery_item,
            gallery::copy_gallery_image_to_clipboard,
            util::detect_gpu,
            util::spellcheck_suggestions,
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
            blueprints::uninstall_blueprint,
            blueprints::cancel_blueprint_install,
            loras::list_loras,
            loras::get_lora,
            loras::install_lora_variant,
            loras::uninstall_lora_variant,
            loras::save_user_lora,
            loras::delete_user_lora,
            loras::open_user_loras_dir,
            loras::set_user_lora_thumbnail,
            loras::clear_user_lora_thumbnail,
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
            blueprints::set_user_blueprint_thumbnail,
            blueprints::clear_user_blueprint_thumbnail,
            util::open_external_url,
            creator::creator_ensure_comfy,
            creator::creator_open_comfy,
            creator::creator_capture_workflow,
            creator::creator_suggest_packaging,
            downloads::resolve_model_url,
            downloads::expand_civitai_lora_url,
            generate::generate_image,
            generate::cancel_job,
            generate::list_job_queue,
            runtime::free_comfy_vram,
            prompt_tools::list_prompt_tool_weights,
            prompt_tools::ensure_prompt_tools_provider,
            downloads::ensure_download,
            downloads::list_downloads,
            downloads::pause_download,
            downloads::resume_download,
            downloads::cancel_download,
            prompt_tools::save_temp_tool_image,
            prompt_tools::run_image_to_prompt,
            prompt_tools::run_prompt_enhance,
        ])
        // Not all of these appear in command signatures (events / allowlists).
        .typ::<crate::recipe::RecipeArch>()
        .typ::<crate::prompt_tools::PromptFormat>()
        .typ::<crate::prompt_tools::PromptTarget>()
        .typ::<crate::ipc::JobProgress>()
        .typ::<crate::ipc::JobQueueItem>()
        .typ::<crate::ipc::JobQueueSnapshot>()
        .typ::<crate::ipc::JobHistoryItem>()
        .typ::<crate::ipc::LoraProgress>()
        .typ::<crate::ipc::PromptToolsProgress>()
        .typ::<crate::ipc::ComfyStatus>()
        .typ::<crate::blueprints::BlueprintProgress>()
        .typ::<crate::upscale::UpscaleProgress>()
        .typ::<crate::download::DownloadProgress>()
        .typ::<crate::comfy::RuntimeProgress>()
        .typ::<crate::app_paths::DataDirProgress>()
}
