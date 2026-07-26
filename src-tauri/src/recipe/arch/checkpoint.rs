use crate::blueprints::ManifestFile;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::recipe::upscale_tail::{finish_recipe, UpscaleWiring};
use crate::recipe::values::{
    f64_val, i64_val, model_by_role, sampler_name, scheduler_name, str_val,
};

/// SD1.5 / SDXL checkpoint txt2img with optional real negative when CFG > 1.
pub(crate) fn compile_checkpoint(
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
    let negative_text = if use_negative {
        negative
    } else {
        String::new()
    };

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

    // VAE may be checkpoint slot 2 or optional VAELoader "8".
    let vae_link: (&'static str, u64) = if model_by_role(&manifest.models, "vae").is_ok() {
        ("8", 0)
    } else {
        ("1", 2)
    };

    finish_recipe(
        graph,
        values,
        manifest,
        ("1", 0),
        ("1", 1),
        &[("5", "model")],
        &[("2", "clip"), ("3", "clip")],
        UpscaleWiring {
            model_from: ("5", "model"),
            positive: ("2", 0),
            negative: ("3", 0),
            vae: vae_link,
            decode_id: "6",
            save_id: "7",
            guider: None,
        },
    )
}
