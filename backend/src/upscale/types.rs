use serde::{Deserialize, Serialize};
use specta::Type;

pub const USDU_NODE_NAME: &str = "ComfyUI_UltimateSDUpscale";
pub const SUPIR_NODE_NAME: &str = "ComfyUI-SUPIR";
pub const DEFAULT_UPSCALE_ID: &str = "4x-nomos2-hq-dat2";

/// SDXL checkpoint SUPIR merges with (shared companion, not blueprint-owned).
pub const SUPIR_SDXL_FILENAME: &str = "sd_xl_base_1.0.safetensors";
pub(crate) const SUPIR_SDXL_URL: &str =
    "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum UpscaleKind {
    Sr,
    Supir,
}

impl UpscaleKind {
    pub fn as_str(self) -> &'static str {
        match self {
            UpscaleKind::Sr => "sr",
            UpscaleKind::Supir => "supir",
        }
    }

    pub(crate) fn from_str(s: &str) -> Self {
        match s {
            "supir" => UpscaleKind::Supir,
            _ => UpscaleKind::Sr,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpscaleModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub filename: String,
    pub url: String,
    pub scale: u32,
    pub kind: UpscaleKind,
    pub ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpscaleProgress {
    pub model_id: String,
    pub stage: String,
    pub message: String,
    #[serde(default)]
    pub filename: Option<String>,
}

#[derive(Debug, Clone)]
pub struct UpscaleCompileOpts {
    pub filename: String,
    pub scale: u32,
    pub kind: UpscaleKind,
    pub usdu: bool,
    pub sdxl_filename: Option<String>,
    /// Explicit USDU enlarge (2 or 4). None → arch default (2×).
    pub usdu_scale: Option<u32>,
    pub usdu_steps: Option<i64>,
    pub usdu_denoise: Option<f64>,
}
