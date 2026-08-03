//! Serial ComfyUI work queue shared by generate + Prompt Tools.
//! Only one job holds the GPU slot at a time; others wait without failing.
//! A paused job can hold the lane so waiting work does not start.

use crate::commands::AppState;
use crate::ipc::{JobQueueItem, JobQueueSnapshot};
use std::collections::VecDeque;
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

struct QueueInner {
    waiting: VecDeque<JobQueueItem>,
    running: Option<JobQueueItem>,
    /// Blocks promotion while set (paused active job).
    paused_holder: Option<JobQueueItem>,
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
            paused_holder: None,
        }),
        cv: Condvar::new(),
    })
}

fn snapshot_from(inner: &QueueInner) -> JobQueueSnapshot {
    let mut items = Vec::with_capacity(inner.waiting.len() + 2);
    if let Some(ref paused) = inner.paused_holder {
        items.push(paused.clone());
    } else if let Some(ref running) = inner.running {
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

fn job_paused(app: &AppHandle, job_id: &str) -> bool {
    let Some(state) = app.try_state::<AppState>() else {
        return false;
    };
    state
        .paused_jobs
        .lock()
        .map(|set| set.contains(job_id))
        .unwrap_or(false)
}

fn truncate_prompt(s: &str, max: usize) -> String {
    let trimmed = s.trim();
    if trimmed.chars().count() <= max {
        return trimmed.to_string();
    }
    let mut out: String = trimmed.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

fn json_num(v: &serde_json::Value) -> Option<i64> {
    v.as_i64()
        .or_else(|| v.as_u64().map(|n| n as i64))
        .or_else(|| v.as_f64().map(|n| n as i64))
        .or_else(|| v.as_str()?.parse().ok())
}

/// Derive prompt + meta lines from a job's stored params.
pub fn summarize_params(kind: &str, params_json: &str) -> (Option<String>, Option<String>) {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(params_json) else {
        return (None, None);
    };
    if kind == "generate" {
        let values = v
            .get("values")
            .cloned()
            .unwrap_or_else(|| serde_json::json!({}));
        let prompt = values
            .get("prompt")
            .and_then(|p| p.as_str())
            .filter(|s| !s.trim().is_empty())
            .map(|s| truncate_prompt(s, 160));
        let w = values.get("width").and_then(json_num);
        let h = values.get("height").and_then(json_num);
        let seed = values.get("seed").and_then(json_num);
        let mut parts = Vec::new();
        if let (Some(w), Some(h)) = (w, h) {
            parts.push(format!("{w}×{h}"));
        }
        if let Some(seed) = seed {
            parts.push(format!("seed {seed}"));
        }
        let meta = if parts.is_empty() {
            None
        } else {
            Some(parts.join(" · "))
        };
        return (prompt, meta);
    }

    // Prompt tools
    let prompt = v
        .get("prompt")
        .and_then(|p| p.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| truncate_prompt(s, 160));
    let format = v.get("format").and_then(|x| x.as_str());
    let mode = v.get("mode").and_then(|x| x.as_str());
    let image = v.get("imagePath").and_then(|x| x.as_str()).map(|p| {
        std::path::Path::new(p)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(p)
            .to_string()
    });
    let mut parts = Vec::new();
    if let Some(f) = format {
        parts.push(f.to_string());
    }
    if let Some(m) = mode {
        parts.push(m.to_string());
    }
    if let Some(img) = image {
        parts.push(img);
    }
    let meta = if parts.is_empty() {
        None
    } else {
        Some(parts.join(" · "))
    };
    (prompt, meta)
}

fn load_queue_summary(app: &AppHandle, job_id: &str) -> (Option<String>, Option<String>) {
    let Some(state) = app.try_state::<AppState>() else {
        return (None, None);
    };
    let Ok(db) = state.db.lock() else {
        return (None, None);
    };
    match db.get_job(job_id) {
        Ok(Some(job)) => summarize_params(&job.kind, &job.params_json),
        _ => (None, None),
    }
}

pub fn make_item(
    app: &AppHandle,
    job_id: impl Into<String>,
    kind: impl Into<String>,
    label: impl Into<String>,
    status: impl Into<String>,
) -> JobQueueItem {
    let job_id = job_id.into();
    let kind = kind.into();
    let (prompt, meta) = load_queue_summary(app, &job_id);
    JobQueueItem {
        job_id,
        kind,
        label: label.into(),
        status: status.into(),
        prompt,
        meta,
    }
}

/// Wait until this job is at the front and the GPU slot is free.
/// Returns Err("cancelled") if the user cancelled while waiting.
/// Returns Err("paused") if the user paused while waiting.
pub fn acquire(
    app: &AppHandle,
    job_id: &str,
    kind: &str,
    label: &str,
    front: bool,
) -> Result<(), String> {
    let q = queue();
    {
        let mut inner = q.inner.lock().map_err(|e| e.to_string())?;
        if inner
            .waiting
            .iter()
            .chain(inner.running.iter())
            .chain(inner.paused_holder.iter())
            .any(|i| i.job_id == job_id)
        {
            return Err("job already in queue".into());
        }
        let item = make_item(app, job_id, kind, label, "queued");
        if front {
            inner.waiting.push_front(item);
        } else {
            inner.waiting.push_back(item);
        }
        emit_snapshot(app, &inner);
        q.cv.notify_all();
    }

    loop {
        if job_cancelled(app, job_id) {
            remove(app, job_id);
            return Err(if job_paused(app, job_id) {
                "paused".into()
            } else {
                "cancelled".into()
            });
        }
        let mut inner = q.inner.lock().map_err(|e| e.to_string())?;
        let is_front = inner
            .waiting
            .front()
            .map(|i| i.job_id == job_id)
            .unwrap_or(false);
        let lane_free = inner.running.is_none() && inner.paused_holder.is_none();
        if lane_free && is_front {
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

/// Drop every lane entry and emit an empty snapshot (clear-queue / hard sync).
pub fn clear_all(app: &AppHandle) {
    let q = queue();
    let Ok(mut inner) = q.inner.lock() else {
        return;
    };
    let had_work =
        inner.running.is_some() || inner.paused_holder.is_some() || !inner.waiting.is_empty();
    inner.running = None;
    inner.paused_holder = None;
    inner.waiting.clear();
    // Always emit so a stale frontend can resync even if memory was already empty.
    emit_snapshot(app, &inner);
    if had_work {
        q.cv.notify_all();
    }
}

/// Release the running slot, or convert it into a paused lane holder.
pub fn release_or_park_paused(app: &AppHandle, job_id: &str) {
    if job_paused(app, job_id) {
        let q = queue();
        let Ok(mut inner) = q.inner.lock() else {
            return;
        };
        if inner
            .running
            .as_ref()
            .map(|r| r.job_id == job_id)
            .unwrap_or(false)
        {
            if let Some(mut item) = inner.running.take() {
                item.status = "paused".into();
                inner.paused_holder = Some(item);
                emit_snapshot(app, &inner);
                // Do not notify waiters — lane stays blocked.
                return;
            }
        }
    }
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
    if inner
        .paused_holder
        .as_ref()
        .map(|r| r.job_id == job_id)
        .unwrap_or(false)
    {
        inner.paused_holder = None;
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

/// Reorder waiting jobs to match `ordered_ids` (must be a permutation of current waiting ids).
pub fn reorder_waiting(app: &AppHandle, ordered_ids: &[String]) -> Result<(), String> {
    let q = queue();
    let mut inner = q.inner.lock().map_err(|e| e.to_string())?;
    let current: Vec<String> = inner.waiting.iter().map(|i| i.job_id.clone()).collect();
    if ordered_ids.len() != current.len() {
        return Err("reorder list must include every waiting job".into());
    }
    let mut seen = std::collections::HashSet::new();
    for id in ordered_ids {
        if !current.iter().any(|c| c == id) {
            return Err(format!("unknown waiting job: {id}"));
        }
        if !seen.insert(id.as_str()) {
            return Err("duplicate job id in reorder list".into());
        }
    }
    let mut by_id: std::collections::HashMap<String, JobQueueItem> = inner
        .waiting
        .drain(..)
        .map(|i| (i.job_id.clone(), i))
        .collect();
    for id in ordered_ids {
        if let Some(item) = by_id.remove(id) {
            inner.waiting.push_back(item);
        }
    }
    emit_snapshot(app, &inner);
    q.cv.notify_all();
    Ok(())
}

/// Restore a paused lane holder after app restart (blocks waiting jobs).
pub fn restore_paused_holder(app: &AppHandle, item: JobQueueItem) {
    let q = queue();
    let Ok(mut inner) = q.inner.lock() else {
        return;
    };
    inner.paused_holder = Some(item);
    emit_snapshot(app, &inner);
}

/// Take the paused lane holder so it can be re-enqueued at the front.
pub fn take_paused_holder(app: &AppHandle, job_id: &str) -> Option<JobQueueItem> {
    let q = queue();
    let Ok(mut inner) = q.inner.lock() else {
        return None;
    };
    let matches = inner
        .paused_holder
        .as_ref()
        .map(|p| p.job_id == job_id)
        .unwrap_or(false);
    if !matches {
        return None;
    }
    let item = inner.paused_holder.take();
    emit_snapshot(app, &inner);
    q.cv.notify_all();
    item
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
        release_or_park_paused(&self.app, &self.job_id);
    }
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
    run_with_slot_opts(app, job_id, kind, label, false, work)
}

pub fn run_with_slot_front<F, T>(
    app: &AppHandle,
    job_id: &str,
    kind: &str,
    label: &str,
    work: F,
) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String>,
{
    run_with_slot_opts(app, job_id, kind, label, true, work)
}

fn run_with_slot_opts<F, T>(
    app: &AppHandle,
    job_id: &str,
    kind: &str,
    label: &str,
    front: bool,
    work: F,
) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String>,
{
    acquire(app, job_id, kind, label, front)?;
    let _guard = QueueGuard::new(app.clone(), job_id);
    if job_cancelled(app, job_id) {
        if job_paused(app, job_id) {
            return Err("paused".into());
        }
        return Err("cancelled".into());
    }
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(db) = state.db.lock() {
            if let Ok(job) = db.update_job_status(job_id, "running", None) {
                let _ = app.emit("jobs://updated", &job);
            }
        }
    }
    let result = work();
    if result.is_err() && job_cancelled(app, job_id) && job_paused(app, job_id) {
        return Err("paused".into());
    }
    if matches!(&result, Err(e) if e == "cancelled") && job_paused(app, job_id) {
        return Err("paused".into());
    }
    result
}
