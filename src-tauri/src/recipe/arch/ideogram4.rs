use crate::blueprints::ManifestFile;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::recipe::controls::default_cfg;
use crate::recipe::upscale_tail::{finish_recipe, GuiderWiring, UpscaleWiring};
use crate::recipe::values::{f64_val, i64_val, model_by_role, sampler_name, str_val};

/// Ideogram 4 txt2img (official Comfy blueprint path):
/// dual UNET (cond + uncond) + CLIP(ideogram4) + VAE + CFGOverride + DualModelGuider
/// + EmptyFlux2LatentImage + Ideogram4Scheduler + SamplerCustomAdvanced.
pub(crate) fn compile_ideogram4(
    manifest: &ManifestFile,
    values: &HashMap<String, Value>,
) -> Result<Value, String> {
    let unet = model_by_role(&manifest.models, "unet")?;
    let unet_uncond = model_by_role(&manifest.models, "unet_uncond")
        .or_else(|_| model_by_role(&manifest.models, "unet_negative"))?;
    let clip = model_by_role(&manifest.models, "text_encoder")
        .or_else(|_| model_by_role(&manifest.models, "clip"))?;
    let vae = model_by_role(&manifest.models, "vae")?;

    let prompt = str_val(values, "prompt", "");
    let width = i64_val(values, "width", 1024);
    let height = i64_val(values, "height", 1024);
    let seed = i64_val(values, "seed", 0);
    let steps = i64_val(values, "steps", 20);
    let batch = i64_val(values, "batch", 1).max(1);
    let cfg = f64_val(values, "cfg", default_cfg(manifest) as f64);
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
    let mu = manifest
        .defaults
        .get("mu")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let std = manifest
        .defaults
        .get("std")
        .and_then(|v| v.as_f64())
        .unwrap_or(1.75);
    let cfg_override = manifest
        .defaults
        .get("cfgOverride")
        .and_then(|v| v.as_f64())
        .unwrap_or(3.0);
    let cfg_override_start = manifest
        .defaults
        .get("cfgOverrideStart")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.7);
    let cfg_override_end = manifest
        .defaults
        .get("cfgOverrideEnd")
        .and_then(|v| v.as_f64())
        .unwrap_or(1.0);

    finish_recipe(
        json!({
            "1": {
                "class_type": "UNETLoader",
                "inputs": {
                    "unet_name": unet.filename,
                    "weight_dtype": weight_dtype
                }
            },
            "2": {
                "class_type": "UNETLoader",
                "inputs": {
                    "unet_name": unet_uncond.filename,
                    "weight_dtype": weight_dtype
                }
            },
            "3": {
                "class_type": "CLIPLoader",
                "inputs": {
                    "clip_name": clip.filename,
                    "type": "ideogram4",
                    "device": clip_device
                }
            },
            "4": {
                "class_type": "VAELoader",
                "inputs": { "vae_name": vae.filename }
            },
            "5": {
                "class_type": "CFGOverride",
                "inputs": {
                    "model": ["1", 0],
                    "cfg": cfg_override,
                    "start_percent": cfg_override_start,
                    "end_percent": cfg_override_end
                }
            },
            "6": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": prompt,
                    "clip": ["3", 0]
                }
            },
            "7": {
                "class_type": "ConditioningZeroOut",
                "inputs": { "conditioning": ["6", 0] }
            },
            "8": {
                "class_type": "DualModelGuider",
                "inputs": {
                    "model": ["5", 0],
                    "model_negative": ["2", 0],
                    "positive": ["6", 0],
                    "negative": ["7", 0],
                    "cfg": cfg
                }
            },
            "9": {
                "class_type": "EmptyFlux2LatentImage",
                "inputs": {
                    "width": width,
                    "height": height,
                    "batch_size": batch
                }
            },
            "10": {
                "class_type": "RandomNoise",
                "inputs": { "noise_seed": seed }
            },
            "11": {
                "class_type": "KSamplerSelect",
                "inputs": { "sampler_name": sampler_name(manifest) }
            },
            "12": {
                "class_type": "Ideogram4Scheduler",
                "inputs": {
                    "steps": steps,
                    "width": width,
                    "height": height,
                    "mu": mu,
                    "std": std
                }
            },
            "13": {
                "class_type": "SamplerCustomAdvanced",
                "inputs": {
                    "noise": ["10", 0],
                    "guider": ["8", 0],
                    "sampler": ["11", 0],
                    "sigmas": ["12", 0],
                    "latent_image": ["9", 0]
                }
            },
            "14": {
                "class_type": "VAEDecode",
                "inputs": {
                    "samples": ["13", 0],
                    "vae": ["4", 0]
                }
            },
            "15": {
                "class_type": "SaveImage",
                "inputs": {
                    "filename_prefix": manifest.id,
                    "images": ["14", 0]
                }
            }
        }),
        values,
        manifest,
        ("1", 0),
        ("3", 0),
        &[("5", "model")],
        &[("6", "clip")],
        UpscaleWiring {
            model_from: ("5", "model"),
            positive: ("6", 0),
            negative: ("7", 0),
            vae: ("4", 0),
            decode_id: "14",
            save_id: "15",
            guider: Some(GuiderWiring {
                guider: ("8", 0),
                sampler: ("11", 0),
                sigmas: ("12", 0),
            }),
        },
    )
}
