use crate::comfy::paths::ProcessState;
use crate::db::RuntimeInstall;
use crate::process_cmd;
use std::path::PathBuf;
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
    let root = PathBuf::from(&runtime.install_path);
    let python = root.join("python_embeded").join("python.exe");
    let main_py = root.join("ComfyUI").join("main.py");
    if !python.is_file() || !main_py.is_file() {
        return Err("ComfyUI portable install is incomplete".into());
    }

    // Existing installs from before Manager support - install on first start.
    super::manager::ensure_comfy_manager(app, &root)?;
    // Keep shared model paths current (e.g. LLM for Prompt Tools / QwenVL).
    super::paths::write_extra_model_paths(&root, &super::paths::models_dir(app)?)?;

    let mut guard = processes.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.child.as_mut() {
        match child.try_wait() {
            Ok(None) => return Err("ComfyUI is already running".into()),
            Ok(Some(_)) => {
                guard.child = None;
            }
            Err(e) => return Err(e.to_string()),
        }
    }

    super::paths::emit_progress(app, "start", "Starting runtime…");

    let child = process_cmd::new(&python)
        .args([
            "-s",
            main_py.to_str().ok_or("invalid main.py path")?,
            "--listen",
            "127.0.0.1",
            "--port",
            &port.to_string(),
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
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("failed to spawn ComfyUI: {e}"))?;

    guard.child = Some(child);
    guard.runtime_id = Some(runtime.id.clone());
    guard.port = Some(port);
    Ok(())
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

pub fn wait_until_healthy(port: u16, attempts: u32) -> Result<(), String> {
    for i in 0..attempts {
        if health(port)? {
            return Ok(());
        }
        std::thread::sleep(Duration::from_secs(2));
        if i + 1 == attempts {
            break;
        }
    }
    Err(format!(
        "ComfyUI did not become healthy on port {port} in time"
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
                Ok(false)
            }
            Err(e) => Err(e.to_string()),
        }
    } else {
        Ok(false)
    }
}
