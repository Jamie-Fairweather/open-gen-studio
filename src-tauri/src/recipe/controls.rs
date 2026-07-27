use crate::blueprints::{BlueprintControl, ManifestFile};
use crate::recipe::RecipeArch;
use serde_json::{json, Map, Value};

/// UI controls for a recipe when the manifest omits `controls[]`.
pub fn synthetic_controls(manifest: &ManifestFile) -> Vec<BlueprintControl> {
    let caps = &manifest.capabilities;
    let defaults = &manifest.defaults;
    let arch = RecipeArch::parse(&manifest.arch);
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
        num_control("steps", "Steps", "core", defaults, default_steps(arch)),
    ]);
    if matches!(arch, Some(RecipeArch::Flux | RecipeArch::Flux2)) {
        out.push(float_control("guidance", "Guidance", "core", defaults, 3.5));
    } else {
        out.push(num_control(
            "cfg",
            "CFG",
            "core",
            defaults,
            default_cfg(arch),
        ));
    }
    out
}

pub(crate) fn num_control(
    id: &str,
    label: &str,
    group: &str,
    defaults: &Map<String, Value>,
    fallback: i64,
) -> BlueprintControl {
    let default = defaults.get(id).cloned().unwrap_or_else(|| json!(fallback));
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

pub(crate) fn float_control(
    id: &str,
    label: &str,
    group: &str,
    defaults: &Map<String, Value>,
    fallback: f64,
) -> BlueprintControl {
    let default = defaults.get(id).cloned().unwrap_or_else(|| json!(fallback));
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

pub(crate) fn default_steps(arch: Option<RecipeArch>) -> i64 {
    match arch {
        Some(RecipeArch::ZImage | RecipeArch::Krea2) => 8,
        Some(RecipeArch::Flux | RecipeArch::Flux2 | RecipeArch::Ideogram4) => 20,
        _ => 28,
    }
}

pub(crate) fn default_cfg(arch: Option<RecipeArch>) -> i64 {
    match arch {
        Some(RecipeArch::ZImage | RecipeArch::Krea2 | RecipeArch::Flux | RecipeArch::Flux2) => 1,
        Some(RecipeArch::Ideogram4) => 7,
        _ => 7,
    }
}
