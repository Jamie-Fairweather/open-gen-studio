use crate::download;
use crate::download_manager::{self, DownloadSnapshot, DownloadSpec, EnsureOpts, EnsureResult};
use crate::providers::{self, ResolvedModelUrl};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Resolve a model page/file URL (Hugging Face, CivitAI, direct) to a download URL + filename.
#[tauri::command]
pub fn resolve_model_url(url: String) -> Result<ResolvedModelUrl, String> {
    providers::resolve(&url)
}

#[tauri::command]
pub fn download_url(
    app: AppHandle,
    url: String,
    relative_path: String,
    expected_sha256: Option<String>,
) -> Result<String, String> {
    if relative_path.contains("..") || PathBuf::from(&relative_path).is_absolute() {
        return Err("invalid relative_path".into());
    }

    let dest = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("downloads")
        .join(&relative_path);

    download::download_file(&app, &url, &dest, expected_sha256.as_deref())?;
    Ok(dest.display().to_string())
}

#[tauri::command]
pub fn ensure_download(
    app: AppHandle,
    spec: DownloadSpec,
    opts: Option<EnsureOpts>,
) -> Result<EnsureResult, String> {
    download_manager::ensure(&app, spec, opts.unwrap_or(EnsureOpts { wait: false }))
}

#[tauri::command]
pub fn list_downloads(app: AppHandle) -> Result<DownloadSnapshot, String> {
    download_manager::snapshot(&app)
}

#[tauri::command]
pub fn pause_download(app: AppHandle, job_id: String) -> Result<(), String> {
    download_manager::pause_job(&app, &job_id)
}

#[tauri::command]
pub fn resume_download(app: AppHandle, job_id: String) -> Result<(), String> {
    download_manager::resume_job(&app, &job_id)
}

#[tauri::command]
pub fn cancel_download(app: AppHandle, job_id: String) -> Result<(), String> {
    download_manager::cancel_job(&app, &job_id)
}
