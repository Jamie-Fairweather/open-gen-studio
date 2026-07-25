//! Shared Official upscale models (SR weights) + USDU / SUPIR generative paths.
//! SR files: `models/upscale_models/`. SUPIR + companion SDXL: `models/checkpoints/`.

use crate::comfy;
use crate::download;
use crate::pins::{self, NodePin, MANAGED_NODES};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

pub const USDU_NODE_NAME: &str = "ComfyUI_UltimateSDUpscale";
pub const SUPIR_NODE_NAME: &str = "ComfyUI-SUPIR";
pub const DEFAULT_UPSCALE_ID: &str = "4x-ultrasharp";

/// SDXL checkpoint SUPIR merges with (shared companion, not blueprint-owned).
pub const SUPIR_SDXL_FILENAME: &str = "sd_xl_base_1.0.safetensors";
const SUPIR_SDXL_URL: &str =
    "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UpscaleKind {
    Sr,
    Supir,
}

impl UpscaleKind {
    pub fn as_str(self) -> &'static str {
        match self {
            UpscaleKind::Sr => "sr",
            UpscaleKind::Supir => "supir",
        }
    }

    fn from_str(s: &str) -> Self {
        match s {
            "supir" => UpscaleKind::Supir,
            _ => UpscaleKind::Sr,
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct CatalogEntry {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    filename: &'static str,
    url: &'static str,
    scale: u32,
    kind: UpscaleKind,
}

const CATALOG: &[CatalogEntry] = &[
    CatalogEntry {
        id: "4x-ultrasharp",
        name: "4x UltraSharp",
        description: "Crisp edges — default for AI-generated art",
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
        description: "Photo ESRGAN — JPEG / light blur (Nomos8k)",
        filename: "4xNomos8kSC.safetensors",
        url: "https://huggingface.co/Phips/4xNomos8kSC/resolve/main/4xNomos8kSC.safetensors",
        scale: 4,
        kind: UpscaleKind::Sr,
    },
    CatalogEntry {
        id: "4x-nomos8k-dat",
        name: "4x Nomos8k DAT",
        description: "Photo DAT — realistic SR (Nomos8k)",
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
        description: "Fast universal — JPEG + multiscale (NomosUni)",
        filename: "4xNomosUni_span_multijpg.safetensors",
        url: "https://huggingface.co/Phips/4xNomosUni_span_multijpg/resolve/main/4xNomosUni_span_multijpg.safetensors",
        scale: 4,
        kind: UpscaleKind::Sr,
    },
    CatalogEntry {
        id: "supir-v0q",
        name: "SUPIR v0Q",
        description: "Generative restoration — quality (needs SDXL + ~12GB VRAM; non-commercial)",
        filename: "SUPIR-v0Q_fp16.safetensors",
        url: "https://huggingface.co/Kijai/SUPIR_pruned/resolve/main/SUPIR-v0Q_fp16.safetensors",
        scale: 2,
        kind: UpscaleKind::Supir,
    },
    CatalogEntry {
        id: "supir-v0f",
        name: "SUPIR v0F",
        description: "Generative restoration — fidelity (needs SDXL + ~12GB VRAM; non-commercial)",
        filename: "SUPIR-v0F_fp16.safetensors",
        url: "https://huggingface.co/Kijai/SUPIR_pruned/resolve/main/SUPIR-v0F_fp16.safetensors",
        scale: 2,
        kind: UpscaleKind::Supir,
    },
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpscaleModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub filename: String,
    pub url: String,
    pub scale: u32,
    pub kind: UpscaleKind,
    pub ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct UpscaleProgress {
    pub model_id: String,
    pub stage: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
}

fn catalog_entry(id: &str) -> Result<&'static CatalogEntry, String> {
    CATALOG
        .iter()
        .find(|e| e.id == id)
        .ok_or_else(|| format!("Unknown upscale model: {id}"))
}

fn model_subdir(kind: UpscaleKind) -> &'static str {
    match kind {
        UpscaleKind::Sr => "upscale_models",
        UpscaleKind::Supir => "checkpoints",
    }
}

fn dest_for(app: &AppHandle, entry: &CatalogEntry) -> Result<PathBuf, String> {
    let dir = comfy::models_dir(app)?.join(model_subdir(entry.kind));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(entry.filename))
}

fn file_ready(models_root: &Path, entry: &CatalogEntry) -> bool {
    download::local_file_usable(
        &models_root
            .join(model_subdir(entry.kind))
            .join(entry.filename),
    )
}

fn sdxl_ready(models_root: &Path) -> bool {
    download::local_file_usable(&models_root.join("checkpoints").join(SUPIR_SDXL_FILENAME))
}

pub fn list_upscalers(app: &AppHandle) -> Result<Vec<UpscaleModelInfo>, String> {
    let models_root = comfy::models_dir(app)?;
    Ok(CATALOG
        .iter()
        .map(|e| {
            let mut ready = file_ready(&models_root, e);
            if e.kind == UpscaleKind::Supir {
                ready = ready && sdxl_ready(&models_root) && supir_installed(app);
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

/// Download one Official upscale asset (SR → upscale_models; SUPIR → checkpoints + deps).
pub fn install_upscaler(app: &AppHandle, id: &str) -> Result<(), String> {
    let entry = catalog_entry(id)?;

    if entry.kind == UpscaleKind::Supir {
        ensure_supir_custom_node(app)?;
        ensure_supir_sdxl(app)?;
    }

    let dest = dest_for(app, entry)?;

    let _ = app.emit(
        "upscale://progress",
        json!({
            "modelId": id,
            "stage": "download",
            "message": format!("Downloading {}", entry.filename),
            "filename": entry.filename,
        }),
    );

    download::clear_cancel();
    download::download_file(app, entry.url, &dest, None)?;

    if !download::local_file_usable(&dest) {
        return Err(format!("download produced unusable file: {}", entry.filename));
    }

    let _ = app.emit(
        "upscale://progress",
        json!({
            "modelId": id,
            "stage": "done",
            "message": format!("Ready: {}", entry.filename),
            "filename": entry.filename,
        }),
    );
    let _ = app.emit("upscale://updated", id);
    Ok(())
}

fn ensure_supir_sdxl(app: &AppHandle) -> Result<(), String> {
    let dest = comfy::models_dir(app)?
        .join("checkpoints")
        .join(SUPIR_SDXL_FILENAME);
    if download::local_file_usable(&dest) {
        return Ok(());
    }

    let _ = app.emit(
        "upscale://progress",
        json!({
            "modelId": "supir-sdxl",
            "stage": "download",
            "message": format!("Downloading companion SDXL ({SUPIR_SDXL_FILENAME})…"),
            "filename": SUPIR_SDXL_FILENAME,
        }),
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

fn custom_nodes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let portable = comfy::find_portable_root(&comfy::runtimes_dir(app)?.join("portable"))
        .map_err(|_| {
            "ComfyUI portable not found — install the runtime before custom upscale nodes"
                .to_string()
        })?;
    let custom_dir = portable.join("ComfyUI").join("custom_nodes");
    fs::create_dir_all(&custom_dir).map_err(|e| e.to_string())?;
    Ok(custom_dir)
}

fn portable_root(app: &AppHandle) -> Result<PathBuf, String> {
    comfy::find_portable_root(&comfy::runtimes_dir(app)?.join("portable")).map_err(|_| {
        "ComfyUI portable not found — install the runtime first".to_string()
    })
}

pub fn usdu_installed(app: &AppHandle) -> bool {
    custom_nodes_dir(app)
        .map(|d| d.join(USDU_NODE_NAME).is_dir())
        .unwrap_or(false)
}

pub fn supir_installed(app: &AppHandle) -> bool {
    custom_nodes_dir(app)
        .map(|d| d.join(SUPIR_NODE_NAME).is_dir())
        .unwrap_or(false)
}

/// True when USDU folder exists and HEAD matches the app pin.
pub fn usdu_at_pin(app: &AppHandle) -> bool {
    pins::node_pin("usdu")
        .map(|p| node_at_pin(app, p))
        .unwrap_or(false)
}

pub fn supir_at_pin(app: &AppHandle) -> bool {
    pins::node_pin("supir")
        .map(|p| node_at_pin(app, p))
        .unwrap_or(false)
}

fn node_at_pin(app: &AppHandle, pin: &NodePin) -> bool {
    let Ok(dir) = custom_nodes_dir(app) else {
        return false;
    };
    let dest = dir.join(pin.folder);
    if !dest.is_dir() {
        return false;
    }
    git_head_sha(&dest)
        .map(|h| h.starts_with(pin.commit) || pin.commit.starts_with(&h) || h == pin.commit)
        .unwrap_or(false)
}

fn git_head_sha(repo: &Path) -> Result<String, String> {
    let out = Command::new("git")
        .current_dir(repo)
        .args(["rev-parse", "HEAD"])
        .output()
        .map_err(|e| format!("git rev-parse failed: {e}"))?;
    if !out.status.success() {
        return Err("git rev-parse failed".into());
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Ensure every managed custom node is checked out at its pinned SHA.
pub fn ensure_managed_nodes(app: &AppHandle) -> Result<(), String> {
    for pin in MANAGED_NODES {
        ensure_pinned_custom_node(app, pin)?;
        if pin.id == "supir" {
            patch_supir_import_hack(app)?;
            install_supir_python_deps(app)?;
        }
    }
    Ok(())
}

/// Clone / checkout Ultimate SD Upscale at the pinned commit.
pub fn ensure_usdu_custom_node(app: &AppHandle) -> Result<(), String> {
    let pin = pins::node_pin("usdu").ok_or("USDU pin missing")?;
    ensure_pinned_custom_node(app, pin)
}

/// Clone / checkout kijai ComfyUI-SUPIR at the pinned commit + deps.
pub fn ensure_supir_custom_node(app: &AppHandle) -> Result<(), String> {
    let pin = pins::node_pin("supir").ok_or("SUPIR pin missing")?;
    ensure_pinned_custom_node(app, pin)?;
    patch_supir_import_hack(app)?;
    install_supir_python_deps(app)?;
    Ok(())
}

pub fn managed_nodes_pin_status(app: &AppHandle) -> Vec<pins::PinStatus> {
    MANAGED_NODES
        .iter()
        .map(|pin| {
            let installed = custom_nodes_dir(app)
                .ok()
                .and_then(|d| {
                    let dest = d.join(pin.folder);
                    if dest.is_dir() {
                        git_head_sha(&dest).ok()
                    } else {
                        None
                    }
                })
                .map(|h| pins::short_sha(&h).to_string());
            let matches = node_at_pin(app, pin);
            pins::PinStatus {
                id: pin.id.into(),
                expected: pins::short_sha(pin.commit).into(),
                installed,
                matches,
            }
        })
        .collect()
}

/// kijai SUPIR resolves relative yaml targets via `import_module(..., package=folder_name)`,
/// then falls back to `package=absolute_path`. Folder names with hyphens fail, and absolute
/// paths that contain dots (our `com.open-gen-ai` AppData dir) get split as packages —
/// yielding `No module named 'C:\\Users\\...\\com'`. Comfy registers the node as
/// `path.replace('.', '_x_')`; use that as the package for relative imports.
fn patch_supir_import_hack(app: &AppHandle) -> Result<(), String> {
    let util = custom_nodes_dir(app)?
        .join(SUPIR_NODE_NAME)
        .join("sgm")
        .join("util.py");
    if !util.is_file() {
        return Err("SUPIR sgm/util.py missing after clone".into());
    }
    let src = fs::read_to_string(&util).map_err(|e| e.to_string())?;
    if src.contains("OGA_SUPIR_IMPORT_FIX") {
        return Ok(());
    }

    const NEW: &str = r#"def get_obj_from_str(string, reload=False, invalidate_cache=True):
    # OGA_SUPIR_IMPORT_FIX — see upscale::patch_supir_import_hack
    import sys
    module, cls = string.rsplit(".", 1)
    if invalidate_cache:
        importlib.invalidate_caches()
    if reload:
        module_imp = importlib.import_module(module)
        importlib.reload(module_imp)
    if not module.startswith("."):
        return getattr(importlib.import_module(module), cls)
    package_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates = [
        package_root.replace(".", "_x_"),
        os.path.basename(package_root),
    ]
    folder = os.path.basename(package_root)
    for key in list(sys.modules.keys()):
        if isinstance(key, str) and key.endswith(folder) and key not in candidates:
            candidates.append(key)
    last = None
    for pkg in candidates:
        try:
            return getattr(importlib.import_module(module, package=pkg), cls)
        except Exception as e:
            last = e
    if last is not None:
        raise last
    raise ModuleNotFoundError(module)

"#;

    let Some(start) = src.find("def get_obj_from_str") else {
        return Err("SUPIR sgm/util.py missing get_obj_from_str".into());
    };
    let Some(rel_end) = src[start..].find("\ndef append_zero") else {
        return Err(
            "SUPIR sgm/util.py layout changed — cannot apply import path fix; update Open Gen AI"
                .into(),
        );
    };
    let end = start + rel_end + 1; // keep the newline before append_zero
    let mut patched = String::with_capacity(src.len() + NEW.len());
    patched.push_str(&src[..start]);
    patched.push_str(NEW);
    patched.push_str(&src[end..]);
    fs::write(&util, patched).map_err(|e| e.to_string())?;
    Ok(())
}

/// Clone (if needed) and check out the pinned commit for a managed custom node.
fn ensure_pinned_custom_node(app: &AppHandle, pin: &NodePin) -> Result<(), String> {
    let custom_dir = custom_nodes_dir(app)?;
    fs::create_dir_all(&custom_dir).map_err(|e| e.to_string())?;
    let dest = custom_dir.join(pin.folder);
    let short = pins::short_sha(pin.commit);

    if node_at_pin(app, pin) {
        return Ok(());
    }

    let _ = app.emit(
        "upscale://progress",
        json!({
            "modelId": pin.id,
            "stage": "download",
            "message": format!(
                "Updating {} to pin {short} (required by this app version)…",
                pin.folder
            ),
        }),
    );

    if !dest.is_dir() {
        let status = Command::new("git")
            .args(["clone", "--no-checkout", pin.repo])
            .arg(&dest)
            .status()
            .map_err(|e| {
                format!(
                    "git clone failed for {} (is git installed?): {e}",
                    pin.folder
                )
            })?;
        if !status.success() {
            let _ = fs::remove_dir_all(&dest);
            return Err(format!("git clone failed for {} ({})", pin.folder, pin.repo));
        }
    }

    let fetch = Command::new("git")
        .current_dir(&dest)
        .args(["fetch", "--depth", "1", "origin", pin.commit])
        .status()
        .map_err(|e| format!("git fetch failed for {}: {e}", pin.folder))?;
    if !fetch.success() {
        // Fallback: deepen / full fetch of the commit.
        let fetch2 = Command::new("git")
            .current_dir(&dest)
            .args(["fetch", "origin", pin.commit])
            .status()
            .map_err(|e| format!("git fetch failed for {}: {e}", pin.folder))?;
        if !fetch2.success() {
            return Err(format!(
                "git fetch {}@{short} failed — check network / git",
                pin.folder
            ));
        }
    }

    let checkout = Command::new("git")
        .current_dir(&dest)
        .args(["checkout", "--force", pin.commit])
        .status()
        .map_err(|e| format!("git checkout failed for {}: {e}", pin.folder))?;
    if !checkout.success() {
        let reset = Command::new("git")
            .current_dir(&dest)
            .args(["reset", "--hard", pin.commit])
            .status()
            .map_err(|e| format!("git reset failed for {}: {e}", pin.folder))?;
        if !reset.success() {
            return Err(format!(
                "could not check out pinned commit {short} for {}",
                pin.folder
            ));
        }
    }

    if !node_at_pin(app, pin) {
        return Err(format!(
            "{} is not at pinned commit {short} after checkout",
            pin.folder
        ));
    }

    let _ = app.emit(
        "upscale://progress",
        json!({
            "modelId": pin.id,
            "stage": "done",
            "message": format!(
                "{} ready at {short} — restart ComfyUI if it was already running",
                pin.folder
            ),
        }),
    );
    let _ = app.emit("upscale://updated", pin.id);
    Ok(())
}

fn install_supir_python_deps(app: &AppHandle) -> Result<(), String> {
    let root = portable_root(app)?;
    let marker = root.join(".oga_supir_deps");
    if marker.is_file() {
        return Ok(());
    }

    let python = root.join("python_embeded").join("python.exe");
    if !python.is_file() {
        return Err("ComfyUI portable python.exe missing — cannot install SUPIR deps".into());
    }
    let reqs = root
        .join("ComfyUI")
        .join("custom_nodes")
        .join(SUPIR_NODE_NAME)
        .join("requirements.txt");
    if !reqs.is_file() {
        return Err("SUPIR requirements.txt missing after clone".into());
    }

    let _ = app.emit(
        "upscale://progress",
        json!({
            "modelId": "supir",
            "stage": "download",
            "message": "Installing SUPIR Python dependencies…",
        }),
    );

    let output = Command::new(&python)
        .args([
            "-s",
            "-m",
            "pip",
            "install",
            "-r",
            reqs.to_str().ok_or("invalid SUPIR requirements path")?,
        ])
        .current_dir(&root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("failed to run pip for SUPIR: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "SUPIR pip install failed: {}{}",
            stderr.trim(),
            if stderr.trim().is_empty() {
                stdout.trim()
            } else {
                ""
            }
        ));
    }

    fs::write(&marker, b"ok").map_err(|e| e.to_string())?;
    Ok(())
}

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

    let entry = catalog_entry(model_id)?;
    let models_root = comfy::models_dir(app)?;

    if entry.kind == UpscaleKind::Supir {
        usdu = false;
        if !supir_installed(app) {
            return Err(
                "SUPIR custom node is not installed — install a SUPIR model from Refine first"
                    .into(),
            );
        }
        if !sdxl_ready(&models_root) {
            return Err(format!(
                "SUPIR companion SDXL ({SUPIR_SDXL_FILENAME}) is not installed — install SUPIR from Refine"
            ));
        }
        if !file_ready(&models_root, entry) {
            return Err(format!(
                "SUPIR model '{}' is not installed — install it from Refine or the Models library",
                entry.name
            ));
        }
    } else if !file_ready(&models_root, entry) {
        return Err(format!(
            "Upscale model '{}' is not installed — install it from Refine or the Models library",
            entry.name
        ));
    }

    if usdu && !usdu_installed(app) {
        return Err(
            "Ultimate SD Upscale is not installed — turn on the toggle to install, or install from Refine"
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
    let usdu = obj.get("usdu").and_then(|v| v.as_bool()).unwrap_or(false) && kind == UpscaleKind::Sr;
    let model_id = obj
        .get("modelId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
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
        model_id,
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

#[derive(Debug, Clone)]
pub struct UpscaleCompileOpts {
    #[allow(dead_code)]
    pub model_id: String,
    pub filename: String,
    pub scale: u32,
    pub kind: UpscaleKind,
    pub usdu: bool,
    pub sdxl_filename: Option<String>,
    /// Explicit USDU enlarge (2 or 4). None → arch default (2×).
    pub usdu_scale: Option<u32>,
    pub usdu_steps: Option<i64>,
    pub usdu_denoise: Option<f64>,
}
