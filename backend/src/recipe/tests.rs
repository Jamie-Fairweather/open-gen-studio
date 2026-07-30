use crate::blueprints::ManifestFile;
use crate::recipe::compile;
use serde_json::{json, Value};
use std::collections::HashMap;

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
fn compiles_pony_with_clip_skip() {
    let m = manifest_from(json!({
        "id": "pony-test",
        "name": "Pony",
        "category": "image",
        "runtime": "comfyui",
        "flowType": "txt2img",
        "arch": "pony",
        "sampler": "euler_ancestral",
        "scheduler": "karras",
        "capabilities": { "negative": true },
        "models": [
            { "filename": "pony.safetensors", "path": "checkpoints", "role": "checkpoint" },
            { "filename": "sdxl_vae.safetensors", "path": "vae", "role": "vae" }
        ]
    }));
    let mut values = HashMap::new();
    values.insert(
        "prompt".into(),
        json!("score_9, score_8_up, score_7_up, portrait"),
    );
    values.insert("negative".into(), json!("score_6, blurry"));
    values.insert("cfg".into(), json!(7));
    values.insert("steps".into(), json!(25));
    values.insert("width".into(), json!(1024));
    values.insert("height".into(), json!(1024));
    values.insert("seed".into(), json!(1));
    let g = compile(&m, &values).unwrap();
    assert_eq!(g["1"]["class_type"], "CheckpointLoaderSimple");
    assert_eq!(g["9"]["class_type"], "CLIPSetLastLayer");
    assert_eq!(g["9"]["inputs"]["stop_at_clip_layer"], -2);
    assert_eq!(g["9"]["inputs"]["clip"], json!(["1", 1]));
    assert_eq!(g["2"]["inputs"]["clip"], json!(["9", 0]));
    assert_eq!(g["3"]["inputs"]["clip"], json!(["9", 0]));
    assert_eq!(g["8"]["class_type"], "VAELoader");
    assert_eq!(g["6"]["inputs"]["vae"], json!(["8", 0]));
    assert_eq!(g["5"]["inputs"]["sampler_name"], "euler_ancestral");
    assert_eq!(g["5"]["inputs"]["scheduler"], "karras");
}

#[test]
fn compiles_illustrious_vpred_and_clip_skip() {
    let m = manifest_from(json!({
        "id": "illustrious-test",
        "name": "Illustrious",
        "category": "image",
        "runtime": "comfyui",
        "flowType": "txt2img",
        "arch": "illustrious",
        "sampler": "euler",
        "scheduler": "normal",
        "capabilities": { "negative": true },
        "models": [
            { "filename": "noobai.safetensors", "path": "checkpoints", "role": "checkpoint" }
        ]
    }));
    let mut values = HashMap::new();
    values.insert("prompt".into(), json!("1girl"));
    values.insert("negative".into(), json!("blurry"));
    values.insert("cfg".into(), json!(5));
    values.insert("steps".into(), json!(28));
    values.insert("seed".into(), json!(1));
    let g = compile(&m, &values).unwrap();
    assert_eq!(g["9"]["class_type"], "CLIPSetLastLayer");
    assert_eq!(g["10"]["class_type"], "ModelSamplingDiscrete");
    assert_eq!(g["10"]["inputs"]["sampling"], "v_prediction");
    assert_eq!(g["10"]["inputs"]["zsnr"], true);
    assert_eq!(g["5"]["inputs"]["model"], json!(["10", 0]));
    assert_eq!(g["2"]["inputs"]["clip"], json!(["9", 0]));
}

#[test]
fn compiles_qwen_image_graph() {
    let m = manifest_from(json!({
        "id": "qwen-test",
        "name": "Qwen",
        "category": "image",
        "runtime": "comfyui",
        "flowType": "txt2img",
        "arch": "qwen-image",
        "capabilities": { "negative": true },
        "defaults": { "clipType": "qwen_image", "auraShift": 3.1 },
        "models": [
            { "filename": "qwen.safetensors", "path": "diffusion_models", "role": "unet" },
            { "filename": "te.safetensors", "path": "text_encoders", "role": "text_encoder" },
            { "filename": "vae.safetensors", "path": "vae", "role": "vae" }
        ]
    }));
    let mut values = HashMap::new();
    values.insert("prompt".into(), json!("poster text"));
    values.insert("negative".into(), json!(""));
    values.insert("cfg".into(), json!(2.5));
    values.insert("steps".into(), json!(30));
    values.insert("seed".into(), json!(1));
    let g = compile(&m, &values).unwrap();
    assert_eq!(g["1"]["class_type"], "UNETLoader");
    assert_eq!(g["2"]["inputs"]["type"], "qwen_image");
    assert_eq!(g["6"]["class_type"], "EmptySD3LatentImage");
    assert_eq!(g["7"]["class_type"], "ModelSamplingAuraFlow");
    assert_eq!(g["5"]["class_type"], "CLIPTextEncode");
}

#[test]
fn compiles_sd35_graph() {
    let m = manifest_from(json!({
        "id": "sd35-test",
        "name": "SD35",
        "category": "image",
        "runtime": "comfyui",
        "flowType": "txt2img",
        "arch": "sd3.5",
        "capabilities": { "negative": true },
        "defaults": { "sd3Shift": 3.0 },
        "models": [
            { "filename": "sd35.safetensors", "path": "checkpoints", "role": "checkpoint" },
            { "filename": "clip_l.safetensors", "path": "text_encoders", "role": "clip_l" },
            { "filename": "clip_g.safetensors", "path": "text_encoders", "role": "clip_g" },
            { "filename": "t5.safetensors", "path": "text_encoders", "role": "t5" }
        ]
    }));
    let mut values = HashMap::new();
    values.insert("prompt".into(), json!("landscape"));
    values.insert("negative".into(), json!("blurry"));
    values.insert("cfg".into(), json!(4.5));
    values.insert("steps".into(), json!(40));
    values.insert("seed".into(), json!(1));
    let g = compile(&m, &values).unwrap();
    assert_eq!(g["2"]["class_type"], "TripleCLIPLoader");
    assert_eq!(g["5"]["class_type"], "EmptySD3LatentImage");
    assert_eq!(g["6"]["class_type"], "ModelSamplingSD3");
    assert_eq!(g["7"]["inputs"]["model"], json!(["6", 0]));
}

#[test]
fn compiles_chroma_graph() {
    let m = manifest_from(json!({
        "id": "chroma-test",
        "name": "Chroma",
        "category": "image",
        "runtime": "comfyui",
        "flowType": "txt2img",
        "arch": "chroma",
        "capabilities": { "negative": true },
        "defaults": { "clipType": "chroma", "auraShift": 1.0 },
        "models": [
            { "filename": "chroma.safetensors", "path": "diffusion_models", "role": "unet" },
            { "filename": "t5.safetensors", "path": "text_encoders", "role": "text_encoder" },
            { "filename": "ae.safetensors", "path": "vae", "role": "vae" }
        ]
    }));
    let mut values = HashMap::new();
    values.insert("prompt".into(), json!("portrait"));
    values.insert("negative".into(), json!("blurry"));
    values.insert("cfg".into(), json!(4));
    values.insert("steps".into(), json!(26));
    values.insert("seed".into(), json!(1));
    let g = compile(&m, &values).unwrap();
    assert_eq!(g["2"]["inputs"]["type"], "chroma");
    assert_eq!(g["6"]["class_type"], "EmptySD3LatentImage");
    assert_eq!(g["7"]["class_type"], "ModelSamplingAuraFlow");
    assert_eq!(g["5"]["class_type"], "CLIPTextEncode");
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
    // Above numpy/lightning u32 max - must wrap for SUPIR.
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
    assert_eq!(
        g["200"]["inputs"]["supir_model"],
        "SUPIR-v0Q_fp16.safetensors"
    );
    assert_eq!(
        g["200"]["inputs"]["sdxl_model"],
        "sd_xl_base_1.0.safetensors"
    );
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
    assert_eq!(
        g["2"]["inputs"]["unet_name"],
        "ideogram4_unconditional_fp8_scaled.safetensors"
    );
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
