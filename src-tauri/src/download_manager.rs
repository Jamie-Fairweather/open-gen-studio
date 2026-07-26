//! Persistent Download Manager: SQLite-backed queue, pause/resume, shared ensure API.

use crate::blueprints;
use crate::comfy;
use crate::commands::AppState;
use crate::db::{Db, DownloadJobRow, DownloadStepRow};
use crate::download;
use crate::loras;
use crate::prompt_tools;
use crate::upscale;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Condvar, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

const EVENT_MANAGER: &str = "downloads://manager";
const HISTORY_KEEP: i64 = 50;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DownloadSpec {
    #[serde(rename = "blueprint")]
    Blueprint { id: String },
    #[serde(rename = "lora")]
    Lora { id: String, arch: String },
    #[serde(rename = "upscale")]
    Upscale { id: String },
    #[serde(rename = "promptTools")]
    PromptTools { provider: String },
    #[serde(rename = "runtime")]
    Runtime { engine: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsureOpts {
    #[serde(default)]
    pub wait: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsureResult {
    pub status: String,
    pub job_id: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadStepView {
    pub id: String,
    pub idx: i64,
    pub step_kind: String,
    pub label: String,
    pub status: String,
    pub bytes_done: i64,
    pub bytes_total: Option<i64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadJobView {
    pub id: String,
    pub job_key: String,
    pub title: String,
    pub kind: String,
    pub status: String,
    pub error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub steps: Vec<DownloadStepView>,
    pub active_label: Option<String>,
    pub downloaded: i64,
    pub total: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSnapshot {
    pub active: Option<DownloadJobView>,
    pub queued: Vec<DownloadJobView>,
    pub history: Vec<DownloadJobView>,
}

struct Wake {
    lock: Mutex<bool>,
    cv: Condvar,
}

fn wake() -> &'static Wake {
    static W: OnceLock<Wake> = OnceLock::new();
    W.get_or_init(|| Wake {
        lock: Mutex::new(false),
        cv: Condvar::new(),
    })
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn notify_worker() {
    let w = wake();
    if let Ok(mut g) = w.lock.lock() {
        *g = true;
        w.cv.notify_one();
    }
}

pub fn start_worker(app: AppHandle) {
    thread::spawn(move || {
        {
            let state = app.state::<AppState>();
            if let Ok(db) = state.db.lock() {
                let _ = db.reset_running_downloads_on_startup();
            };
        }
        emit_snapshot(&app);
        loop {
            run_next_job(&app);
            let w = wake();
            let Ok(guard) = w.lock.lock() else {
                thread::sleep(Duration::from_secs(1));
                continue;
            };
            let (mut g, _) = w
                .cv
                .wait_timeout_while(guard, Duration::from_secs(2), |pending| !*pending)
                .unwrap_or_else(|e| e.into_inner());
            *g = false;
        }
    });
}

fn job_view(db: &Db, job: &DownloadJobRow) -> Result<DownloadJobView, String> {
    let steps = db.list_download_steps(&job.id)?;
    let mut downloaded = 0i64;
    let mut total_sum = 0i64;
    let mut total_known = true;
    let mut active_label = None;
    for s in &steps {
        downloaded += s.bytes_done;
        match s.bytes_total {
            Some(t) => total_sum += t,
            None if s.step_kind == "http" && s.status != "done" => total_known = false,
            None => {}
        }
        if matches!(s.status.as_str(), "running" | "paused") && active_label.is_none() {
            active_label = Some(s.label.clone());
        }
    }
    if active_label.is_none() {
        active_label = steps
            .iter()
            .find(|s| s.status == "queued")
            .map(|s| s.label.clone());
    }
    Ok(DownloadJobView {
        id: job.id.clone(),
        job_key: job.job_key.clone(),
        title: job.title.clone(),
        kind: job.kind.clone(),
        status: job.status.clone(),
        error: job.error.clone(),
        created_at: job.created_at,
        updated_at: job.updated_at,
        steps: steps
            .into_iter()
            .map(|s| DownloadStepView {
                id: s.id,
                idx: s.idx,
                step_kind: s.step_kind,
                label: s.label,
                status: s.status,
                bytes_done: s.bytes_done,
                bytes_total: s.bytes_total,
                error: s.error,
            })
            .collect(),
        active_label,
        downloaded,
        total: if total_known && total_sum > 0 {
            Some(total_sum)
        } else {
            None
        },
    })
}

pub fn snapshot(app: &AppHandle) -> Result<DownloadSnapshot, String> {
    let state = app.state::<AppState>();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let active_rows = db.list_download_jobs_by_status(&["running", "paused"])?;
    let queued_rows = db.list_download_jobs_by_status(&["queued"])?;
    let history_rows = db.list_download_history(HISTORY_KEEP)?;
    let active = active_rows
        .into_iter()
        .next()
        .map(|j| job_view(&db, &j))
        .transpose()?;
    let queued = queued_rows
        .into_iter()
        .map(|j| job_view(&db, &j))
        .collect::<Result<Vec<_>, _>>()?;
    let history = history_rows
        .into_iter()
        .map(|j| job_view(&db, &j))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(DownloadSnapshot {
        active,
        queued,
        history,
    })
}

fn emit_snapshot(app: &AppHandle) {
    if let Ok(snap) = snapshot(app) {
        let _ = app.emit(EVENT_MANAGER, snap);
    }
}

fn spec_job_key(spec: &DownloadSpec) -> String {
    match spec {
        DownloadSpec::Blueprint { id } => format!("blueprint:{id}"),
        DownloadSpec::Lora { id, arch } => format!("lora:{id}:{arch}"),
        DownloadSpec::Upscale { id } => format!("upscale:{id}"),
        DownloadSpec::PromptTools { provider } => {
            let p = if matches!(
                provider.as_str(),
                "qwenvl" | "qwen3-vl-8b" | "enhancer" | "instruct-gguf" | "joycaption"
            ) {
                prompt_tools::QWENVL_MODEL_ID
            } else {
                provider.as_str()
            };
            format!("prompt-tools:{p}")
        }
        DownloadSpec::Runtime { engine } => format!("runtime:{engine}"),
    }
}

fn spec_title(spec: &DownloadSpec) -> String {
    match spec {
        DownloadSpec::Blueprint { id } => format!("Blueprint {id}"),
        DownloadSpec::Lora { id, arch } => format!("LoRA {id} ({arch})"),
        DownloadSpec::Upscale { id } => format!("Upscale {id}"),
        DownloadSpec::PromptTools { .. } => "Qwen3-VL-8B (Prompt Tools)".into(),
        DownloadSpec::Runtime { engine } => format!("Runtime {engine}"),
    }
}

fn spec_kind(spec: &DownloadSpec) -> &'static str {
    match spec {
        DownloadSpec::Blueprint { .. } => "blueprint",
        DownloadSpec::Lora { .. } => "lora",
        DownloadSpec::Upscale { .. } => "upscale",
        DownloadSpec::PromptTools { .. } => "promptTools",
        DownloadSpec::Runtime { .. } => "runtime",
    }
}

fn is_ready(app: &AppHandle, spec: &DownloadSpec) -> Result<bool, String> {
    Ok(match spec {
        DownloadSpec::Blueprint { id } => {
            let detail = blueprints::get_detail(app, id)?;
            detail.models_ready >= detail.model_count
        }
        DownloadSpec::Lora { id, arch } => {
            let pack = loras::get_lora(app, id)?;
            pack.variants
                .iter()
                .any(|v| v.arch == *arch && v.ready)
        }
        DownloadSpec::Upscale { id } => {
            if id == "usdu" {
                upscale::usdu_at_pin(app)
            } else if id == "supir" {
                upscale::supir_at_pin(app)
            } else {
                upscale::list_upscalers(app)?
                    .into_iter()
                    .any(|m| m.id == *id && m.ready)
            }
        }
        DownloadSpec::PromptTools { provider } => {
            prompt_tools::provider_ready(app, provider)
        }
        DownloadSpec::Runtime { engine } => {
            if engine != comfy::ENGINE {
                return Err(format!("unknown runtime engine: {engine}"));
            }
            let state = app.state::<AppState>();
            let db = state.db.lock().map_err(|e| e.to_string())?;
            match db.get_runtime_by_engine(comfy::ENGINE)? {
                Some(rt) => {
                    !rt.install_path.is_empty()
                        && rt.status != "error"
                        && rt.status != "installing"
                        && PathBuf::from(&rt.install_path)
                            .join("python_embeded")
                            .join("python.exe")
                            .is_file()
                }
                None => false,
            }
        }
    })
}

#[derive(Debug, Clone)]
struct PlannedStep {
    step_kind: String,
    label: String,
    spec: Value,
}

fn plan_steps(app: &AppHandle, spec: &DownloadSpec) -> Result<Vec<PlannedStep>, String> {
    match spec {
        DownloadSpec::PromptTools { .. } => {
            let mut steps = vec![
                PlannedStep {
                    step_kind: "git_node".into(),
                    label: "ComfyUI-QwenVL custom node".into(),
                    spec: json!({ "pinId": "qwenvl" }),
                },
                PlannedStep {
                    step_kind: "pip".into(),
                    label: "QwenVL Python dependencies".into(),
                    spec: json!({ "action": "qwenvl_deps" }),
                },
            ];
            for (filename, url, dest) in prompt_tools::qwenvl_http_files(app)? {
                steps.push(PlannedStep {
                    step_kind: "http".into(),
                    label: filename.clone(),
                    spec: json!({
                        "url": url,
                        "dest": dest.to_string_lossy(),
                        "filename": filename,
                    }),
                });
            }
            Ok(steps)
        }
        DownloadSpec::Blueprint { id } => Ok(vec![PlannedStep {
            step_kind: "action".into(),
            label: format!("Install blueprint {id}"),
            spec: json!({ "action": "blueprint", "id": id }),
        }]),
        DownloadSpec::Lora { id, arch } => Ok(vec![PlannedStep {
            step_kind: "action".into(),
            label: format!("Install LoRA {id} ({arch})"),
            spec: json!({ "action": "lora", "id": id, "arch": arch }),
        }]),
        DownloadSpec::Upscale { id } => Ok(vec![PlannedStep {
            step_kind: "action".into(),
            label: format!("Install {id}"),
            spec: json!({ "action": "upscale", "id": id }),
        }]),
        DownloadSpec::Runtime { engine } => Ok(vec![PlannedStep {
            step_kind: "action".into(),
            label: format!("Install {engine}"),
            spec: json!({ "action": "runtime", "engine": engine }),
        }]),
    }
}

fn enrich_title(app: &AppHandle, spec: &DownloadSpec) -> String {
    match spec {
        DownloadSpec::Blueprint { id } => blueprints::get_detail(app, id)
            .map(|b| b.name)
            .unwrap_or_else(|_| spec_title(spec)),
        DownloadSpec::Lora { id, arch } => loras::get_lora(app, id)
            .map(|p| format!("{} ({arch})", p.name))
            .unwrap_or_else(|_| spec_title(spec)),
        DownloadSpec::Upscale { id } => {
            if id == "usdu" {
                "Ultimate SD Upscale".into()
            } else if id == "supir" {
                "SUPIR".into()
            } else {
                upscale::list_upscalers(app)
                    .ok()
                    .and_then(|list| list.into_iter().find(|m| m.id == *id))
                    .map(|m| m.name)
                    .unwrap_or_else(|| spec_title(spec))
            }
        }
        _ => spec_title(spec),
    }
}

fn enqueue_job(app: &AppHandle, spec: &DownloadSpec) -> Result<String, String> {
    let job_key = spec_job_key(spec);
    let title = enrich_title(app, spec);
    let kind = spec_kind(spec).to_string();
    let planned = plan_steps(app, spec)?;
    let ts = now_secs();
    let job_id = Uuid::new_v4().to_string();

    {
        let state = app.state::<AppState>();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(existing) = db.get_download_job_by_key(&job_key)? {
            if matches!(
                existing.status.as_str(),
                "queued" | "running" | "paused"
            ) {
                return Ok(existing.id);
            }
            // Terminal job with same key — allow re-enqueue by deleting old row.
            let _ = db.delete_download_job(&existing.id);
        }
        let sort = db.next_download_sort_order()?;
        db.insert_download_job(&DownloadJobRow {
            id: job_id.clone(),
            job_key,
            title,
            kind,
            status: "queued".into(),
            error: None,
            sort_order: sort,
            created_at: ts,
            updated_at: ts,
            started_at: None,
            finished_at: None,
        })?;
        for (i, step) in planned.iter().enumerate() {
            db.insert_download_step(&DownloadStepRow {
                id: Uuid::new_v4().to_string(),
                job_id: job_id.clone(),
                idx: i as i64,
                step_kind: step.step_kind.clone(),
                label: step.label.clone(),
                spec_json: step.spec.to_string(),
                status: "queued".into(),
                bytes_done: 0,
                bytes_total: None,
                error: None,
                updated_at: ts,
            })?;
        }
    }
    notify_worker();
    emit_snapshot(app);
    Ok(job_id)
}

/// Shared ensure: ready → return; else enqueue. Optionally block until terminal.
pub fn ensure(
    app: &AppHandle,
    spec: DownloadSpec,
    opts: EnsureOpts,
) -> Result<EnsureResult, String> {
    if is_ready(app, &spec)? {
        return Ok(EnsureResult {
            status: "ready".into(),
            job_id: None,
            message: Some("Already installed".into()),
        });
    }

    let job_id = {
        let key = spec_job_key(&spec);
        let state = app.state::<AppState>();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(existing) = db.get_download_job_by_key(&key)? {
            if matches!(
                existing.status.as_str(),
                "queued" | "running" | "paused"
            ) {
                existing.id
            } else {
                drop(db);
                enqueue_job(app, &spec)?
            }
        } else {
            drop(db);
            enqueue_job(app, &spec)?
        }
    };

    // Re-open path when enqueue_job was skipped above but we need to ensure worker wakes.
    notify_worker();
    emit_snapshot(app);

    if !opts.wait {
        let status = {
            let state = app.state::<AppState>();
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.get_download_job(&job_id)?
                .map(|j| j.status)
                .unwrap_or_else(|| "queued".into())
        };
        return Ok(EnsureResult {
            status,
            job_id: Some(job_id),
            message: None,
        });
    }

    // Wait until terminal or ready on disk.
    let deadline = std::time::Instant::now() + Duration::from_secs(60 * 60 * 6);
    loop {
        if is_ready(app, &spec)? {
            return Ok(EnsureResult {
                status: "ready".into(),
                job_id: Some(job_id),
                message: None,
            });
        }
        let status = {
            let state = app.state::<AppState>();
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.get_download_job(&job_id)?
                .map(|j| j.status)
                .unwrap_or_else(|| "error".into())
        };
        match status.as_str() {
            "done" => {
                return Ok(EnsureResult {
                    status: "ready".into(),
                    job_id: Some(job_id),
                    message: None,
                });
            }
            "error" | "cancelled" => {
                let message = {
                    let state = app.state::<AppState>();
                    let db = state.db.lock().map_err(|e| e.to_string())?;
                    db.get_download_job(&job_id)?
                        .and_then(|j| j.error)
                };
                return Ok(EnsureResult {
                    status,
                    job_id: Some(job_id),
                    message,
                });
            }
            "paused" => {
                // Soft-wait: still blocked until user resumes and finishes.
            }
            _ => {}
        }
        if std::time::Instant::now() > deadline {
            return Err("timed out waiting for download".into());
        }
        thread::sleep(Duration::from_millis(500));
    }
}

pub fn pause_job(app: &AppHandle, job_id: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let Some(job) = db.get_download_job(job_id)? else {
        return Err("download job not found".into());
    };
    if job.status == "running" {
        download::request_pause();
    } else if job.status == "queued" {
        db.update_download_job_status(job_id, "paused", None)?;
        drop(db);
        emit_snapshot(app);
    }
    Ok(())
}

pub fn resume_job(app: &AppHandle, job_id: &str) -> Result<(), String> {
    download::clear_pause();
    {
        let state = app.state::<AppState>();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let Some(job) = db.get_download_job(job_id)? else {
            return Err("download job not found".into());
        };
        if job.status == "paused" {
            db.update_download_job_status(job_id, "queued", None)?;
            for step in db.list_download_steps(job_id)? {
                if step.status == "paused" {
                    db.update_download_step_status(&step.id, "queued", None, None, None)?;
                }
            }
        }
    }
    notify_worker();
    emit_snapshot(app);
    Ok(())
}

pub fn cancel_job(app: &AppHandle, job_id: &str) -> Result<(), String> {
    {
        let state = app.state::<AppState>();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let Some(job) = db.get_download_job(job_id)? else {
            return Err("download job not found".into());
        };
        if job.status == "running" {
            download::request_cancel();
        } else if matches!(job.status.as_str(), "queued" | "paused") {
            db.update_download_job_status(job_id, "cancelled", Some("cancelled"))?;
            for step in db.list_download_steps(job_id)? {
                if matches!(step.status.as_str(), "queued" | "paused" | "running") {
                    db.update_download_step_status(
                        &step.id,
                        "cancelled",
                        Some("cancelled"),
                        None,
                        None,
                    )?;
                }
            }
            let _ = db.prune_download_history(HISTORY_KEEP);
        }
    }
    notify_worker();
    emit_snapshot(app);
    Ok(())
}

fn run_next_job(app: &AppHandle) {
    let job = {
        let state = app.state::<AppState>();
        let Ok(db) = state.db.lock() else {
            return;
        };
        // Prefer paused? No — only queued. Paused waits for resume.
        let queued = db.list_download_jobs_by_status(&["queued"]).ok();
        queued.and_then(|v| v.into_iter().next())
    };
    let Some(job) = job else {
        return;
    };

    download::clear_transfer_controls();
    {
        let state = app.state::<AppState>();
        let Ok(db) = state.db.lock() else {
            return;
        };
        let _ = db.update_download_job_status(&job.id, "running", None);
    }
    emit_snapshot(app);

    let steps = {
        let state = app.state::<AppState>();
        let Ok(db) = state.db.lock() else {
            return;
        };
        db.list_download_steps(&job.id).unwrap_or_default()
    };

    for step in steps {
        if matches!(step.status.as_str(), "done" | "cancelled") {
            continue;
        }
        // If job was paused while queued before this step, stop.
        {
            let state = app.state::<AppState>();
            let Ok(db) = state.db.lock() else {
                return;
            };
            if let Ok(Some(j)) = db.get_download_job(&job.id) {
                if j.status == "paused" {
                    emit_snapshot(app);
                    return;
                }
                if j.status == "cancelled" {
                    emit_snapshot(app);
                    return;
                }
            }
            let _ = db.update_download_step_status(&step.id, "running", None, None, None);
        }
        emit_snapshot(app);

        let result = run_step(app, &job.id, &step);
        match result {
            Ok(()) => {
                let state = app.state::<AppState>();
                let Ok(db) = state.db.lock() else {
                    return;
                };
                let _ = db.update_download_step_status(&step.id, "done", None, None, None);
            }
            Err(err) if err == "paused" => {
                let state = app.state::<AppState>();
                let Ok(db) = state.db.lock() else {
                    return;
                };
                let _ = db.update_download_step_status(&step.id, "paused", Some("paused"), None, None);
                let _ = db.update_download_job_status(&job.id, "paused", None);
                download::clear_pause();
                emit_snapshot(app);
                return;
            }
            Err(err) if err == "cancelled" => {
                let state = app.state::<AppState>();
                let Ok(db) = state.db.lock() else {
                    return;
                };
                let _ = db.update_download_step_status(
                    &step.id,
                    "cancelled",
                    Some("cancelled"),
                    None,
                    None,
                );
                let _ = db.update_download_job_status(&job.id, "cancelled", Some("cancelled"));
                let _ = db.prune_download_history(HISTORY_KEEP);
                download::clear_transfer_controls();
                emit_snapshot(app);
                return;
            }
            Err(err) => {
                let state = app.state::<AppState>();
                let Ok(db) = state.db.lock() else {
                    return;
                };
                let _ = db.update_download_step_status(&step.id, "error", Some(&err), None, None);
                let _ = db.update_download_job_status(&job.id, "error", Some(&err));
                let _ = db.prune_download_history(HISTORY_KEEP);
                download::clear_transfer_controls();
                emit_snapshot(app);
                return;
            }
        }
        emit_snapshot(app);
    }

    {
        let state = app.state::<AppState>();
        let Ok(db) = state.db.lock() else {
            return;
        };
        let _ = db.update_download_job_status(&job.id, "done", None);
        let _ = db.prune_download_history(HISTORY_KEEP);
    }
    download::clear_transfer_controls();
    emit_snapshot(app);
}

fn run_step(app: &AppHandle, _job_id: &str, step: &DownloadStepRow) -> Result<(), String> {
    let spec: Value = serde_json::from_str(&step.spec_json).unwrap_or(json!({}));
    match step.step_kind.as_str() {
        "http" => {
            let url = spec
                .get("url")
                .and_then(|v| v.as_str())
                .ok_or("http step missing url")?;
            let dest = PathBuf::from(
                spec.get("dest")
                    .and_then(|v| v.as_str())
                    .ok_or("http step missing dest")?,
            );
            if download::local_file_complete(&dest) {
                if let Ok(len) = dest.metadata().map(|m| m.len() as i64) {
                    let state = app.state::<AppState>();
                    let db = state.db.lock().map_err(|e| e.to_string())?;
                    let _ = db.update_download_step_status(
                        &step.id,
                        "running",
                        None,
                        Some(len),
                        Some(len),
                    );
                }
                return Ok(());
            }
            use std::sync::atomic::{AtomicBool, Ordering};
            let stop = std::sync::Arc::new(AtomicBool::new(false));
            let stop_t = stop.clone();
            let app_tick = app.clone();
            let sid = step.id.clone();
            let dest_tick = dest.clone();
            let tick = thread::spawn(move || {
                while !stop_t.load(Ordering::SeqCst) {
                    if let Ok(meta) = std::fs::metadata(&dest_tick) {
                        let state = app_tick.state::<AppState>();
                        if let Ok(db) = state.db.lock() {
                            let _ = db.update_download_step_status(
                                &sid,
                                "running",
                                None,
                                Some(meta.len() as i64),
                                None,
                            );
                        };
                    }
                    emit_snapshot(&app_tick);
                    thread::sleep(Duration::from_millis(800));
                }
            });

            let result = download::download_file(app, url, &dest, None);
            stop.store(true, Ordering::SeqCst);
            let _ = tick.join();
            result?;
            if !download::local_file_complete(&dest) {
                return Err("download incomplete".into());
            }
            if let Ok(len) = dest.metadata().map(|m| m.len() as i64) {
                let state = app.state::<AppState>();
                let db = state.db.lock().map_err(|e| e.to_string())?;
                let _ = db.update_download_step_status(
                    &step.id,
                    "running",
                    None,
                    Some(len),
                    Some(len),
                );
            }
            Ok(())
        }
        "git_node" => {
            let pin_id = spec
                .get("pinId")
                .and_then(|v| v.as_str())
                .ok_or("git_node missing pinId")?;
            upscale::ensure_pinned_node(app, pin_id)
        }
        "pip" => {
            let action = spec
                .get("action")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match action {
                "qwenvl_deps" => {
                    let _ = prompt_tools::install_qwenvl_python_deps(app)?;
                    Ok(())
                }
                other => Err(format!("unknown pip action: {other}")),
            }
        }
        "action" => {
            let action = spec
                .get("action")
                .and_then(|v| v.as_str())
                .ok_or("action step missing action")?;
            match action {
                "blueprint" => {
                    let id = spec
                        .get("id")
                        .and_then(|v| v.as_str())
                        .ok_or("blueprint id missing")?;
                    blueprints::install_models(app, id)
                }
                "lora" => {
                    let id = spec
                        .get("id")
                        .and_then(|v| v.as_str())
                        .ok_or("lora id missing")?;
                    let arch = spec
                        .get("arch")
                        .and_then(|v| v.as_str())
                        .ok_or("lora arch missing")?;
                    loras::install_variant(app, id, arch)
                }
                "upscale" => {
                    let id = spec
                        .get("id")
                        .and_then(|v| v.as_str())
                        .ok_or("upscale id missing")?;
                    if id == "usdu" {
                        upscale::ensure_usdu_custom_node(app)
                    } else if id == "supir" {
                        upscale::ensure_supir_custom_node(app)
                    } else {
                        upscale::install_upscaler(app, id)
                    }
                }
                "runtime" => {
                    let engine = spec
                        .get("engine")
                        .and_then(|v| v.as_str())
                        .ok_or("runtime engine missing")?;
                    if engine != comfy::ENGINE {
                        return Err(format!("unknown engine: {engine}"));
                    }
                    let existing = {
                        let state = app.state::<AppState>();
                        let db = state.db.lock().map_err(|e| e.to_string())?;
                        db.get_runtime_by_engine(comfy::ENGINE)?
                    };
                    let runtime = comfy::install_portable(app, existing.as_ref(), false)?;
                    {
                        let state = app.state::<AppState>();
                        let db = state.db.lock().map_err(|e| e.to_string())?;
                        let _ = db.upsert_runtime(&runtime);
                    }
                    let _ = app.emit("runtimes://updated", &runtime);
                    Ok(())
                }
                other => Err(format!("unknown action: {other}")),
            }
        }
        other => Err(format!("unknown step kind: {other}")),
    }
}
