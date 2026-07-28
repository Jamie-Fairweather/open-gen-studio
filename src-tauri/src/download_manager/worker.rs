use crate::commands::AppState;
use crate::download;
use serde_json::json;
use std::sync::{Condvar, Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use super::api::emit_snapshot;
use super::steps::run_step;
use super::HISTORY_KEEP;

fn parse_lora_job_key(job_key: &str) -> Option<(&str, &str)> {
    let rest = job_key.strip_prefix("lora:")?;
    rest.split_once(':')
}

fn emit_kind_success(app: &AppHandle, kind: &str, job_key: &str) {
    if kind == "lora" {
        if let Some((id, arch)) = parse_lora_job_key(job_key) {
            let _ = app.emit(
                "loras://progress",
                json!({
                    "loraId": id,
                    "arch": arch,
                    "stage": "done",
                    "message": format!("Ready: {id} ({arch})"),
                }),
            );
            let _ = app.emit("loras://updated", id);
        }
    } else if kind == "blueprint" {
        if let Some(id) = job_key.strip_prefix("blueprint:") {
            let _ = app.emit("blueprints://updated", id);
        }
    } else if kind == "upscale" {
        if let Some(id) = job_key.strip_prefix("upscale:") {
            let _ = app.emit(
                "upscale://progress",
                json!({
                    "modelId": id,
                    "stage": "done",
                    "message": format!("Ready: {id}"),
                }),
            );
            let _ = app.emit("upscale://updated", id);
        }
    }
}

fn emit_kind_failure(app: &AppHandle, kind: &str, job_key: &str, err: &str) {
    if kind == "lora" {
        if let Some((id, arch)) = parse_lora_job_key(job_key) {
            let _ = app.emit(
                "loras://progress",
                json!({
                    "loraId": id,
                    "arch": arch,
                    "stage": "error",
                    "message": err,
                }),
            );
        }
    } else if kind == "blueprint" {
        if let Some(id) = job_key.strip_prefix("blueprint:") {
            let _ = app.emit(
                "blueprints://progress",
                json!({
                    "blueprintId": id,
                    "stage": "error",
                    "message": err,
                    "modelIndex": 0,
                    "modelTotal": 0,
                }),
            );
        }
    } else if kind == "upscale" {
        if let Some(id) = job_key.strip_prefix("upscale:") {
            let _ = app.emit(
                "upscale://progress",
                json!({
                    "modelId": id,
                    "stage": "error",
                    "message": err,
                }),
            );
        }
    }
}

pub(crate) struct Wake {
    lock: Mutex<bool>,
    cv: Condvar,
}

pub(crate) fn wake() -> &'static Wake {
    static W: OnceLock<Wake> = OnceLock::new();
    W.get_or_init(|| Wake {
        lock: Mutex::new(false),
        cv: Condvar::new(),
    })
}

pub(crate) fn notify_worker() {
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
            // Keep combined % accurate for jobs that started before sizes were known.
            {
                let state = app.state::<AppState>();
                if let Ok(db) = state.db.lock() {
                    if let Ok(running) = db.list_download_jobs_by_status(&["running", "paused"]) {
                        drop(db);
                        for job in running {
                            super::steps::seed_http_totals(&app, &job.id);
                        }
                    }
                };
            }
            run_next_job(&app);
            let w = wake();
            let Ok(guard) = w.lock.lock() else {
                thread::sleep(Duration::from_secs(1));
                continue;
            };
            let (mut g, _) =
                w.cv.wait_timeout_while(guard, Duration::from_secs(2), |pending| !*pending)
                    .unwrap_or_else(|e| e.into_inner());
            *g = false;
        }
    });
}

pub(crate) fn run_next_job(app: &AppHandle) {
    let job = {
        let state = app.state::<AppState>();
        let Ok(db) = state.db.lock() else {
            return;
        };
        // Prefer paused? No - only queued. Paused waits for resume.
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

    // Probe waiting http sizes once so the UI can show combined job progress.
    super::steps::seed_http_totals(app, &job.id);

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
                if j.status == "paused" || j.status == "cancelled" {
                    drop(db);
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
                {
                    let state = app.state::<AppState>();
                    let Ok(db) = state.db.lock() else {
                        return;
                    };
                    let _ = db.update_download_step_status(
                        &step.id,
                        "paused",
                        Some("paused"),
                        None,
                        None,
                    );
                    let _ = db.update_download_job_status(&job.id, "paused", None);
                }
                download::clear_pause();
                emit_snapshot(app);
                return;
            }
            Err(err) if err == "cancelled" => {
                {
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
                }
                download::clear_transfer_controls();
                emit_snapshot(app);
                return;
            }
            Err(err) => {
                {
                    let state = app.state::<AppState>();
                    let Ok(db) = state.db.lock() else {
                        return;
                    };
                    let _ =
                        db.update_download_step_status(&step.id, "error", Some(&err), None, None);
                    let _ = db.update_download_job_status(&job.id, "error", Some(&err));
                    let _ = db.prune_download_history(HISTORY_KEEP);
                }
                download::clear_transfer_controls();
                emit_kind_failure(app, &job.kind, &job.job_key, &err);
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
    emit_kind_success(app, &job.kind, &job.job_key);
    emit_snapshot(app);
}
