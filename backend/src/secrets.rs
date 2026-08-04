//! OS credential store for provider API tokens (Windows Credential Manager, etc.).

use keyring::Entry;
use serde::{Deserialize, Serialize};
use specta::Type;

const SERVICE: &str = "Open Gen Studio";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum TokenProvider {
    HuggingFace,
    CivitAi,
}

impl TokenProvider {
    pub fn entry_name(self) -> &'static str {
        match self {
            Self::HuggingFace => "huggingface_token",
            Self::CivitAi => "civitai_api_key",
        }
    }

    pub fn setting_key(self) -> &'static str {
        self.entry_name()
    }
}

fn entry(provider: TokenProvider) -> Result<Entry, String> {
    Entry::new(SERVICE, provider.entry_name()).map_err(|e| e.to_string())
}

pub fn get(provider: TokenProvider) -> Result<Option<String>, String> {
    match entry(provider)?.get_password() {
        Ok(password) => {
            let trimmed = password.trim().to_string();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                Ok(Some(trimmed))
            }
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Store a token; empty/whitespace clears the entry.
pub fn set(provider: TokenProvider, value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return delete(provider);
    }
    entry(provider)?
        .set_password(trimmed)
        .map_err(|e| e.to_string())
}

pub fn delete(provider: TokenProvider) -> Result<(), String> {
    match entry(provider)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn has(provider: TokenProvider) -> bool {
    matches!(get(provider), Ok(Some(_)))
}
