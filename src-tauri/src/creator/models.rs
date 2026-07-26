use crate::creator::types::{EmbeddedModel, SuggestedModel};
use serde_json::Value;
use std::collections::HashSet;

/// Scan API workflow for model loader filenames, filling download URLs from
/// Comfy embedded metadata when available.
pub fn suggest_models(workflow: &Value, embedded: &[EmbeddedModel]) -> Vec<SuggestedModel> {
    let Some(obj) = workflow.as_object() else {
        // UI-format import: still surface models that have URLs.
        return models_from_embedded_only(embedded);
    };

    // Bare API map is keyed by node id; UI save format has a top-level "nodes" array.
    if obj.contains_key("nodes") && !obj.values().any(|v| v.get("class_type").is_some()) {
        let from_ui = extract_embedded_from_ui(workflow);
        let merged = merge_embedded(embedded, &from_ui);
        return suggest_models_from_ui(workflow, &merged);
    }

    let mut seen = HashSet::new();
    let mut out = Vec::new();

    for (_id, node) in obj {
        let class = node
            .get("class_type")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let inputs = node.get("inputs").and_then(|v| v.as_object());
        let Some(inputs) = inputs else { continue };

        let mapping: Option<(&str, &str)> = match class {
            "CheckpointLoaderSimple" => Some(("ckpt_name", "checkpoints")),
            "UNETLoader" | "UnetLoader" | "UnetLoaderGGUF" | "UNETLoaderGGUF" => {
                Some(("unet_name", "diffusion_models"))
            }
            "VAELoader" => Some(("vae_name", "vae")),
            "CLIPLoader"
            | "DualCLIPLoader"
            | "TripleCLIPLoader"
            | "CLIPLoaderGGUF"
            | "DualCLIPLoaderGGUF"
            | "TripleCLIPLoaderGGUF" => None,
            "LoraLoader" | "LoraLoaderModelOnly" => Some(("lora_name", "loras")),
            "ControlNetLoader" => Some(("control_net_name", "controlnet")),
            "UpscaleModelLoader" => Some(("model_name", "upscale_models")),
            _ => None,
        };

        if let Some((key, folder)) = mapping {
            if let Some(filename) = inputs.get(key).and_then(|v| v.as_str()) {
                push_model(&mut seen, &mut out, filename, folder, embedded);
            }
        }

        if matches!(
            class,
            "CLIPLoader"
                | "DualCLIPLoader"
                | "TripleCLIPLoader"
                | "CLIPLoaderGGUF"
                | "DualCLIPLoaderGGUF"
                | "TripleCLIPLoaderGGUF"
        ) {
            for key in ["clip_name", "clip_name1", "clip_name2", "clip_name3"] {
                if let Some(filename) = inputs.get(key).and_then(|v| v.as_str()) {
                    push_model(&mut seen, &mut out, filename, "text_encoders", embedded);
                }
            }
        }
    }

    // Embedded URLs only when that exact file is referenced by a loader input.
    // CivitAI graphs often leave stale properties.models (wrong filename + URL).
    for m in embedded {
        if m.name.is_empty() || m.url.is_empty() {
            continue;
        }
        if !workflow_references_model_file(workflow, &m.name) {
            continue;
        }
        let path = if m.directory.is_empty() {
            guess_folder_from_name(&m.name)
        } else {
            normalize_model_dir(&m.directory)
        };
        push_model(&mut seen, &mut out, &m.name, &path, embedded);
    }

    out
}

fn workflow_references_model_file(workflow: &Value, filename: &str) -> bool {
    let base = filename.rsplit(['/', '\\']).next().unwrap_or(filename);
    let Some(obj) = workflow.as_object() else {
        return false;
    };
    for (_id, node) in obj {
        let Some(inputs) = node.get("inputs").and_then(|v| v.as_object()) else {
            continue;
        };
        for (_k, v) in inputs {
            if let Some(s) = v.as_str() {
                if s == filename || s == base || s.ends_with(base) {
                    return true;
                }
            }
        }
    }
    false
}

fn string_matches_model_file(value: &str, filename: &str, base: &str) -> bool {
    value == filename || value == base || value.ends_with(base)
}

/// Scan Comfy UI-format graphs (CivitAI downloads) for loader filenames + matching URLs.
fn suggest_models_from_ui(workflow: &Value, embedded: &[EmbeddedModel]) -> Vec<SuggestedModel> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    let Some(nodes) = workflow.get("nodes").and_then(|v| v.as_array()) else {
        return models_from_embedded_only(embedded);
    };

    for node in nodes {
        let class = node.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let widgets = node
            .get("widgets_values")
            .and_then(|v| v.as_array())
            .map(|a| a.as_slice())
            .unwrap_or(&[]);

        let mapping: Option<(&str, usize)> = match class {
            "CheckpointLoaderSimple" => Some(("checkpoints", 0)),
            "UNETLoader" | "UnetLoader" | "UnetLoaderGGUF" | "UNETLoaderGGUF" => {
                Some(("diffusion_models", 0))
            }
            "VAELoader" => Some(("vae", 0)),
            "CLIPLoader" | "CLIPLoaderGGUF" => Some(("text_encoders", 0)),
            "UpscaleModelLoader" => Some(("upscale_models", 0)),
            "LoraLoader" | "LoraLoaderModelOnly" => Some(("loras", 0)),
            "ControlNetLoader" => Some(("controlnet", 0)),
            _ => None,
        };

        if let Some((folder, idx)) = mapping {
            if let Some(filename) = widgets.get(idx).and_then(|v| v.as_str()) {
                push_model(&mut seen, &mut out, filename, folder, embedded);
            }
        }

        if matches!(
            class,
            "DualCLIPLoader" | "TripleCLIPLoader" | "DualCLIPLoaderGGUF" | "TripleCLIPLoaderGGUF"
        ) {
            for idx in 0..3 {
                if let Some(filename) = widgets.get(idx).and_then(|v| v.as_str()) {
                    if filename.ends_with(".safetensors")
                        || filename.ends_with(".gguf")
                        || filename.ends_with(".bin")
                        || filename.ends_with(".pth")
                    {
                        push_model(&mut seen, &mut out, filename, "text_encoders", embedded);
                    }
                }
            }
        }
    }

    for m in embedded {
        if m.name.is_empty() || m.url.is_empty() {
            continue;
        }
        if !ui_workflow_references_model_file(workflow, &m.name) {
            continue;
        }
        let path = if m.directory.is_empty() {
            guess_folder_from_name(&m.name)
        } else {
            normalize_model_dir(&m.directory)
        };
        push_model(&mut seen, &mut out, &m.name, &path, embedded);
    }

    out
}

fn ui_workflow_references_model_file(workflow: &Value, filename: &str) -> bool {
    let base = filename.rsplit(['/', '\\']).next().unwrap_or(filename);
    let Some(nodes) = workflow.get("nodes").and_then(|v| v.as_array()) else {
        return false;
    };
    for node in nodes {
        if let Some(widgets) = node.get("widgets_values").and_then(|v| v.as_array()) {
            for v in widgets {
                if let Some(s) = v.as_str() {
                    if string_matches_model_file(s, filename, base) {
                        return true;
                    }
                }
            }
        }
    }
    false
}

fn push_model(
    seen: &mut HashSet<String>,
    out: &mut Vec<SuggestedModel>,
    filename: &str,
    path: &str,
    embedded: &[EmbeddedModel],
) {
    if filename.is_empty() {
        return;
    }
    let key = format!("{path}/{filename}");
    if !seen.insert(key) {
        return;
    }
    out.push(SuggestedModel {
        filename: filename.into(),
        path: path.into(),
        url: lookup_embedded_url(embedded, filename, path),
        gated: false,
    });
}

/// Stamp `gated` on models by probing URLs anonymously (HF GatedRepo / 401).
pub fn mark_gated_models(models: &mut [SuggestedModel]) {
    for m in models.iter_mut() {
        if m.url.trim().is_empty() {
            m.gated = false;
            continue;
        }
        m.gated = crate::download::url_is_gated(&m.url);
    }
}

fn models_from_embedded_only(embedded: &[EmbeddedModel]) -> Vec<SuggestedModel> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for m in embedded {
        if m.name.is_empty() {
            continue;
        }
        let path = if m.directory.is_empty() {
            guess_folder_from_name(&m.name)
        } else {
            normalize_model_dir(&m.directory)
        };
        push_model(&mut seen, &mut out, &m.name, &path, embedded);
    }
    out
}

fn lookup_embedded_url(embedded: &[EmbeddedModel], filename: &str, path: &str) -> String {
    let base = filename.rsplit(['/', '\\']).next().unwrap_or(filename);
    let path_norm = normalize_model_dir(path);

    // Prefer name + directory match, then exact name, then basename.
    for m in embedded {
        if m.url.is_empty() {
            continue;
        }
        let dir = normalize_model_dir(&m.directory);
        if m.name == filename && (dir.is_empty() || dir == path_norm) {
            return m.url.clone();
        }
    }
    for m in embedded {
        if m.url.is_empty() {
            continue;
        }
        if m.name == filename || m.name == base {
            return m.url.clone();
        }
        let m_base = m.name.rsplit(['/', '\\']).next().unwrap_or(&m.name);
        if m_base == base {
            return m.url.clone();
        }
    }
    String::new()
}

fn normalize_model_dir(dir: &str) -> String {
    dir.trim()
        .trim_matches(['/', '\\'])
        .trim_start_matches("models/")
        .trim_start_matches("models\\")
        .replace('\\', "/")
}

fn guess_folder_from_name(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("lora") {
        "loras".into()
    } else if lower.contains("vae") || lower == "ae.safetensors" {
        "vae".into()
    } else if lower.contains("clip") || lower.contains("t5") || lower.contains("mistral") {
        "text_encoders".into()
    } else if lower.contains("control") {
        "controlnet".into()
    } else if lower.contains("upscale") || lower.contains("esrgan") {
        "upscale_models".into()
    } else {
        "diffusion_models".into()
    }
}

pub(crate) fn dedupe_embedded(models: Vec<EmbeddedModel>) -> Vec<EmbeddedModel> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for m in models {
        if m.name.is_empty() || m.url.is_empty() {
            continue;
        }
        let key = format!("{}|{}|{}", m.name, normalize_model_dir(&m.directory), m.url);
        if seen.insert(key) {
            out.push(m);
        }
    }
    out
}

fn merge_embedded(a: &[EmbeddedModel], b: &[EmbeddedModel]) -> Vec<EmbeddedModel> {
    let mut all = a.to_vec();
    all.extend(b.iter().cloned());
    dedupe_embedded(all)
}

/// Pull `properties.models` / top-level `models` from a Comfy UI-format workflow JSON.
pub fn extract_embedded_from_ui(workflow: &Value) -> Vec<EmbeddedModel> {
    let mut out = Vec::new();
    collect_embedded_from_graph(workflow, &mut out);
    dedupe_embedded(out)
}

fn collect_embedded_from_graph(graph: &Value, out: &mut Vec<EmbeddedModel>) {
    if let Some(nodes) = graph.get("nodes").and_then(|v| v.as_array()) {
        for node in nodes {
            if let Some(models) = node
                .pointer("/properties/models")
                .and_then(|v| v.as_array())
            {
                for m in models {
                    push_embedded_value(m, out);
                }
            }
        }
    }
    if let Some(models) = graph.get("models").and_then(|v| v.as_array()) {
        for m in models {
            push_embedded_value(m, out);
        }
    }
    for key in ["/definitions/subgraphs", "/extra/subgraphs"] {
        if let Some(subs) = graph.pointer(key).and_then(|v| v.as_array()) {
            for sg in subs {
                collect_embedded_from_graph(sg, out);
            }
        }
    }
}

fn push_embedded_value(m: &Value, out: &mut Vec<EmbeddedModel>) {
    let name = m.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let url = m.get("url").and_then(|v| v.as_str()).unwrap_or("");
    if name.is_empty() || url.is_empty() {
        return;
    }
    out.push(EmbeddedModel {
        name: name.into(),
        url: url.into(),
        directory: m
            .get("directory")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .into(),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn skips_stale_embedded_model_urls() {
        let workflow = json!({
            "761": {
                "class_type": "UNETLoader",
                "inputs": {
                    "unet_name": "IntoRealismZIT4.safetensors",
                    "weight_dtype": "default"
                }
            },
            "557": {
                "class_type": "VAELoader",
                "inputs": { "vae_name": "ae.safetensors" }
            },
            "42": {
                "class_type": "CLIPLoaderGGUF",
                "inputs": {
                    "clip_name": "zImage_textEncoder.safetensors",
                    "type": "lumina2"
                }
            }
        });
        let embedded = vec![
            EmbeddedModel {
                name: "flux-2-klein-9b-fp8.safetensors".into(),
                url: "https://huggingface.co/example/flux".into(),
                directory: "diffusion_models".into(),
            },
            EmbeddedModel {
                name: "wan_2.1_vae.safetensors".into(),
                url: "https://huggingface.co/example/wan".into(),
                directory: "vae".into(),
            },
        ];
        let models = suggest_models(&workflow, &embedded);
        let names: Vec<&str> = models.iter().map(|m| m.filename.as_str()).collect();
        assert!(names.contains(&"IntoRealismZIT4.safetensors"));
        assert!(names.contains(&"ae.safetensors"));
        assert!(names.contains(&"zImage_textEncoder.safetensors"));
        assert!(!names.contains(&"flux-2-klein-9b-fp8.safetensors"));
        assert!(!names.contains(&"wan_2.1_vae.safetensors"));
        assert!(models.iter().all(|m| m.url.is_empty()));
    }
}
