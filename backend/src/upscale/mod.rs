//! Shared Official upscale models (SR weights) + USDU / SUPIR generative paths.
//! SR files: `models/upscale_models/`. SUPIR + companion SDXL: `models/checkpoints/`.

mod catalog;
mod compile;
mod install;
mod nodes;
mod types;

#[allow(unused_imports)]
pub use catalog::{http_files, list_upscalers, node_pin_for_download};
#[allow(unused_imports)]
pub use compile::{parse_upscale_opts, resolve_for_generate};
#[allow(unused_imports)]
pub use install::install_upscaler;
#[allow(unused_imports)]
pub use nodes::{
    ensure_managed_nodes, ensure_pinned_custom_node, ensure_pinned_node, ensure_supir_custom_node,
    ensure_usdu_custom_node, managed_node_at_pin, managed_nodes_pin_status, supir_at_pin,
    supir_installed, usdu_at_pin, usdu_installed,
};
#[allow(unused_imports)]
pub use types::{
    UpscaleCompileOpts, UpscaleKind, UpscaleModelInfo, UpscaleProgress, DEFAULT_UPSCALE_ID,
    SUPIR_NODE_NAME, SUPIR_SDXL_FILENAME, USDU_NODE_NAME,
};
