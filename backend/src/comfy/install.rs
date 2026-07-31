use crate::db::RuntimeInstall;
use crate::download;
use crate::gpu::{self, GpuInfo};
use crate::pins::{self, COMFY_NVIDIA_PORTABLE_URL, COMFY_PINNED_VERSION};
use crate::process_cmd;
use sevenz_rust2::{ArchiveReader, Password};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};
use tauri::AppHandle;

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
    // Pinned NVIDIA portable - bump COMFY_PINNED_VERSION in pins.rs with app releases.
    Ok(COMFY_NVIDIA_PORTABLE_URL)
}

pub fn pinned_version() -> &'static str {
    COMFY_PINNED_VERSION
}

/// Copy `custom_nodes` to `backup_parent` (must be **outside** the extract tree -
/// nested portable roots used to put the backup under `portable/`, which we then delete).
pub(crate) fn backup_custom_nodes(
    root: &Path,
    backup_parent: &Path,
) -> Result<Option<PathBuf>, String> {
    let src = root.join("ComfyUI").join("custom_nodes");
    if !src.is_dir() {
        return Ok(None);
    }
    fs::create_dir_all(backup_parent).map_err(|e| e.to_string())?;
    let dest = backup_parent.join(format!(
        ".oga_custom_nodes_backup_{}",
        super::paths::now_secs()
    ));
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    }
    copy_dir_recursive(&src, &dest)?;
    Ok(Some(dest))
}

pub(crate) fn restore_custom_nodes(root: &Path, backup: &Path) -> Result<(), String> {
    if !backup.is_dir() {
        return Err(format!(
            "custom nodes backup missing at {} - managed nodes will be re-pinned",
            backup.display()
        ));
    }
    let dest = root.join("ComfyUI").join("custom_nodes");
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    }
    copy_dir_recursive(backup, &dest)?;
    let _ = fs::remove_dir_all(backup);
    // Never carry over managed packs - they are re-pinned fresh (avoids restoring a
    // broken QwenVL/SUPIR tree that already matched HEAD and skipped re-clone).
    purge_managed_custom_nodes(root);
    Ok(())
}

/// Delete app-managed custom node folders so `ensure_managed_nodes` re-clones them.
pub(crate) fn purge_managed_custom_nodes(root: &Path) {
    let custom = root.join("ComfyUI").join("custom_nodes");
    purge_managed_folders(&custom);
}

/// Backup layout is the custom_nodes tree itself (no ComfyUI/ prefix).
fn purge_managed_custom_nodes_in_backup(backup: &Path) {
    purge_managed_folders(backup);
}

fn purge_managed_folders(custom_nodes_dir: &Path) {
    if !custom_nodes_dir.is_dir() {
        return;
    }
    for pin in pins::MANAGED_NODES {
        let _ = fs::remove_dir_all(custom_nodes_dir.join(pin.folder));
    }
}

/// Retry delete - Windows often holds locks for a few seconds after process kill.
fn remove_dir_retries(path: &Path, attempts: u32) -> Result<(), String> {
    for i in 0..attempts {
        if !path.exists() {
            return Ok(());
        }
        match fs::remove_dir_all(path) {
            Ok(()) => return Ok(()),
            Err(e) if i + 1 >= attempts => {
                return Err(format!(
                    "Could not delete ComfyUI folder (a file is still in use): {e}. \
                     Close anything using that folder, reboot if needed, then retry Reinstall."
                ));
            }
            Err(_) => {
                std::thread::sleep(Duration::from_secs(2));
            }
        }
    }
    Ok(())
}

pub(crate) fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
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

pub(crate) fn find_7z_exe() -> Option<PathBuf> {
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

pub(crate) fn extract_with_sevenz_cli(
    app: &AppHandle,
    archive: &Path,
    dest: &Path,
) -> Result<(), String> {
    use std::io::Read;

    let seven = find_7z_exe().ok_or_else(|| "7-Zip not found".to_string())?;
    super::paths::emit_progress(
        app,
        "extract",
        &format!("Extracting with {}…", seven.display()),
    );
    let mut child = process_cmd::new(&seven)
        .args([
            "x",
            archive
                .to_str()
                .ok_or_else(|| "invalid archive path".to_string())?,
            &format!("-o{}", dest.display()),
            "-y",
            "-bsp1",
            "-bso1",
            "-bse1",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to run 7z: {e}"))?;

    let stderr_thread = child.stderr.take().map(|mut s| {
        std::thread::spawn(move || {
            let mut buf = String::new();
            let _ = s.read_to_string(&mut buf);
            buf
        })
    });

    let mut last_emit = Instant::now()
        .checked_sub(Duration::from_secs(1))
        .unwrap_or_else(Instant::now);
    if let Some(mut out) = child.stdout.take() {
        let mut buf = [0u8; 256];
        let mut acc = String::new();
        loop {
            let n = out.read(&mut buf).map_err(|e| format!("7z stdout: {e}"))?;
            if n == 0 {
                break;
            }
            for &b in &buf[..n] {
                if b == b'\r' || b == b'\n' {
                    if let Some(msg) = parse_7z_progress_line(&acc) {
                        if last_emit.elapsed() >= Duration::from_millis(400) {
                            super::paths::emit_progress(app, "extract", &msg);
                            last_emit = Instant::now();
                        }
                    }
                    acc.clear();
                } else if b.is_ascii() {
                    acc.push(b as char);
                }
            }
        }
        if let Some(msg) = parse_7z_progress_line(&acc) {
            super::paths::emit_progress(app, "extract", &msg);
        }
    }

    let status = child.wait().map_err(|e| format!("7z wait failed: {e}"))?;
    let stderr = stderr_thread
        .and_then(|t| t.join().ok())
        .unwrap_or_default();
    if !status.success() {
        return Err(format!("7z extract failed: {stderr}"));
    }
    super::paths::emit_progress(app, "extract", "Extract complete");
    Ok(())
}

/// Parse 7-Zip `-bsp1` progress lines like `"  45%"` or `"  45% 1234"`.
fn parse_7z_progress_line(line: &str) -> Option<String> {
    let t = line.trim();
    if t.is_empty() {
        return None;
    }
    let pct_token = t
        .split_whitespace()
        .find(|p| p.ends_with('%'))?
        .trim_end_matches('%');
    let pct: u32 = pct_token.parse().ok()?;
    if pct > 100 {
        return None;
    }
    Some(format!("Extracting… {pct}%"))
}

/// Pure-Rust extract via sevenz-rust2 (no system 7-Zip required).
pub(crate) fn extract_with_rust(
    app: &AppHandle,
    archive: &Path,
    dest: &Path,
) -> Result<(), String> {
    super::paths::emit_progress(
        app,
        "extract",
        "Extracting with built-in Rust 7z (sevenz-rust2)…",
    );

    let mut reader = ArchiveReader::open(archive, Password::empty()).map_err(|e| e.to_string())?;
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
                if last_emit.elapsed() >= Duration::from_secs(1) {
                    super::paths::emit_progress(
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

    super::paths::emit_progress(
        app,
        "extract",
        &format!("Extract complete ({extracted} files)"),
    );
    Ok(())
}

pub(crate) fn extract_7z(app: &AppHandle, archive: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;

    // Optional boost when 7-Zip is installed; otherwise pure Rust always works.
    if find_7z_exe().is_some() {
        match extract_with_sevenz_cli(app, archive, dest) {
            Ok(()) => return Ok(()),
            Err(err) => {
                super::paths::emit_progress(
                    app,
                    "extract",
                    &format!("System 7-Zip failed ({err}) - falling back to Rust extractor…"),
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

pub fn portable_archive_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::app_paths::app_data_dir(app)?
        .join("downloads")
        .join(format!(
            "ComfyUI_windows_portable_nvidia_{COMFY_PINNED_VERSION}.7z"
        )))
}

pub fn archive_looks_complete(archive: &Path) -> bool {
    archive.is_file()
        && fs::metadata(archive)
            .map(|m| m.len() > 1_500_000_000)
            .unwrap_or(false)
}

/// Download the pinned portable archive when missing/incomplete.
pub fn download_portable_archive(app: &AppHandle) -> Result<PathBuf, String> {
    let gpu = gpu::detect_nvidia();
    let url = resolve_portable_url(&gpu)?;
    let archive = portable_archive_path(app)?;
    if archive_looks_complete(&archive) {
        super::paths::emit_progress(
            app,
            "download",
            &format!(
                "Pinned archive {COMFY_PINNED_VERSION} already downloaded - skipping download"
            ),
        );
        return Ok(archive);
    }
    super::paths::emit_progress(
        app,
        "download",
        &format!("Downloading ComfyUI {COMFY_PINNED_VERSION} Windows Portable…"),
    );
    download::download_file(app, url, &archive, None)?;
    Ok(archive)
}

fn runtime_row_ids(existing: Option<&RuntimeInstall>) -> (String, i64) {
    let id = existing
        .map(|r| r.id.clone())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let created_at = existing
        .map(|r| r.created_at)
        .unwrap_or_else(super::paths::now_secs);
    (id, created_at)
}

fn ready_runtime(id: String, created_at: i64, root: &Path) -> RuntimeInstall {
    RuntimeInstall {
        id,
        engine: super::paths::ENGINE.into(),
        version: COMFY_PINNED_VERSION.into(),
        install_path: root.display().to_string(),
        port: Some(super::paths::DEFAULT_PORT as i64),
        status: "ready".into(),
        error: None,
        created_at,
        updated_at: super::paths::now_secs(),
    }
}

/// Stable backup dir for custom nodes across extract → configure download steps.
fn custom_nodes_backup_path(base: &Path) -> PathBuf {
    base.join(".oga_custom_nodes_backup")
}

/// Extract pinned portable (assumes archive already downloaded). No configure.
pub fn extract_portable_core(
    app: &AppHandle,
    _existing: Option<&RuntimeInstall>,
    force: bool,
) -> Result<(), String> {
    let base = super::paths::runtimes_dir(app)?;
    let archive = portable_archive_path(app)?;
    let extract_to = base.join("portable");
    let backup_path = custom_nodes_backup_path(&base);

    if let Ok(root) = super::paths::find_portable_root(&extract_to) {
        if super::paths::portable_ready(&root) {
            if super::paths::portable_pin_matches(&root) && !force {
                super::paths::emit_progress(
                    app,
                    "extract",
                    &format!("ComfyUI {COMFY_PINNED_VERSION} already extracted"),
                );
                return Ok(());
            }

            super::paths::emit_progress(
                app,
                "extract",
                if force {
                    "Reinstalling pinned ComfyUI - backing up custom nodes…"
                } else {
                    "Updating ComfyUI to the version required by this app - backing up custom nodes…"
                },
            );
            // Release file locks before wipe (tracked stop happens in enqueue; catch orphans).
            super::process::kill_portable_python(&root);
            if backup_path.exists() {
                let _ = remove_dir_retries(&backup_path, 3);
            }
            if let Some(backup) = backup_custom_nodes(&root, &base)? {
                // Drop managed packs from the backup so restore cannot resurrect a broken pin.
                purge_managed_custom_nodes_in_backup(&backup);
                // Normalize to the stable path configure looks for.
                if backup != backup_path {
                    fs::rename(&backup, &backup_path).map_err(|e| e.to_string())?;
                }
            }
            remove_dir_retries(&extract_to, 8)?;
        }
    }

    if !archive_looks_complete(&archive) {
        return Err(format!(
            "ComfyUI archive missing or incomplete at {}",
            archive.display()
        ));
    }

    if extract_to.exists() {
        super::paths::emit_progress(app, "extract", "Removing incomplete extract…");
        if let Ok(root) = super::paths::find_portable_root(&extract_to) {
            super::process::kill_portable_python(&root);
        }
        remove_dir_retries(&extract_to, 8)?;
    }
    extract_7z(app, &archive, &extract_to)?;

    let root = super::paths::find_portable_root(&extract_to)?;
    if !super::paths::portable_ready(&root) {
        return Err("extract finished but ComfyUI portable looks incomplete".into());
    }
    Ok(())
}

/// Configure extracted portable: model paths, Manager, restore custom nodes, pin.
pub fn configure_portable_core(
    app: &AppHandle,
    existing: Option<&RuntimeInstall>,
    _force: bool,
) -> Result<RuntimeInstall, String> {
    let base = super::paths::runtimes_dir(app)?;
    let extract_to = base.join("portable");
    let models = super::paths::models_dir(app)?;
    let (id, created_at) = runtime_row_ids(existing);
    let backup_path = custom_nodes_backup_path(&base);

    let root = super::paths::find_portable_root(&extract_to)?;
    if !super::paths::portable_ready(&root) {
        return Err("ComfyUI portable extract missing - run extract first".into());
    }

    super::paths::emit_progress(app, "configure", "Writing shared model paths…");
    super::paths::write_extra_model_paths(&root, &models)?;
    super::manager::ensure_comfy_manager(app, &root)?;

    if backup_path.is_dir() {
        super::paths::emit_progress(app, "configure", "Restoring custom nodes…");
        if let Err(err) = restore_custom_nodes(&root, &backup_path) {
            super::paths::emit_progress(
                app,
                "configure",
                &format!("Custom nodes restore skipped ({err})"),
            );
            let _ = fs::remove_dir_all(&backup_path);
        }
    }
    super::paths::write_pin_marker(&root)?;
    Ok(ready_runtime(id, created_at, &root))
}

/// Extract + configure pinned portable (assumes archive already downloaded).
/// Does not install managed custom-node extensions.
pub fn install_portable_core(
    app: &AppHandle,
    existing: Option<&RuntimeInstall>,
    force: bool,
) -> Result<RuntimeInstall, String> {
    extract_portable_core(app, existing, force)?;
    configure_portable_core(app, existing, force)
}

/// Install or migrate to the pinned ComfyUI portable.
/// `force` reinstalls even when the pin already matches (Settings → Reinstall).
pub fn install_portable(
    app: &AppHandle,
    existing: Option<&RuntimeInstall>,
    force: bool,
) -> Result<RuntimeInstall, String> {
    let _ = download_portable_archive(app)?;
    let runtime = install_portable_core(app, existing, force)?;
    super::paths::emit_progress(
        app,
        "configure",
        "Ensuring managed custom nodes match app pins…",
    );
    crate::upscale::ensure_managed_nodes(app)?;
    // Fresh python_embeded has no Prompt Tools deps; marker was wiped with the portable.
    let _ = crate::prompt_tools::install_qwenvl_python_deps(app)?;
    Ok(runtime)
}

/// Status for Settings: expected pin vs installed marker / DB version.
pub fn comfy_pin_status(_app: &AppHandle, runtime: Option<&RuntimeInstall>) -> pins::PinStatus {
    let installed = runtime.and_then(|r| {
        if r.install_path.is_empty() {
            None
        } else {
            super::paths::read_pin_marker(Path::new(&r.install_path)).or_else(|| {
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
        id: super::paths::ENGINE.into(),
        expected: COMFY_PINNED_VERSION.into(),
        installed,
        matches,
    }
}
