//! Closed set of recipe architecture ids (compiler + UI allowlist).
//! Exported to TypeScript via Specta / tauri-specta.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Supported recipe graph families. Manifests still store `arch` as a string;
/// parse into this enum at compile / UI boundaries.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
pub enum RecipeArch {
    #[serde(rename = "z-image")]
    ZImage,
    #[serde(rename = "krea2")]
    Krea2,
    #[serde(rename = "flux")]
    Flux,
    #[serde(rename = "flux2")]
    Flux2,
    #[serde(rename = "ideogram4")]
    Ideogram4,
    #[serde(rename = "sdxl")]
    Sdxl,
    #[serde(rename = "sd15")]
    Sd15,
}

impl RecipeArch {
    pub const ALL: &[RecipeArch] = &[
        Self::ZImage,
        Self::Krea2,
        Self::Flux,
        Self::Flux2,
        Self::Ideogram4,
        Self::Sdxl,
        Self::Sd15,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::ZImage => "z-image",
            Self::Krea2 => "krea2",
            Self::Flux => "flux",
            Self::Flux2 => "flux2",
            Self::Ideogram4 => "ideogram4",
            Self::Sdxl => "sdxl",
            Self::Sd15 => "sd15",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "z-image" => Some(Self::ZImage),
            "krea2" => Some(Self::Krea2),
            "flux" => Some(Self::Flux),
            "flux2" => Some(Self::Flux2),
            "ideogram4" => Some(Self::Ideogram4),
            "sdxl" => Some(Self::Sdxl),
            "sd15" => Some(Self::Sd15),
            _ => None,
        }
    }

    pub fn supported_list() -> String {
        Self::ALL
            .iter()
            .map(|a| a.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    }
}

impl std::fmt::Display for RecipeArch {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}
