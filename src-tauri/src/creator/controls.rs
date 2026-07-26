use crate::blueprints::BlueprintControl;
use crate::creator::types::{BindableInput, SuggestedControl};
use serde_json::Value;
use std::collections::HashSet;

struct UiSlot {
    id: &'static str,
    control_type: &'static str,
    label: &'static str,
    group: &'static str,
    fixed: bool,
    /// Always emit even when unbound (so the dialog can map it).
    always_emit: bool,
    /// Default include when matched.
    include_when_matched: bool,
}

const UI_SLOTS: &[UiSlot] = &[
    UiSlot {
        id: "prompt",
        control_type: "textarea",
        label: "Prompt",
        group: "default",
        fixed: true,
        always_emit: true,
        include_when_matched: true,
    },
    UiSlot {
        id: "negative",
        control_type: "textarea",
        label: "Negative prompt",
        group: "default",
        fixed: true,
        always_emit: false, // only when the workflow has a negative encode
        include_when_matched: true,
    },
    UiSlot {
        id: "width",
        control_type: "number",
        label: "Width",
        group: "advanced",
        fixed: true,
        always_emit: true,
        include_when_matched: true,
    },
    UiSlot {
        id: "height",
        control_type: "number",
        label: "Height",
        group: "advanced",
        fixed: true,
        always_emit: true,
        include_when_matched: true,
    },
    UiSlot {
        id: "seed",
        control_type: "number",
        label: "Seed (0 = random)",
        group: "advanced",
        fixed: false,
        always_emit: true, // common — emit unbound so user can map noise_seed
        include_when_matched: true,
    },
    UiSlot {
        id: "steps",
        control_type: "number",
        label: "Steps",
        group: "advanced",
        fixed: false,
        always_emit: false,
        include_when_matched: true,
    },
    UiSlot {
        id: "cfg",
        control_type: "number",
        label: "CFG",
        group: "advanced",
        fixed: false,
        always_emit: false,
        include_when_matched: true,
    },
    UiSlot {
        id: "denoise",
        control_type: "number",
        label: "Denoise",
        group: "advanced",
        fixed: false,
        always_emit: false,
        include_when_matched: false,
    },
];

/// List scalar (non-link) inputs from an API-format workflow.
pub fn list_bindable_inputs(workflow: &Value) -> Vec<BindableInput> {
    let Some(obj) = workflow.as_object() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (node_id, node) in obj {
        // Skip non-node keys (UI-format roots, etc.)
        let class_type = match node.get("class_type").and_then(|v| v.as_str()) {
            Some(c) => c.to_string(),
            None => continue,
        };
        let Some(inputs) = node.get("inputs").and_then(|v| v.as_object()) else {
            continue;
        };
        let title = node
            .pointer("/_meta/title")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        for (input_name, value) in inputs {
            let Some(kind) = scalar_kind(value) else {
                continue;
            };
            out.push(BindableInput {
                node_id: node_id.clone(),
                input: input_name.clone(),
                class_type: class_type.clone(),
                kind: kind.into(),
                current: value.clone(),
                title: title.clone(),
            });
        }
    }
    out.sort_by(|a, b| {
        (&a.class_type, &a.node_id, &a.input).cmp(&(&b.class_type, &b.node_id, &b.input))
    });
    out
}

fn scalar_kind(value: &Value) -> Option<&'static str> {
    match value {
        Value::Number(_) => Some("number"),
        Value::String(_) => Some("string"),
        Value::Bool(_) => Some("boolean"),
        // Comfy link: ["nodeId", slotIndex]
        Value::Array(_) => None,
        Value::Null | Value::Object(_) => None,
    }
}

/// Map UI slots onto discovered workflow inputs (aliases + type).
pub fn suggest_controls(workflow: &Value) -> Vec<SuggestedControl> {
    let bindable = list_bindable_inputs(workflow);
    suggest_controls_from_bindable(&bindable)
}

/// True when this scalar string is a plausible positive/negative prompt source.
/// Includes CLIP encodes and ComfyUI-Easy-Use `easy positive` / `easy negative`
/// (common on CivitAI graphs where CLIP `text` is a link, not a widget).
fn is_prompt_bindable(b: &BindableInput) -> bool {
    if b.kind != "string" {
        return false;
    }
    let class = b.class_type.as_str();
    let input = b.input.as_str();

    if input == "text"
        && (class == "CLIPTextEncode"
            || class == "CLIPTextEncodeSDXL"
            || class == "CLIPTextEncodeFlux"
            || class.contains("TextEncode"))
    {
        return true;
    }

    if matches!(
        class,
        "easy positive" | "easy negative" | "easy prompt" | "easy wildcards"
    ) && matches!(
        input,
        "positive" | "negative" | "text" | "prompt" | "string"
    ) {
        return true;
    }

    if matches!(input, "positive" | "negative") {
        return true;
    }

    // PrimitiveString / String Literal titled as a prompt.
    if matches!(input, "value" | "string" | "text")
        && (title_hints_positive(b) || title_hints_negative(b))
    {
        return true;
    }

    false
}

fn prompt_source_rank(b: &BindableInput) -> u8 {
    // Prefer dedicated prompt nodes over CLIP encodes (CLIP text is often linked).
    if b.class_type.starts_with("easy ") {
        0
    } else if title_hints_positive(b) || title_hints_negative(b) {
        1
    } else if matches!(b.input.as_str(), "positive" | "negative") {
        2
    } else if b.class_type.contains("TextEncode") {
        3
    } else {
        4
    }
}

pub fn suggest_controls_from_bindable(bindable: &[BindableInput]) -> Vec<SuggestedControl> {
    let mut claimed: HashSet<String> = HashSet::new();
    let mut out = Vec::new();

    // Prompt / negative — easy-use nodes, titled primitives, then CLIP encodes.
    let mut text_inputs: Vec<&BindableInput> =
        bindable.iter().filter(|b| is_prompt_bindable(b)).collect();
    text_inputs.sort_by(|a, b| {
        prompt_source_rank(a)
            .cmp(&prompt_source_rank(b))
            .then_with(|| a.node_id.cmp(&b.node_id))
    });

    let prompt_text = text_inputs
        .iter()
        .copied()
        .find(|b| {
            title_hints_positive(b) || b.class_type == "easy positive" || b.input == "positive"
        })
        .or_else(|| {
            text_inputs.iter().copied().find(|b| {
                !title_hints_negative(b) && b.class_type != "easy negative" && b.input != "negative"
            })
        })
        .or_else(|| text_inputs.first().copied());
    let prompt_key = prompt_text.map(binding_key);
    let negative_text = text_inputs
        .iter()
        .copied()
        .find(|b| {
            Some(binding_key(b)) != prompt_key
                && (title_hints_negative(b)
                    || b.class_type == "easy negative"
                    || b.input == "negative")
        })
        .or_else(|| {
            text_inputs
                .iter()
                .copied()
                .find(|b| Some(binding_key(b)) != prompt_key)
        });

    for slot in UI_SLOTS {
        let matched: Option<&BindableInput> = match slot.id {
            "prompt" => prompt_text,
            "negative" => negative_text,
            _ => find_alias_match(bindable, &claimed, slot),
        };

        if let Some(b) = matched {
            let key = binding_key(b);
            claimed.insert(key);
            let default = if slot.id == "seed" {
                Some(serde_json::json!(0))
            } else {
                Some(b.current.clone())
            };
            out.push(SuggestedControl {
                id: slot.id.into(),
                control_type: slot.control_type.into(),
                node_id: b.node_id.clone(),
                input: b.input.clone(),
                label: slot.label.into(),
                group: slot.group.into(),
                default,
                include: slot.include_when_matched || slot.fixed,
                fixed: slot.fixed,
            });
        } else if slot.fixed || slot.always_emit {
            out.push(SuggestedControl {
                id: slot.id.into(),
                control_type: slot.control_type.into(),
                node_id: String::new(),
                input: String::new(),
                label: slot.label.into(),
                group: slot.group.into(),
                default: if slot.id == "seed" {
                    Some(serde_json::json!(0))
                } else {
                    None
                },
                include: slot.fixed,
                fixed: slot.fixed,
            });
        }
    }

    out
}

fn find_alias_match<'a>(
    bindable: &'a [BindableInput],
    claimed: &HashSet<String>,
    slot: &UiSlot,
) -> Option<&'a BindableInput> {
    let aliases: &[&str] = match slot.id {
        "width" => &["width"],
        "height" => &["height"],
        "seed" => &["seed", "noise_seed"],
        "steps" => &["steps"],
        "cfg" => &["cfg"],
        "denoise" => &["denoise"],
        _ => return None,
    };
    let want_kind = match slot.control_type {
        "number" | "slider" => "number",
        "textarea" => "string",
        _ => "string",
    };

    // Prefer exact alias order; among equals prefer shorter node ids (root over deep).
    for alias in aliases {
        let mut candidates: Vec<&BindableInput> = bindable
            .iter()
            .filter(|b| {
                b.input == *alias && b.kind == want_kind && !claimed.contains(&binding_key(b))
            })
            .collect();
        if candidates.is_empty() {
            continue;
        }
        candidates.sort_by(|a, b| {
            a.node_id
                .len()
                .cmp(&b.node_id.len())
                .then_with(|| a.node_id.cmp(&b.node_id))
        });
        return candidates.into_iter().next();
    }

    // PrimitiveInt/Float nodes often use input `value` with title Width/Height.
    if matches!(slot.id, "width" | "height") {
        let needle = slot.id;
        let mut candidates: Vec<&BindableInput> = bindable
            .iter()
            .filter(|b| {
                b.kind == "number"
                    && b.input == "value"
                    && !claimed.contains(&binding_key(b))
                    && b.title
                        .as_deref()
                        .map(|t| t.to_ascii_lowercase().contains(needle))
                        .unwrap_or(false)
            })
            .collect();
        candidates.sort_by(|a, b| a.node_id.cmp(&b.node_id));
        return candidates.into_iter().next();
    }

    None
}

fn title_hints_negative(b: &BindableInput) -> bool {
    let t = b.title.as_deref().unwrap_or("").to_ascii_lowercase();
    t.contains("negative")
}

fn title_hints_positive(b: &BindableInput) -> bool {
    let t = b.title.as_deref().unwrap_or("").to_ascii_lowercase();
    (t.contains("positive") || t.contains("prompt")) && !t.contains("negative")
}

fn binding_key(b: &BindableInput) -> String {
    format!("{}.{}", b.node_id, b.input)
}

/// Convert included suggestions into manifest controls.
pub fn controls_from_suggestions(suggestions: Vec<SuggestedControl>) -> Vec<BlueprintControl> {
    suggestions
        .into_iter()
        .filter(|c| (c.include || c.fixed) && !c.node_id.is_empty() && !c.input.is_empty())
        .map(|c| BlueprintControl {
            id: c.id,
            control_type: c.control_type,
            node_id: c.node_id,
            input: c.input,
            label: c.label,
            group: c.group,
            default: c.default,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn suggests_easy_use_prompt_nodes() {
        let workflow = json!({
            "55": {
                "class_type": "CLIPTextEncode",
                "inputs": { "text": ["803", 0], "clip": ["10", 0] },
                "_meta": { "title": "CLIP Text Encode (Positive Prompt)" }
            },
            "804": {
                "class_type": "easy positive",
                "inputs": { "positive": "a cinematic portrait" },
                "_meta": { "title": "Positive Prompt" }
            },
            "805": {
                "class_type": "easy negative",
                "inputs": { "negative": "blurry ugly bad" },
                "_meta": { "title": "Negative Prompt" }
            }
        });
        let controls = suggest_controls(&workflow);
        let prompt = controls.iter().find(|c| c.id == "prompt").unwrap();
        let negative = controls.iter().find(|c| c.id == "negative").unwrap();
        assert_eq!(prompt.node_id, "804");
        assert_eq!(prompt.input, "positive");
        assert_eq!(negative.node_id, "805");
        assert_eq!(negative.input, "negative");
    }
}
