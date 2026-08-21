use crate::pins::COMFY_MANAGER_PIP_SPEC;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use tauri::AppHandle;

/// Install ComfyUI-Manager deps (official portable flow) once per install.
/// Built into ComfyUI core; needs Manager packages + `--enable-manager` at launch.
///
/// Order: ensure pip → requirements file or pinned PyPI spec (retries). Hard-fails
/// if install fails (Manager is required). Onboarding already requires network.
pub fn ensure_comfy_manager(app: &AppHandle, root: &Path) -> Result<(), String> {
    let marker = root.join(".oga_comfy_manager");
    if marker.is_file() {
        return Ok(());
    }

    // Fail in-app before Windows pops "python313.dll was not found".
    if let Err(err) = super::paths::portable_python_exe(root) {
        return Err(format!(
            "{err} If Retry keeps failing, remove the ComfyUI runtime folder and reinstall."
        ));
    }
    super::paths::unblock_embedded_python(root);
    // Bundled VC++ DLLs next to python.exe (System32 is not enough under MSIX).
    super::vc_redist::ensure_vc_runtime(app, root)?;
    // Re-check after writing VC DLLs / unblock — never CreateProcess a broken embed.
    super::paths::portable_python_exe(root)?;

    super::paths::emit_progress(app, "python-deps", "Preparing pip…");
    ensure_pip(app, root)?;

    super::paths::emit_progress(app, "python-deps", "Installing Python packages…");

    install_manager_from_pypi(root)
        .map_err(|e| format!("ComfyUI-Manager install failed (Manager is required). {e}"))?;

    fs::write(&marker, b"ok").map_err(|e| e.to_string())?;
    super::paths::emit_progress(app, "python-deps", "Python packages ready");
    Ok(())
}

fn ensure_pip(app: &AppHandle, root: &Path) -> Result<(), String> {
    if pip_works(root) {
        return Ok(());
    }
    super::paths::emit_progress(app, "python-deps", "Bootstrapping pip…");
    let ensure = run_python(root, &["-s", "-m", "ensurepip", "--upgrade"])?;
    if ensure.status.success() && pip_works(root) {
        return Ok(());
    }
    // Last resort: get-pip.py from the official bootstrap host.
    let get_pip = root.join("python_embeded").join("get-pip.py");
    let get_pip = fs::canonicalize(&get_pip).unwrap_or(get_pip);
    crate::download::download_file(app, "https://bootstrap.pypa.io/get-pip.py", &get_pip, None)?;
    let boot = run_python(
        root,
        &["-s", get_pip.to_str().ok_or("invalid get-pip.py path")?],
    )?;
    let _ = fs::remove_file(&get_pip);
    if !boot.status.success() || !pip_works(root) {
        let detail = output_detail(&boot);
        return Err(format!("failed to bootstrap pip: {detail}"));
    }
    Ok(())
}

fn pip_works(root: &Path) -> bool {
    run_python(root, &["-s", "-m", "pip", "--version"])
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn install_manager_from_pypi(root: &Path) -> Result<(), String> {
    const ATTEMPTS: u32 = 3;
    let mut last = String::new();

    // Prefer official requirements file when the portable ships it; many builds omit it.
    let reqs = find_manager_requirements(root);
    if reqs.is_none() {
        log::info!(
            "manager_requirements.txt missing under {} — installing pinned {}",
            root.display(),
            COMFY_MANAGER_PIP_SPEC
        );
    }

    for attempt in 1..=ATTEMPTS {
        let output = match reqs.as_ref() {
            Some(reqs_path) => {
                let staged = super::paths::stage_requirements_for_pip(root, reqs_path)?;
                let staged_s = staged
                    .to_str()
                    .ok_or("invalid staged manager_requirements path")?;
                let output = run_python(
                    root,
                    &[
                        "-s",
                        "-m",
                        "pip",
                        "install",
                        "--disable-pip-version-check",
                        "-r",
                        staged_s,
                    ],
                )?;
                let _ = fs::remove_file(&staged);
                output
            }
            None => run_python(
                root,
                &[
                    "-s",
                    "-m",
                    "pip",
                    "install",
                    "--disable-pip-version-check",
                    COMFY_MANAGER_PIP_SPEC,
                ],
            )?,
        };
        if output.status.success() {
            return Ok(());
        }
        last = output_detail(&output);
        log::warn!("Manager pip attempt {attempt}/{ATTEMPTS} failed: {last}");

        // If -r failed because the file vanished / wrong view, fall back to the pin.
        if reqs.is_some()
            && (last.contains("Could not open requirements file")
                || last.contains("No such file or directory"))
        {
            log::warn!("requirements file unreadable — falling back to {COMFY_MANAGER_PIP_SPEC}");
            let pinned = run_python(
                root,
                &[
                    "-s",
                    "-m",
                    "pip",
                    "install",
                    "--disable-pip-version-check",
                    COMFY_MANAGER_PIP_SPEC,
                ],
            )?;
            if pinned.status.success() {
                return Ok(());
            }
            last = output_detail(&pinned);
        }

        if attempt < ATTEMPTS {
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    }
    Err(last)
}

fn find_manager_requirements(root: &Path) -> Option<PathBuf> {
    let candidates = [
        root.join("ComfyUI").join("manager_requirements.txt"),
        root.join("manager_requirements.txt"),
    ];
    for candidate in candidates {
        // Canonicalize so unpackaged python.exe sees the real path under MSIX redirection.
        if let Ok(canon) = fs::canonicalize(&candidate) {
            if canon.is_file() {
                return Some(canon);
            }
        } else if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn run_python(root: &Path, args: &[&str]) -> Result<Output, String> {
    let mut cmd: Command = super::paths::command_portable_python(root)?;
    cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
    cmd.output().map_err(|e| {
        let embed = root.join("python_embeded");
        // ERROR_MOD_NOT_FOUND — usually python3*.dll missing next to python.exe.
        if e.raw_os_error() == Some(126) {
            format!(
                "failed to start portable Python (DLL not found). \
Confirm python3*.dll exists in {}. {e}",
                embed.display()
            )
        } else {
            format!("failed to run {}: {e}", args.join(" "))
        }
    })
}

fn output_detail(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let err = stderr.trim();
    if !err.is_empty() {
        err.to_string()
    } else {
        stdout.trim().to_string()
    }
}
