//! Serial ComfyUI work queue shared by generate + Prompt Tools.
//! Only one job holds the GPU slot at a time; others wait without failing.

use crate::commands::AppState;
use crate::ipc::{JobQueueItem, JobQueueSnapshot};
use std::collections::VecDeque;
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

struct QueueInner {
    waiting: VecDeque<JobQueueItem>,
    running: Option<JobQueueItem>,
}

struct QueueState {
    inner: Mutex<QueueInner>,
    cv: Condvar,
}

fn queue() -> &'static QueueState {
    static Q: OnceLock<QueueState> = OnceLock::new();
    Q.get_or_init(|| QueueState {
        inner: Mutex::new(QueueInner {
            waiting: VecDeque::new(),
            running: None,
        }),
        cv: Condvar::new(),
    })
}

fn snapshot_from(inner: &QueueInner) -> JobQueueSnapshot {
    let mut items = Vec::with_capacity(inner.waiting.len() + 1);
    if let Some(ref running) = inner.running {
        items.push(running.clone());
    }
    items.extend(inner.waiting.iter().cloned());
    JobQueueSnapshot { items }
}

fn emit_snapshot(app: &AppHandle, inner: &QueueInner) {
    let _ = app.emit("jobs://queue", snapshot_from(inner));
}

pub fn snapshot() -> JobQueueSnapshot {
    let q = queue();
    let Ok(inner) = q.inner.lock() else {
        return JobQueueSnapshot { items: vec![] };
    };
    snapshot_from(&inner)
}

/// Wait until this job is at the front and the GPU slot is free.
/// Returns Err("cancelled") if the user cancelled while waiting.
pub fn acquire(app: &AppHandle, job_id: &str, kind: &str, label: &str) -> Result<(), String> {
    let q = queue();
    {
        let mut inner = q.inner.lock().map_err(|e| e.to_string())?;
        if inner
            .waiting
            .iter()
            .chain(inner.running.iter())
            .any(|i| i.job_id == job_id)
        {
            return Err("job already in queue".into());
        }
        inner.waiting.push_back(JobQueueItem {
            job_id: job_id.into(),
            kind: kind.into(),
            label: label.into(),
            status: "queued".into(),
        });
        emit_snapshot(app, &inner);
        q.cv.notify_all();
    }

    loop {
        if job_cancelled(app, job_id) {
            remove(app, job_id);
            return Err("cancelled".into());
        }
        let mut inner = q.inner.lock().map_err(|e| e.to_string())?;
        let is_front = inner
            .waiting
            .front()
            .map(|i| i.job_id == job_id)
            .unwrap_or(false);
        if inner.running.is_none() && is_front {
            let mut item = inner
                .waiting
                .pop_front()
                .ok_or_else(|| "queue empty".to_string())?;
            item.status = "running".into();
            inner.running = Some(item);
            emit_snapshot(app, &inner);
            return Ok(());
        }
        let (guard, _) =
            q.cv.wait_timeout(inner, Duration::from_millis(250))
                .map_err(|e| e.to_string())?;
        drop(guard);
    }
}

pub fn release(app: &AppHandle, job_id: &str) {
    remove(app, job_id);
}

fn remove(app: &AppHandle, job_id: &str) {
    let q = queue();
    let Ok(mut inner) = q.inner.lock() else {
        return;
    };
    let mut changed = false;
    if inner
        .running
        .as_ref()
        .map(|r| r.job_id == job_id)
        .unwrap_or(false)
    {
        inner.running = None;
        changed = true;
    }
    let before = inner.waiting.len();
    inner.waiting.retain(|i| i.job_id != job_id);
    if inner.waiting.len() != before {
        changed = true;
    }
    if changed {
        emit_snapshot(app, &inner);
        q.cv.notify_all();
    }
}

/// Drop guard: releases the queue slot even if the worker panics.
pub struct QueueGuard {
    app: AppHandle,
    job_id: String,
}

impl QueueGuard {
    pub fn new(app: AppHandle, job_id: impl Into<String>) -> Self {
        Self {
            app,
            job_id: job_id.into(),
        }
    }
}

impl Drop for QueueGuard {
    fn drop(&mut self) {
        release(&self.app, &self.job_id);
    }
}

fn job_cancelled(app: &AppHandle, job_id: &str) -> bool {
    let Some(state) = app.try_state::<AppState>() else {
        return false;
    };
    state
        .cancelled_jobs
        .lock()
        .map(|set| set.contains(job_id))
        .unwrap_or(false)
}

/// Acquire the slot, mark the job running, run `work`, release on exit.
pub fn run_with_slot<F, T>(
    app: &AppHandle,
    job_id: &str,
    kind: &str,
    label: &str,
    work: F,
) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String>,
{
    acquire(app, job_id, kind, label)?;
    let _guard = QueueGuard::new(app.clone(), job_id);
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(db) = state.db.lock() {
            if let Ok(job) = db.update_job_status(job_id, "running", None) {
                let _ = app.emit("jobs://updated", &job);
            }
        }
    }
    work()
}
