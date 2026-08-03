//! Pinned ComfyUI portable + managed custom-node versions.
//!
//! Bump these only with an app release, then smoke Official recipes against the set.
//! No tip-of-tree /releases/latest downloads for managed deps.

use serde::{Deserialize, Serialize};
use specta::Type;

/// ComfyUI Windows portable pin (release tag). Bump all vendor URLs together.
pub const COMFY_PINNED_VERSION: &str = "v0.28.0";

pub const COMFY_NVIDIA_PORTABLE_URL: &str = concat!(
    "https://github.com/comfyanonymous/ComfyUI/releases/download/",
    "v0.28.0",
    "/ComfyUI_windows_portable_nvidia.7z"
);

pub const COMFY_NVIDIA_CU126_PORTABLE_URL: &str = concat!(
    "https://github.com/comfyanonymous/ComfyUI/releases/download/",
    "v0.28.0",
    "/ComfyUI_windows_portable_nvidia_cu126.7z"
);

pub const COMFY_AMD_PORTABLE_URL: &str = concat!(
    "https://github.com/comfyanonymous/ComfyUI/releases/download/",
    "v0.28.0",
    "/ComfyUI_windows_portable_amd.7z"
);

pub const COMFY_INTEL_PORTABLE_URL: &str = concat!(
    "https://github.com/comfyanonymous/ComfyUI/releases/download/",
    "v0.28.0",
    "/ComfyUI_windows_portable_intel.7z"
);

/// Marker file written into the portable root after a successful pin install.
pub const COMFY_PIN_MARKER: &str = ".oga_comfy_pin";

#[derive(Debug, Clone, Copy)]
pub struct NodePin {
    pub id: &'static str,
    pub folder: &'static str,
    pub repo: &'static str,
    /// Full git commit SHA.
    pub commit: &'static str,
}

/// App-managed custom nodes. Checkout these SHAs only - never default-branch tip.
pub const MANAGED_NODES: &[NodePin] = &[
    NodePin {
        id: "usdu",
        folder: "ComfyUI_UltimateSDUpscale",
        repo: "https://github.com/ssitu/ComfyUI_UltimateSDUpscale.git",
        // Includes UltimateSDUpscaleGuider (2026-06-22).
        commit: "a5547db9e1d07d3318bb21e9e9c474f4c1e9c8df",
    },
    NodePin {
        id: "supir",
        folder: "ComfyUI-SUPIR",
        repo: "https://github.com/kijai/ComfyUI-SUPIR.git",
        commit: "99d49e912c905ce1aaf7d15898f550b40fb3e6cc",
    },
    NodePin {
        id: "qwenvl",
        folder: "ComfyUI-QwenVL",
        repo: "https://github.com/1038lab/ComfyUI-QwenVL.git",
        // Qwen3-VL GGUF + Prompt Enhancer nodes (2026-07).
        commit: "c522c43b15618a4d5c92b2500105ee2a65527f95",
    },
];

pub fn node_pin(id: &str) -> Option<&'static NodePin> {
    MANAGED_NODES.iter().find(|p| p.id == id)
}

pub fn short_sha(sha: &str) -> &str {
    if sha.len() >= 7 {
        &sha[..7]
    } else {
        sha
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PinStatus {
    pub id: String,
    pub expected: String,
    pub installed: Option<String>,
    pub matches: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePinsStatus {
    pub comfy: PinStatus,
    pub nodes: Vec<PinStatus>,
}
