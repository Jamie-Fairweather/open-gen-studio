#[path = "install_archive.rs"]
mod install_archive;
#[path = "install_fs.rs"]
mod install_fs;

use crate::commands::AppState;
use crate::db::RuntimeInstall;
use crate::download;
use crate::gpu::{
    self, GpuVendor, NvidiaVariant, PortableKind, SETTING_GPU_VENDOR,
    SETTING_NVIDIA_PORTABLE_OVERRIDE,
};
use crate::pins::{
    self, COMFY_AMD_PORTABLE_URL, COMFY_INTEL_PORTABLE_URL, COMFY_NVIDIA_CU126_PORTABLE_URL,
    COMFY_NVIDIA_PORTABLE_URL, COMFY_PINNED_VERSION,
};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use install_archive::{archive_looks_complete, extract_7z};
use install_fs::{
    backup_custom_nodes, custom_nodes_backup_path, purge_managed_custom_nodes_in_backup,
    remove_dir_retries, restore_custom_nodes,
};

pub fn pinned_version() -> &'static str {
    COMFY_PINNED_VERSION
}

/// Read persisted GPU choice + detection → portable kind for install.
///
/// When the user already saved `gpu_vendor` (onboarding / settings), skip a full
/// `nvidia-smi`/WMI rescan — those probes can hang for minutes in some VMs and
/// would block Comfy enqueue entirely.
pub fn effective_gpu_choice(app: &AppHandle) -> Result<(GpuVendor, Option<NvidiaVariant>), String> {
    let (vendor_setting, nvidia_override) = {
        let state = app.state::<AppState>();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        (
            db.get_setting(SETTING_GPU_VENDOR)?,
            db.get_setting(SETTING_NVIDIA_PORTABLE_OVERRIDE)?,
        )
    };

    if let Some(raw) = vendor_setting
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let vendor =
            GpuVendor::parse(raw).ok_or_else(|| format!("Invalid gpu_vendor setting: {raw}"))?;
        let nvidia = if vendor == GpuVendor::Nvidia {
            Some(
                nvidia_override
                    .as_deref()
                    .and_then(NvidiaVariant::parse)
                    .unwrap_or(NvidiaVariant::Modern),
            )
        } else {
            None
        };
        return Ok((vendor, nvidia));
    }

    let info = gpu::detect_gpus();
    gpu::resolve_choice(&info, None, nvidia_override.as_deref())
}

pub fn portable_kind_for_app(app: &AppHandle) -> Result<PortableKind, String> {
    let (vendor, nvidia) = effective_gpu_choice(app)?;
    Ok(PortableKind::from_choice(vendor, nvidia))
}

pub fn resolve_portable_url(kind: PortableKind) -> Result<&'static str, String> {
    if !cfg!(target_os = "windows") {
        return Err("ComfyUI portable install is Windows-only for now".into());
    }
    Ok(match kind {
        PortableKind::NvidiaModern => COMFY_NVIDIA_PORTABLE_URL,
        PortableKind::NvidiaCu126 => COMFY_NVIDIA_CU126_PORTABLE_URL,
        PortableKind::Amd => COMFY_AMD_PORTABLE_URL,
        PortableKind::Intel => COMFY_INTEL_PORTABLE_URL,
    })
}

#[cfg(test)]
mod portable_url_tests {
    use super::*;
    use crate::gpu::PortableKind;

    #[test]
    fn urls_match_kind() {
        assert!(resolve_portable_url(PortableKind::NvidiaModern)
            .unwrap()
            .ends_with("ComfyUI_windows_portable_nvidia.7z"));
        assert!(resolve_portable_url(PortableKind::NvidiaCu126)
            .unwrap()
            .ends_with("ComfyUI_windows_portable_nvidia_cu126.7z"));
        assert!(resolve_portable_url(PortableKind::Amd)
            .unwrap()
            .ends_with("ComfyUI_windows_portable_amd.7z"));
        assert!(resolve_portable_url(PortableKind::Intel)
            .unwrap()
            .ends_with("ComfyUI_windows_portable_intel.7z"));
    }
}

pub fn portable_archive_path(app: &AppHandle, kind: PortableKind) -> Result<PathBuf, String> {
    Ok(crate::app_paths::app_data_dir(app)?
        .join("downloads")
        .join(format!(
            "ComfyUI_windows_portable_{}_{COMFY_PINNED_VERSION}.7z",
            kind.as_str()
        )))
}

/// Download the pinned portable archive when missing/incomplete.
pub fn download_portable_archive(app: &AppHandle) -> Result<PathBuf, String> {
    let kind = portable_kind_for_app(app)?;
    let url = resolve_portable_url(kind)?;
    let archive = portable_archive_path(app, kind)?;
    if archive_looks_complete(&archive) {
        super::paths::emit_progress(
            app,
            "download",
            &format!(
                "Pinned archive {COMFY_PINNED_VERSION} ({}) already downloaded - skipping download",
                kind.as_str()
            ),
        );
        return Ok(archive);
    }
    super::paths::emit_progress(
        app,
        "download",
        &format!(
            "Downloading ComfyUI {COMFY_PINNED_VERSION} ({})…",
            kind.as_str()
        ),
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
    // Prefer a short on-disk root under MSIX (relocates out of Packages\… when needed)
    // so pip/Python stay under Windows MAX_PATH. Falls back to canonicalize.
    let install_path = match super::paths::process_portable_root(root) {
        Ok(p) => p,
        Err(_) => fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf()),
    }
    .display()
    .to_string();
    RuntimeInstall {
        id,
        engine: super::paths::ENGINE.into(),
        version: COMFY_PINNED_VERSION.into(),
        install_path,
        port: Some(super::paths::DEFAULT_PORT as i64),
        status: "ready".into(),
        error: None,
        created_at,
        updated_at: super::paths::now_secs(),
    }
}

/// Extract pinned portable (assumes archive already downloaded). No configure.
pub fn extract_portable_core(
    app: &AppHandle,
    _existing: Option<&RuntimeInstall>,
    force: bool,
) -> Result<(), String> {
    let kind = portable_kind_for_app(app)?;
    let base = super::paths::runtimes_dir(app)?;
    let archive = portable_archive_path(app, kind)?;
    let extract_to = base.join("portable");
    let backup_path = custom_nodes_backup_path(&base);

    if let Ok(root) = super::paths::find_portable_root(&extract_to) {
        if super::paths::portable_ready(&root) {
            if super::paths::portable_pin_matches(&root, kind.as_str()) && !force {
                super::paths::emit_progress(
                    app,
                    "extract",
                    &format!(
                        "ComfyUI {COMFY_PINNED_VERSION} ({}) already extracted",
                        kind.as_str()
                    ),
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
        // Common failure: python.exe extracted but python3*.dll missing (truncated archive).
        let detail = match super::paths::portable_python_exe(&root) {
            Err(e) => e,
            Ok(_) => "ComfyUI/main.py missing".into(),
        };
        let _ = remove_dir_retries(&extract_to, 4);
        return Err(format!(
            "extract finished but ComfyUI portable looks incomplete ({detail})"
        ));
    }
    super::paths::unblock_embedded_python(&root);
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
    // Manager / pip deps are a separate download-manager step (`runtime_python_deps`).

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
    let kind = portable_kind_for_app(app)?;
    super::paths::write_pin_marker(&root, kind.as_str())?;
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
    let root = PathBuf::from(&runtime.install_path);
    super::manager::ensure_comfy_manager(app, &root)?;
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
pub fn comfy_pin_status(app: &AppHandle, runtime: Option<&RuntimeInstall>) -> pins::PinStatus {
    let expected = portable_kind_for_app(app)
        .map(|k| super::paths::pin_marker_value(k.as_str()))
        .unwrap_or_else(|_| COMFY_PINNED_VERSION.into());
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
    let matches = installed.as_deref() == Some(expected.as_str());
    pins::PinStatus {
        id: super::paths::ENGINE.into(),
        expected,
        installed,
        matches,
    }
}
