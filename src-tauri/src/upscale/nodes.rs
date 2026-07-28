use crate::comfy;
use crate::pins::{self, NodePin, MANAGED_NODES};
use crate::process_cmd;
use crate::upscale::types::{UpscaleProgress, SUPIR_NODE_NAME, USDU_NODE_NAME};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Emitter};

pub(crate) fn custom_nodes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let portable =
        comfy::find_portable_root(&comfy::runtimes_dir(app)?.join("portable")).map_err(|_| {
            "ComfyUI portable not found - install the runtime before custom upscale nodes"
                .to_string()
        })?;
    let custom_dir = portable.join("ComfyUI").join("custom_nodes");
    fs::create_dir_all(&custom_dir).map_err(|e| e.to_string())?;
    Ok(custom_dir)
}

pub(crate) fn portable_root(app: &AppHandle) -> Result<PathBuf, String> {
    comfy::find_portable_root(&comfy::runtimes_dir(app)?.join("portable"))
        .map_err(|_| "ComfyUI portable not found - install the runtime first".to_string())
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

pub(crate) fn node_at_pin(app: &AppHandle, pin: &NodePin) -> bool {
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

pub(crate) fn git_head_sha(repo: &Path) -> Result<String, String> {
    let out = process_cmd::new("git")
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
            // One git rev-parse per node (node_at_pin would spawn a second).
            let head = custom_nodes_dir(app).ok().and_then(|d| {
                let dest = d.join(pin.folder);
                if dest.is_dir() {
                    git_head_sha(&dest).ok()
                } else {
                    None
                }
            });
            let matches = head.as_ref().is_some_and(|h| {
                h.starts_with(pin.commit) || pin.commit.starts_with(h) || h == pin.commit
            });
            pins::PinStatus {
                id: pin.id.into(),
                expected: pins::short_sha(pin.commit).into(),
                installed: head.as_ref().map(|h| pins::short_sha(h).to_string()),
                matches,
            }
        })
        .collect()
}

/// kijai SUPIR resolves relative yaml targets via `import_module(..., package=folder_name)`,
/// then falls back to `package=absolute_path`. Folder names with hyphens fail, and absolute
/// paths that contain dots (our `com.open-gen-ai` AppData dir) get split as packages -
/// yielding `No module named 'C:\\Users\\...\\com'`. Comfy registers the node as
/// `path.replace('.', '_x_')`; use that as the package for relative imports.
pub(crate) fn patch_supir_import_hack(app: &AppHandle) -> Result<(), String> {
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
    # OGA_SUPIR_IMPORT_FIX - see upscale::patch_supir_import_hack
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
            "SUPIR sgm/util.py layout changed - cannot apply import path fix; update Open Gen AI"
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

/// Ensure a managed custom node (by pin id) is at the app-pinned commit.
pub fn ensure_pinned_node(app: &AppHandle, pin_id: &str) -> Result<(), String> {
    let pin = pins::node_pin(pin_id).ok_or_else(|| format!("unknown node pin: {pin_id}"))?;
    ensure_pinned_custom_node(app, pin)
}

/// Clone (if needed) and check out the pinned commit for a managed custom node.
pub fn ensure_pinned_custom_node(app: &AppHandle, pin: &NodePin) -> Result<(), String> {
    let custom_dir = custom_nodes_dir(app)?;
    fs::create_dir_all(&custom_dir).map_err(|e| e.to_string())?;
    let dest = custom_dir.join(pin.folder);
    let short = pins::short_sha(pin.commit);

    if node_at_pin(app, pin) {
        return Ok(());
    }

    let _ = app.emit(
        "upscale://progress",
        UpscaleProgress {
            model_id: pin.id.into(),
            stage: "download".into(),
            message: format!(
                "Updating {} to pin {short} (required by this app version)…",
                pin.folder
            ),
            filename: None,
        },
    );

    if !dest.is_dir() {
        let status = process_cmd::new("git")
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
            return Err(format!(
                "git clone failed for {} ({})",
                pin.folder, pin.repo
            ));
        }
    }

    let fetch = process_cmd::new("git")
        .current_dir(&dest)
        .args(["fetch", "--depth", "1", "origin", pin.commit])
        .status()
        .map_err(|e| format!("git fetch failed for {}: {e}", pin.folder))?;
    if !fetch.success() {
        // Fallback: deepen / full fetch of the commit.
        let fetch2 = process_cmd::new("git")
            .current_dir(&dest)
            .args(["fetch", "origin", pin.commit])
            .status()
            .map_err(|e| format!("git fetch failed for {}: {e}", pin.folder))?;
        if !fetch2.success() {
            return Err(format!(
                "git fetch {}@{short} failed - check network / git",
                pin.folder
            ));
        }
    }

    let checkout = process_cmd::new("git")
        .current_dir(&dest)
        .args(["checkout", "--force", pin.commit])
        .status()
        .map_err(|e| format!("git checkout failed for {}: {e}", pin.folder))?;
    if !checkout.success() {
        let reset = process_cmd::new("git")
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
        UpscaleProgress {
            model_id: pin.id.into(),
            stage: "done".into(),
            message: format!(
                "{} ready at {short} - restart ComfyUI if it was already running",
                pin.folder
            ),
            filename: None,
        },
    );
    let _ = app.emit("upscale://updated", pin.id);
    Ok(())
}

pub(crate) fn install_supir_python_deps(app: &AppHandle) -> Result<(), String> {
    let root = portable_root(app)?;
    let marker = root.join(".oga_supir_deps");
    if marker.is_file() {
        return Ok(());
    }

    let python = root.join("python_embeded").join("python.exe");
    if !python.is_file() {
        return Err("ComfyUI portable python.exe missing - cannot install SUPIR deps".into());
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
        UpscaleProgress {
            model_id: "supir".into(),
            stage: "download".into(),
            message: "Installing SUPIR Python dependencies…".into(),
            filename: None,
        },
    );

    let output = process_cmd::new(&python)
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
