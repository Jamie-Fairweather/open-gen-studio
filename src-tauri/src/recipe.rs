//! Recipe Blueprints: compile Comfy API graphs at generate time.
//! See docs/PLAN-RECIPE-BLUEPRINTS.md.

use crate::blueprints::{BlueprintControl, ManifestFile, ModelEntry};
use crate::upscale;
use serde_json::{json, Map, Value};
use std::collections::HashMap;

/// Wiring for optional shared upscale / Ultimate SD Upscale after VAEDecode.
struct UpscaleWiring {
    /// Node + input that already holds the sampling MODEL (post-LoRA).
    model_from: (&'static str, &'static str),
    positive: (&'static str, u64),
    negative: (&'static str, u64),
    vae: (&'static str, u64),
    decode_id: &'static str,
    save_id: &'static str,
    /// Flux.2-style custom sampling → `UltimateSDUpscaleGuider`.
    guider: Option<GuiderWiring>,
}

struct GuiderWiring {
    guider: (&'static str, u64),
    sampler: (&'static str, u64),
    sigmas: (&'static str, u64),
}

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
        "ideogram4" => compile_ideogram4(manifest, values),
        "sdxl" | "sd15" => compile_checkpoint(manifest, values),
        "" => Err("blueprint missing arch — only recipe blueprints are supported".into()),
        other => Err(format!(
            "unsupported arch '{other}' (supported: z-image, krea2, flux, flux2, ideogram4, sdxl, sd15)"
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
        "flux" | "flux2" | "ideogram4" => 20,
        _ => 28,
    }
}

fn default_cfg(manifest: &ManifestFile) -> i64 {
    match manifest.arch.as_str() {
        "z-image" | "krea2" | "flux" | "flux2" => 1,
        "ideogram4" => 7,
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
            "krea2" | "flux" | "flux2" | "ideogram4" => "euler",
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

/// Resolved LoRA stack from generate values: `[{ filename, strength }]`.
fn lora_stack(values: &HashMap<String, Value>) -> Vec<(String, f64)> {
    let Some(arr) = values.get("loras").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|item| {
            let filename = item.get("filename")?.as_str()?.trim();
            if filename.is_empty() {
                return None;
            }
            let strength = item
                .get("strength")
                .and_then(|v| v.as_f64())
                .unwrap_or(1.0);
            Some((filename.to_string(), strength))
        })
        .collect()
}

/// Chain `LoraLoader` after model/clip sources; rewire consumer inputs to the stack tip.
fn apply_lora_stack(
    graph: &mut Map<String, Value>,
    model_src: (&str, u64),
    clip_src: (&str, u64),
    stack: &[(String, f64)],
    model_consumers: &[(&str, &str)],
    clip_consumers: &[(&str, &str)],
) -> Result<(), String> {
    if stack.is_empty() {
        return Ok(());
    }
    let mut model = (model_src.0.to_string(), model_src.1);
    let mut clip = (clip_src.0.to_string(), clip_src.1);
    let mut next_id = 100u64;
    while graph.contains_key(&next_id.to_string()) {
        next_id += 1;
    }
    for (filename, strength) in stack {
        let sid = next_id.to_string();
        graph.insert(
            sid.clone(),
            json!({
                "class_type": "LoraLoader",
                "inputs": {
                    "model": [model.0, model.1],
                    "clip": [clip.0, clip.1],
                    "lora_name": filename,
                    "strength_model": strength,
                    "strength_clip": strength
                }
            }),
        );
        model = (sid.clone(), 0);
        clip = (sid, 1);
        next_id += 1;
    }
    for (node_id, input) in model_consumers {
        let node = graph
            .get_mut(*node_id)
            .ok_or_else(|| format!("missing node {node_id} for LoRA rewire"))?;
        let inputs = node
            .get_mut("inputs")
            .and_then(|v| v.as_object_mut())
            .ok_or_else(|| format!("node {node_id} missing inputs"))?;
        inputs.insert(input.to_string(), json!([model.0, model.1]));
    }
    for (node_id, input) in clip_consumers {
        let node = graph
            .get_mut(*node_id)
            .ok_or_else(|| format!("missing node {node_id} for LoRA rewire"))?;
        let inputs = node
            .get_mut("inputs")
            .and_then(|v| v.as_object_mut())
            .ok_or_else(|| format!("node {node_id} missing inputs"))?;
        inputs.insert(input.to_string(), json!([clip.0, clip.1]));
    }
    Ok(())
}

fn finish_with_loras(
    mut graph: Value,
    values: &HashMap<String, Value>,
    model_src: (&str, u64),
    clip_src: (&str, u64),
    model_consumers: &[(&str, &str)],
    clip_consumers: &[(&str, &str)],
) -> Result<Value, String> {
    let stack = lora_stack(values);
    if stack.is_empty() {
        return Ok(graph);
    }
    let obj = graph
        .as_object_mut()
        .ok_or_else(|| "compile graph is not an object".to_string())?;
    apply_lora_stack(
        obj,
        model_src,
        clip_src,
        &stack,
        model_consumers,
        clip_consumers,
    )?;
    Ok(graph)
}

fn next_node_id(graph: &Map<String, Value>, start: u64) -> u64 {
    let mut next_id = start;
    while graph.contains_key(&next_id.to_string()) {
        next_id += 1;
    }
    next_id
}

fn link_from_input(
    graph: &Map<String, Value>,
    node_id: &str,
    input: &str,
) -> Result<(String, u64), String> {
    let node = graph
        .get(node_id)
        .ok_or_else(|| format!("missing node {node_id} for upscale wiring"))?;
    let arr = node
        .get("inputs")
        .and_then(|i| i.get(input))
        .and_then(|v| v.as_array())
        .ok_or_else(|| format!("node {node_id} missing link input '{input}'"))?;
    let id = arr
        .first()
        .and_then(|v| {
            v.as_str()
                .map(|s| s.to_string())
                .or_else(|| v.as_i64().map(|n| n.to_string()))
                .or_else(|| v.as_u64().map(|n| n.to_string()))
        })
        .ok_or_else(|| format!("node {node_id}.{input} is not a node link"))?;
    let slot = arr
        .get(1)
        .and_then(|v| v.as_u64().or_else(|| v.as_i64().map(|n| n as u64)))
        .unwrap_or(0);
    Ok((id, slot))
}

fn usdu_denoise(arch: &str) -> f64 {
    // Keep structure: turbo/distilled models rewrite hard above ~0.2.
    match arch {
        "z-image" | "krea2" => 0.15,
        "flux" | "flux2" | "ideogram4" => 0.2,
        _ => 0.25,
    }
}

/// Default USDU enlarge when the UI does not send `usduScale` — prefer 2×.
fn usdu_upscale_by_default() -> f64 {
    2.0
}

fn usdu_steps(arch: &str, recipe_steps: i64) -> i64 {
    let cap = match arch {
        "z-image" | "krea2" => 8,
        _ => 12,
    };
    recipe_steps.clamp(1, cap)
}

/// Append shared SR and optional Ultimate SD Upscale after decode; rewire SaveImage.
fn finish_with_upscale(
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

fn finish_recipe(
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

    let graph = json!({
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
    });
    finish_recipe(
        graph,
        values,
        manifest,
        ("1", 0),
        ("2", 0),
        &[("7", "model")],
        &[("4", "clip")],
        UpscaleWiring {
            model_from: ("8", "model"),
            positive: ("4", 0),
            negative: ("5", 0),
            vae: ("3", 0),
            decode_id: "9",
            save_id: "10",
            guider: None,
        },
    )
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

/// Ideogram 4 txt2img (official Comfy blueprint path):
/// dual UNET (cond + uncond) + CLIP(ideogram4) + VAE + CFGOverride + DualModelGuider
/// + EmptyFlux2LatentImage + Ideogram4Scheduler + SamplerCustomAdvanced.
fn compile_ideogram4(
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
    fn compiles_krea2_with_lora_stack() {
        let m = manifest_from(json!({
            "id": "krea2-turbo",
            "name": "Krea 2",
            "category": "image",
            "runtime": "comfyui",
            "flowType": "txt2img",
            "arch": "krea2",
            "capabilities": { "loras": true },
            "models": [
                { "filename": "unet.safetensors", "path": "diffusion_models", "role": "unet" },
                { "filename": "te.safetensors", "path": "text_encoders", "role": "text_encoder" },
                { "filename": "vae.safetensors", "path": "vae", "role": "vae" }
            ]
        }));
        let mut values = HashMap::new();
        values.insert("prompt".into(), json!("test"));
        values.insert(
            "loras".into(),
            json!([{ "filename": "style.safetensors", "strength": 0.8 }]),
        );
        let g = compile(&m, &values).unwrap();
        assert_eq!(g["100"]["class_type"], "LoraLoader");
        assert_eq!(g["100"]["inputs"]["lora_name"], "style.safetensors");
        assert_eq!(g["100"]["inputs"]["strength_model"], 0.8);
        assert_eq!(g["4"]["inputs"]["clip"], json!(["100", 1]));
        assert_eq!(g["7"]["inputs"]["model"], json!(["100", 0]));
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

    #[test]
    fn compiles_krea2_with_sr_upscale() {
        let m = manifest_from(json!({
            "id": "krea2-turbo",
            "name": "Krea 2",
            "category": "image",
            "runtime": "comfyui",
            "flowType": "txt2img",
            "arch": "krea2",
            "models": [
                { "filename": "unet.safetensors", "path": "diffusion_models", "role": "unet" },
                { "filename": "te.safetensors", "path": "text_encoders", "role": "text_encoder" },
                { "filename": "vae.safetensors", "path": "vae", "role": "vae" }
            ]
        }));
        let mut values = HashMap::new();
        values.insert("prompt".into(), json!("test"));
        values.insert(
            "upscale".into(),
            json!({
                "modelId": "4x-ultrasharp",
                "filename": "4x-UltraSharp.pth",
                "scale": 4,
                "usdu": false
            }),
        );
        let g = compile(&m, &values).unwrap();
        assert_eq!(g["200"]["class_type"], "UpscaleModelLoader");
        assert_eq!(g["200"]["inputs"]["model_name"], "4x-UltraSharp.pth");
        assert_eq!(g["201"]["class_type"], "ImageUpscaleWithModel");
        assert_eq!(g["201"]["inputs"]["image"], json!(["8", 0]));
        assert_eq!(g["9"]["inputs"]["images"], json!(["201", 0]));
    }

    #[test]
    fn compiles_sdxl_with_usdu() {
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
        values.insert("cfg".into(), json!(7));
        values.insert("steps".into(), json!(20));
        values.insert("seed".into(), json!(1));
        values.insert(
            "upscale".into(),
            json!({
                "modelId": "realesrgan-x2plus",
                "filename": "RealESRGAN_x2plus.pth",
                "scale": 2,
                "usdu": true
            }),
        );
        let g = compile(&m, &values).unwrap();
        assert_eq!(g["200"]["class_type"], "UpscaleModelLoader");
        assert_eq!(g["201"]["class_type"], "UltimateSDUpscale");
        assert_eq!(g["201"]["inputs"]["upscale_by"], 2.0);
        assert_eq!(g["201"]["inputs"]["denoise"], 0.25);
        assert_eq!(g["7"]["inputs"]["images"], json!(["201", 0]));
    }

    #[test]
    fn usdu_defaults_to_2x_and_low_denoise_on_krea2() {
        let m = manifest_from(json!({
            "id": "krea2-turbo",
            "name": "Krea 2",
            "category": "image",
            "runtime": "comfyui",
            "flowType": "txt2img",
            "arch": "krea2",
            "models": [
                { "filename": "unet.safetensors", "path": "diffusion_models", "role": "unet" },
                { "filename": "te.safetensors", "path": "text_encoders", "role": "text_encoder" },
                { "filename": "vae.safetensors", "path": "vae", "role": "vae" }
            ]
        }));
        let mut values = HashMap::new();
        values.insert("prompt".into(), json!("test"));
        values.insert("steps".into(), json!(8));
        values.insert(
            "upscale".into(),
            json!({
                "filename": "4x-UltraSharp.pth",
                "scale": 4,
                "usdu": true
            }),
        );
        let g = compile(&m, &values).unwrap();
        assert_eq!(g["201"]["class_type"], "UltimateSDUpscale");
        assert_eq!(g["201"]["inputs"]["upscale_by"], 2.0);
        assert_eq!(g["201"]["inputs"]["denoise"], 0.15);
        assert_eq!(g["201"]["inputs"]["steps"], 8);
    }

    #[test]
    fn usdu_honors_explicit_scale_steps_denoise() {
        let m = manifest_from(json!({
            "id": "krea2-turbo",
            "name": "Krea 2",
            "category": "image",
            "runtime": "comfyui",
            "flowType": "txt2img",
            "arch": "krea2",
            "models": [
                { "filename": "unet.safetensors", "path": "diffusion_models", "role": "unet" },
                { "filename": "te.safetensors", "path": "text_encoders", "role": "text_encoder" },
                { "filename": "vae.safetensors", "path": "vae", "role": "vae" }
            ]
        }));
        let mut values = HashMap::new();
        values.insert("prompt".into(), json!("test"));
        values.insert(
            "upscale".into(),
            json!({
                "filename": "4x-UltraSharp.pth",
                "scale": 4,
                "usdu": true,
                "usduScale": 4,
                "usduSteps": 6,
                "usduDenoise": 0.35
            }),
        );
        let g = compile(&m, &values).unwrap();
        assert_eq!(g["201"]["inputs"]["upscale_by"], 4.0);
        assert_eq!(g["201"]["inputs"]["steps"], 6);
        assert_eq!(g["201"]["inputs"]["denoise"], 0.35);
    }

    #[test]
    fn compiles_krea2_with_supir() {
        let m = manifest_from(json!({
            "id": "krea2-turbo",
            "name": "Krea 2",
            "category": "image",
            "runtime": "comfyui",
            "flowType": "txt2img",
            "arch": "krea2",
            "models": [
                { "filename": "unet.safetensors", "path": "diffusion_models", "role": "unet" },
                { "filename": "te.safetensors", "path": "text_encoders", "role": "text_encoder" },
                { "filename": "vae.safetensors", "path": "vae", "role": "vae" }
            ]
        }));
        let mut values = HashMap::new();
        values.insert("prompt".into(), json!("portrait"));
        // Above numpy/lightning u32 max — must wrap for SUPIR.
        values.insert("seed".into(), json!(4_745_625_442_457_469i64));
        values.insert(
            "upscale".into(),
            json!({
                "modelId": "supir-v0q",
                "filename": "SUPIR-v0Q_fp16.safetensors",
                "scale": 2,
                "kind": "supir",
                "usdu": false,
                "sdxlFilename": "sd_xl_base_1.0.safetensors"
            }),
        );
        let g = compile(&m, &values).unwrap();
        assert_eq!(g["200"]["class_type"], "SUPIR_Upscale");
        assert_eq!(g["200"]["inputs"]["supir_model"], "SUPIR-v0Q_fp16.safetensors");
        assert_eq!(g["200"]["inputs"]["sdxl_model"], "sd_xl_base_1.0.safetensors");
        assert_eq!(g["200"]["inputs"]["scale_by"], 2.0);
        assert_eq!(g["200"]["inputs"]["seed"], 112_990_077);
        assert_eq!(g["9"]["inputs"]["images"], json!(["200", 0]));
    }

    #[test]
    fn compiles_flux2_usdu_uses_guider_node() {
        let m = manifest_from(json!({
            "id": "flux2-dev",
            "name": "Flux.2 Dev",
            "category": "image",
            "runtime": "comfyui",
            "flowType": "txt2img",
            "arch": "flux2",
            "sampler": "euler",
            "models": [
                { "filename": "flux2.safetensors", "path": "diffusion_models", "role": "unet" },
                { "filename": "clip.safetensors", "path": "text_encoders", "role": "clip" },
                { "filename": "vae.safetensors", "path": "vae", "role": "vae" }
            ]
        }));
        let mut values = HashMap::new();
        values.insert("prompt".into(), json!("fox"));
        values.insert(
            "upscale".into(),
            json!({
                "filename": "4x-UltraSharp.pth",
                "scale": 4,
                "usdu": true
            }),
        );
        let g = compile(&m, &values).unwrap();
        assert_eq!(g["201"]["class_type"], "UltimateSDUpscaleGuider");
        assert_eq!(g["201"]["inputs"]["guider"], json!(["8", 0]));
        assert_eq!(g["201"]["inputs"]["upscale_by"], 2.0);
        assert_eq!(g["13"]["inputs"]["images"], json!(["201", 0]));
    }

    #[test]
    fn compiles_ideogram4_graph() {
        let m = manifest_from(json!({
            "id": "ideogram4",
            "name": "Ideogram 4",
            "category": "image",
            "runtime": "comfyui",
            "flowType": "txt2img",
            "arch": "ideogram4",
            "sampler": "euler",
            "capabilities": { "negative": false },
            "defaults": {
                "mu": 0.0,
                "std": 1.75,
                "cfgOverride": 3.0,
                "cfgOverrideStart": 0.7,
                "cfgOverrideEnd": 1.0
            },
            "models": [
                { "filename": "ideogram4_fp8_scaled.safetensors", "path": "diffusion_models", "role": "unet" },
                { "filename": "ideogram4_unconditional_fp8_scaled.safetensors", "path": "diffusion_models", "role": "unet_uncond" },
                { "filename": "qwen3vl_8b_fp8_scaled.safetensors", "path": "text_encoders", "role": "text_encoder" },
                { "filename": "flux2-vae.safetensors", "path": "vae", "role": "vae" }
            ]
        }));
        let mut values = HashMap::new();
        values.insert("prompt".into(), json!("a poster"));
        values.insert("width".into(), json!(1024));
        values.insert("height".into(), json!(1024));
        values.insert("seed".into(), json!(9));
        values.insert("steps".into(), json!(20));
        values.insert("cfg".into(), json!(7));
        let g = compile(&m, &values).unwrap();
        assert_eq!(g["1"]["class_type"], "UNETLoader");
        assert_eq!(g["2"]["inputs"]["unet_name"], "ideogram4_unconditional_fp8_scaled.safetensors");
        assert_eq!(g["3"]["inputs"]["type"], "ideogram4");
        assert_eq!(g["5"]["class_type"], "CFGOverride");
        assert_eq!(g["8"]["class_type"], "DualModelGuider");
        assert_eq!(g["8"]["inputs"]["cfg"], 7.0);
        assert_eq!(g["8"]["inputs"]["model_negative"], json!(["2", 0]));
        assert_eq!(g["9"]["class_type"], "EmptyFlux2LatentImage");
        assert_eq!(g["12"]["class_type"], "Ideogram4Scheduler");
        assert_eq!(g["12"]["inputs"]["mu"], 0.0);
        assert_eq!(g["12"]["inputs"]["std"], 1.75);
        assert_eq!(g["13"]["class_type"], "SamplerCustomAdvanced");
        assert_eq!(g["10"]["inputs"]["noise_seed"], 9);
        assert_eq!(g["6"]["inputs"]["text"], "a poster");
    }

    #[test]
    fn compiles_ideogram4_usdu_uses_guider_node() {
        let m = manifest_from(json!({
            "id": "ideogram4",
            "name": "Ideogram 4",
            "category": "image",
            "runtime": "comfyui",
            "flowType": "txt2img",
            "arch": "ideogram4",
            "sampler": "euler",
            "models": [
                { "filename": "ideogram4.safetensors", "path": "diffusion_models", "role": "unet" },
                { "filename": "ideogram4_uncond.safetensors", "path": "diffusion_models", "role": "unet_uncond" },
                { "filename": "te.safetensors", "path": "text_encoders", "role": "text_encoder" },
                { "filename": "vae.safetensors", "path": "vae", "role": "vae" }
            ]
        }));
        let mut values = HashMap::new();
        values.insert("prompt".into(), json!("fox"));
        values.insert(
            "upscale".into(),
            json!({
                "filename": "4x-UltraSharp.pth",
                "scale": 4,
                "usdu": true
            }),
        );
        let g = compile(&m, &values).unwrap();
        assert_eq!(g["200"]["class_type"], "UpscaleModelLoader");
        assert_eq!(g["201"]["class_type"], "UltimateSDUpscaleGuider");
        assert_eq!(g["201"]["inputs"]["guider"], json!(["8", 0]));
        assert_eq!(g["15"]["inputs"]["images"], json!(["201", 0]));
    }
}
