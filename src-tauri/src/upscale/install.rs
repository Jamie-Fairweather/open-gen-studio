use crate::comfy;
use crate::download;
use crate::upscale::types::{UpscaleKind, UpscaleProgress, SUPIR_SDXL_FILENAME, SUPIR_SDXL_URL};
use tauri::{AppHandle, Emitter};

/// Download one Official upscale asset (SR → upscale_models; SUPIR → checkpoints + deps).
pub fn install_upscaler(app: &AppHandle, id: &str) -> Result<(), String> {
    let entry = super::catalog::catalog_entry(id)?;

    if entry.kind == UpscaleKind::Supir {
        super::nodes::ensure_supir_custom_node(app)?;
        ensure_supir_sdxl(app)?;
    }

    let dest = super::catalog::dest_for(app, entry)?;

    let _ = app.emit(
        "upscale://progress",
        UpscaleProgress {
            model_id: id.into(),
            stage: "download".into(),
            message: format!("Downloading {}", entry.filename),
            filename: Some(entry.filename.into()),
        },
    );

    download::clear_cancel();
    download::download_file(app, entry.url, &dest, None)?;

    if !download::local_file_usable(&dest) {
        return Err(format!(
            "download produced unusable file: {}",
            entry.filename
        ));
    }

    let _ = app.emit(
        "upscale://progress",
        UpscaleProgress {
            model_id: id.into(),
            stage: "done".into(),
            message: format!("Ready: {}", entry.filename),
            filename: Some(entry.filename.into()),
        },
    );
    let _ = app.emit("upscale://updated", id);
    Ok(())
}

pub(crate) fn ensure_supir_sdxl(app: &AppHandle) -> Result<(), String> {
    let dest = comfy::models_dir(app)?
        .join("checkpoints")
        .join(SUPIR_SDXL_FILENAME);
    if download::local_file_usable(&dest) {
        return Ok(());
    }

    let _ = app.emit(
        "upscale://progress",
        UpscaleProgress {
            model_id: "supir-sdxl".into(),
            stage: "download".into(),
            message: format!("Downloading companion SDXL ({SUPIR_SDXL_FILENAME})…"),
            filename: Some(SUPIR_SDXL_FILENAME.into()),
        },
    );

    download::clear_cancel();
    download::download_file(app, SUPIR_SDXL_URL, &dest, None)?;
    if !download::local_file_usable(&dest) {
        return Err(format!(
            "download produced unusable file: {SUPIR_SDXL_FILENAME}"
        ));
    }
    Ok(())
}
