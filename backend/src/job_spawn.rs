//! Re-spawn generate / prompt-tool workers from persisted job rows (resume + startup).

use crate::blueprints;
use crate::comfy;
use crate::comfy_queue;
use crate::commands::AppState;
use crate::db::{GalleryItem, Job, RuntimeInstall};
use crate::generate;
use crate::prompt_tools::{self, RunImageToPromptArgs, RunPromptEnhanceArgs};
use serde_json::Value;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};

pub fn label_for_job(app: &AppHandle, job: &Job) -> String {
    let mut cache = HashMap::new();
    label_for_job_cached(app, job, &mut cache)
}

/// Same as [`label_for_job`] but reuses blueprint name lookups across a list.
pub fn label_for_job_cached(
    app: &AppHandle,
    job: &Job,
    cache: &mut HashMap<String, String>,
) -> String {
    if job.kind == "generate" {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&job.params_json) {
            if let Some(id) = v.get("blueprintId").and_then(|x| x.as_str()) {
                if let Some(name) = cache.get(id) {
                    return name.clone();
                }
                if let Ok(detail) = blueprints::get_detail(app, id) {
                    if !detail.name.is_empty() {
                        cache.insert(id.to_string(), detail.name.clone());
                        return detail.name;
                    }
                }
            }
        }
        return "Generate image".into();
    }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&job.params_json) {
        if v.get("imagePath").is_some() {
            return "Image to Prompt".into();
        }
        if v.get("prompt").is_some() || v.get("mode").is_some() {
            return "Prompt Enhancer".into();
        }
    }
    "Prompt Tools".into()
}

fn emit_history_changed(app: &AppHandle) {
    let _ = app.emit("jobs://history", true);
}

fn runtime_ready(state: &AppState) -> Result<RuntimeInstall, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let runtime = db
        .get_runtime_by_engine(comfy::ENGINE)?
        .ok_or_else(|| "ComfyUI is not installed - open Settings to install".to_string())?;
    if runtime.install_path.is_empty()
        || runtime.status == "error"
        || runtime.status == "installing"
    {
        return Err("ComfyUI install is not ready - open Settings".into());
    }
    Ok(runtime)
}

/// Spawn a worker for an existing DB job (queued / resumed). `front` puts it ahead of waiting work.
pub fn spawn_existing_job(app: &AppHandle, job: &Job, front: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    let runtime = runtime_ready(&state)?;
    let label = label_for_job(app, job);

    {
        let mut cancelled = state.cancelled_jobs.lock().map_err(|e| e.to_string())?;
        cancelled.remove(&job.id);
    }
    {
        let mut paused = state.paused_jobs.lock().map_err(|e| e.to_string())?;
        paused.remove(&job.id);
    }

    if job.kind == "generate" {
        spawn_generate(app, job, &runtime, &label, front)?;
    } else if job.kind == "prompt-tool" {
        spawn_prompt_tool(app, job, &runtime, &label, front)?;
    } else {
        return Err(format!("unsupported job kind: {}", job.kind));
    }
    Ok(())
}

fn spawn_generate(
    app: &AppHandle,
    job: &Job,
    runtime: &RuntimeInstall,
    label: &str,
    front: bool,
) -> Result<(), String> {
    let params: serde_json::Value =
        serde_json::from_str(&job.params_json).map_err(|e| e.to_string())?;
    let blueprint_id = params
        .get("blueprintId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "generate job missing blueprintId".to_string())?
        .to_string();
    let values = params
        .get("values")
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));
    let values_map: HashMap<String, Value> = match values {
        Value::Object(m) => m.into_iter().collect(),
        _ => HashMap::new(),
    };

    let state = app.state::<AppState>();
    let active_jobs = state.active_generate_jobs.clone();
    {
        let mut active = active_jobs.lock().map_err(|e| e.to_string())?;
        active.insert(job.id.clone());
    }

    let app_bg = app.clone();
    let job_bg = job.clone();
    let runtime_bg = runtime.clone();
    let label_bg = label.to_string();
    std::thread::spawn(move || {
        struct ActiveGuard(
            std::sync::Arc<std::sync::Mutex<std::collections::HashSet<String>>>,
            String,
        );
        impl Drop for ActiveGuard {
            fn drop(&mut self) {
                if let Ok(mut active) = self.0.lock() {
                    active.remove(&self.1);
                }
            }
        }
        let _active = ActiveGuard(active_jobs, job_bg.id.clone());
        let state = app_bg.state::<AppState>();
        let run = || {
            generate::run_generate(
                &app_bg,
                &state.db,
                &state.processes,
                &state.cancelled_jobs,
                &job_bg,
                &blueprint_id,
                values_map,
                &runtime_bg,
            )
        };
        let result = if front {
            comfy_queue::run_with_slot_front(&app_bg, &job_bg.id, "generate", &label_bg, run)
        } else {
            comfy_queue::run_with_slot(&app_bg, &job_bg.id, "generate", &label_bg, run)
        };
        finish_generate_job(&app_bg, &state, &job_bg, result);
    });
    Ok(())
}

fn spawn_prompt_tool(
    app: &AppHandle,
    job: &Job,
    runtime: &RuntimeInstall,
    label: &str,
    front: bool,
) -> Result<(), String> {
    let app_bg = app.clone();
    let job_bg = job.clone();
    let runtime_bg = runtime.clone();
    let label_bg = label.to_string();
    let params_json = job.params_json.clone();

    std::thread::spawn(move || {
        let state = app_bg.state::<AppState>();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            if let Ok(args) = serde_json::from_str::<RunImageToPromptArgs>(&params_json) {
                let run = || {
                    prompt_tools::run_image_to_prompt(
                        &app_bg,
                        &state.db,
                        &state.processes,
                        &state.cancelled_jobs,
                        &job_bg,
                        &args,
                        &runtime_bg,
                    )
                };
                return if front {
                    comfy_queue::run_with_slot_front(
                        &app_bg,
                        &job_bg.id,
                        "prompt-tool",
                        &label_bg,
                        run,
                    )
                } else {
                    comfy_queue::run_with_slot(&app_bg, &job_bg.id, "prompt-tool", &label_bg, run)
                };
            }
            if let Ok(args) = serde_json::from_str::<RunPromptEnhanceArgs>(&params_json) {
                let run = || {
                    prompt_tools::run_prompt_enhance(
                        &app_bg,
                        &state.db,
                        &state.processes,
                        &state.cancelled_jobs,
                        &job_bg,
                        &args,
                        &runtime_bg,
                    )
                };
                return if front {
                    comfy_queue::run_with_slot_front(
                        &app_bg,
                        &job_bg.id,
                        "prompt-tool",
                        &label_bg,
                        run,
                    )
                } else {
                    comfy_queue::run_with_slot(&app_bg, &job_bg.id, "prompt-tool", &label_bg, run)
                };
            }
            Err("prompt-tool job has unrecognized params".into())
        }))
        .unwrap_or_else(|_| Err("Prompt Tools worker crashed".into()));
        finish_prompt_tool_job(&app_bg, &state, &job_bg, result);
    });
    Ok(())
}

pub fn finish_prompt_tool_job(
    app: &AppHandle,
    state: &AppState,
    job: &Job,
    result: Result<prompt_tools::PromptToolResult, String>,
) {
    let was_paused = matches!(&result, Err(e) if e == "paused");
    let updated = match result {
        Ok(payload) => {
            let _ = app.emit(
                "jobs://progress",
                serde_json::json!({
                    "jobId": job.id,
                    "stage": "done",
                    "message": "Done",
                    "result": payload,
                }),
            );
            if let Ok(db) = state.db.lock() {
                // Persist result on the job so History can show prompts after restart.
                let mut params: serde_json::Value = serde_json::from_str(&job.params_json)
                    .unwrap_or_else(|_| serde_json::json!({}));
                if let Some(obj) = params.as_object_mut() {
                    if let Ok(v) = serde_json::to_value(&payload) {
                        obj.insert("result".into(), v);
                    }
                }
                let _ = db.update_job_params(&job.id, &params.to_string());
                db.update_job_status(&job.id, "completed", None).ok()
            } else {
                None
            }
        }
        Err(ref err) if err == "paused" => {
            let _ = app.emit(
                "jobs://progress",
                serde_json::json!({
                    "jobId": job.id,
                    "stage": "paused",
                    "message": "Paused",
                }),
            );
            if let Ok(db) = state.db.lock() {
                db.update_job_status(&job.id, "paused", None).ok()
            } else {
                None
            }
        }
        Err(ref err) if err == "cancelled" => {
            let _ = app.emit(
                "jobs://progress",
                serde_json::json!({
                    "jobId": job.id,
                    "stage": "cancelled",
                    "message": "Cancelled",
                }),
            );
            if let Ok(db) = state.db.lock() {
                db.update_job_status(&job.id, "cancelled", Some("Cancelled by user"))
                    .ok()
            } else {
                None
            }
        }
        Err(ref err) => {
            let _ = app.emit(
                "jobs://progress",
                serde_json::json!({
                    "jobId": job.id,
                    "stage": "error",
                    "message": err,
                }),
            );
            if let Ok(db) = state.db.lock() {
                db.update_job_status(&job.id, "failed", Some(err)).ok()
            } else {
                None
            }
        }
    };
    if let Ok(mut cancelled) = state.cancelled_jobs.lock() {
        cancelled.remove(&job.id);
    }
    if !was_paused {
        if let Ok(mut paused) = state.paused_jobs.lock() {
            paused.remove(&job.id);
        }
    }
    if let Some(job) = updated {
        let terminal = matches!(job.status.as_str(), "completed" | "failed" | "cancelled");
        let _ = app.emit("jobs://updated", &job);
        if terminal {
            emit_history_changed(app);
        }
    }
}

pub fn finish_generate_job(
    app: &AppHandle,
    state: &AppState,
    job: &Job,
    result: Result<Vec<GalleryItem>, String>,
) {
    let was_paused = matches!(&result, Err(e) if e == "paused");
    let updated = match result {
        Ok(_) => {
            if let Ok(db) = state.db.lock() {
                db.update_job_status(&job.id, "completed", None).ok()
            } else {
                None
            }
        }
        Err(ref err) if err == "paused" => {
            let _ = app.emit(
                "jobs://progress",
                serde_json::json!({
                    "jobId": job.id,
                    "stage": "paused",
                    "message": "Paused",
                }),
            );
            if let Ok(db) = state.db.lock() {
                db.update_job_status(&job.id, "paused", None).ok()
            } else {
                None
            }
        }
        Err(ref err) if err == "cancelled" => {
            let _ = app.emit(
                "jobs://progress",
                serde_json::json!({
                    "jobId": job.id,
                    "stage": "cancelled",
                    "message": "Cancelled",
                }),
            );
            if let Ok(db) = state.db.lock() {
                db.update_job_status(&job.id, "cancelled", Some("Cancelled by user"))
                    .ok()
            } else {
                None
            }
        }
        Err(ref err) => {
            let _ = app.emit(
                "jobs://progress",
                serde_json::json!({
                    "jobId": job.id,
                    "stage": "error",
                    "message": err,
                }),
            );
            if let Ok(db) = state.db.lock() {
                db.update_job_status(&job.id, "failed", Some(err)).ok()
            } else {
                None
            }
        }
    };
    if let Ok(mut cancelled) = state.cancelled_jobs.lock() {
        cancelled.remove(&job.id);
    }
    if !was_paused {
        if let Ok(mut paused) = state.paused_jobs.lock() {
            paused.remove(&job.id);
        }
    }
    generate::cleanup_job_previews(app, &job.id);
    if let Some(job) = updated {
        let terminal = matches!(job.status.as_str(), "completed" | "failed" | "cancelled");
        let _ = app.emit("jobs://updated", &job);
        if terminal {
            emit_history_changed(app);
        }
    }
}

/// After process start: re-queue durable active jobs instead of failing them.
pub fn rehydrate_jobs_on_startup(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let jobs = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.list_active_jobs()?
    };

    for job in &jobs {
        if job.status == "running" {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let _ = db.update_job_status(&job.id, "queued", None);
        }
    }

    let jobs = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.list_active_jobs()?
    };

    for job in jobs {
        if job.status == "paused" {
            // Park as paused lane holder without starting GPU work.
            let label = label_for_job(app, &job);
            {
                let mut paused = state.paused_jobs.lock().map_err(|e| e.to_string())?;
                paused.insert(job.id.clone());
            }
            let (prompt, meta) = comfy_queue::summarize_params(&job.kind, &job.params_json);
            let q_item = crate::ipc::JobQueueItem {
                job_id: job.id.clone(),
                kind: job.kind.clone(),
                label,
                status: "paused".into(),
                prompt,
                meta,
            };
            // Directly set paused holder via acquire trick: push and park.
            restore_paused_holder(app, q_item);
            continue;
        }
        if let Err(e) = spawn_existing_job(app, &job, false) {
            log::warn!("failed to rehydrate job {}: {e}", job.id);
            if let Ok(db) = state.db.lock() {
                let _ = db.update_job_status(&job.id, "failed", Some(&e));
            }
        }
    }
    Ok(())
}

fn restore_paused_holder(app: &AppHandle, item: crate::ipc::JobQueueItem) {
    // Use reorder module API — inject via taking empty and setting through pause path.
    // comfy_queue doesn't expose set_paused_holder; use a small public helper.
    comfy_queue::restore_paused_holder(app, item);
}
