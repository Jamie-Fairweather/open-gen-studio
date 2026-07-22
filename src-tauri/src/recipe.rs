//! Recipe Blueprints: compile Comfy API graphs at generate time.
//! See docs/PLAN-RECIPE-BLUEPRINTS.md.

use crate::blueprints::{BlueprintControl, ManifestFile, ModelEntry};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

/// Compile a Comfy API workflow from a recipe + live User Mode values.
pub fn compile(
    manifest: &ManifestFile,
    values: &HashMap<String, Value>,
) -> Result<Value, String> {
    let flow = if manifest.flow_type.is_empty() {
        "txt2img"
    } else {
        manifest.flow_type.as_str()
    };
    if flow != "txt2img" {
        return Err(format!("unsupported flowType '{flow}' (v1: txt2img only)"));
    }

    match manifest.arch.as_str() {
        "z-image" => compile_z_image(manifest, values),
        "krea2" => compile_krea2(manifest, values),
        "flux" => compile_flux(manifest, values),
        "flux2" => compile_flux2(manifest, values),
        "sdxl" | "sd15" => compile_checkpoint(manifest, values),
        "" => Err("blueprint missing arch — only recipe blueprints are supported".into()),
        other => Err(format!(
            "unsupported arch '{other}' (supported: z-image, krea2, flux, flux2, sdxl, sd15)"
        )),
    }
}

/// UI controls for a recipe when the manifest omits `controls[]`.
pub fn synthetic_controls(manifest: &ManifestFile) -> Vec<BlueprintControl> {
    let caps = &manifest.capabilities;
    let defaults = &manifest.defaults;
    let mut out = vec![BlueprintControl {
        id: "prompt".into(),
        control_type: "textarea".into(),
        node_id: String::new(),
        input: String::new(),
        label: "Prompt".into(),
        group: "prompt".into(),
        default: None,
    }];
    if caps.negative {
        out.push(BlueprintControl {
            id: "negative".into(),
            control_type: "textarea".into(),
            node_id: String::new(),
            input: String::new(),
            label: "Negative prompt".into(),
            group: "prompt".into(),
            default: Some(json!("")),
        });
    }
    out.extend([
        num_control("width", "Width", "basic", defaults, 1024),
        num_control("height", "Height", "basic", defaults, 1024),
        num_control("seed", "Seed (0 = random)", "core", defaults, 0),
        num_control("steps", "Steps", "core", defaults, default_steps(manifest)),
    ]);
    if matches!(manifest.arch.as_str(), "flux" | "flux2") {
        out.push(float_control(
            "guidance",
            "Guidance",
            "core",
            defaults,
            3.5,
        ));
    } else {
        out.push(num_control(
            "cfg",
            "CFG",
            "core",
            defaults,
            default_cfg(manifest),
        ));
    }
    out
}

fn num_control(
    id: &str,
    label: &str,
    group: &str,
    defaults: &Map<String, Value>,
    fallback: i64,
) -> BlueprintControl {
    let default = defaults
        .get(id)
        .cloned()
        .unwrap_or_else(|| json!(fallback));
    BlueprintControl {
        id: id.into(),
        control_type: "number".into(),
        node_id: String::new(),
        input: String::new(),
        label: label.into(),
        group: group.into(),
        default: Some(default),
    }
}

fn float_control(
    id: &str,
    label: &str,
    group: &str,
    defaults: &Map<String, Value>,
    fallback: f64,
) -> BlueprintControl {
    let default = defaults
        .get(id)
        .cloned()
        .unwrap_or_else(|| json!(fallback));
    BlueprintControl {
        id: id.into(),
        control_type: "number".into(),
        node_id: String::new(),
        input: String::new(),
        label: label.into(),
        group: group.into(),
        default: Some(default),
    }
}

fn default_steps(manifest: &ManifestFile) -> i64 {
    match manifest.arch.as_str() {
        "z-image" | "krea2" => 8,
        "flux" | "flux2" => 20,
        _ => 28,
    }
}

fn default_cfg(manifest: &ManifestFile) -> i64 {
    match manifest.arch.as_str() {
        "z-image" | "krea2" | "flux" | "flux2" => 1,
        _ => 7,
    }
}

fn str_val(values: &HashMap<String, Value>, key: &str, fallback: &str) -> String {
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

fn i64_val(values: &HashMap<String, Value>, key: &str, fallback: i64) -> i64 {
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

fn f64_val(values: &HashMap<String, Value>, key: &str, fallback: f64) -> f64 {
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

fn model_by_role<'a>(
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

fn sampler_name(manifest: &ManifestFile) -> &str {
    if manifest.sampler.is_empty() {
        match manifest.arch.as_str() {
            "z-image" => "res_multistep",
            "krea2" | "flux" | "flux2" => "euler",
            _ => "euler",
        }
    } else {
        manifest.sampler.as_str()
    }
}

fn scheduler_name(manifest: &ManifestFile) -> &str {
    if manifest.scheduler.is_empty() {
        "simple"
    } else {
        manifest.scheduler.as_str()
    }
}

/// Krea 2: UNET + CLIP(krea2) + VAE + EmptyLatentImage + KSampler (no sampling wrapper).
/// Negative is ConditioningZeroOut (no text negative). Official turbo template defaults.
fn compile_krea2(
    manifest: &ManifestFile,
    values: &HashMap<String, Value>,
) -> Result<Value, String> {
    let unet = model_by_role(&manifest.models, "unet")?;
    let te = model_by_role(&manifest.models, "text_encoder")
        .or_else(|_| model_by_role(&manifest.models, "clip"))?;
    let vae = model_by_role(&manifest.models, "vae")?;

    let prompt = str_val(values, "prompt", "");
    let width = i64_val(values, "width", 1024);
    let height = i64_val(values, "height", 1024);
    let seed = i64_val(values, "seed", 0);
    let steps = i64_val(values, "steps", 8);
    let cfg = f64_val(values, "cfg", 1.0);
    let batch = i64_val(values, "batch", 1).max(1);

    let clip_type = manifest
        .defaults
        .get("clipType")
        .and_then(|v| v.as_str())
        .unwrap_or("krea2");
    let weight_dtype = manifest
        .defaults
        .get("weightDtype")
        .and_then(|v| v.as_str())
        .unwrap_or("default");

    Ok(json!({
        "1": {
            "class_type": "UNETLoader",
            "inputs": {
                "unet_name": unet.filename,
                "weight_dtype": weight_dtype
            }
        },
        "2": {
            "class_type": "CLIPLoader",
            "inputs": {
                "clip_name": te.filename,
                "type": clip_type,
                "device": "default"
            }
        },
        "3": {
            "class_type": "VAELoader",
            "inputs": { "vae_name": vae.filename }
        },
        "4": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": prompt,
                "clip": ["2", 0]
            }
        },
        "5": {
            "class_type": "ConditioningZeroOut",
            "inputs": { "conditioning": ["4", 0] }
        },
        "6": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": batch
            }
        },
        "7": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": steps,
                "cfg": cfg,
                "sampler_name": sampler_name(manifest),
                "scheduler": scheduler_name(manifest),
                "denoise": 1.0,
                "model": ["1", 0],
                "positive": ["4", 0],
                "negative": ["5", 0],
                "latent_image": ["6", 0]
            }
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["7", 0],
                "vae": ["3", 0]
            }
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": manifest.id,
                "images": ["8", 0]
            }
        }
    }))
}

/// Z-Image / Lumina2-style: UNET + CLIP(lumina2) + VAE + EmptySD3Latent + AuraFlow + KSampler.
/// Negative is ConditioningZeroOut (no text negative).
fn compile_z_image(
    manifest: &ManifestFile,
    values: &HashMap<String, Value>,
) -> Result<Value, String> {
    let unet = model_by_role(&manifest.models, "unet")?;
    let te = model_by_role(&manifest.models, "text_encoder")
        .or_else(|_| model_by_role(&manifest.models, "clip"))?;
    let vae = model_by_role(&manifest.models, "vae")?;

    let prompt = str_val(values, "prompt", "");
    let width = i64_val(values, "width", 1024);
    let height = i64_val(values, "height", 1024);
    let seed = i64_val(values, "seed", 0);
    let steps = i64_val(values, "steps", 8);
    let cfg = f64_val(values, "cfg", 1.0);
    let batch = i64_val(values, "batch", 1).max(1);

    let clip_type = manifest
        .defaults
        .get("clipType")
        .and_then(|v| v.as_str())
        .unwrap_or("lumina2");
    let aura_shift = manifest
        .defaults
        .get("auraShift")
        .and_then(|v| v.as_f64())
        .unwrap_or(3.0);

    Ok(json!({
        "1": {
            "class_type": "UNETLoader",
            "inputs": {
                "unet_name": unet.filename,
                "weight_dtype": "default"
            }
        },
        "2": {
            "class_type": "CLIPLoader",
            "inputs": {
                "clip_name": te.filename,
                "type": clip_type,
                "device": "default"
            }
        },
        "3": {
            "class_type": "VAELoader",
            "inputs": { "vae_name": vae.filename }
        },
        "4": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": prompt,
                "clip": ["2", 0]
            }
        },
        "5": {
            "class_type": "ConditioningZeroOut",
            "inputs": { "conditioning": ["4", 0] }
        },
        "6": {
            "class_type": "EmptySD3LatentImage",
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": batch
            }
        },
        "7": {
            "class_type": "ModelSamplingAuraFlow",
            "inputs": {
                "shift": aura_shift,
                "model": ["1", 0]
            }
        },
        "8": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": steps,
                "cfg": cfg,
                "sampler_name": sampler_name(manifest),
                "scheduler": scheduler_name(manifest),
                "denoise": 1.0,
                "model": ["7", 0],
                "positive": ["4", 0],
                "negative": ["5", 0],
                "latent_image": ["6", 0]
            }
        },
        "9": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["8", 0],
                "vae": ["3", 0]
            }
        },
        "10": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": manifest.id,
                "images": ["9", 0]
            }
        }
    }))
}

/// Flux.1 txt2img: UNET + DualCLIP (t5 + clip_l) + VAE + FluxGuidance + ModelSamplingFlux.
/// KSampler CFG is fixed at 1; distilled guidance comes from FluxGuidance.
fn compile_flux(
    manifest: &ManifestFile,
    values: &HashMap<String, Value>,
) -> Result<Value, String> {
    let unet = model_by_role(&manifest.models, "unet")?;
    let t5 = model_by_role(&manifest.models, "t5")
        .or_else(|_| model_by_role(&manifest.models, "text_encoder_t5"))?;
    let clip_l = model_by_role(&manifest.models, "clip_l")
        .or_else(|_| model_by_role(&manifest.models, "text_encoder_clip"))?;
    let vae = model_by_role(&manifest.models, "vae")?;

    let prompt = str_val(values, "prompt", "");
    let width = i64_val(values, "width", 1024);
    let height = i64_val(values, "height", 1024);
    let seed = i64_val(values, "seed", 0);
    let steps = i64_val(values, "steps", 20);
    let batch = i64_val(values, "batch", 1).max(1);
    let guidance_fallback = manifest
        .defaults
        .get("guidance")
        .and_then(|v| v.as_f64())
        .unwrap_or(3.5);
    let guidance = f64_val(values, "guidance", guidance_fallback);
    let weight_dtype = manifest
        .defaults
        .get("weightDtype")
        .and_then(|v| v.as_str())
        .unwrap_or("default");
    let max_shift = manifest
        .defaults
        .get("maxShift")
        .and_then(|v| v.as_f64())
        .unwrap_or(1.15);
    let base_shift = manifest
        .defaults
        .get("baseShift")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.5);

    Ok(json!({
        "1": {
            "class_type": "UNETLoader",
            "inputs": {
                "unet_name": unet.filename,
                "weight_dtype": weight_dtype
            }
        },
        "2": {
            "class_type": "DualCLIPLoader",
            "inputs": {
                "clip_name1": t5.filename,
                "clip_name2": clip_l.filename,
                "type": "flux"
            }
        },
        "3": {
            "class_type": "VAELoader",
            "inputs": { "vae_name": vae.filename }
        },
        "4": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": prompt,
                "clip": ["2", 0]
            }
        },
        "5": {
            "class_type": "FluxGuidance",
            "inputs": {
                "guidance": guidance,
                "conditioning": ["4", 0]
            }
        },
        "6": {
            "class_type": "ConditioningZeroOut",
            "inputs": { "conditioning": ["4", 0] }
        },
        "7": {
            "class_type": "EmptySD3LatentImage",
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": batch
            }
        },
        "8": {
            "class_type": "ModelSamplingFlux",
            "inputs": {
                "max_shift": max_shift,
                "base_shift": base_shift,
                "width": width,
                "height": height,
                "model": ["1", 0]
            }
        },
        "9": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": steps,
                "cfg": 1.0,
                "sampler_name": sampler_name(manifest),
                "scheduler": scheduler_name(manifest),
                "denoise": 1.0,
                "model": ["8", 0],
                "positive": ["5", 0],
                "negative": ["6", 0],
                "latent_image": ["7", 0]
            }
        },
        "10": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["9", 0],
                "vae": ["3", 0]
            }
        },
        "11": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": manifest.id,
                "images": ["10", 0]
            }
        }
    }))
}

/// Flux.2 txt2img: UNET + single CLIP (Mistral/Qwen, type=flux2) + VAE.
/// Uses EmptyFlux2LatentImage + Flux2Scheduler + SamplerCustomAdvanced (official Comfy path).
fn compile_flux2(
    manifest: &ManifestFile,
    values: &HashMap<String, Value>,
) -> Result<Value, String> {
    let unet = model_by_role(&manifest.models, "unet")?;
    let clip = model_by_role(&manifest.models, "clip")
        .or_else(|_| model_by_role(&manifest.models, "text_encoder"))?;
    let vae = model_by_role(&manifest.models, "vae")?;

    let prompt = str_val(values, "prompt", "");
    let width = i64_val(values, "width", 1024);
    let height = i64_val(values, "height", 1024);
    let seed = i64_val(values, "seed", 0);
    let steps = i64_val(values, "steps", 20);
    let batch = i64_val(values, "batch", 1).max(1);
    let guidance_fallback = manifest
        .defaults
        .get("guidance")
        .and_then(|v| v.as_f64())
        .unwrap_or(3.5);
    let guidance = f64_val(values, "guidance", guidance_fallback);
    let weight_dtype = manifest
        .defaults
        .get("weightDtype")
        .and_then(|v| v.as_str())
        .unwrap_or("default");
    let clip_device = manifest
        .defaults
        .get("clipDevice")
        .and_then(|v| v.as_str())
        .unwrap_or("default");

    Ok(json!({
        "1": {
            "class_type": "UNETLoader",
            "inputs": {
                "unet_name": unet.filename,
                "weight_dtype": weight_dtype
            }
        },
        "2": {
            "class_type": "CLIPLoader",
            "inputs": {
                "clip_name": clip.filename,
                "type": "flux2",
                "device": clip_device
            }
        },
        "3": {
            "class_type": "VAELoader",
            "inputs": { "vae_name": vae.filename }
        },
        "4": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": prompt,
                "clip": ["2", 0]
            }
        },
        "5": {
            "class_type": "FluxGuidance",
            "inputs": {
                "guidance": guidance,
                "conditioning": ["4", 0]
            }
        },
        "6": {
            "class_type": "EmptyFlux2LatentImage",
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": batch
            }
        },
        "7": {
            "class_type": "RandomNoise",
            "inputs": { "noise_seed": seed }
        },
        "8": {
            "class_type": "BasicGuider",
            "inputs": {
                "model": ["1", 0],
                "conditioning": ["5", 0]
            }
        },
        "9": {
            "class_type": "KSamplerSelect",
            "inputs": { "sampler_name": sampler_name(manifest) }
        },
        "10": {
            "class_type": "Flux2Scheduler",
            "inputs": {
                "steps": steps,
                "width": width,
                "height": height
            }
        },
        "11": {
            "class_type": "SamplerCustomAdvanced",
            "inputs": {
                "noise": ["7", 0],
                "guider": ["8", 0],
                "sampler": ["9", 0],
                "sigmas": ["10", 0],
                "latent_image": ["6", 0]
            }
        },
        "12": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["11", 0],
                "vae": ["3", 0]
            }
        },
        "13": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": manifest.id,
                "images": ["12", 0]
            }
        }
    }))
}

/// SD1.5 / SDXL checkpoint txt2img with optional real negative when CFG > 1.
fn compile_checkpoint(
    manifest: &ManifestFile,
    values: &HashMap<String, Value>,
) -> Result<Value, String> {
    let ckpt = model_by_role(&manifest.models, "checkpoint")?;
    let prompt = str_val(values, "prompt", "");
    let negative = str_val(values, "negative", "");
    let width = i64_val(values, "width", 1024);
    let height = i64_val(values, "height", 1024);
    let seed = i64_val(values, "seed", 0);
    let steps = i64_val(values, "steps", 28);
    let cfg = f64_val(values, "cfg", 7.0);
    let batch = i64_val(values, "batch", 1).max(1);

    let use_negative = manifest.capabilities.negative && cfg > 1.0;
    let negative_text = if use_negative { negative } else { String::new() };

    let mut graph = json!({
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": { "ckpt_name": ckpt.filename }
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": prompt,
                "clip": ["1", 1]
            }
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": negative_text,
                "clip": ["1", 1]
            }
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": batch
            }
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": steps,
                "cfg": cfg,
                "sampler_name": sampler_name(manifest),
                "scheduler": scheduler_name(manifest),
                "denoise": 1.0,
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0]
            }
        },
        "6": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["5", 0],
                "vae": ["1", 2]
            }
        },
        "7": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": manifest.id,
                "images": ["6", 0]
            }
        }
    });

    // Optional separate VAE override.
    if let Ok(vae) = model_by_role(&manifest.models, "vae") {
        let obj = graph.as_object_mut().unwrap();
        obj.insert(
            "8".into(),
            json!({
                "class_type": "VAELoader",
                "inputs": { "vae_name": vae.filename }
            }),
        );
        obj.get_mut("6")
            .and_then(|n| n.get_mut("inputs"))
            .and_then(|i| i.as_object_mut())
            .map(|i| i.insert("vae".into(), json!(["8", 0])));
    }

    Ok(graph)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest_from(json: Value) -> ManifestFile {
        serde_json::from_value(json).expect("manifest")
    }

    #[test]
    fn compiles_krea2_graph() {
        let m = manifest_from(json!({
            "id": "krea2-turbo",
            "name": "Krea 2 Turbo",
            "category": "image",
            "runtime": "comfyui",
            "flowType": "txt2img",
            "arch": "krea2",
            "sampler": "euler",
            "scheduler": "simple",
            "capabilities": { "negative": false },
            "models": [
                { "filename": "krea2_turbo_fp8_scaled.safetensors", "path": "diffusion_models", "role": "unet" },
                { "filename": "qwen3vl_4b_fp8_scaled.safetensors", "path": "text_encoders", "role": "text_encoder" },
                { "filename": "qwen_image_vae.safetensors", "path": "vae", "role": "vae" }
            ]
        }));
        let mut values = HashMap::new();
        values.insert("prompt".into(), json!("a cat"));
        values.insert("width".into(), json!(1024));
        values.insert("height".into(), json!(1024));
        values.insert("seed".into(), json!(42));
        values.insert("steps".into(), json!(8));
        values.insert("cfg".into(), json!(1));
        let g = compile(&m, &values).unwrap();
        assert_eq!(g["1"]["class_type"], "UNETLoader");
        assert_eq!(g["2"]["inputs"]["type"], "krea2");
        assert_eq!(g["6"]["class_type"], "EmptyLatentImage");
        assert_eq!(g["7"]["class_type"], "KSampler");
        assert_eq!(g["7"]["inputs"]["model"], json!(["1", 0]));
        assert_eq!(g["7"]["inputs"]["sampler_name"], "euler");
        assert_eq!(g["4"]["inputs"]["text"], "a cat");
    }

    #[test]
    fn compiles_z_image_graph() {
        let m = manifest_from(json!({
            "id": "z-image-turbo",
            "name": "Z-Image Turbo",
            "category": "image",
            "runtime": "comfyui",
            "flowType": "txt2img",
            "arch": "z-image",
            "sampler": "res_multistep",
            "scheduler": "simple",
            "capabilities": { "negative": false },
            "models": [
                { "filename": "z_image_turbo_bf16.safetensors", "path": "diffusion_models", "role": "unet" },
                { "filename": "qwen_3_4b.safetensors", "path": "text_encoders", "role": "text_encoder" },
                { "filename": "ae.safetensors", "path": "vae", "role": "vae" }
            ]
        }));
        let mut values = HashMap::new();
        values.insert("prompt".into(), json!("a cat"));
        values.insert("width".into(), json!(1024));
        values.insert("height".into(), json!(1024));
        values.insert("seed".into(), json!(42));
        values.insert("steps".into(), json!(8));
        values.insert("cfg".into(), json!(1));
        let g = compile(&m, &values).unwrap();
        assert_eq!(g["1"]["class_type"], "UNETLoader");
        assert_eq!(g["8"]["class_type"], "KSampler");
        assert_eq!(g["4"]["inputs"]["text"], "a cat");
        assert_eq!(g["8"]["inputs"]["seed"], 42);
        assert_eq!(g["7"]["class_type"], "ModelSamplingAuraFlow");
    }

    #[test]
    fn compiles_flux_graph() {
        let m = manifest_from(json!({
            "id": "flux-dev",
            "name": "Flux Dev",
            "category": "image",
            "runtime": "comfyui",
            "flowType": "txt2img",
            "arch": "flux",
            "sampler": "euler",
            "scheduler": "simple",
            "capabilities": { "negative": false },
            "defaults": { "guidance": 3.5 },
            "models": [
                { "filename": "flux1-dev.safetensors", "path": "diffusion_models", "role": "unet" },
                { "filename": "t5xxl_fp16.safetensors", "path": "text_encoders", "role": "t5" },
                { "filename": "clip_l.safetensors", "path": "text_encoders", "role": "clip_l" },
                { "filename": "ae.safetensors", "path": "vae", "role": "vae" }
            ]
        }));
        let mut values = HashMap::new();
        values.insert("prompt".into(), json!("a fox"));
        values.insert("width".into(), json!(1024));
        values.insert("height".into(), json!(1024));
        values.insert("seed".into(), json!(7));
        values.insert("steps".into(), json!(20));
        values.insert("guidance".into(), json!(3.5));
        let g = compile(&m, &values).unwrap();
        assert_eq!(g["2"]["class_type"], "DualCLIPLoader");
        assert_eq!(g["5"]["class_type"], "FluxGuidance");
        assert_eq!(g["8"]["class_type"], "ModelSamplingFlux");
        assert_eq!(g["9"]["inputs"]["cfg"], 1.0);
        assert_eq!(g["5"]["inputs"]["guidance"], 3.5);
    }

    #[test]
    fn compiles_flux2_graph() {
        let m = manifest_from(json!({
            "id": "flux2-dev",
            "name": "Flux.2 Dev",
            "category": "image",
            "runtime": "comfyui",
            "flowType": "txt2img",
            "arch": "flux2",
            "sampler": "euler",
            "capabilities": { "negative": false },
            "defaults": { "guidance": 3.5 },
            "models": [
                { "filename": "flux2_dev_fp8mixed.safetensors", "path": "diffusion_models", "role": "unet" },
                { "filename": "mistral_3_small_flux2_bf16.safetensors", "path": "text_encoders", "role": "clip" },
                { "filename": "flux2-vae.safetensors", "path": "vae", "role": "vae" }
            ]
        }));
        let mut values = HashMap::new();
        values.insert("prompt".into(), json!("a fox"));
        values.insert("width".into(), json!(1024));
        values.insert("height".into(), json!(1024));
        values.insert("seed".into(), json!(7));
        values.insert("steps".into(), json!(20));
        values.insert("guidance".into(), json!(4.0));
        let g = compile(&m, &values).unwrap();
        assert_eq!(g["2"]["class_type"], "CLIPLoader");
        assert_eq!(g["2"]["inputs"]["type"], "flux2");
        assert_eq!(g["5"]["class_type"], "FluxGuidance");
        assert_eq!(g["5"]["inputs"]["guidance"], 4.0);
        assert_eq!(g["6"]["class_type"], "EmptyFlux2LatentImage");
        assert_eq!(g["10"]["class_type"], "Flux2Scheduler");
        assert_eq!(g["11"]["class_type"], "SamplerCustomAdvanced");
        assert_eq!(g["7"]["inputs"]["noise_seed"], 7);
    }

    #[test]
    fn compiles_sdxl_with_negative_when_cfg_high() {
        let m = manifest_from(json!({
            "id": "sdxl-test",
            "name": "SDXL",
            "category": "image",
            "runtime": "comfyui",
            "flowType": "txt2img",
            "arch": "sdxl",
            "sampler": "euler",
            "scheduler": "normal",
            "capabilities": { "negative": true },
            "models": [
                { "filename": "sdxl.safetensors", "path": "checkpoints", "role": "checkpoint" }
            ]
        }));
        let mut values = HashMap::new();
        values.insert("prompt".into(), json!("portrait"));
        values.insert("negative".into(), json!("blurry"));
        values.insert("cfg".into(), json!(7));
        values.insert("steps".into(), json!(20));
        values.insert("width".into(), json!(1024));
        values.insert("height".into(), json!(1024));
        values.insert("seed".into(), json!(1));
        let g = compile(&m, &values).unwrap();
        assert_eq!(g["1"]["class_type"], "CheckpointLoaderSimple");
        assert_eq!(g["3"]["inputs"]["text"], "blurry");
    }
}
