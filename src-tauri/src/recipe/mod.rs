//! Recipe Blueprints: compile Comfy API graphs at generate time.
//! See docs/PLAN-RECIPE-BLUEPRINTS.md.

mod arch;
mod arch_id;
mod controls;
mod graph;
mod lora;
mod upscale_tail;
mod values;

#[cfg(test)]
mod tests;

use crate::blueprints::ManifestFile;
use serde_json::Value;
use std::collections::HashMap;

pub use arch_id::RecipeArch;
pub use controls::synthetic_controls;

use arch::{
    compile_checkpoint, compile_flux, compile_flux2, compile_ideogram4, compile_krea2,
    compile_z_image,
};

/// Compile a Comfy API workflow from a recipe + live User Mode values.
pub fn compile(manifest: &ManifestFile, values: &HashMap<String, Value>) -> Result<Value, String> {
    let flow = if manifest.flow_type.is_empty() {
        "txt2img"
    } else {
        manifest.flow_type.as_str()
    };
    if flow != "txt2img" {
        return Err(format!("unsupported flowType '{flow}' (v1: txt2img only)"));
    }

    if manifest.arch.is_empty() {
        return Err("blueprint missing arch - only recipe blueprints are supported".into());
    }

    let Some(arch) = RecipeArch::parse(&manifest.arch) else {
        return Err(format!(
            "unsupported arch '{}' (supported: {})",
            manifest.arch,
            RecipeArch::supported_list()
        ));
    };

    match arch {
        RecipeArch::ZImage => compile_z_image(manifest, values),
        RecipeArch::Krea2 => compile_krea2(manifest, values),
        RecipeArch::Flux => compile_flux(manifest, values),
        RecipeArch::Flux2 => compile_flux2(manifest, values),
        RecipeArch::Ideogram4 => compile_ideogram4(manifest, values),
        RecipeArch::Sdxl | RecipeArch::Sd15 => compile_checkpoint(manifest, values),
    }
}
