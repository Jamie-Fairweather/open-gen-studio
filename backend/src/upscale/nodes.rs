use crate::archive_zip;
use crate::comfy;
use crate::pins::{self, NodePin, MANAGED_NODES, NODE_PIN_MARKER};
use crate::process_cmd;
use crate::upscale::types::{UpscaleProgress, SUPIR_NODE_NAME, USDU_NODE_NAME};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Emitter};

pub(crate) fn custom_nodes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let portable = comfy::live_portable_root_for_app(app).map_err(|_| {
        "ComfyUI portable not found - install the runtime before custom upscale nodes".to_string()
    })?;
    let custom_dir = portable.join("ComfyUI").join("custom_nodes");
    fs::create_dir_all(&custom_dir).map_err(|e| e.to_string())?;
    Ok(custom_dir)
}

pub(crate) fn portable_root(app: &AppHandle) -> Result<PathBuf, String> {
    comfy::live_portable_root_for_app(app)
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

pub fn managed_node_at_pin(app: &AppHandle, pin_id: &str) -> bool {
    pins::node_pin(pin_id)
        .map(|p| node_at_pin(app, p))
        .unwrap_or(false)
}

fn dest_sha_at_pin(dest: &Path, pin: &NodePin) -> bool {
    installed_node_sha(dest)
        .map(|h| sha_matches(&h, pin.commit))
        .unwrap_or(false)
}

pub(crate) fn node_at_pin(app: &AppHandle, pin: &NodePin) -> bool {
    let Ok(dir) = custom_nodes_dir(app) else {
        return false;
    };
    let dest = dir.join(pin.folder);
    dest.is_dir() && dest_sha_at_pin(&dest, pin) && pin.submodules_ready(&dest)
}

fn sha_matches(installed: &str, expected: &str) -> bool {
    installed.starts_with(expected) || expected.starts_with(installed) || installed == expected
}

/// Prefer `.oga_node_pin` (zip installs); fall back to `git rev-parse` for git clones.
pub(crate) fn installed_node_sha(dest: &Path) -> Result<String, String> {
    let marker = dest.join(NODE_PIN_MARKER);
    if marker.is_file() {
        let s = fs::read_to_string(&marker).map_err(|e| e.to_string())?;
        let sha = s.trim();
        if !sha.is_empty() {
            return Ok(sha.to_string());
        }
    }
    git_head_sha(dest)
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

fn write_node_pin_marker(dest: &Path, commit: &str) -> Result<(), String> {
    fs::write(dest.join(NODE_PIN_MARKER), commit.as_bytes()).map_err(|e| e.to_string())
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let from = entry.path();
        let to = dest.join(entry.file_name());
        if from.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
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
            let dest = custom_nodes_dir(app).ok().map(|d| d.join(pin.folder));
            let dest_ok = dest.as_ref().is_some_and(|p| p.is_dir());
            let head = dest
                .as_ref()
                .filter(|p| p.is_dir())
                .and_then(|p| installed_node_sha(p).ok());
            let matches = dest_ok
                && head.as_ref().is_some_and(|h| sha_matches(h, pin.commit))
                && dest.as_ref().is_some_and(|p| pin.submodules_ready(p));
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
/// paths that contain dots (e.g. a reverse-DNS AppData dir) get split as packages -
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
            "SUPIR sgm/util.py layout changed - cannot apply import path fix; update Open Gen Studio"
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

fn node_progress_label(pin: &NodePin) -> &str {
    match pin.id {
        "usdu" => "Ultimate SD Upscale",
        "supir" => "SUPIR",
        "qwenvl" => "Prompt Tools",
        _ => pin.folder,
    }
}

/// Install a managed custom node at the pinned commit (GitHub zip, then git fallback).
pub fn ensure_pinned_custom_node(app: &AppHandle, pin: &NodePin) -> Result<(), String> {
    let custom_dir = custom_nodes_dir(app)?;
    fs::create_dir_all(&custom_dir).map_err(|e| e.to_string())?;
    let dest = custom_dir.join(pin.folder);
    let short = pins::short_sha(pin.commit);
    let label = node_progress_label(pin);

    if node_at_pin(app, pin) {
        return Ok(());
    }
    // Zip installs omit git submodules. If the pin marker is already there,
    // only fetch the missing payload — don't wipe a working parent checkout.
    if dest.is_dir() && dest_sha_at_pin(&dest, pin) && !pin.submodules_ready(&dest) {
        ensure_node_submodules(app, pin, &dest)?;
        if node_at_pin(app, pin) {
            return Ok(());
        }
    }

    let _ = app.emit(
        "upscale://progress",
        UpscaleProgress {
            model_id: pin.id.into(),
            stage: "download".into(),
            message: format!("Installing {label}…"),
            filename: None,
        },
    );

    let mut errors: Vec<String> = Vec::new();
    match install_node_from_zip(app, pin, &custom_dir, &dest) {
        Ok(()) => {}
        Err(e) => {
            log::warn!(
                "zip install failed for {} ({short}), trying git: {e}",
                pin.folder
            );
            errors.push(format!("zip: {e}"));
            if let Err(git_err) = install_node_from_git(pin, &dest) {
                errors.push(format!("git: {git_err}"));
                return Err(format!(
                    "failed to install {}@{short}: {}",
                    pin.folder,
                    errors.join(" | ")
                ));
            }
            ensure_node_submodules(app, pin, &dest)?;
        }
    }

    if !node_at_pin(app, pin) {
        return Err(format!(
            "{} is not at pinned commit {short} after install",
            pin.folder
        ));
    }

    let _ = app.emit(
        "upscale://progress",
        UpscaleProgress {
            model_id: pin.id.into(),
            stage: "done".into(),
            message: format!("{label} ready"),
            filename: None,
        },
    );
    let _ = app.emit("upscale://updated", pin.id);
    Ok(())
}

fn install_node_from_zip(
    app: &AppHandle,
    pin: &NodePin,
    custom_dir: &Path,
    dest: &Path,
) -> Result<(), String> {
    let url = archive_zip::github_commit_zip_url(pin.repo, pin.commit)?;
    let zip_path = custom_dir.join(format!(".oga_{}_pin.zip", pin.id));
    let extract_to = custom_dir.join(format!(".oga_{}_extract", pin.id));
    archive_zip::download_and_extract_zip(app, &url, &zip_path, &extract_to)?;
    let nested = archive_zip::single_top_level_dir(&extract_to)?;
    if dest.exists() {
        fs::remove_dir_all(dest).map_err(|e| e.to_string())?;
    }
    // Prefer rename; fall back to copy (cross-volume).
    if fs::rename(&nested, dest).is_err() {
        copy_dir_recursive(&nested, dest)?;
        let _ = fs::remove_dir_all(&nested);
    }
    let _ = fs::remove_dir_all(&extract_to);
    write_node_pin_marker(dest, pin.commit)?;
    ensure_node_submodules(app, pin, dest)?;
    Ok(())
}

fn ensure_node_submodules(app: &AppHandle, pin: &NodePin, dest: &Path) -> Result<(), String> {
    for sub in pin.submodules {
        if dest.join(sub.path).join(sub.ready_file).is_file() {
            continue;
        }
        let url = archive_zip::github_commit_zip_url(sub.repo, sub.commit)?;
        let zip_path = dest.join(format!(".oga_{}_sub.zip", pin.id));
        let extract_to = dest.join(format!(".oga_{}_sub_extract", pin.id));
        archive_zip::download_and_extract_zip(app, &url, &zip_path, &extract_to)?;
        let nested = archive_zip::single_top_level_dir(&extract_to)?;
        let sub_dest = dest.join(sub.path);
        if sub_dest.exists() {
            fs::remove_dir_all(&sub_dest).map_err(|e| e.to_string())?;
        }
        if let Some(parent) = sub_dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if fs::rename(&nested, &sub_dest).is_err() {
            copy_dir_recursive(&nested, &sub_dest)?;
            let _ = fs::remove_dir_all(&nested);
        }
        let _ = fs::remove_dir_all(&extract_to);
        if !sub_dest.join(sub.ready_file).is_file() {
            return Err(format!(
                "{} submodule {} is missing {}",
                pin.folder, sub.path, sub.ready_file
            ));
        }
    }
    Ok(())
}

fn install_node_from_git(pin: &NodePin, dest: &Path) -> Result<(), String> {
    let short = pins::short_sha(pin.commit);
    if dest.exists() {
        fs::remove_dir_all(dest).map_err(|e| e.to_string())?;
    }

    let status = process_cmd::new("git")
        .args(["clone", "--no-checkout", pin.repo])
        .arg(dest)
        .status()
        .map_err(|e| {
            format!(
                "git clone failed for {} (is git installed?): {e}",
                pin.folder
            )
        })?;
    if !status.success() {
        let _ = fs::remove_dir_all(dest);
        return Err(format!(
            "git clone failed for {} ({})",
            pin.folder, pin.repo
        ));
    }

    let fetch = process_cmd::new("git")
        .current_dir(dest)
        .args(["fetch", "--depth", "1", "origin", pin.commit])
        .status()
        .map_err(|e| format!("git fetch failed for {}: {e}", pin.folder))?;
    if !fetch.success() {
        let fetch2 = process_cmd::new("git")
            .current_dir(dest)
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
        .current_dir(dest)
        .args(["checkout", "--force", pin.commit])
        .status()
        .map_err(|e| format!("git checkout failed for {}: {e}", pin.folder))?;
    if !checkout.success() {
        let reset = process_cmd::new("git")
            .current_dir(dest)
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

    write_node_pin_marker(dest, pin.commit)?;
    Ok(())
}

pub(crate) fn install_supir_python_deps(app: &AppHandle) -> Result<(), String> {
    let root = portable_root(app)?;
    let marker = root.join(".oga_supir_deps");
    if marker.is_file() {
        return Ok(());
    }

    let reqs = root
        .join("ComfyUI")
        .join("custom_nodes")
        .join(SUPIR_NODE_NAME)
        .join("requirements.txt");
    if !reqs.is_file() {
        return Err("SUPIR requirements.txt missing after clone".into());
    }
    // Stage into python_embeded — unpackaged pip cannot open MSIX-redirected Roaming paths.
    let staged = comfy::stage_requirements_for_pip(&root, &reqs)?;
    let staged_s = staged
        .to_str()
        .ok_or("invalid staged SUPIR requirements path")?;

    let _ = app.emit(
        "upscale://progress",
        UpscaleProgress {
            model_id: "supir".into(),
            stage: "download".into(),
            message: "Installing Python dependencies…".into(),
            filename: None,
        },
    );

    let output = crate::comfy::command_portable_python(&root)?
        .args([
            "-s",
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "-r",
            staged_s,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("failed to run pip for SUPIR: {e}"))?;

    let _ = fs::remove_file(&staged);

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("oga-node-{name}-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn installed_node_sha_prefers_marker_over_git() {
        let dir = temp_dir("marker");
        write_node_pin_marker(&dir, "abcdef0123456789").unwrap();
        assert_eq!(installed_node_sha(&dir).unwrap(), "abcdef0123456789");
        assert!(sha_matches("abcdef0123456789", "abcdef0"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn sha_matches_prefix_either_side() {
        assert!(sha_matches("abcdef0", "abcdef0123456789"));
        assert!(sha_matches("abcdef0123456789", "abcdef0"));
        assert!(!sha_matches("deadbeef", "abcdef0"));
    }
}
