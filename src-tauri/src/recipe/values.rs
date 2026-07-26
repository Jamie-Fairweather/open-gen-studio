use crate::blueprints::{ManifestFile, ModelEntry};
use serde_json::Value;
use std::collections::HashMap;

pub(crate) fn str_val(values: &HashMap<String, Value>, key: &str, fallback: &str) -> String {
    values
        .get(key)
        .and_then(|v| {
            if let Some(s) = v.as_str() {
                Some(s.to_string())
            } else if v.is_null() {
                None
            } else {
                Some(v.to_string().trim_matches('"').to_string())
            }
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

pub(crate) fn i64_val(values: &HashMap<String, Value>, key: &str, fallback: i64) -> i64 {
    values
        .get(key)
        .and_then(|v| {
            v.as_i64()
                .or_else(|| v.as_u64().map(|n| n as i64))
                .or_else(|| v.as_f64().map(|n| n as i64))
                .or_else(|| v.as_str().and_then(|s| s.trim().parse().ok()))
        })
        .unwrap_or(fallback)
}

pub(crate) fn f64_val(values: &HashMap<String, Value>, key: &str, fallback: f64) -> f64 {
    values
        .get(key)
        .and_then(|v| {
            v.as_f64()
                .or_else(|| v.as_i64().map(|n| n as f64))
                .or_else(|| v.as_u64().map(|n| n as f64))
                .or_else(|| v.as_str().and_then(|s| s.trim().parse().ok()))
        })
        .unwrap_or(fallback)
}

pub(crate) fn model_by_role<'a>(
    models: &'a [ModelEntry],
    role: &str,
) -> Result<&'a ModelEntry, String> {
    if let Some(m) = models.iter().find(|m| m.role == role) {
        return Ok(m);
    }
    // Fallback: infer from Comfy folder path.
    let path_match = match role {
        "unet" | "diffusion" => "diffusion_models",
        "vae" => "vae",
        "text_encoder" | "clip" => "text_encoders",
        "checkpoint" => "checkpoints",
        _ => "",
    };
    if !path_match.is_empty() {
        if let Some(m) = models.iter().find(|m| m.path == path_match) {
            return Ok(m);
        }
    }
    Err(format!("recipe missing model with role '{role}'"))
}

pub(crate) fn sampler_name(manifest: &ManifestFile) -> &str {
    if manifest.sampler.is_empty() {
        match manifest.arch.as_str() {
            "z-image" => "res_multistep",
            "krea2" | "flux" | "flux2" | "ideogram4" => "euler",
            _ => "euler",
        }
    } else {
        manifest.sampler.as_str()
    }
}

pub(crate) fn scheduler_name(manifest: &ManifestFile) -> &str {
    if manifest.scheduler.is_empty() {
        "simple"
    } else {
        manifest.scheduler.as_str()
    }
}
