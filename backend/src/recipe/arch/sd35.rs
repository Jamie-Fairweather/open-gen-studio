use crate::blueprints::ManifestFile;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::recipe::upscale_tail::{finish_recipe, UpscaleWiring};
use crate::recipe::values::{
    f64_val, i64_val, model_by_role, sampler_name, scheduler_name, str_val,
};

/// SD 3.5: Checkpoint (MODEL+VAE) + TripleCLIP (clip_l + clip_g + t5) + EmptySD3Latent + ModelSamplingSD3.
pub(crate) fn compile_sd35(
    manifest: &ManifestFile,
    values: &HashMap<String, Value>,
) -> Result<Value, String> {
    let ckpt = model_by_role(&manifest.models, "checkpoint")?;
    let clip_l = model_by_role(&manifest.models, "clip_l")?;
    let clip_g = model_by_role(&manifest.models, "clip_g")?;
    let t5 = model_by_role(&manifest.models, "t5")
        .or_else(|_| model_by_role(&manifest.models, "text_encoder_t5"))?;

    let prompt = str_val(values, "prompt", "");
    let negative = str_val(values, "negative", "");
    let width = i64_val(values, "width", 1024);
    let height = i64_val(values, "height", 1024);
    let seed = i64_val(values, "seed", 0);
    let steps = i64_val(values, "steps", 40);
    let cfg = f64_val(values, "cfg", 4.5);
    let batch = i64_val(values, "batch", 1).max(1);
    let shift = manifest
        .defaults
        .get("sd3Shift")
        .and_then(|v| v.as_f64())
        .unwrap_or(3.0);

    let use_negative = manifest.capabilities.negative && cfg > 1.0;
    let negative_text = if use_negative {
        negative
    } else {
        String::new()
    };

    finish_recipe(
        json!({
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": { "ckpt_name": ckpt.filename }
            },
            "2": {
                "class_type": "TripleCLIPLoader",
                "inputs": {
                    "clip_name1": clip_l.filename,
                    "clip_name2": clip_g.filename,
                    "clip_name3": t5.filename
                }
            },
            "3": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": prompt,
                    "clip": ["2", 0]
                }
            },
            "4": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": negative_text,
                    "clip": ["2", 0]
                }
            },
            "5": {
                "class_type": "EmptySD3LatentImage",
                "inputs": {
                    "width": width,
                    "height": height,
                    "batch_size": batch
                }
            },
            "6": {
                "class_type": "ModelSamplingSD3",
                "inputs": {
                    "shift": shift,
                    "model": ["1", 0]
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
                    "model": ["6", 0],
                    "positive": ["3", 0],
                    "negative": ["4", 0],
                    "latent_image": ["5", 0]
                }
            },
            "8": {
                "class_type": "VAEDecode",
                "inputs": {
                    "samples": ["7", 0],
                    "vae": ["1", 2]
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
        &[("6", "model")],
        &[("3", "clip"), ("4", "clip")],
        UpscaleWiring {
            model_from: ("7", "model"),
            positive: ("3", 0),
            negative: ("4", 0),
            vae: ("1", 2),
            decode_id: "8",
            save_id: "9",
            guider: None,
        },
    )
}
