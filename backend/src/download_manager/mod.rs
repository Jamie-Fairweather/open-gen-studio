//! Persistent Download Manager: SQLite-backed queue, pause/resume, shared ensure API.

mod api;
mod plan;
mod steps;
mod types;
mod worker;

pub(crate) const EVENT_MANAGER: &str = "downloads://manager";
pub(crate) const HISTORY_KEEP: i64 = 50;

pub use api::{cancel_job, ensure, pause_job, resume_job, snapshot};
#[allow(unused_imports)]
pub use types::{
    DownloadJobView, DownloadSnapshot, DownloadSpec, DownloadStepView, EnsureOpts, EnsureResult,
};
pub use worker::start_worker;
