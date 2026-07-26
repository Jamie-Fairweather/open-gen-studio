use crate::comfy::ProcessState;
use crate::db::Db;
use std::collections::HashSet;
use std::sync::Mutex;

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
    /// Active prompt-tools install id (e.g. `"qwen3-vl-8b"`), if any.
    pub prompt_tools_install_busy: Mutex<Option<String>>,
    /// Job ids the user asked to cancel.
    pub cancelled_jobs: Mutex<HashSet<String>>,
}
