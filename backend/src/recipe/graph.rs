use serde_json::{Map, Value};

pub(crate) fn next_node_id(graph: &Map<String, Value>, start: u64) -> u64 {
    let mut next_id = start;
    while graph.contains_key(&next_id.to_string()) {
        next_id += 1;
    }
    next_id
}

pub(crate) fn link_from_input(
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
