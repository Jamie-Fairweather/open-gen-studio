use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedModel {
    pub filename: String,
    pub path: String,
    #[serde(default)]
    pub url: String,
    /// True when the download URL is a gated Hugging Face repo (needs token).
    #[serde(default)]
    pub gated: bool,
}

/// Model download metadata embedded in ComfyUI workflows / node properties
/// (same source as the Missing Models "Copy URL" / Download buttons).
#[derive(Debug, Clone, Serialize, Deserialize, Default, Type)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedModel {
    pub name: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub directory: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CapturedWorkflow {
    #[specta(type = specta_typescript::Any)]
    pub workflow: Value,
    #[serde(default)]
    pub embedded_models: Vec<EmbeddedModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedControl {
    pub id: String,
    #[serde(rename = "type")]
    pub control_type: String,
    #[serde(default)]
    pub node_id: String,
    #[serde(default)]
    pub input: String,
    pub label: String,
    pub group: String,
    #[serde(default)]
    #[specta(type = specta_typescript::Any)]
    pub default: Option<Value>,
    /// Pre-checked in the Save dialog.
    pub include: bool,
    /// Required for the blueprint - locked in the Save dialog (always saved).
    #[serde(default)]
    pub fixed: bool,
}

/// Scalar widget input on a Comfy API workflow node (bindable to a UI slot).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BindableInput {
    pub node_id: String,
    pub input: String,
    pub class_type: String,
    /// "number" | "string" | "boolean"
    pub kind: String,
    #[specta(type = specta_typescript::Any)]
    pub current: Value,
    #[serde(default)]
    pub title: Option<String>,
}
