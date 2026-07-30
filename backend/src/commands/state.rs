use crate::comfy::ProcessState;
use crate::db::Db;
use std::collections::HashSet;
use std::sync::Mutex;

pub struct AppState {
    pub db: Mutex<Db>,
    pub processes: Mutex<ProcessState>,
    pub comfy_install_busy: Mutex<bool>,
    /// Job ids the user asked to cancel.
    pub cancelled_jobs: Mutex<HashSet<String>>,
}
