use crate::comfy::ProcessState;
use crate::db::Db;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};

pub struct AppState {
    pub db: Mutex<Db>,
    pub processes: Mutex<ProcessState>,
    /// Job ids the user asked to cancel.
    pub cancelled_jobs: Mutex<HashSet<String>>,
    /// Generate jobs with a live worker thread (DB rows alone can lie after panic).
    pub active_generate_jobs: Arc<Mutex<HashSet<String>>>,
}
