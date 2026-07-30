//! Prompt Tools: Image→Prompt + Prompt Enhancer via Comfy utility workflows.
//! Bidirectional VRAM free around runs; text-only history collect (no gallery).

mod embedded;
mod ensure;
mod io;
mod prompts;
mod run;
mod types;
mod workflows;

pub use embedded::read_embedded_prompt;
#[allow(unused_imports)]
pub use ensure::{
    ensure_provider, install_qwenvl_python_deps, list_weights, provider_ready, qwenvl_http_files,
    qwenvl_weights_ready,
};
pub use io::{free_comfy_vram, save_temp_image};
pub use run::{run_image_to_prompt, run_prompt_enhance};
#[allow(unused_imports)]
pub use types::{
    EnsureOutcome, PromptFormat, PromptTarget, PromptToolResult, PromptToolWeightInfo,
    RunImageToPromptArgs, RunPromptEnhanceArgs, QWENVL_HF_FILES, QWENVL_MODEL_ID,
};
