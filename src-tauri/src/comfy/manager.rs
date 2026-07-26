use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::AppHandle;

/// Install ComfyUI-Manager deps (official portable flow) once per install.
/// Built into ComfyUI core; needs `manager_requirements.txt` + `--enable-manager` at launch.
pub(crate) fn ensure_comfy_manager(app: &AppHandle, root: &Path) -> Result<(), String> {
    let marker = root.join(".oga_comfy_manager");
    if marker.is_file() {
        return Ok(());
    }

    let python = root.join("python_embeded").join("python.exe");
    if !python.is_file() {
        return Err("ComfyUI portable python.exe missing — cannot install Manager".into());
    }

    let reqs = root.join("ComfyUI").join("manager_requirements.txt");
    super::paths::emit_progress(app, "configure", "Installing ComfyUI-Manager…");

    let output = if reqs.is_file() {
        Command::new(&python)
            .args([
                "-s",
                "-m",
                "pip",
                "install",
                "-r",
                reqs.to_str().ok_or("invalid manager_requirements path")?,
            ])
            .current_dir(root)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| format!("failed to run pip for ComfyUI-Manager: {e}"))?
    } else {
        // Older portables / docs still mention the pip package.
        Command::new(&python)
            .args([
                "-s",
                "-m",
                "pip",
                "install",
                "-U",
                "--pre",
                "comfyui-manager",
            ])
            .current_dir(root)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| format!("failed to run pip for ComfyUI-Manager: {e}"))?
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "ComfyUI-Manager install failed: {}{}",
            stderr.trim(),
            if stderr.trim().is_empty() {
                stdout.trim()
            } else {
                ""
            }
        ));
    }

    fs::write(&marker, b"ok").map_err(|e| e.to_string())?;
    super::paths::emit_progress(app, "configure", "ComfyUI-Manager ready");
    Ok(())
}
