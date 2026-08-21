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

/// Microsoft VC++ Redistributable (x64) — needed on clean PCs for portable Python.
pub const VC_REDIST_X64_URL: &str = "https://aka.ms/vs/17/release/vc_redist.x64.exe";

/// PyPI pin matching ComfyUI `v0.28.0` `manager_requirements.txt`.
/// Used when the portable archive omits that file.
pub const COMFY_MANAGER_PIP_SPEC: &str = "comfyui_manager==4.2.2";

/// Marker file written into the portable root after a successful pin install.
pub const COMFY_PIN_MARKER: &str = ".oga_comfy_pin";

/// Written into each managed custom-node folder after a successful zip/git pin install.
pub const NODE_PIN_MARKER: &str = ".oga_node_pin";

/// Nested git submodule a managed node needs before Comfy can import it.
/// GitHub commit zips omit submodule contents — we fetch these separately.
#[derive(Debug, Clone, Copy)]
pub struct NodeSubmodule {
    pub path: &'static str,
    pub repo: &'static str,
    pub commit: &'static str,
    /// File that must exist under `path` after install (Comfy import needs it).
    pub ready_file: &'static str,
}

#[derive(Debug, Clone, Copy)]
pub struct NodePin {
    pub id: &'static str,
    pub folder: &'static str,
    pub repo: &'static str,
    /// Full git commit SHA.
    pub commit: &'static str,
    pub submodules: &'static [NodeSubmodule],
}

impl NodePin {
    /// True when every pinned submodule payload is on disk.
    pub fn submodules_ready(&self, dest: &std::path::Path) -> bool {
        self.submodules
            .iter()
            .all(|sub| dest.join(sub.path).join(sub.ready_file).is_file())
    }
}

/// App-managed custom nodes. Checkout these SHAs only - never default-branch tip.
pub const MANAGED_NODES: &[NodePin] = &[
    NodePin {
        id: "usdu",
        folder: "ComfyUI_UltimateSDUpscale",
        repo: "https://github.com/ssitu/ComfyUI_UltimateSDUpscale.git",
        // Includes UltimateSDUpscaleGuider (2026-06-22).
        commit: "a5547db9e1d07d3318bb21e9e9c474f4c1e9c8df",
        submodules: &[NodeSubmodule {
            path: "repositories/ultimate_sd_upscale",
            repo: "https://github.com/Coyote-A/ultimate-upscale-for-automatic1111.git",
            // gitlink at the USDU pin above.
            commit: "2322caa480535b1011a1f9c18126d85ea444f146",
            ready_file: "scripts/ultimate-upscale.py",
        }],
    },
    NodePin {
        id: "supir",
        folder: "ComfyUI-SUPIR",
        repo: "https://github.com/kijai/ComfyUI-SUPIR.git",
        commit: "99d49e912c905ce1aaf7d15898f550b40fb3e6cc",
        submodules: &[],
    },
    NodePin {
        id: "qwenvl",
        folder: "ComfyUI-QwenVL",
        repo: "https://github.com/1038lab/ComfyUI-QwenVL.git",
        // Qwen3-VL GGUF + Prompt Enhancer nodes (2026-07).
        commit: "c522c43b15618a4d5c92b2500105ee2a65527f95",
        submodules: &[],
    },
];

/// Workflow `class_type` → managed pin id. Every custom class we emit must be here.
pub const MANAGED_NODE_CLASSES: &[(&str, &str)] = &[
    ("UltimateSDUpscale", "usdu"),
    ("UltimateSDUpscaleGuider", "usdu"),
    ("SUPIR_Upscale", "supir"),
    ("AILab_QwenVL", "qwenvl"),
    ("AILab_QwenVL_PromptEnhancer", "qwenvl"),
];

pub fn node_pin(id: &str) -> Option<&'static NodePin> {
    MANAGED_NODES.iter().find(|p| p.id == id)
}

pub fn pin_id_for_class(class_type: &str) -> Option<&'static str> {
    MANAGED_NODE_CLASSES
        .iter()
        .find(|(class, _)| *class == class_type)
        .map(|(_, id)| *id)
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

/// Pin ids required by a compiled Comfy graph (each managed class_type once).
pub fn managed_pin_ids_for_workflow(workflow: &serde_json::Value) -> Vec<&'static str> {
    let mut ids = Vec::new();
    let Some(obj) = workflow.as_object() else {
        return ids;
    };
    for node in obj.values() {
        let Some(class) = node.get("class_type").and_then(|v| v.as_str()) else {
            continue;
        };
        if let Some(id) = pin_id_for_class(class) {
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
    }
    ids
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn every_managed_class_maps_to_a_pin() {
        for (class, pin_id) in MANAGED_NODE_CLASSES {
            assert!(
                node_pin(pin_id).is_some(),
                "{class} maps to unknown pin {pin_id}"
            );
        }
        for pin in MANAGED_NODES {
            assert!(
                MANAGED_NODE_CLASSES.iter().any(|(_, id)| *id == pin.id),
                "pin {} has no workflow class_type — install would skip a pack the app ships",
                pin.id
            );
        }
    }

    #[test]
    fn usdu_pin_is_incomplete_without_submodule_script() {
        let pin = node_pin("usdu").expect("usdu pin");
        let tmp = std::env::temp_dir().join(format!(
            "ogs-usdu-payload-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("time")
                .as_nanos()
        ));
        let script_dir = tmp.join("repositories/ultimate_sd_upscale/scripts");
        std::fs::create_dir_all(&script_dir).expect("mkdir");
        assert!(
            !pin.submodules_ready(&tmp),
            "empty submodule dir must not count as ready"
        );
        std::fs::write(script_dir.join("ultimate-upscale.py"), b"# fixture\n").expect("write");
        assert!(pin.submodules_ready(&tmp));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn ultimatesdupscale_graph_requires_usdu_pin() {
        let g = json!({ "201": { "class_type": "UltimateSDUpscale" } });
        assert_eq!(managed_pin_ids_for_workflow(&g), ["usdu"]);
    }

    #[test]
    fn every_managed_class_is_detected_in_a_graph() {
        for (class, pin_id) in MANAGED_NODE_CLASSES {
            let g = json!({ "n": { "class_type": class } });
            assert_eq!(
                managed_pin_ids_for_workflow(&g),
                [*pin_id],
                "{class} must require {pin_id}"
            );
        }
    }
}
