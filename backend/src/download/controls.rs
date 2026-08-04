use crate::commands::AppState;
use crate::providers::{self, ProviderKind};
use crate::secrets::{self, TokenProvider};
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

/// Sync Hugging Face token into process memory (or clear it).
pub fn set_stored_hf_token(token: Option<String>) {
    providers::set_stored_token(ProviderKind::HuggingFace, token);
}

/// Sync CivitAI API key into process memory (or clear it).
pub fn set_stored_civitai_token(token: Option<String>) {
    providers::set_stored_token(ProviderKind::CivitAi, token);
}

fn migrate_db_token_to_keyring(db: &crate::db::Db, provider: TokenProvider) -> Result<(), String> {
    let key = provider.setting_key();
    let Ok(Some(db_token)) = db.get_setting(key) else {
        return Ok(());
    };
    let trimmed = db_token.trim();
    if trimmed.is_empty() {
        let _ = db.delete_setting(key);
        return Ok(());
    }
    // Don't overwrite an existing keyring entry; still drop plaintext from DB.
    if secrets::get(provider)?.is_none() {
        secrets::set(provider, trimmed)?;
    }
    db.delete_setting(key)?;
    Ok(())
}

fn load_token_into_memory(provider: TokenProvider) {
    let token = secrets::get(provider).ok().flatten();
    match provider {
        TokenProvider::HuggingFace => set_stored_hf_token(token),
        TokenProvider::CivitAi => set_stored_civitai_token(token),
    }
}

fn load_provider_token(db: &crate::db::Db, provider: TokenProvider) {
    match migrate_db_token_to_keyring(db, provider) {
        Ok(()) => load_token_into_memory(provider),
        Err(e) => {
            log::warn!("provider token migrate ({}): {e}", provider.entry_name());
            // Keep this session working from plaintext until keyring accepts the write.
            if let Ok(Some(token)) = db.get_setting(provider.setting_key()) {
                let trimmed = token.trim();
                if !trimmed.is_empty() {
                    match provider {
                        TokenProvider::HuggingFace => {
                            set_stored_hf_token(Some(trimmed.to_string()))
                        }
                        TokenProvider::CivitAi => {
                            set_stored_civitai_token(Some(trimmed.to_string()))
                        }
                    }
                    return;
                }
            }
            load_token_into_memory(provider);
        }
    }
}

/// Migrate plaintext settings → keyring (once), then load tokens into memory.
pub fn sync_provider_tokens(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Ok(db) = state.db.lock() else {
        return;
    };
    for provider in [TokenProvider::HuggingFace, TokenProvider::CivitAi] {
        load_provider_token(&db, provider);
    }
}

/// Open DB and sync tokens without an AppHandle (app startup before manage).
pub fn migrate_and_load_provider_tokens(db: &crate::db::Db) {
    for provider in [TokenProvider::HuggingFace, TokenProvider::CivitAi] {
        load_provider_token(db, provider);
    }
}
