use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Blueprint {
    pub id: String,
    pub name: String,
    pub category: String,
    pub description: String,
    pub runtime: String,
    /// `"official"` | `"user"`
    pub source: String,
    pub minimum_vram_gb: Option<u32>,
    pub model_count: u32,
    pub models_ready: u32,
    /// Sum of remote Content-Lengths when probes succeed.
    pub total_size_bytes: Option<u64>,
    /// Bytes already on disk for this blueprint's models.
    pub local_size_bytes: u64,
    pub dir: String,
    /// Absolute path to `thumbnail.png` / `.jpg` / `.webp` when present.
    pub thumbnail_path: Option<String>,
    /// True if any model URL is a gated Hugging Face repo (token required).
    #[serde(default)]
    pub requires_hf_token: bool,
    /// True if any model URL is from CivitAI (API key required).
    #[serde(default)]
    pub requires_civitai_token: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintProgress {
    pub blueprint_id: String,
    pub stage: String,
    pub message: String,
    pub model_index: u32,
    pub model_total: u32,
    /// Current model filename when stage is download/skip/missing.
    #[serde(default)]
    pub filename: Option<String>,
    /// Bytes already accounted for (completed models, or offset before the current file).
    #[serde(default)]
    pub downloaded: Option<u64>,
    /// Expected total bytes for all models in this install (when known).
    #[serde(default)]
    pub total: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintControl {
    pub id: String,
    #[serde(rename = "type")]
    pub control_type: String,
    pub node_id: String,
    pub input: String,
    #[serde(default)]
    pub label: String,
    #[serde(default = "default_group")]
    pub group: String,
    #[serde(default)]
    #[specta(type = specta_typescript::Any)]
    pub default: Option<serde_json::Value>,
}

fn default_group() -> String {
    "default".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintModelInfo {
    pub filename: String,
    pub path: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub gated: bool,
    #[serde(default)]
    pub role: String,
    /// True when the file is already usable in the shared models library.
    pub ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintDetail {
    pub id: String,
    pub name: String,
    pub category: String,
    pub description: String,
    pub runtime: String,
    pub minimum_vram_gb: Option<u32>,
    pub model_count: u32,
    pub models_ready: u32,
    pub controls: Vec<BlueprintControl>,
    #[serde(default)]
    pub flow_type: String,
    #[serde(default)]
    pub arch: String,
    #[serde(default)]
    pub capabilities: RecipeCapabilities,
    /// `"official"` | `"user"`
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub sampler: String,
    #[serde(default)]
    pub scheduler: String,
    #[serde(default)]
    pub models: Vec<BlueprintModelInfo>,
    #[serde(default)]
    #[specta(type = specta_typescript::Any)]
    pub defaults: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, Type)]
#[serde(rename_all = "camelCase")]
pub struct RecipeCapabilities {
    #[serde(default)]
    pub negative: bool,
    #[serde(default)]
    pub loras: bool,
    #[serde(default)]
    pub controlnet: bool,
    #[serde(default)]
    pub upscale: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ManifestFile {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) category: String,
    #[serde(default)]
    pub(crate) description: String,
    pub(crate) runtime: String,
    pub(crate) minimum_vram_gb: Option<u32>,
    #[serde(default)]
    pub(crate) models: Vec<ModelEntry>,
    #[serde(default)]
    pub(crate) custom_nodes: Vec<CustomNodeDep>,
    #[serde(default)]
    pub(crate) flow_type: String,
    #[serde(default)]
    pub(crate) arch: String,
    #[serde(default)]
    pub(crate) sampler: String,
    #[serde(default)]
    pub(crate) scheduler: String,
    #[serde(default)]
    pub(crate) capabilities: RecipeCapabilities,
    #[serde(default)]
    pub(crate) defaults: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ModelEntry {
    pub filename: String,
    pub path: String,
    /// Empty = local-only (no download).
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub sha256: Option<String>,
    /// Hugging Face gated repo - anonymous download returns 401.
    #[serde(default)]
    pub gated: bool,
    /// Recipe role: `unet` | `unet_uncond` | `vae` | `text_encoder` | `checkpoint` | …
    #[serde(default)]
    pub role: String,
}

/// ComfyUI custom node repo to clone into `ComfyUI/custom_nodes/<name>`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomNodeDep {
    pub name: String,
    /// Git clone URL (https://github.com/…/….git).
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ModelFileEntry {
    pub relative_path: String,
    pub bytes: u64,
}
