//! Comfy utility workflow builders for Image→Prompt and Prompt Enhancer.

use super::prompts::{
    enhance_system_prompt, general_custom_prompt, graphic_custom_prompt, json_custom_prompt,
    structured_custom_prompt,
};
use super::types::{PromptFormat, PromptTarget, QWENVL_MODEL_NAME, QWENVL_QUANT};
use serde_json::{json, Value};

/// Comfy rejects graphs with no `OUTPUT_NODE`. Caption nodes return STRING but are not
/// output nodes - terminate every utility graph with built-in PreviewAny.
fn preview_any_node(source: (&str, usize)) -> Value {
    json!({
        "class_type": "PreviewAny",
        "inputs": {
            "source": [source.0, source.1]
        }
    })
}

pub(crate) fn build_qwenvl_image(filename: &str, custom_prompt: &str) -> Value {
    json!({
        "1": {
            "class_type": "LoadImage",
            "inputs": { "image": filename }
        },
        "2": {
            "class_type": "AILab_QwenVL",
            "inputs": {
                "image": ["1", 0],
                "model_name": QWENVL_MODEL_NAME,
                "quantization": QWENVL_QUANT,
                "attention_mode": "auto",
                "preset_prompt": "🖼️ Detailed Description",
                "custom_prompt": custom_prompt,
                "max_tokens": 1024,
                "keep_model_loaded": false,
                "seed": 1
            }
        },
        "3": preview_any_node(("2", 0))
    })
}

pub(crate) fn build_enhance_workflow(prompt: &str, target: PromptTarget, mode: &str) -> Value {
    let system = enhance_system_prompt(target, mode);
    json!({
        "1": {
            "class_type": "AILab_QwenVL_PromptEnhancer",
            "inputs": {
                "model_name": QWENVL_MODEL_NAME,
                "quantization": QWENVL_QUANT,
                "attention_mode": "auto",
                "use_torch_compile": false,
                "device": "auto",
                "prompt_text": prompt,
                "enhancement_style": "📝 Enhance",
                "custom_system_prompt": system,
                "max_tokens": 768,
                "temperature": 0.7,
                "top_p": 0.9,
                "repetition_penalty": 1.1,
                "keep_model_loaded": false,
                "seed": 1
            }
        },
        "2": preview_any_node(("1", 0))
    })
}

pub(crate) fn build_workflow(
    format: PromptFormat,
    target: PromptTarget,
    filename: &str,
) -> Result<Value, String> {
    Ok(match format {
        PromptFormat::General => build_qwenvl_image(filename, &general_custom_prompt(target)),
        PromptFormat::Structured => build_qwenvl_image(filename, &structured_custom_prompt(target)),
        PromptFormat::Json => build_qwenvl_image(filename, &json_custom_prompt(target)),
        PromptFormat::GraphicDesign => build_qwenvl_image(filename, &graphic_custom_prompt(target)),
    })
}
