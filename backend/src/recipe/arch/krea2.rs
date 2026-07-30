use crate::blueprints::ManifestFile;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::recipe::upscale_tail::{finish_recipe, UpscaleWiring};
use crate::recipe::values::{
    f64_val, i64_val, model_by_role, sampler_name, scheduler_name, str_val,
};

/// Krea 2: UNET + CLIP(krea2) + VAE + EmptyLatentImage + KSampler (no sampling wrapper).
/// Negative is ConditioningZeroOut (no text negative). Official turbo template defaults.
pub(crate) fn compile_krea2(
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
        }),
        values,
        manifest,
        ("1", 0),
        ("2", 0),
        &[("7", "model")],
        &[("4", "clip")],
        UpscaleWiring {
            model_from: ("7", "model"),
            positive: ("4", 0),
            negative: ("5", 0),
            vae: ("3", 0),
            decode_id: "8",
            save_id: "9",
            guider: None,
        },
    )
}
