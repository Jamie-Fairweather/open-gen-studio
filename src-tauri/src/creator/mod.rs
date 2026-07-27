//! Creator Mode: Comfy webview + workflow capture / packaging helpers.

mod controls;
mod models;
mod types;
mod window;

#[allow(unused_imports)]
pub use controls::{list_bindable_inputs, suggest_controls_from_bindable};
pub use models::{extract_embedded_from_ui, mark_gated_models, suggest_models};
pub use types::{BindableInput, CapturedWorkflow, EmbeddedModel, SuggestedControl, SuggestedModel};
#[allow(unused_imports)]
pub use window::{capture_workflow, ensure_comfy_url, open_comfy_window, CREATOR_WINDOW_LABEL};
