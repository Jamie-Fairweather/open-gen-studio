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
    let seven = find_7z_exe().ok_or_else(|| "7-Zip not found".to_string())?;
    super::paths::emit_progress(
        app,
        "extract",
        &format!("Extracting with {}…", seven.display()),
    );
    let output = process_cmd::new(&seven)
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
                if last_emit.elapsed() >= Duration::from_secs(2) {
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

/// Extract + configure pinned portable (assumes archive already downloaded).
/// Does not install managed custom-node extensions.
pub fn install_portable_core(
    app: &AppHandle,
    existing: Option<&RuntimeInstall>,
    force: bool,
) -> Result<RuntimeInstall, String> {
    let base = super::paths::runtimes_dir(app)?;
    let archive = portable_archive_path(app)?;
    let extract_to = base.join("portable");
    let models = super::paths::models_dir(app)?;
    let (id, created_at) = runtime_row_ids(existing);

    let mut custom_nodes_backup: Option<PathBuf> = None;

    if let Ok(root) = super::paths::find_portable_root(&extract_to) {
        if super::paths::portable_ready(&root) {
            if super::paths::portable_pin_matches(&root) && !force {
                super::paths::emit_progress(
                    app,
                    "configure",
                    &format!("ComfyUI {COMFY_PINNED_VERSION} already installed - finishing setup…"),
                );
                super::paths::write_extra_model_paths(&root, &models)?;
                super::manager::ensure_comfy_manager(app, &root)?;
                super::paths::write_pin_marker(&root)?;
                return Ok(ready_runtime(id, created_at, &root));
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
            // `base` is runtimes/comfyui - never under extract_to/portable.
            custom_nodes_backup = backup_custom_nodes(&root, &base)?;
            fs::remove_dir_all(&extract_to).map_err(|e| e.to_string())?;
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
        fs::remove_dir_all(&extract_to).map_err(|e| e.to_string())?;
    }
    extract_7z(app, &archive, &extract_to)?;

    let root = super::paths::find_portable_root(&extract_to)?;
    if !super::paths::portable_ready(&root) {
        return Err("extract finished but ComfyUI portable looks incomplete".into());
    }
    super::paths::emit_progress(app, "configure", "Writing shared model paths…");
    super::paths::write_extra_model_paths(&root, &models)?;
    super::manager::ensure_comfy_manager(app, &root)?;

    if let Some(ref backup) = custom_nodes_backup {
        super::paths::emit_progress(app, "configure", "Restoring custom nodes…");
        if let Err(err) = restore_custom_nodes(&root, backup) {
            // Don't fail the whole Comfy pin migrate - managed nodes are re-checked out next.
            super::paths::emit_progress(
                app,
                "configure",
                &format!("Custom nodes restore skipped ({err})"),
            );
            let _ = fs::remove_dir_all(backup);
        }
    }
    super::paths::write_pin_marker(&root)?;
    Ok(ready_runtime(id, created_at, &root))
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
