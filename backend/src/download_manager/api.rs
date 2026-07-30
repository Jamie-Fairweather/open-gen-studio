use super::types::{
    DownloadJobView, DownloadSnapshot, DownloadSpec, DownloadStepView, EnsureOpts, EnsureResult,
};
use crate::commands::AppState;
use crate::db::{Db, DownloadJobRow};
use crate::download;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use super::plan::{enqueue_job, is_ready, spec_job_key};
use super::worker::notify_worker;
use super::{EVENT_MANAGER, HISTORY_KEEP};

pub(crate) fn job_view(db: &Db, job: &DownloadJobRow) -> Result<DownloadJobView, String> {
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

pub(crate) fn emit_snapshot(app: &AppHandle) {
    if let Ok(snap) = snapshot(app) {
        let _ = app.emit(EVENT_MANAGER, snap);
    }
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
            if matches!(existing.status.as_str(), "queued" | "running" | "paused") {
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
                    db.get_download_job(&job_id)?.and_then(|j| j.error)
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
