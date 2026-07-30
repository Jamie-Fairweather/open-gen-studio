use crate::blueprints::ManifestFile;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::recipe::upscale_tail::{finish_recipe, UpscaleWiring};
use crate::recipe::values::{
    f64_val, i64_val, model_by_role, sampler_name, scheduler_name, str_val,
};

/// Flux.1 txt2img: UNET + DualCLIP (t5 + clip_l) + VAE + FluxGuidance + ModelSamplingFlux.
/// KSampler CFG is fixed at 1; distilled guidance comes from FluxGuidance.
pub(crate) fn compile_flux(
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
        }),
        values,
        manifest,
        ("1", 0),
        ("2", 0),
        &[("8", "model")],
        &[("4", "clip")],
        UpscaleWiring {
            model_from: ("9", "model"),
            positive: ("5", 0),
            negative: ("6", 0),
            vae: ("3", 0),
            decode_id: "10",
            save_id: "11",
            guider: None,
        },
    )
}
