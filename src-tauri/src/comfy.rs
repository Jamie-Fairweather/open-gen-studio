use crate::db::RuntimeInstall;
use crate::download;
use crate::gpu::{self, GpuInfo};
use crate::pins::{self, COMFY_NVIDIA_PORTABLE_URL, COMFY_PINNED_VERSION, COMFY_PIN_MARKER};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use sevenz_rust2::{ArchiveReader, Password};

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

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn emit_progress(app: &AppHandle, stage: &str, message: &str) {
    let _ = app.emit(
        "runtimes://progress",
        RuntimeProgress {
            engine: ENGINE.into(),
            stage: stage.into(),
            message: message.into(),
        },
    );
}

pub fn resolve_portable_url(gpu: &GpuInfo) -> Result<&'static str, String> {
    if !cfg!(target_os = "windows") {
        return Err("ComfyUI portable install is Windows-only for now".into());
    }
    if !gpu.available {
        return Err(gpu
            .error
            .clone()
            .unwrap_or_else(|| "NVIDIA GPU required for default portable".into()));
    }
    // Pinned NVIDIA portable — bump COMFY_PINNED_VERSION in pins.rs with app releases.
    Ok(COMFY_NVIDIA_PORTABLE_URL)
}

pub fn pinned_version() -> &'static str {
    COMFY_PINNED_VERSION
}

pub fn read_pin_marker(root: &Path) -> Option<String> {
    fs::read_to_string(root.join(COMFY_PIN_MARKER))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn write_pin_marker(root: &Path) -> Result<(), String> {
    fs::write(root.join(COMFY_PIN_MARKER), COMFY_PINNED_VERSION).map_err(|e| e.to_string())
}

/// True when the extract looks ready and matches the app's Comfy pin.
pub fn portable_pin_matches(root: &Path) -> bool {
    portable_ready(root) && read_pin_marker(root).as_deref() == Some(COMFY_PINNED_VERSION)
}

/// Copy `custom_nodes` to `backup_parent` (must be **outside** the extract tree —
/// nested portable roots used to put the backup under `portable/`, which we then delete).
fn backup_custom_nodes(
    root: &Path,
    backup_parent: &Path,
) -> Result<Option<PathBuf>, String> {
    let src = root.join("ComfyUI").join("custom_nodes");
    if !src.is_dir() {
        return Ok(None);
    }
    fs::create_dir_all(backup_parent).map_err(|e| e.to_string())?;
    let dest = backup_parent.join(format!(".oga_custom_nodes_backup_{}", now_secs()));
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    }
    copy_dir_recursive(&src, &dest)?;
    Ok(Some(dest))
}

fn restore_custom_nodes(root: &Path, backup: &Path) -> Result<(), String> {
    if !backup.is_dir() {
        return Err(format!(
            "custom nodes backup missing at {} — managed nodes will be re-pinned",
            backup.display()
        ));
    }
    let dest = root.join("ComfyUI").join("custom_nodes");
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    }
    copy_dir_recursive(backup, &dest)?;
    let _ = fs::remove_dir_all(backup);
    Ok(())
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

fn looks_like_portable_root(path: &Path) -> bool {
    path.join("python_embeded").is_dir() && path.join("ComfyUI").is_dir()
}

fn portable_ready(path: &Path) -> bool {
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

fn find_7z_exe() -> Option<PathBuf> {
    const CANDIDATES: &[&str] = &[
        r"C:\Program Files\7-Zip\7z.exe",
        r"C:\Program Files (x86)\7-Zip\7z.exe",
    ];
    for candidate in CANDIDATES {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Some(path);
        }
    }
    None
}


fn write_extra_model_paths(portable_root: &Path, models: &Path) -> Result<(), String> {
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
    ] {
        fs::create_dir_all(models.join(sub)).map_err(|e| e.to_string())?;
    }

    let models_posix = models
        .to_string_lossy()
        .replace('\\', "/");
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
"#
    );
    let path = portable_root.join("ComfyUI").join("extra_model_paths.yaml");
    let mut file = fs::File::create(path).map_err(|e| e.to_string())?;
    file.write_all(yaml.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn extract_with_sevenz_cli(app: &AppHandle, archive: &Path, dest: &Path) -> Result<(), String> {
    let seven = find_7z_exe().ok_or_else(|| "7-Zip not found".to_string())?;
    emit_progress(
        app,
        "extract",
        &format!("Extracting with {}…", seven.display()),
    );
    let output = Command::new(&seven)
        .args([
            "x",
            archive
                .to_str()
                .ok_or_else(|| "invalid archive path".to_string())?,
            &format!("-o{}", dest.display()),
            "-y",
            "-bsp1",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("failed to run 7z: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("7z extract failed: {stderr}"));
    }
    Ok(())
}

/// Pure-Rust extract via sevenz-rust2 (no system 7-Zip required).
fn extract_with_rust(app: &AppHandle, archive: &Path, dest: &Path) -> Result<(), String> {
    emit_progress(
        app,
        "extract",
        "Extracting with built-in Rust 7z (sevenz-rust2)…",
    );

    let mut reader =
        ArchiveReader::open(archive, Password::empty()).map_err(|e| e.to_string())?;
    if let Ok(n) = std::thread::available_parallelism() {
        reader.set_thread_count(n.get() as u32);
    }

    let mut extracted = 0u64;
    let mut last_emit = Instant::now()
        .checked_sub(Duration::from_secs(1))
        .unwrap_or_else(Instant::now);

    reader
        .for_each_entries(|entry, reader| {
            let out = dest.join(entry.name());
            sevenz_rust2::default_entry_extract_fn(entry, reader, &out)?;
            if !entry.is_directory() {
                extracted += 1;
                if last_emit.elapsed() >= Duration::from_secs(2) {
                    emit_progress(
                        app,
                        "extract",
                        &format!("Extracting… {extracted} files written"),
                    );
                    last_emit = Instant::now();
                }
            }
            Ok(true)
        })
        .map_err(|e| e.to_string())?;

    emit_progress(
        app,
        "extract",
        &format!("Extract complete ({extracted} files)"),
    );
    Ok(())
}

fn extract_7z(app: &AppHandle, archive: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;

    // Optional boost when 7-Zip is installed; otherwise pure Rust always works.
    if find_7z_exe().is_some() {
        match extract_with_sevenz_cli(app, archive, dest) {
            Ok(()) => return Ok(()),
            Err(err) => {
                emit_progress(
                    app,
                    "extract",
                    &format!("System 7-Zip failed ({err}) — falling back to Rust extractor…"),
                );
                if dest.exists() {
                    let _ = fs::remove_dir_all(dest);
                    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    extract_with_rust(app, archive, dest)
}

/// Install or migrate to the pinned ComfyUI portable.
/// `force` reinstalls even when the pin already matches (Settings → Reinstall).
pub fn install_portable(
    app: &AppHandle,
    existing: Option<&RuntimeInstall>,
    force: bool,
) -> Result<RuntimeInstall, String> {
    let gpu = gpu::detect_nvidia();
    let url = resolve_portable_url(&gpu)?;
    let base = runtimes_dir(app)?;
    let archive = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("downloads")
        .join(format!(
            "ComfyUI_windows_portable_nvidia_{COMFY_PINNED_VERSION}.7z"
        ));
    let extract_to = base.join("portable");
    let models = models_dir(app)?;

    let id = existing
        .map(|r| r.id.clone())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let created_at = existing.map(|r| r.created_at).unwrap_or_else(now_secs);

    let mut custom_nodes_backup: Option<PathBuf> = None;

    if let Ok(root) = find_portable_root(&extract_to) {
        if portable_ready(&root) {
            if portable_pin_matches(&root) && !force {
                emit_progress(
                    app,
                    "configure",
                    &format!("ComfyUI {COMFY_PINNED_VERSION} already installed — finishing setup…"),
                );
                write_extra_model_paths(&root, &models)?;
                ensure_comfy_manager(app, &root)?;
                write_pin_marker(&root)?;
                let _ = crate::upscale::ensure_managed_nodes(app);
                return Ok(RuntimeInstall {
                    id,
                    engine: ENGINE.into(),
                    version: COMFY_PINNED_VERSION.into(),
                    install_path: root.display().to_string(),
                    port: Some(DEFAULT_PORT as i64),
                    status: "ready".into(),
                    error: None,
                    created_at,
                    updated_at: now_secs(),
                });
            }

            emit_progress(
                app,
                "extract",
                if force {
                    "Reinstalling pinned ComfyUI — backing up custom nodes…"
                } else {
                    "Updating ComfyUI to the version required by this app — backing up custom nodes…"
                },
            );
            // `base` is runtimes/comfyui — never under extract_to/portable.
            custom_nodes_backup = backup_custom_nodes(&root, &base)?;
            fs::remove_dir_all(&extract_to).map_err(|e| e.to_string())?;
        }
    }

    let archive_ok = archive.is_file()
        && fs::metadata(&archive)
            .map(|m| m.len() > 1_500_000_000)
            .unwrap_or(false);
    if archive_ok {
        emit_progress(
            app,
            "download",
            &format!("Pinned archive {COMFY_PINNED_VERSION} already downloaded — skipping download"),
        );
    } else {
        emit_progress(
            app,
            "download",
            &format!("Downloading ComfyUI {COMFY_PINNED_VERSION} Windows Portable…"),
        );
        download::download_file(app, url, &archive, None)?;
    }

    if extract_to.exists() {
        emit_progress(app, "extract", "Removing incomplete extract…");
        fs::remove_dir_all(&extract_to).map_err(|e| e.to_string())?;
    }
    extract_7z(app, &archive, &extract_to)?;

    let root = find_portable_root(&extract_to)?;
    if !portable_ready(&root) {
        return Err("extract finished but ComfyUI portable looks incomplete".into());
    }
    emit_progress(app, "configure", "Writing shared model paths…");
    write_extra_model_paths(&root, &models)?;
    ensure_comfy_manager(app, &root)?;

    if let Some(ref backup) = custom_nodes_backup {
        emit_progress(app, "configure", "Restoring custom nodes…");
        if let Err(err) = restore_custom_nodes(&root, backup) {
            // Don't fail the whole Comfy pin migrate — managed nodes are re-checked out next.
            emit_progress(
                app,
                "configure",
                &format!("Custom nodes restore skipped ({err})"),
            );
            let _ = fs::remove_dir_all(backup);
        }
    }
    write_pin_marker(&root)?;
    emit_progress(app, "configure", "Ensuring managed custom nodes match app pins…");
    crate::upscale::ensure_managed_nodes(app)?;

    Ok(RuntimeInstall {
        id,
        engine: ENGINE.into(),
        version: COMFY_PINNED_VERSION.into(),
        install_path: root.display().to_string(),
        port: Some(DEFAULT_PORT as i64),
        status: "ready".into(),
        error: None,
        created_at,
        updated_at: now_secs(),
    })
}

/// Status for Settings: expected pin vs installed marker / DB version.
pub fn comfy_pin_status(_app: &AppHandle, runtime: Option<&RuntimeInstall>) -> pins::PinStatus {
    let installed = runtime
        .and_then(|r| {
            if r.install_path.is_empty() {
                None
            } else {
                read_pin_marker(Path::new(&r.install_path)).or_else(|| {
                    let v = r.version.trim();
                    if v.is_empty() || v == "portable-latest" {
                        None
                    } else {
                        Some(v.to_string())
                    }
                })
            }
        });
    let matches = installed.as_deref() == Some(COMFY_PINNED_VERSION);
    pins::PinStatus {
        id: ENGINE.into(),
        expected: COMFY_PINNED_VERSION.into(),
        installed,
        matches,
    }
}

/// Install ComfyUI-Manager deps (official portable flow) once per install.
/// Built into ComfyUI core; needs `manager_requirements.txt` + `--enable-manager` at launch.
fn ensure_comfy_manager(app: &AppHandle, root: &Path) -> Result<(), String> {
    let marker = root.join(".oga_comfy_manager");
    if marker.is_file() {
        return Ok(());
    }

    let python = root.join("python_embeded").join("python.exe");
    if !python.is_file() {
        return Err("ComfyUI portable python.exe missing — cannot install Manager".into());
    }

    let reqs = root.join("ComfyUI").join("manager_requirements.txt");
    emit_progress(app, "configure", "Installing ComfyUI-Manager…");

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
            .args(["-s", "-m", "pip", "install", "-U", "--pre", "comfyui-manager"])
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
    emit_progress(app, "configure", "ComfyUI-Manager ready");
    Ok(())
}

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

    // Existing installs from before Manager support — install on first start.
    ensure_comfy_manager(app, &root)?;

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

    emit_progress(app, "start", "Starting runtime…");

    let child = Command::new(&python)
        .args([
            "-s",
            main_py.to_str().ok_or("invalid main.py path")?,
            "--listen",
            "127.0.0.1",
            "--port",
            &port.to_string(),
            // Latent previews over /ws — taesd is sharper; preview-size lifts the pixel cap.
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
        // Comfy spawns worker children — kill the whole tree on Windows.
        #[cfg(windows)]
        {
            let pid = child.id();
            let _ = Command::new("taskkill")
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
