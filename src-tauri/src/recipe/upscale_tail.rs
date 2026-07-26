use crate::blueprints::ManifestFile;
use crate::upscale;
use serde_json::{json, Value};
use std::collections::HashMap;

use super::controls::{default_cfg, default_steps};
use super::graph::{link_from_input, next_node_id};
use super::lora::finish_with_loras;
use super::values::{f64_val, i64_val, sampler_name, scheduler_name, str_val};

pub(crate) struct UpscaleWiring {
    /// Node + input that already holds the sampling MODEL (post-LoRA).
    pub(crate) model_from: (&'static str, &'static str),
    pub(crate) positive: (&'static str, u64),
    pub(crate) negative: (&'static str, u64),
    pub(crate) vae: (&'static str, u64),
    pub(crate) decode_id: &'static str,
    pub(crate) save_id: &'static str,
    /// Flux.2-style custom sampling → `UltimateSDUpscaleGuider`.
    pub(crate) guider: Option<GuiderWiring>,
}

pub(crate) struct GuiderWiring {
    pub(crate) guider: (&'static str, u64),
    pub(crate) sampler: (&'static str, u64),
    pub(crate) sigmas: (&'static str, u64),
}

pub(crate) fn usdu_denoise(arch: &str) -> f64 {
    // Keep structure: turbo/distilled models rewrite hard above ~0.2.
    match arch {
        "z-image" | "krea2" => 0.15,
        "flux" | "flux2" | "ideogram4" => 0.2,
        _ => 0.25,
    }
}

/// Default USDU enlarge when the UI does not send `usduScale` — prefer 2×.
pub(crate) fn usdu_upscale_by_default() -> f64 {
    2.0
}

pub(crate) fn usdu_steps(arch: &str, recipe_steps: i64) -> i64 {
    let cap = match arch {
        "z-image" | "krea2" => 8,
        _ => 12,
    };
    recipe_steps.clamp(1, cap)
}

/// Append shared SR and optional Ultimate SD Upscale after decode; rewire SaveImage.
pub(crate) fn finish_with_upscale(
    mut graph: Value,
    values: &HashMap<String, Value>,
    manifest: &ManifestFile,
    wiring: UpscaleWiring,
) -> Result<Value, String> {
    let Some(opts) = upscale::parse_upscale_opts(values) else {
        return Ok(graph);
    };

    let obj = graph
        .as_object_mut()
        .ok_or_else(|| "compile graph is not an object".to_string())?;

    let image_link = json!([wiring.decode_id, 0]);
    let up_id = next_node_id(obj, 200);
    let up_key = up_id.to_string();

    if opts.kind == upscale::UpscaleKind::Supir {
        let sdxl = opts
            .sdxl_filename
            .clone()
            .unwrap_or_else(|| upscale::SUPIR_SDXL_FILENAME.to_string());
        // lightning/numpy seed_everything only accepts 0..=u32::MAX.
        let seed = i64_val(values, "seed", 0).rem_euclid(1 << 32);
        let prompt = str_val(values, "prompt", "high quality, detailed");
        let a_prompt = if prompt.is_empty() {
            "high quality, detailed".into()
        } else {
            format!("{prompt}, high quality, detailed")
        };
        // SUPIR scale_by is a pre-resize; keep modest (2×) — full 4× is very VRAM-heavy.
        let scale_by = (opts.scale as f64).clamp(1.0, 2.0);
        obj.insert(
            up_key.clone(),
            json!({
                "class_type": "SUPIR_Upscale",
                "inputs": {
                    "supir_model": opts.filename,
                    "sdxl_model": sdxl,
                    "image": image_link,
                    "seed": seed,
                    "resize_method": "lanczos",
                    "scale_by": scale_by,
                    "steps": 20,
                    "restoration_scale": -1.0,
                    "cfg_scale": 4.0,
                    "a_prompt": a_prompt,
                    "n_prompt": "bad quality, blurry, messy",
                    "s_churn": 5,
                    "s_noise": 1.003,
                    "control_scale": 1.0,
                    "cfg_scale_start": 4.0,
                    "control_scale_start": 0.0,
                    "color_fix_type": "Wavelet",
                    "keep_model_loaded": false,
                    "use_tiled_vae": true,
                    "encoder_tile_size_pixels": 512,
                    "decoder_tile_size_latent": 64,
                    "diffusion_dtype": "auto",
                    "encoder_dtype": "auto",
                    "batch_size": 1,
                    "use_tiled_sampling": false,
                    "fp8_unet": true,
                    "fp8_vae": false,
                    "sampler": "RestoreEDMSampler"
                }
            }),
        );
    } else {
        let loader_id = up_id;
        let process_id = loader_id + 1;
        let loader_key = loader_id.to_string();
        let process_key = process_id.to_string();

        obj.insert(
            loader_key.clone(),
            json!({
                "class_type": "UpscaleModelLoader",
                "inputs": { "model_name": opts.filename }
            }),
        );

        if opts.usdu {
            let seed = i64_val(values, "seed", 0);
            let recipe_steps = i64_val(values, "steps", default_steps(manifest)).max(1);
            let steps = opts
                .usdu_steps
                .unwrap_or_else(|| usdu_steps(manifest.arch.as_str(), recipe_steps));
            let cfg = if matches!(manifest.arch.as_str(), "flux" | "flux2") {
                1.0
            } else {
                // ideogram4 DualModelGuider CFG applies via UltimateSDUpscaleGuider.
                f64_val(values, "cfg", default_cfg(manifest) as f64)
            };
            let upscale_by = opts
                .usdu_scale
                .map(|s| if s >= 4 { 4.0 } else { 2.0 })
                .unwrap_or_else(usdu_upscale_by_default);
            let denoise = opts
                .usdu_denoise
                .unwrap_or_else(|| usdu_denoise(manifest.arch.as_str()));
            let sampler = sampler_name(manifest);
            let scheduler = scheduler_name(manifest);

            if let Some(g) = wiring.guider {
                obj.insert(
                    process_key.clone(),
                    json!({
                        "class_type": "UltimateSDUpscaleGuider",
                        "inputs": {
                            "image": image_link,
                            "guider": [g.guider.0, g.guider.1],
                            "sampler": [g.sampler.0, g.sampler.1],
                            "sigmas": [g.sigmas.0, g.sigmas.1],
                            "vae": [wiring.vae.0, wiring.vae.1],
                            "upscale_by": upscale_by,
                            "seed": seed,
                            "upscale_model": [loader_key, 0],
                            "mode_type": "Linear",
                            "tile_width": 512,
                            "tile_height": 512,
                            "mask_blur": 8,
                            "tile_padding": 32,
                            "seam_fix_mode": "None",
                            "seam_fix_denoise": 0.0,
                            "seam_fix_width": 64,
                            "seam_fix_mask_blur": 8,
                            "seam_fix_padding": 16,
                            "force_uniform_tiles": true,
                            "tiled_decode": false,
                            "batch_size": 1
                        }
                    }),
                );
            } else {
                let model = link_from_input(obj, wiring.model_from.0, wiring.model_from.1)?;
                obj.insert(
                    process_key.clone(),
                    json!({
                        "class_type": "UltimateSDUpscale",
                        "inputs": {
                            "image": image_link,
                            "model": [model.0, model.1],
                            "positive": [wiring.positive.0, wiring.positive.1],
                            "negative": [wiring.negative.0, wiring.negative.1],
                            "vae": [wiring.vae.0, wiring.vae.1],
                            "upscale_by": upscale_by,
                            "seed": seed,
                            "steps": steps,
                            "cfg": cfg,
                            "sampler_name": sampler,
                            "scheduler": scheduler,
                            "denoise": denoise,
                            "upscale_model": [loader_key, 0],
                            "mode_type": "Linear",
                            "tile_width": 512,
                            "tile_height": 512,
                            "mask_blur": 8,
                            "tile_padding": 32,
                            "seam_fix_mode": "None",
                            "seam_fix_denoise": 0.0,
                            "seam_fix_width": 64,
                            "seam_fix_mask_blur": 8,
                            "seam_fix_padding": 16,
                            "force_uniform_tiles": true,
                            "tiled_decode": false,
                            "batch_size": 1
                        }
                    }),
                );
            }
        } else {
            obj.insert(
                process_key.clone(),
                json!({
                    "class_type": "ImageUpscaleWithModel",
                    "inputs": {
                        "upscale_model": [loader_key, 0],
                        "image": image_link
                    }
                }),
            );
        }
        // Point SaveImage at the process node (loader is process_id - 1).
        let save = obj
            .get_mut(wiring.save_id)
            .ok_or_else(|| format!("missing SaveImage node {}", wiring.save_id))?;
        let inputs = save
            .get_mut("inputs")
            .and_then(|v| v.as_object_mut())
            .ok_or_else(|| format!("SaveImage {} missing inputs", wiring.save_id))?;
        inputs.insert("images".into(), json!([process_key, 0]));
        return Ok(graph);
    }

    let save = obj
        .get_mut(wiring.save_id)
        .ok_or_else(|| format!("missing SaveImage node {}", wiring.save_id))?;
    let inputs = save
        .get_mut("inputs")
        .and_then(|v| v.as_object_mut())
        .ok_or_else(|| format!("SaveImage {} missing inputs", wiring.save_id))?;
    inputs.insert("images".into(), json!([up_key, 0]));

    Ok(graph)
}

pub(crate) fn finish_recipe(
    graph: Value,
    values: &HashMap<String, Value>,
    manifest: &ManifestFile,
    model_src: (&str, u64),
    clip_src: (&str, u64),
    model_consumers: &[(&str, &str)],
    clip_consumers: &[(&str, &str)],
    wiring: UpscaleWiring,
) -> Result<Value, String> {
    let graph = finish_with_loras(
        graph,
        values,
        model_src,
        clip_src,
        model_consumers,
        clip_consumers,
    )?;
    finish_with_upscale(graph, values, manifest, wiring)
}
