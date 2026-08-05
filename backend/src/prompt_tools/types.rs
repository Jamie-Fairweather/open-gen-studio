//! Shared types and QwenVL model constants for Prompt Tools.

use crate::recipe::RecipeArch;
use serde::{Deserialize, Serialize};
use specta::Type;

/// Shared Qwen3-VL-8B (HF transformers, 4-bit) for Image→Prompt + Prompt Enhancer.
/// GGUF/llama-cpp was tried first but hard-crashed Comfy on CUDA load (cu131 wheel vs cu130 torch).
pub const QWENVL_MODEL_ID: &str = "qwen3-vl-8b";
pub(crate) const QWENVL_MODEL_NAME: &str = "Qwen3-VL-8B-Instruct";
pub(crate) const QWENVL_HF_REPO: &str = "Qwen/Qwen3-VL-8B-Instruct";
pub(crate) const QWENVL_QUANT: &str = "4-bit (VRAM-friendly)";

/// HF hub files for Qwen3-VL-8B-Instruct (skip README / .gitattributes).
pub const QWENVL_HF_FILES: &[&str] = &[
    "chat_template.json",
    "config.json",
    "generation_config.json",
    "merges.txt",
    "model-00001-of-00004.safetensors",
    "model-00002-of-00004.safetensors",
    "model-00003-of-00004.safetensors",
    "model-00004-of-00004.safetensors",
    "model.safetensors.index.json",
    "preprocessor_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "video_preprocessor_config.json",
    "vocab.json",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PromptFormat {
    General,
    Structured,
    #[serde(rename = "graphicDesign")]
    GraphicDesign,
    Json,
}

impl PromptFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            PromptFormat::General => "general",
            PromptFormat::Structured => "structured",
            PromptFormat::GraphicDesign => "graphicDesign",
            PromptFormat::Json => "json",
        }
    }

    pub(crate) fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "general" => Ok(Self::General),
            "structured" => Ok(Self::Structured),
            "graphicDesign" | "graphic_design" | "graphic-design" => Ok(Self::GraphicDesign),
            "json" => Ok(Self::Json),
            other => Err(format!("unknown prompt format: {other}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PromptTarget {
    Auto,
    Flux,
    StableDiffusion,
    Ideogram,
    #[serde(rename = "zImageKrea")]
    ZImageKrea,
    #[serde(rename = "qwenImage")]
    QwenImage,
}

impl PromptTarget {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Flux => "flux",
            Self::StableDiffusion => "stableDiffusion",
            Self::Ideogram => "ideogram",
            Self::ZImageKrea => "zImageKrea",
            Self::QwenImage => "qwenImage",
        }
    }

    pub(crate) fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "auto" => Ok(Self::Auto),
            "flux" => Ok(Self::Flux),
            "stableDiffusion" | "sd" | "sdxl" | "sd15" | "pony" | "illustrious" => {
                Ok(Self::StableDiffusion)
            }
            "ideogram" => Ok(Self::Ideogram),
            "zImageKrea" | "z-image" | "krea" | "krea2" => Ok(Self::ZImageKrea),
            "qwenImage" | "qwen-image" | "qwen" => Ok(Self::QwenImage),
            other => Err(format!("unknown prompt target: {other}")),
        }
    }

    pub(crate) fn resolve(self, arch: Option<&str>) -> Self {
        if self != PromptTarget::Auto {
            return self;
        }
        let s = arch.unwrap_or("").to_ascii_lowercase();
        match RecipeArch::parse(&s) {
            Some(RecipeArch::Flux | RecipeArch::Flux2 | RecipeArch::Chroma) => PromptTarget::Flux,
            Some(
                RecipeArch::Sdxl | RecipeArch::Sd15 | RecipeArch::Pony | RecipeArch::Illustrious,
            ) => PromptTarget::StableDiffusion,
            Some(RecipeArch::Ideogram4) => PromptTarget::Ideogram,
            Some(RecipeArch::QwenImage) => PromptTarget::QwenImage,
            Some(RecipeArch::ZImage | RecipeArch::Krea2) => PromptTarget::ZImageKrea,
            Some(RecipeArch::Sd35) => PromptTarget::StableDiffusion,
            None => match s.as_str() {
                "sd" => PromptTarget::StableDiffusion,
                "ideogram" => PromptTarget::Ideogram,
                "krea" => PromptTarget::ZImageKrea,
                "qwen" | "qwen-image" => PromptTarget::QwenImage,
                _ => PromptTarget::Flux,
            },
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Provider {
    QwenVl,
}

impl Provider {
    pub(crate) fn pin_id(self) -> &'static str {
        "qwenvl"
    }

    pub(crate) fn id(self) -> &'static str {
        "qwenvl"
    }
}

pub(crate) fn provider_for_format(_format: PromptFormat) -> Provider {
    Provider::QwenVl
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PromptToolWeightInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub ready: bool,
    pub provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PromptToolResult {
    pub prompt: String,
    pub negative: Option<String>,
    pub provider: String,
    pub format: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RunImageToPromptArgs {
    pub image_path: String,
    pub format: String,
    pub target: String,
    pub arch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RunPromptEnhanceArgs {
    pub prompt: String,
    pub target: String,
    pub arch: Option<String>,
    pub mode: Option<String>,
}

/// `restart_comfy` - caller should bounce the runtime so new pip packages / nodes load.
pub struct EnsureOutcome {
    pub restart_comfy: bool,
}
