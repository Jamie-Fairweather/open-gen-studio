use crate::comfy;
use crate::upscale::types::{
    UpscaleCompileOpts, UpscaleKind, DEFAULT_UPSCALE_ID, SUPIR_SDXL_FILENAME,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::AppHandle;

/// Resolve `values.upscale` → fills filename / scale / kind; verifies files/nodes.
pub fn resolve_for_generate(
    app: &AppHandle,
    values: &mut HashMap<String, Value>,
) -> Result<(), String> {
    let Some(raw) = values.get("upscale").cloned() else {
        return Ok(());
    };
    let obj = raw
        .as_object()
        .ok_or_else(|| "upscale value must be an object".to_string())?;

    let model_id = obj
        .get("modelId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_UPSCALE_ID);
    let mut usdu = obj.get("usdu").and_then(|v| v.as_bool()).unwrap_or(false);

    let entry = super::catalog::catalog_entry(model_id)?;
    let models_root = comfy::models_dir(app)?;

    if entry.kind == UpscaleKind::Supir {
        usdu = false;
        if !super::nodes::supir_installed(app) {
            return Err(
                "SUPIR custom node is not installed - install a SUPIR model from Refine first"
                    .into(),
            );
        }
        if !super::catalog::sdxl_ready(&models_root) {
            return Err(format!(
                "SUPIR companion SDXL ({SUPIR_SDXL_FILENAME}) is not installed - install SUPIR from Refine"
            ));
        }
        if !super::catalog::file_ready(&models_root, entry) {
            return Err(format!(
                "SUPIR model '{}' is not installed - install it from Refine or the Models library",
                entry.name
            ));
        }
    } else if !super::catalog::file_ready(&models_root, entry) {
        return Err(format!(
            "Upscale model '{}' is not installed - install it from Refine or the Models library",
            entry.name
        ));
    }

    if usdu && !super::nodes::usdu_installed(app) {
        return Err(
            "Ultimate SD Upscale is not installed - turn on the toggle to install, or install from Refine"
                .into(),
        );
    }

    let mut resolved = json!({
        "modelId": entry.id,
        "filename": entry.filename,
        "scale": entry.scale,
        "kind": entry.kind.as_str(),
        "usdu": usdu,
    });
    if entry.kind == UpscaleKind::Supir {
        resolved["sdxlFilename"] = json!(SUPIR_SDXL_FILENAME);
    }
    // Preserve optional USDU refine knobs from the client.
    for key in ["usduScale", "usduSteps", "usduDenoise"] {
        if let Some(v) = obj.get(key) {
            resolved[key] = v.clone();
        }
    }
    values.insert("upscale".into(), resolved);
    Ok(())
}

/// Read resolved upscale options from compile values (after resolve_for_generate).
pub fn parse_upscale_opts(values: &HashMap<String, Value>) -> Option<UpscaleCompileOpts> {
    let obj = values.get("upscale")?.as_object()?;
    let filename = obj.get("filename")?.as_str()?.to_string();
    if filename.is_empty() {
        return None;
    }
    let scale = obj
        .get("scale")
        .and_then(|v| v.as_u64())
        .unwrap_or(4)
        .max(1) as u32;
    let kind = obj
        .get("kind")
        .and_then(|v| v.as_str())
        .map(UpscaleKind::from_str)
        .unwrap_or(UpscaleKind::Sr);
    let usdu =
        obj.get("usdu").and_then(|v| v.as_bool()).unwrap_or(false) && kind == UpscaleKind::Sr;
    let sdxl_filename = obj
        .get("sdxlFilename")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    // USDU enlarge: only 2× or 4× from the UI; ignore other values.
    let usdu_scale = obj
        .get("usduScale")
        .and_then(|v| v.as_u64().or_else(|| v.as_i64().map(|n| n as u64)))
        .map(|n| if n >= 4 { 4u32 } else { 2u32 });
    let usdu_steps = obj
        .get("usduSteps")
        .and_then(|v| v.as_i64().or_else(|| v.as_u64().map(|n| n as i64)))
        .map(|n| n.clamp(1, 40));
    let usdu_denoise = obj
        .get("usduDenoise")
        .and_then(|v| v.as_f64())
        .map(|n| n.clamp(0.05, 0.75));
    Some(UpscaleCompileOpts {
        filename,
        scale,
        kind,
        usdu,
        sdxl_filename,
        usdu_scale,
        usdu_steps,
        usdu_denoise,
    })
}
