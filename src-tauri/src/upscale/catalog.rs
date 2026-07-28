use crate::comfy;
use crate::download;
use crate::upscale::types::{UpscaleKind, UpscaleModelInfo, SUPIR_SDXL_FILENAME, SUPIR_SDXL_URL};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Debug, Clone, Copy)]
pub(crate) struct CatalogEntry {
    pub(crate) id: &'static str,
    pub(crate) name: &'static str,
    pub(crate) description: &'static str,
    pub(crate) filename: &'static str,
    pub(crate) url: &'static str,
    pub(crate) scale: u32,
    pub(crate) kind: UpscaleKind,
}

pub(crate) const CATALOG: &[CatalogEntry] = &[
    CatalogEntry {
        id: "4x-ultrasharp",
        name: "4x UltraSharp",
        description: "Crisp edges - default for AI-generated art",
        filename: "4x-UltraSharp.pth",
        url: "https://huggingface.co/Shandypur/ESRGAN-4x-UltraSharp/resolve/main/4x-UltraSharp.pth",
        scale: 4,
        kind: UpscaleKind::Sr,
    },
    CatalogEntry {
        id: "realesrgan-x4plus",
        name: "RealESRGAN x4plus",
        description: "General / photo-like 4× upscale",
        filename: "RealESRGAN_x4plus.pth",
        url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
        scale: 4,
        kind: UpscaleKind::Sr,
    },
    CatalogEntry {
        id: "realesrgan-x2plus",
        name: "RealESRGAN x2plus",
        description: "Modest 2× enlarge",
        filename: "RealESRGAN_x2plus.pth",
        url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth",
        scale: 2,
        kind: UpscaleKind::Sr,
    },
    CatalogEntry {
        id: "4x-nomos8k-sc",
        name: "4x Nomos8k SC",
        description: "Photo ESRGAN - JPEG / light blur (Nomos8k)",
        filename: "4xNomos8kSC.safetensors",
        url: "https://huggingface.co/Phips/4xNomos8kSC/resolve/main/4xNomos8kSC.safetensors",
        scale: 4,
        kind: UpscaleKind::Sr,
    },
    CatalogEntry {
        id: "4x-nomos8k-dat",
        name: "4x Nomos8k DAT",
        description: "Photo DAT - realistic SR (Nomos8k)",
        filename: "4xNomos8kDAT.safetensors",
        url: "https://huggingface.co/Phips/4xNomos8kDAT/resolve/main/4xNomos8kDAT.safetensors",
        scale: 4,
        kind: UpscaleKind::Sr,
    },
    CatalogEntry {
        id: "4x-nomos2-hq-dat2",
        name: "4x Nomos2 HQ DAT2",
        description: "Clean / non-degraded input (Nomos v2)",
        filename: "4xNomos2_hq_dat2.safetensors",
        url: "https://huggingface.co/Phips/4xNomos2_hq_dat2/resolve/main/4xNomos2_hq_dat2.safetensors",
        scale: 4,
        kind: UpscaleKind::Sr,
    },
    CatalogEntry {
        id: "4x-nomos-uni-span",
        name: "4x NomosUni SPAN",
        description: "Fast universal - JPEG + multiscale (NomosUni)",
        filename: "4xNomosUni_span_multijpg.safetensors",
        url: "https://huggingface.co/Phips/4xNomosUni_span_multijpg/resolve/main/4xNomosUni_span_multijpg.safetensors",
        scale: 4,
        kind: UpscaleKind::Sr,
    },
    CatalogEntry {
        id: "supir-v0q",
        name: "SUPIR v0Q",
        description: "Generative restoration - quality (needs SDXL + ~12GB VRAM; non-commercial)",
        filename: "SUPIR-v0Q_fp16.safetensors",
        url: "https://huggingface.co/Kijai/SUPIR_pruned/resolve/main/SUPIR-v0Q_fp16.safetensors",
        scale: 2,
        kind: UpscaleKind::Supir,
    },
    CatalogEntry {
        id: "supir-v0f",
        name: "SUPIR v0F",
        description: "Generative restoration - fidelity (needs SDXL + ~12GB VRAM; non-commercial)",
        filename: "SUPIR-v0F_fp16.safetensors",
        url: "https://huggingface.co/Kijai/SUPIR_pruned/resolve/main/SUPIR-v0F_fp16.safetensors",
        scale: 2,
        kind: UpscaleKind::Supir,
    },
];

pub(crate) fn catalog_entry(id: &str) -> Result<&'static CatalogEntry, String> {
    CATALOG
        .iter()
        .find(|e| e.id == id)
        .ok_or_else(|| format!("Unknown upscale model: {id}"))
}

pub(crate) fn model_subdir(kind: UpscaleKind) -> &'static str {
    match kind {
        UpscaleKind::Sr => "upscale_models",
        UpscaleKind::Supir => "checkpoints",
    }
}

pub(crate) fn dest_for(app: &AppHandle, entry: &CatalogEntry) -> Result<PathBuf, String> {
    let dir = comfy::models_dir(app)?.join(model_subdir(entry.kind));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(entry.filename))
}

pub(crate) fn file_ready(models_root: &Path, entry: &CatalogEntry) -> bool {
    download::local_file_usable(
        &models_root
            .join(model_subdir(entry.kind))
            .join(entry.filename),
    )
}

pub(crate) fn sdxl_ready(models_root: &Path) -> bool {
    download::local_file_usable(&models_root.join("checkpoints").join(SUPIR_SDXL_FILENAME))
}

pub fn list_upscalers(app: &AppHandle) -> Result<Vec<UpscaleModelInfo>, String> {
    let models_root = comfy::models_dir(app)?;
    Ok(CATALOG
        .iter()
        .map(|e| {
            let mut ready = file_ready(&models_root, e);
            if e.kind == UpscaleKind::Supir {
                ready = ready && sdxl_ready(&models_root) && super::nodes::supir_installed(app);
            }
            UpscaleModelInfo {
                id: e.id.into(),
                name: e.name.into(),
                description: e.description.into(),
                filename: e.filename.into(),
                url: e.url.into(),
                scale: e.scale,
                kind: e.kind,
                ready,
            }
        })
        .collect())
}

/// Managed custom-node pin for a download id (`usdu` / `supir` / SUPIR weights).
pub fn node_pin_for_download(id: &str) -> Option<&'static str> {
    if id == "usdu" {
        return Some("usdu");
    }
    if id == "supir" {
        return Some("supir");
    }
    match catalog_entry(id) {
        Ok(e) if e.kind == UpscaleKind::Supir => Some("supir"),
        _ => None,
    }
}

/// HTTP files for Download Manager progress (label, url, dest).
/// SUPIR includes the companion SDXL checkpoint first.
pub fn http_files(app: &AppHandle, id: &str) -> Result<Vec<(String, String, PathBuf)>, String> {
    let entry = catalog_entry(id)?;
    let mut files = Vec::new();
    if entry.kind == UpscaleKind::Supir {
        files.push((
            SUPIR_SDXL_FILENAME.into(),
            SUPIR_SDXL_URL.into(),
            comfy::models_dir(app)?
                .join("checkpoints")
                .join(SUPIR_SDXL_FILENAME),
        ));
    }
    let dest = dest_for(app, entry)?;
    files.push((entry.filename.into(), entry.url.into(), dest));
    Ok(files)
}
