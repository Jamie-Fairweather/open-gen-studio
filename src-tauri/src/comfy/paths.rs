use crate::pins::{COMFY_PINNED_VERSION, COMFY_PIN_MARKER};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Child;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

pub const ENGINE: &str = "comfyui";
pub const DEFAULT_PORT: u16 = 8188;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProgress {
    pub engine: String,
    pub stage: String,
    pub message: String,
}

pub struct ProcessState {
    pub child: Option<Child>,
    pub runtime_id: Option<String>,
    pub port: Option<u16>,
}

impl Default for ProcessState {
    fn default() -> Self {
        Self {
            child: None,
            runtime_id: None,
            port: None,
        }
    }
}

pub(crate) fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub(crate) fn emit_progress(app: &AppHandle, stage: &str, message: &str) {
    let _ = app.emit(
        "runtimes://progress",
        RuntimeProgress {
            engine: ENGINE.into(),
            stage: stage.into(),
            message: message.into(),
        },
    );
}

pub fn read_pin_marker(root: &Path) -> Option<String> {
    fs::read_to_string(root.join(COMFY_PIN_MARKER))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub(crate) fn write_pin_marker(root: &Path) -> Result<(), String> {
    fs::write(root.join(COMFY_PIN_MARKER), COMFY_PINNED_VERSION).map_err(|e| e.to_string())
}

/// True when the extract looks ready and matches the app's Comfy pin.
pub fn portable_pin_matches(root: &Path) -> bool {
    portable_ready(root) && read_pin_marker(root).as_deref() == Some(COMFY_PINNED_VERSION)
}

pub fn runtimes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("runtimes")
        .join(ENGINE))
}

pub fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models"))
}

pub(crate) fn looks_like_portable_root(path: &Path) -> bool {
    path.join("python_embeded").is_dir() && path.join("ComfyUI").is_dir()
}

pub(crate) fn portable_ready(path: &Path) -> bool {
    path.join("python_embeded").join("python.exe").is_file()
        && path.join("ComfyUI").join("main.py").is_file()
}

pub fn find_portable_root(extract_dir: &Path) -> Result<PathBuf, String> {
    if looks_like_portable_root(extract_dir) {
        return Ok(extract_dir.to_path_buf());
    }
    let entries = fs::read_dir(extract_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && looks_like_portable_root(&path) {
            return Ok(path);
        }
    }
    Err("extracted archive does not look like ComfyUI portable".into())
}

pub(crate) fn write_extra_model_paths(portable_root: &Path, models: &Path) -> Result<(), String> {
    fs::create_dir_all(models).map_err(|e| e.to_string())?;
    for sub in [
        "checkpoints",
        "loras",
        "vae",
        "diffusion_models",
        "text_encoders",
        "clip",
        "clip_vision",
        "controlnet",
        "embeddings",
        "upscale_models",
        "LLM",
    ] {
        fs::create_dir_all(models.join(sub)).map_err(|e| e.to_string())?;
    }

    let models_posix = models.to_string_lossy().replace('\\', "/");
    let yaml = format!(
        r#"# Managed by Open Gen AI — shared model library
open_gen_ai:
  base_path: {models_posix}
  is_default: true
  checkpoints: checkpoints
  loras: loras
  vae: vae
  diffusion_models: diffusion_models
  text_encoders: text_encoders
  clip: clip
  clip_vision: clip_vision
  controlnet: controlnet
  embeddings: embeddings
  upscale_models: upscale_models
  LLM: LLM
"#
    );
    let path = portable_root.join("ComfyUI").join("extra_model_paths.yaml");
    let mut file = fs::File::create(path).map_err(|e| e.to_string())?;
    file.write_all(yaml.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}
