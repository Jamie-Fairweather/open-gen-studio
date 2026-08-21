use crate::comfy::paths::ProcessState;
use crate::db::RuntimeInstall;
use crate::process_cmd;
use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;
use std::time::Duration;
use tauri::AppHandle;

pub fn start(
    app: &AppHandle,
    processes: &Mutex<ProcessState>,
    runtime: &RuntimeInstall,
    port: u16,
) -> Result<(), String> {
    let stored_root = PathBuf::from(&runtime.install_path);
    if !stored_root.join("ComfyUI").join("main.py").is_file() {
        return Err("ComfyUI portable install is incomplete".into());
    }
    // Relocate out of long MSIX paths before VC/torch probes.
    let root = super::paths::process_portable_root(&stored_root)?;
    super::paths::portable_python_exe(&root)?;
    super::paths::unblock_embedded_python(&root);
    super::vc_redist::ensure_vc_runtime(app, &root)?;

    // Existing installs from before Manager support - install on first start.
    super::manager::ensure_comfy_manager(app, &root)?;
    // Keep shared model paths current (e.g. LLM for Prompt Tools / QwenVL).
    super::paths::write_extra_model_paths(&root, &super::paths::models_dir(app)?)?;

    // Fail before spawn with an actionable message (WinError 126 / missing CUDA).
    ensure_torch_imports(app, &root)?;

    let python = super::paths::portable_python_exe(&root)?;

    let mut guard = processes.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.child.as_mut() {
        match child.try_wait() {
            // Already spawned (e.g. app auto-start) — callers wait for health.
            Ok(None) => return Ok(()),
            Ok(Some(_)) => {
                guard.child = None;
            }
            Err(e) => return Err(e.to_string()),
        }
    }

    super::paths::emit_progress(app, "start", "Starting runtime…");

    let log_path = root.join("oga-comfyui.log");
    let log = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&log_path)
        .map_err(|e| format!("failed to open ComfyUI log {}: {e}", log_path.display()))?;
    let log_err = log
        .try_clone()
        .map_err(|e| format!("failed to clone ComfyUI log handle: {e}"))?;

    // Below Normal so the studio WebView keeps getting scheduled while Comfy saturates the GPU.
    let mut cmd = process_cmd::new_below_normal(&python);
    let embed = python
        .parent()
        .ok_or_else(|| "invalid python_embeded path".to_string())?;
    // Relative main.py + cwd = portable root matches official run_nvidia_gpu.bat.
    let main_rel = PathBuf::from("ComfyUI").join("main.py");
    let main_rel_s = main_rel.to_str().ok_or("invalid main.py path")?;
    let port_s = port.to_string();
    super::paths::apply_portable_path_env(&mut cmd, &root);
    let child = cmd
        .args([
            "-s",
            main_rel_s,
            "--listen",
            "127.0.0.1",
            "--port",
            &port_s,
            // Latent previews over /ws - taesd is sharper; preview-size lifts the pixel cap.
            "--preview-method",
            "taesd",
            "--preview-size",
            "1024",
            "--disable-auto-launch",
            "--windows-standalone-build",
            // Official portable Manager (deps via ensure_comfy_manager).
            "--enable-manager",
        ])
        .current_dir(&root)
        .env("PYTHONNOUSERSITE", "1")
        .env("PYTHONHOME", embed)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(log_err))
        .spawn()
        .map_err(|e| format!("failed to spawn ComfyUI: {e}"))?;

    guard.child = Some(child);
    guard.runtime_id = Some(runtime.id.clone());
    guard.port = Some(port);
    guard.log_path = Some(log_path);
    Ok(())
}

/// Probe `import torch` so we surface WinError 126 before a long health timeout.
fn ensure_torch_imports(app: &AppHandle, root: &Path) -> Result<(), String> {
    let cuda_driver_ok = crate::gpu::cuda_user_mode_driver_present();
    match probe_torch_import(root) {
        Ok(()) => Ok(()),
        Err(err) if looks_like_missing_native_dll(&err) => {
            super::paths::emit_progress(app, "start", "Repairing Visual C++ / torch DLLs…");
            super::paths::unblock_embedded_python(root);
            let _ = super::vc_redist::force_install_vc_redist(app, root);
            super::vc_redist::ensure_vc_runtime(app, root)?;
            super::paths::unblock_embedded_python(root);
            if probe_torch_import(root).is_ok() {
                return Ok(());
            }
            if !cuda_driver_ok {
                return Err(format!(
                    "NVIDIA CUDA driver not found in this Windows install \
(missing nvcuda.dll / nvidia-smi).\n\n\
Seeing the GPU name in Open Gen Studio is not enough on Hyper-V GPU-P — \
install NVIDIA drivers inside the VM (guest), reboot, then Start again.\n\n\
Underlying error: {err}"
                ));
            }
            Err(format!(
                "PyTorch failed to load (missing native DLL). {err}\n\n\
Install the VC++ redistributable from https://aka.ms/vs/17/release/vc_redist.x64.exe \
and confirm NVIDIA drivers are up to date, then Start again."
            ))
        }
        Err(err) => Err(format!("PyTorch import failed: {err}")),
    }
}

fn looks_like_missing_native_dll(err: &str) -> bool {
    let lower = err.to_ascii_lowercase();
    lower.contains("winerror 126")
        || lower.contains("the specified module could not be found")
        || lower.contains("torch_python.dll")
        || lower.contains("c10.dll")
        || lower.contains("vcruntime")
}

fn probe_torch_import(root: &Path) -> Result<(), String> {
    let output = super::paths::command_portable_python(root)?
        .args(["-s", "-c", "import torch; print(torch.__version__)"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("failed to probe torch: {e}"))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let msg = if stderr.trim().is_empty() {
        stdout.trim().to_string()
    } else {
        stderr.trim().to_string()
    };
    Err(if msg.is_empty() {
        "import torch failed".into()
    } else {
        msg
    })
}

pub fn stop(processes: &Mutex<ProcessState>) -> Result<(), String> {
    let mut guard = processes.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.child.take() {
        // Comfy spawns worker children - kill the whole tree on Windows.
        #[cfg(windows)]
        {
            let pid = child.id();
            let _ = process_cmd::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
        #[cfg(not(windows))]
        {
            let _ = child.kill();
        }
        let _ = child.wait();
    }
    guard.runtime_id = None;
    guard.port = None;
    Ok(())
}

/// Kill orphaned `python.exe` processes whose executable lives under `root`
/// (e.g. after a crash, or when AppState lost the child handle). Needed so
/// Settings → Reinstall can delete the portable tree on Windows.
pub fn kill_portable_python(root: &std::path::Path) {
    #[cfg(windows)]
    {
        let root_s = root.to_string_lossy().replace('/', "\\");
        if root_s.is_empty() {
            return;
        }
        // Escape single quotes for PowerShell single-quoted string.
        let root_ps = root_s.replace('\'', "''");
        let script = format!(
            "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | \
             Where-Object {{ $_.ExecutablePath -and $_.ExecutablePath.StartsWith('{root_ps}', [StringComparison]::OrdinalIgnoreCase) }} | \
             ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}"
        );
        let _ = process_cmd::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        std::thread::sleep(Duration::from_secs(1));
    }
    #[cfg(not(windows))]
    {
        let _ = root;
    }
}

pub fn health(port: u16) -> Result<bool, String> {
    let url = format!("http://127.0.0.1:{port}/system_stats");
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    match client.get(&url).send() {
        Ok(res) => Ok(res.status().is_success()),
        Err(_) => Ok(false),
    }
}

fn log_tail_hint(processes: &Mutex<ProcessState>) -> String {
    let path = processes
        .lock()
        .ok()
        .and_then(|g| g.log_path.clone())
        .filter(|p| p.is_file());
    let Some(path) = path else {
        return String::new();
    };
    match read_log_tail(&path, 2500) {
        Ok(tail) if !tail.trim().is_empty() => {
            format!("\n\nLog ({}):\n{}", path.display(), tail.trim())
        }
        _ => format!("\n\nSee log: {}", path.display()),
    }
}

fn read_log_tail(path: &Path, max_bytes: u64) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let len = file.metadata().map_err(|e| e.to_string())?.len();
    if len > max_bytes {
        file.seek(SeekFrom::End(max_bytes as i64 * -1))
            .map_err(|e| e.to_string())?;
    }
    let mut buf = String::new();
    file.read_to_string(&mut buf).map_err(|e| e.to_string())?;
    // Drop a partial first line when we seeked mid-file.
    if len > max_bytes {
        if let Some(i) = buf.find('\n') {
            buf = buf[i + 1..].to_string();
        }
    }
    Ok(buf)
}

/// Poll `/system_stats` until healthy, or fail fast if the process exits.
///
/// Cold start with custom nodes + CUDA can take a couple of minutes on VMs.
pub fn wait_until_healthy(
    processes: &Mutex<ProcessState>,
    port: u16,
    attempts: u32,
) -> Result<(), String> {
    for i in 0..attempts {
        if health(port)? {
            return Ok(());
        }
        if !is_process_alive(processes)? {
            return Err(format!(
                "ComfyUI exited before becoming healthy on port {port}.{}",
                log_tail_hint(processes)
            ));
        }
        std::thread::sleep(Duration::from_secs(2));
        if i + 1 == attempts {
            break;
        }
    }
    Err(format!(
        "ComfyUI did not become healthy on port {port} in time.{}",
        log_tail_hint(processes)
    ))
}

pub fn is_process_alive(processes: &Mutex<ProcessState>) -> Result<bool, String> {
    let mut guard = processes.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.child.as_mut() {
        match child.try_wait() {
            Ok(None) => Ok(true),
            Ok(Some(_)) => {
                guard.child = None;
                guard.runtime_id = None;
                guard.port = None;
                // Keep log_path so wait_until_healthy can include the crash log.
                Ok(false)
            }
            Err(e) => Err(e.to_string()),
        }
    } else {
        Ok(false)
    }
}
