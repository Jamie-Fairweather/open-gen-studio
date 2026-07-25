use crate::blueprints::{
    self, Blueprint, BlueprintDetail, ModelEntry, ModelFileEntry, RecipeCapabilities,
};
use crate::comfy::{self, ProcessState};
use crate::creator::{
    self, BindableInput, CapturedWorkflow, EmbeddedModel, SuggestedControl, SuggestedModel,
};
use crate::db::{Db, GalleryItem, Job, RuntimeInstall};
use crate::download;
use crate::generate;
use crate::gpu::{self, GpuInfo};
use crate::loras::{self, LoraPack, SaveUserLoraArgs};
use crate::providers::{self, ResolvedModelUrl};
use crate::upscale::{self, UpscaleModelInfo};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

pub struct AppState {
    pub db: Mutex<Db>,
    pub processes: Mutex<ProcessState>,
    pub comfy_install_busy: Mutex<bool>,
    /// Blueprint id currently installing models, if any.
    pub blueprint_install_busy: Mutex<Option<String>>,
    /// Active LoRA install key `"id:arch"`, if any.
    pub lora_install_busy: Mutex<Option<String>>,
    /// Active upscale install id (or `"usdu"` / `"supir"`), if any.
    pub upscale_install_busy: Mutex<Option<String>>,
    /// Job ids the user asked to cancel.
    pub cancelled_jobs: Mutex<HashSet<String>>,
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn list_settings(state: State<'_, AppState>) -> Result<HashMap<String, String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok(db.list_settings()?.into_iter().collect())
}

#[tauri::command]
pub fn set_setting(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_setting(&key, &value)?;
    if key == download::SETTING_HF_TOKEN {
        download::set_stored_hf_token(Some(value));
        // Gated sizes often fail HEAD before a token exists — re-probe with auth.
        blueprints::clear_remote_size_cache();
        blueprints::enqueue_size_probe(&app);
    } else if key == download::SETTING_CIVITAI_TOKEN {
        download::set_stored_civitai_token(Some(value));
        blueprints::clear_remote_size_cache();
        blueprints::enqueue_size_probe(&app);
    }
    Ok(())
}

#[tauri::command]
pub fn list_jobs(state: State<'_, AppState>) -> Result<Vec<Job>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_jobs()
}

#[tauri::command]
pub fn create_job(
    app: AppHandle,
    state: State<'_, AppState>,
    kind: String,
    params_json: Option<String>,
) -> Result<Job, String> {
    let params = params_json.unwrap_or_else(|| "{}".into());
    let job = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.create_job(&kind, &params)?
    };
    let _ = app.emit("jobs://updated", &job);
    Ok(job)
}

#[tauri::command]
pub fn update_job_status(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    status: String,
    error: Option<String>,
) -> Result<Job, String> {
    let job = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_job_status(&id, &status, error.as_deref())?
    };
    let _ = app.emit("jobs://updated", &job);
    Ok(job)
}

#[tauri::command]
pub fn list_gallery(state: State<'_, AppState>) -> Result<Vec<GalleryItem>, String> {
    let items = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.list_gallery()?
    };
    // Backfill missing thumbs without holding the DB lock (decode can be slow once).
    let (items, updates) = generate::ensure_gallery_thumbnails(items);
    if !updates.is_empty() {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        for (id, path) in updates {
            let _ = db.set_gallery_thumbnail(&id, &path);
        }
    }
    Ok(items)
}

#[tauri::command]
pub fn add_gallery_item(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    job_id: Option<String>,
    thumbnail_path: Option<String>,
    metadata_json: Option<String>,
) -> Result<GalleryItem, String> {
    let meta = metadata_json.unwrap_or_else(|| "{}".into());
    let item = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.add_gallery_item(job_id.as_deref(), &path, thumbnail_path.as_deref(), &meta)?
    };
    let _ = app.emit("gallery://updated", &item);
    Ok(item)
}

#[tauri::command]
pub fn delete_gallery_item(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let item = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.delete_gallery_item(&id)?
    };
    if let Some(item) = item {
        let path = PathBuf::from(&item.path);
        if path.is_file() {
            let _ = fs::remove_file(&path);
        }
        if let Some(thumb) = item.thumbnail_path.as_deref() {
            let thumb = PathBuf::from(thumb);
            if thumb.is_file() {
                let _ = fs::remove_file(&thumb);
            }
        } else {
            // Sidecar naming used before thumbnail_path was stored.
            let sidecar = path.with_file_name(format!(
                "{}.thumb.jpg",
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("image")
            ));
            if sidecar.is_file() {
                let _ = fs::remove_file(&sidecar);
            }
        }
        // Remove empty day folder (YYYY-MM-DD) or legacy job folder (gallery/<job_id>/).
        if let Some(parent) = path.parent() {
            let name = parent.file_name().and_then(|s| s.to_str()).unwrap_or("");
            let is_job_folder = item.job_id.as_deref() == Some(name);
            let is_day_folder = name.len() == 10
                && name.as_bytes().get(4) == Some(&b'-')
                && name.as_bytes().get(7) == Some(&b'-')
                && name.bytes().all(|b| b.is_ascii_digit() || b == b'-');
            if is_job_folder || is_day_folder {
                let _ = fs::remove_dir(parent);
            }
        }
        let _ = app.emit("gallery://deleted", &id);
    }
    Ok(())
}

#[tauri::command]
pub fn detect_gpu() -> GpuInfo {
    gpu::detect_nvidia()
}

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
pub fn list_runtimes(state: State<'_, AppState>) -> Result<Vec<RuntimeInstall>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_runtimes()
}

/// Returns immediately with status=installing; heavy work runs on a background thread.
/// Always force-reinstalls the **pinned** portable (Settings → Reinstall).
#[tauri::command]
pub fn install_comfyui(app: AppHandle, state: State<'_, AppState>) -> Result<RuntimeInstall, String> {
    enqueue_comfy_install(&app, &state, true)
}

pub fn comfy_needs_install(state: &AppState) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    match db.get_runtime_by_engine(comfy::ENGINE)? {
        Some(r) => {
            let path = Path::new(&r.install_path);
            let path_ok = !r.install_path.is_empty()
                && path.join("ComfyUI").is_dir()
                && path.join("python_embeded").join("python.exe").is_file();
            let pin_ok = path_ok && comfy::portable_pin_matches(path);
            // "installing" after a crash means a stalled job — retry.
            // Pin mismatch → migrate to the version this app release requires.
            Ok(!path_ok || !pin_ok || r.status == "error" || r.status == "installing")
        }
        None => Ok(true),
    }
}

/// `force` = wipe/reinstall even when already on the pin (user Reinstall).
pub fn enqueue_comfy_install(
    app: &AppHandle,
    state: &AppState,
    force: bool,
) -> Result<RuntimeInstall, String> {
    {
        let mut busy = state.comfy_install_busy.lock().map_err(|e| e.to_string())?;
        if *busy {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            if let Some(r) = db.get_runtime_by_engine(comfy::ENGINE)? {
                return Ok(r);
            }
            return Err("ComfyUI install already in progress".into());
        }
        *busy = true;
    }

    let existing = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
    };

    let installing = if let Some(runtime) = existing.clone() {
        let updated = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.update_runtime_status(&runtime.id, "installing", None, None)?
        };
        let _ = app.emit("runtimes://updated", &updated);
        updated
    } else {
        let row = RuntimeInstall {
            id: uuid::Uuid::new_v4().to_string(),
            engine: comfy::ENGINE.into(),
            version: comfy::pinned_version().into(),
            install_path: String::new(),
            port: Some(comfy::DEFAULT_PORT as i64),
            status: "installing".into(),
            error: None,
            created_at: now_secs(),
            updated_at: now_secs(),
        };
        {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.upsert_runtime(&row)?;
        }
        let _ = app.emit("runtimes://updated", &row);
        row
    };

    let app_bg = app.clone();
    let job = installing.clone();
    std::thread::spawn(move || {
        let result = comfy::install_portable(&app_bg, Some(&job), force);
        let state = app_bg.state::<AppState>();
        match result {
            Ok(runtime) => {
                if let Ok(db) = state.db.lock() {
                    let _ = db.upsert_runtime(&runtime);
                }
                let _ = app_bg.emit("runtimes://updated", &runtime);
                let _ = app_bg.emit(
                    "runtimes://progress",
                    comfy::RuntimeProgress {
                        engine: comfy::ENGINE.into(),
                        stage: "done".into(),
                        message: format!(
                            "ComfyUI {} ready",
                            comfy::pinned_version()
                        ),
                    },
                );
            }
            Err(err) => {
                let failed = if let Ok(db) = state.db.lock() {
                    db.update_runtime_status(&job.id, "error", None, Some(&err))
                        .unwrap_or_else(|_| RuntimeInstall {
                            id: job.id.clone(),
                            engine: comfy::ENGINE.into(),
                            version: job.version.clone(),
                            install_path: String::new(),
                            port: job.port,
                            status: "error".into(),
                            error: Some(err.clone()),
                            created_at: job.created_at,
                            updated_at: now_secs(),
                        })
                } else {
                    RuntimeInstall {
                        id: job.id.clone(),
                        engine: comfy::ENGINE.into(),
                        version: job.version.clone(),
                        install_path: String::new(),
                        port: job.port,
                        status: "error".into(),
                        error: Some(err.clone()),
                        created_at: job.created_at,
                        updated_at: now_secs(),
                    }
                };
                let _ = app_bg.emit("runtimes://updated", &failed);
                let _ = app_bg.emit(
                    "runtimes://progress",
                    comfy::RuntimeProgress {
                        engine: comfy::ENGINE.into(),
                        stage: "error".into(),
                        message: err,
                    },
                );
            }
        }
        {
            let mut busy = state.comfy_install_busy.lock().ok();
            if let Some(ref mut b) = busy {
                **b = false;
            }
        }
    });

    Ok(installing)
}

/// Spawns ComfyUI and returns immediately; health wait runs in a background thread.
#[tauri::command]
pub fn start_comfyui(app: AppHandle, state: State<'_, AppState>) -> Result<RuntimeInstall, String> {
    let runtime = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
            .ok_or_else(|| "ComfyUI is not installed".to_string())?
    };
    if runtime.install_path.is_empty()
        || runtime.status == "error"
        || runtime.status == "installing"
    {
        return Err("ComfyUI install is not ready — run install first".into());
    }
    if (runtime.status == "starting" || runtime.status == "running")
        && comfy::is_process_alive(&state.processes)?
    {
        return Ok(runtime);
    }

    let port = runtime.port.unwrap_or(comfy::DEFAULT_PORT as i64) as u16;
    comfy::start(&app, &state.processes, &runtime, port)?;

    let starting = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_runtime_status(&runtime.id, "starting", Some(port as i64), None)?
    };
    let _ = app.emit("runtimes://updated", &starting);
    let _ = app.emit(
        "runtimes://progress",
        comfy::RuntimeProgress {
            engine: comfy::ENGINE.into(),
            stage: "start".into(),
            message: "Waiting for runtime…".into(),
        },
    );

    let app_bg = app.clone();
    let runtime_id = runtime.id.clone();
    std::thread::spawn(move || {
        let state = app_bg.state::<AppState>();
        match comfy::wait_until_healthy(port, 60) {
            Ok(()) => {
                if let Ok(db) = state.db.lock() {
                    if let Ok(updated) =
                        db.update_runtime_status(&runtime_id, "running", Some(port as i64), None)
                    {
                        let _ = app_bg.emit("runtimes://updated", &updated);
                    }
                }
                let _ = app_bg.emit(
                    "runtimes://progress",
                    comfy::RuntimeProgress {
                        engine: comfy::ENGINE.into(),
                        stage: "ready".into(),
                        message: "Runtime is ready".into(),
                    },
                );
            }
            Err(err) => {
                let _ = comfy::stop(&state.processes);
                if let Ok(db) = state.db.lock() {
                    if let Ok(updated) = db.update_runtime_status(
                        &runtime_id,
                        "error",
                        Some(port as i64),
                        Some(&err),
                    ) {
                        let _ = app_bg.emit("runtimes://updated", &updated);
                    }
                }
                let _ = app_bg.emit(
                    "runtimes://progress",
                    comfy::RuntimeProgress {
                        engine: comfy::ENGINE.into(),
                        stage: "error".into(),
                        message: err,
                    },
                );
            }
        }
    });

    Ok(starting)
}

#[tauri::command]
pub fn stop_comfyui(app: AppHandle, state: State<'_, AppState>) -> Result<RuntimeInstall, String> {
    comfy::stop(&state.processes)?;
    let runtime = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
            .ok_or_else(|| "ComfyUI is not installed".to_string())?
    };
    let updated = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_runtime_status(&runtime.id, "ready", runtime.port, None)?
    };
    let _ = app.emit("runtimes://updated", &updated);
    Ok(updated)
}

#[tauri::command]
pub fn list_official_blueprints(app: AppHandle) -> Result<Vec<Blueprint>, String> {
    list_blueprints(app)
}

#[tauri::command]
pub fn list_blueprints(app: AppHandle) -> Result<Vec<Blueprint>, String> {
    // Instant: manifests + local sizes (+ cached remote sizes). Network probe is async.
    let list = blueprints::list_blueprints(&app, false)?;
    blueprints::enqueue_size_probe(&app);
    Ok(list)
}

#[tauri::command]
pub fn get_official_blueprint(
    app: AppHandle,
    id: String,
) -> Result<BlueprintDetail, String> {
    blueprints::get_detail(&app, &id)
}

#[tauri::command]
pub fn get_blueprint(app: AppHandle, id: String) -> Result<BlueprintDetail, String> {
    blueprints::get_detail(&app, &id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveUserBlueprintArgs {
    pub id: String,
    pub name: String,
    pub category: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub runtime: String,
    #[serde(default)]
    pub models: Vec<ModelEntry>,
    #[serde(default)]
    pub flow_type: String,
    pub arch: String,
    #[serde(default)]
    pub sampler: String,
    #[serde(default)]
    pub scheduler: String,
    #[serde(default)]
    pub capabilities: RecipeCapabilities,
    #[serde(default)]
    pub defaults: serde_json::Map<String, Value>,
}

#[tauri::command]
pub fn save_user_blueprint(
    app: AppHandle,
    args: SaveUserBlueprintArgs,
) -> Result<String, String> {
    let dir = blueprints::save_user_blueprint(
        &app,
        &args.id,
        &args.name,
        &args.category,
        &args.description,
        &args.runtime,
        args.models,
        &args.flow_type,
        &args.arch,
        &args.sampler,
        &args.scheduler,
        args.capabilities,
        args.defaults,
    )?;
    Ok(dir.display().to_string())
}

#[tauri::command]
pub fn delete_user_blueprint(app: AppHandle, id: String) -> Result<(), String> {
    blueprints::delete_user_blueprint(&app, &id)
}

#[tauri::command]
pub fn open_user_blueprints_dir(app: AppHandle) -> Result<String, String> {
    blueprints::open_user_blueprints_dir(&app)
}

/// Open an http(s) URL in the user's default system browser.
#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let url = url.trim();
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("only http(s) URLs can be opened".into());
    }
    #[cfg(windows)]
    {
        // `start` treats the first quoted arg as the window title.
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn creator_ensure_comfy(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    creator::ensure_comfy_url(&app, &state.db, &state.processes)
}

#[tauri::command]
pub async fn creator_open_comfy(app: AppHandle) -> Result<String, String> {
    // reqwest::blocking (health/start) must not run on the async runtime.
    let app_ensure = app.clone();
    let url = tauri::async_runtime::spawn_blocking(move || {
        let state = app_ensure.state::<AppState>();
        creator::ensure_comfy_url(&app_ensure, &state.db, &state.processes)
    })
    .await
    .map_err(|e| format!("failed to start ComfyUI: {e}"))??;

    creator::open_comfy_window(app, url.clone()).await?;
    Ok(url)
}

#[tauri::command]
pub async fn creator_capture_workflow(app: AppHandle) -> Result<CapturedWorkflow, String> {
    creator::capture_workflow(app).await
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagingSuggestions {
    pub models: Vec<SuggestedModel>,
    pub controls: Vec<SuggestedControl>,
    pub bindable_inputs: Vec<BindableInput>,
}

#[tauri::command]
pub fn creator_suggest_packaging(
    workflow: Value,
    embedded_models: Option<Vec<EmbeddedModel>>,
) -> Result<PackagingSuggestions, String> {
    let mut embedded = embedded_models.unwrap_or_default();
    // File imports of Comfy UI-format JSON may carry URLs on nodes.
    if embedded.is_empty() {
        embedded = creator::extract_embedded_from_ui(&workflow);
    }
    let bindable_inputs = creator::list_bindable_inputs(&workflow);
    let mut models = creator::suggest_models(&workflow, &embedded);
    creator::mark_gated_models(&mut models);
    Ok(PackagingSuggestions {
        models,
        controls: creator::suggest_controls_from_bindable(&bindable_inputs),
        bindable_inputs,
    })
}

/// Queue a generate job: returns immediately, runs Comfy /prompt in the background.
#[tauri::command]
pub fn generate_image(
    app: AppHandle,
    state: State<'_, AppState>,
    blueprint_id: String,
    values: HashMap<String, Value>,
) -> Result<Job, String> {
    let runtime = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
            .ok_or_else(|| "ComfyUI is not installed — open Settings to install".to_string())?
    };
    if runtime.install_path.is_empty()
        || runtime.status == "error"
        || runtime.status == "installing"
    {
        return Err("ComfyUI install is not ready — open Settings".into());
    }

    let detail = blueprints::get_detail(&app, &blueprint_id)?;
    if detail.model_count > 0 && detail.models_ready < detail.model_count {
        return Err(format!(
            "Install blueprint models first ({}/{})",
            detail.models_ready, detail.model_count
        ));
    }

    let params = serde_json::json!({
        "blueprintId": blueprint_id,
        "values": values,
    })
    .to_string();

    let job = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let created = db.create_job("generate", &params)?;
        db.update_job_status(&created.id, "running", None)?
    };
    let _ = app.emit("jobs://updated", &job);

    {
        let mut cancelled = state
            .cancelled_jobs
            .lock()
            .map_err(|e| e.to_string())?;
        cancelled.remove(&job.id);
    }

    let app_bg = app.clone();
    let job_bg = job.clone();
    let runtime_bg = runtime.clone();
    let blueprint_id_bg = blueprint_id.clone();
    std::thread::spawn(move || {
        let state = app_bg.state::<AppState>();
        let result = generate::run_generate(
            &app_bg,
            &state.db,
            &state.processes,
            &state.cancelled_jobs,
            &job_bg,
            &blueprint_id_bg,
            values,
            &runtime_bg,
        );

        let updated = match result {
            Ok(_) => {
                if let Ok(db) = state.db.lock() {
                    db.update_job_status(&job_bg.id, "completed", None)
                        .ok()
                } else {
                    None
                }
            }
            Err(err) if err == "cancelled" => {
                let _ = app_bg.emit(
                    "jobs://progress",
                    serde_json::json!({
                        "jobId": job_bg.id,
                        "stage": "cancelled",
                        "message": "Cancelled",
                    }),
                );
                if let Ok(db) = state.db.lock() {
                    db.update_job_status(&job_bg.id, "cancelled", Some("Cancelled by user"))
                        .ok()
                } else {
                    None
                }
            }
            Err(err) => {
                let _ = app_bg.emit(
                    "jobs://progress",
                    serde_json::json!({
                        "jobId": job_bg.id,
                        "stage": "error",
                        "message": err,
                    }),
                );
                if let Ok(db) = state.db.lock() {
                    db.update_job_status(&job_bg.id, "failed", Some(&err))
                        .ok()
                } else {
                    None
                }
            }
        };
        if let Ok(mut cancelled) = state.cancelled_jobs.lock() {
            cancelled.remove(&job_bg.id);
        }
        if let Some(job) = updated {
            let _ = app_bg.emit("jobs://updated", &job);
        }
    });

    Ok(job)
}

#[tauri::command]
pub fn cancel_job(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<Job, String> {
    {
        let mut cancelled = state
            .cancelled_jobs
            .lock()
            .map_err(|e| e.to_string())?;
        cancelled.insert(id.clone());
    }

    let port = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
            .and_then(|r| r.port)
            .unwrap_or(comfy::DEFAULT_PORT as i64) as u16
    };
    let _ = generate::interrupt(port);

    let job = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_job_status(&id, "cancelled", Some("Cancelled by user"))?
    };
    let _ = app.emit("jobs://updated", &job);
    let _ = app.emit(
        "jobs://progress",
        serde_json::json!({
            "jobId": id,
            "stage": "cancelled",
            "message": "Cancelled",
        }),
    );
    Ok(job)
}

/// Returns immediately; model downloads run on a background thread.
#[tauri::command]
pub fn install_official_blueprint(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    {
        let mut busy = state
            .blueprint_install_busy
            .lock()
            .map_err(|e| e.to_string())?;
        if let Some(current) = busy.as_ref() {
            return Err(format!("Already installing blueprint: {current}"));
        }
        *busy = Some(id.clone());
    }
    download::clear_cancel();

    let app_bg = app.clone();
    let blueprint_id = id.clone();
    std::thread::spawn(move || {
        let result = blueprints::install_models(&app_bg, &blueprint_id);
        let state = app_bg.state::<AppState>();
        if let Err(err) = result {
            let stage = if err == "cancelled" { "cancelled" } else { "error" };
            let _ = app_bg.emit(
                "blueprints://progress",
                blueprints::BlueprintProgress {
                    blueprint_id: blueprint_id.clone(),
                    stage: stage.into(),
                    message: if err == "cancelled" {
                        "Download cancelled".into()
                    } else {
                        err
                    },
                    model_index: 0,
                    model_total: 0,
                    filename: None,
                    downloaded: None,
                    total: None,
                },
            );
        }
        if let Ok(mut busy) = state.blueprint_install_busy.lock() {
            *busy = None;
        }
        download::clear_cancel();
        // Cache is warm from install probes — push an immediate refresh (no network).
        if let Ok(list) = blueprints::list_blueprints(&app_bg, false) {
            let _ = app_bg.emit("blueprints://sizes", &list);
        }
        let _ = app_bg.emit("blueprints://updated", &blueprint_id);
    });

    Ok(())
}

#[tauri::command]
pub fn cancel_blueprint_install() -> Result<(), String> {
    download::request_cancel();
    Ok(())
}

#[tauri::command]
pub fn list_loras(app: AppHandle) -> Result<Vec<LoraPack>, String> {
    loras::list_loras(&app)
}

#[tauri::command]
pub fn get_lora(app: AppHandle, id: String) -> Result<LoraPack, String> {
    loras::get_lora(&app, &id)
}

/// Download one arch variant for a LoRA pack (background). Queueing is owned by the UI.
#[tauri::command]
pub fn install_lora_variant(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    arch: String,
) -> Result<(), String> {
    let key = format!("{id}:{arch}");
    {
        let mut busy = state
            .lora_install_busy
            .lock()
            .map_err(|e| e.to_string())?;
        if let Some(current) = busy.as_ref() {
            return Err(format!("Already installing LoRA: {current}"));
        }
        *busy = Some(key);
    }
    download::clear_cancel();

    let app_bg = app.clone();
    let lora_id = id;
    let arch_bg = arch;
    std::thread::spawn(move || {
        let result = loras::install_variant(&app_bg, &lora_id, &arch_bg);
        let state = app_bg.state::<AppState>();
        if let Err(err) = &result {
            let stage = if err.as_str() == "cancelled" {
                "cancelled"
            } else {
                "error"
            };
            let _ = app_bg.emit(
                "loras://progress",
                serde_json::json!({
                    "loraId": lora_id,
                    "arch": arch_bg,
                    "stage": stage,
                    "message": err,
                }),
            );
        }
        if let Ok(mut busy) = state.lora_install_busy.lock() {
            *busy = None;
        }
        download::clear_cancel();
        let _ = app_bg.emit("loras://updated", &lora_id);
    });

    Ok(())
}

#[tauri::command]
pub fn save_user_lora(app: AppHandle, args: SaveUserLoraArgs) -> Result<LoraPack, String> {
    loras::save_user_lora(&app, args)
}

#[tauri::command]
pub fn delete_user_lora(app: AppHandle, id: String) -> Result<(), String> {
    loras::delete_user_lora(&app, &id)
}

#[tauri::command]
pub fn list_upscalers(app: AppHandle) -> Result<Vec<UpscaleModelInfo>, String> {
    upscale::list_upscalers(&app)
}

#[tauri::command]
pub fn usdu_node_ready(app: AppHandle) -> Result<bool, String> {
    Ok(upscale::usdu_installed(&app))
}

#[tauri::command]
pub fn supir_node_ready(app: AppHandle) -> Result<bool, String> {
    Ok(upscale::supir_installed(&app))
}

/// Download one Official SR/SUPIR weight (background). Queueing is owned by the UI.
#[tauri::command]
pub fn install_upscaler(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    start_upscale_install(app, state, id)
}

/// Ensure Ultimate SD Upscale is at the app-pinned commit (background as `"usdu"`).
#[tauri::command]
pub fn ensure_usdu_node(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if upscale::usdu_at_pin(&app) {
        let _ = app.emit(
            "upscale://progress",
            serde_json::json!({
                "modelId": "usdu",
                "stage": "done",
                "message": "Ultimate SD Upscale already at pinned version",
            }),
        );
        return Ok(());
    }
    start_upscale_install(app, state, "usdu".into())
}

/// Ensure SUPIR custom node is at the app-pinned commit + deps (background as `"supir"`).
#[tauri::command]
pub fn ensure_supir_node(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if upscale::supir_at_pin(&app) {
        let _ = app.emit(
            "upscale://progress",
            serde_json::json!({
                "modelId": "supir",
                "stage": "done",
                "message": "SUPIR already at pinned version",
            }),
        );
        return Ok(());
    }
    start_upscale_install(app, state, "supir".into())
}

/// Expected vs installed pins for ComfyUI + managed custom nodes (Settings).
#[tauri::command]
pub fn runtime_pins_status(app: AppHandle, state: State<'_, AppState>) -> Result<crate::pins::RuntimePinsStatus, String> {
    let runtime = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
    };
    Ok(crate::pins::RuntimePinsStatus {
        comfy: comfy::comfy_pin_status(&app, runtime.as_ref()),
        nodes: upscale::managed_nodes_pin_status(&app),
    })
}

fn start_upscale_install(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    {
        let mut busy = state
            .upscale_install_busy
            .lock()
            .map_err(|e| e.to_string())?;
        if let Some(current) = busy.as_ref() {
            return Err(format!("Already installing upscale: {current}"));
        }
        *busy = Some(id.clone());
    }
    download::clear_cancel();

    let app_bg = app.clone();
    let job_id = id;
    std::thread::spawn(move || {
        let result = if job_id == "usdu" {
            upscale::ensure_usdu_custom_node(&app_bg)
        } else if job_id == "supir" {
            upscale::ensure_supir_custom_node(&app_bg)
        } else {
            upscale::install_upscaler(&app_bg, &job_id)
        };
        let state = app_bg.state::<AppState>();
        if let Err(err) = &result {
            let stage = if err.as_str() == "cancelled" {
                "cancelled"
            } else {
                "error"
            };
            let _ = app_bg.emit(
                "upscale://progress",
                serde_json::json!({
                    "modelId": job_id,
                    "stage": stage,
                    "message": err,
                }),
            );
        }
        if let Ok(mut busy) = state.upscale_install_busy.lock() {
            *busy = None;
        }
        download::clear_cancel();
        let _ = app_bg.emit("upscale://updated", &job_id);
    });

    Ok(())
}

#[tauri::command]
pub fn list_model_files(app: AppHandle) -> Result<Vec<ModelFileEntry>, String> {
    blueprints::list_model_files(&app)
}

#[tauri::command]
pub fn open_models_dir(app: AppHandle) -> Result<String, String> {
    blueprints::open_models_dir(&app)
}

#[tauri::command]
pub fn comfyui_status(
    state: State<'_, AppState>,
) -> Result<HashMap<String, serde_json::Value>, String> {
    let runtime = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
    };
    let process_alive = comfy::is_process_alive(&state.processes)?;
    let port = runtime
        .as_ref()
        .and_then(|r| r.port)
        .unwrap_or(comfy::DEFAULT_PORT as i64) as u16;
    let healthy = if process_alive {
        comfy::health(port)?
    } else {
        false
    };

    let mut map = HashMap::new();
    map.insert("processAlive".into(), serde_json::json!(process_alive));
    map.insert("healthy".into(), serde_json::json!(healthy));
    map.insert("port".into(), serde_json::json!(port));
    map.insert(
        "runtime".into(),
        serde_json::to_value(runtime).map_err(|e| e.to_string())?,
    );
    Ok(map)
}
