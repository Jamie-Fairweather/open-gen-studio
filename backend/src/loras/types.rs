//! LoRA pack types (official + user).

use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LoraVariant {
    pub arch: String,
    pub filename: String,
    #[serde(default = "default_loras_path")]
    pub path: String,
    #[serde(default)]
    pub url: String,
}

pub(crate) fn default_loras_path() -> String {
    "loras".into()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LoraManifestFile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub trigger_words: Vec<String>,
    #[serde(default = "default_strength")]
    pub default_strength: f64,
    #[serde(default = "default_strength_min")]
    pub strength_min: f64,
    #[serde(default = "default_strength_max")]
    pub strength_max: f64,
    #[serde(default)]
    pub variants: Vec<LoraVariant>,
}

pub(crate) fn default_strength() -> f64 {
    1.0
}
pub(crate) fn default_strength_min() -> f64 {
    0.0
}
pub(crate) fn default_strength_max() -> f64 {
    2.0
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LoraVariantInfo {
    pub arch: String,
    pub filename: String,
    pub path: String,
    pub url: String,
    pub ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LoraPack {
    pub id: String,
    pub name: String,
    pub description: String,
    /// `"official"` | `"user"`
    pub source: String,
    pub trigger_words: Vec<String>,
    pub default_strength: f64,
    pub strength_min: f64,
    pub strength_max: f64,
    pub arches: Vec<String>,
    pub variants: Vec<LoraVariantInfo>,
    /// Count of variants whose file is on disk.
    pub variants_ready: u32,
    pub variant_count: u32,
    /// Absolute path to pack `thumbnail.*` when present.
    #[serde(default)]
    pub thumbnail_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SaveUserLoraArgs {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub trigger_words: Vec<String>,
    #[serde(default = "default_strength")]
    pub default_strength: f64,
    #[serde(default = "default_strength_min")]
    pub strength_min: f64,
    #[serde(default = "default_strength_max")]
    pub strength_max: f64,
    pub variants: Vec<LoraVariant>,
}
