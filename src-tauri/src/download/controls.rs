use crate::commands::AppState;
use crate::providers::{self, ProviderKind};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};

/// Cooperative cancel / pause for the active HTTP transfer (single-flight worker).
static DOWNLOAD_CANCEL: AtomicBool = AtomicBool::new(false);
static DOWNLOAD_PAUSE: AtomicBool = AtomicBool::new(false);

/// Request cancel of the current download(s). Cleared when a new install starts.
pub fn request_cancel() {
    DOWNLOAD_CANCEL.store(true, Ordering::SeqCst);
}

pub fn clear_cancel() {
    DOWNLOAD_CANCEL.store(false, Ordering::SeqCst);
    DOWNLOAD_PAUSE.store(false, Ordering::SeqCst);
}

pub fn is_cancelled() -> bool {
    DOWNLOAD_CANCEL.load(Ordering::SeqCst)
}

pub fn request_pause() {
    DOWNLOAD_PAUSE.store(true, Ordering::SeqCst);
}

pub fn clear_pause() {
    DOWNLOAD_PAUSE.store(false, Ordering::SeqCst);
}

pub fn is_paused() -> bool {
    DOWNLOAD_PAUSE.load(Ordering::SeqCst)
}

/// Clear both signals before the worker starts a job.
pub fn clear_transfer_controls() {
    clear_cancel();
}

/// Sync Hugging Face token from Settings DB (or clear it).
pub fn set_stored_hf_token(token: Option<String>) {
    providers::set_stored_token(ProviderKind::HuggingFace, token);
}

/// Sync CivitAI API key from Settings DB (or clear it).
pub fn set_stored_civitai_token(token: Option<String>) {
    providers::set_stored_token(ProviderKind::CivitAi, token);
}

/// Reload provider tokens from Settings so downloads always use the latest keys.
pub fn sync_provider_tokens_from_db(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Ok(db) = state.db.lock() else {
        return;
    };
    if let Ok(token) = db.get_setting(crate::providers::SETTING_HF_TOKEN) {
        set_stored_hf_token(token);
    }
    if let Ok(token) = db.get_setting(crate::providers::SETTING_CIVITAI_TOKEN) {
        set_stored_civitai_token(token);
    }
}
