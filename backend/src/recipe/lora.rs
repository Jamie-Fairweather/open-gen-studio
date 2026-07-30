use serde_json::{json, Map, Value};
use std::collections::HashMap;

/// Resolved LoRA stack from generate values: `[{ filename, strength }]`.
pub(crate) fn lora_stack(values: &HashMap<String, Value>) -> Vec<(String, f64)> {
    let Some(arr) = values.get("loras").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|item| {
            let filename = item.get("filename")?.as_str()?.trim();
            if filename.is_empty() {
                return None;
            }
            let strength = item.get("strength").and_then(|v| v.as_f64()).unwrap_or(1.0);
            Some((filename.to_string(), strength))
        })
        .collect()
}

/// Chain `LoraLoader` after model/clip sources; rewire consumer inputs to the stack tip.
pub(crate) fn apply_lora_stack(
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

pub(crate) fn finish_with_loras(
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
