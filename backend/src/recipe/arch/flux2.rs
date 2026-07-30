use crate::blueprints::ManifestFile;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::recipe::upscale_tail::{finish_recipe, GuiderWiring, UpscaleWiring};
use crate::recipe::values::{f64_val, i64_val, model_by_role, sampler_name, str_val};

/// Flux.2 txt2img: UNET + single CLIP (Mistral/Qwen, type=flux2) + VAE.
/// Uses EmptyFlux2LatentImage + Flux2Scheduler + SamplerCustomAdvanced (official Comfy path).
pub(crate) fn compile_flux2(
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
        }),
        values,
        manifest,
        ("1", 0),
        ("2", 0),
        &[("8", "model")],
        &[("4", "clip")],
        UpscaleWiring {
            model_from: ("8", "model"),
            positive: ("5", 0),
            negative: ("5", 0),
            vae: ("3", 0),
            decode_id: "12",
            save_id: "13",
            guider: Some(GuiderWiring {
                guider: ("8", 0),
                sampler: ("9", 0),
                sigmas: ("10", 0),
            }),
        },
    )
}
