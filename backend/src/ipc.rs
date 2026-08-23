//! Shared IPC event/status DTOs (and helpers) used by emitters + Specta export.
//!
//! Command bindings + most types come from tauri-specta (`npm run ipc:types` /
//! debug export). Types that only appear on events are registered via
//! `commands::specta_builder().typ::<…>()`.

use crate::prompt_tools::PromptToolResult;
use serde::{Deserialize, Serialize};
use specta::Type;

/// `jobs://progress` payload (generate + prompt tools).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct JobProgress {
    /// Host job id this event belongs to.
    pub job_id: String,
    /// Stage id (`start`, `step`, `preview`, `done`, `error`, …).
    pub stage: String,
    /// Human-readable status line for the toast / runtime strip.
    pub message: String,
    /// Current sampler step when `stage` is `step`.
    #[serde(default)]
    pub step: Option<u32>,
    /// Sampler step count when `stage` is `step`.
    #[serde(default)]
    pub max: Option<u32>,
    /// Live-preview file under the gallery previews dir.
    #[serde(default)]
    pub preview_path: Option<String>,
    /// Prompt-tools text result when the job produced a string.
    #[serde(default)]
    pub text: Option<String>,
    /// Structured prompt-tools result (enhance / image-to-prompt).
    #[serde(default)]
    pub result: Option<PromptToolResult>,
}

impl JobProgress {
    /// Progress event with no step / preview / result yet.
    pub fn new(
        job_id: impl Into<String>,
        stage: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            job_id: job_id.into(),
            stage: stage.into(),
            message: message.into(),
            step: None,
            max: None,
            preview_path: None,
            text: None,
            result: None,
        }
    }
}

/// `loras://progress` payload.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LoraProgress {
    /// Official or user LoRA pack id.
    pub lora_id: String,
    /// Recipe arch this variant is installing for.
    pub arch: crate::recipe::RecipeArch,
    /// Install stage (`download`, `done`, `error`, …).
    pub stage: String,
    /// Status line for the catalog toast.
    pub message: String,
    /// Weight filename when a specific file is in flight.
    #[serde(default)]
    pub filename: Option<String>,
}

/// `prompt-tools://progress` payload.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PromptToolsProgress {
    /// Ensure / run stage (`download`, `python`, `done`, `error`, …).
    pub stage: String,
    /// Status line for the tools toast.
    pub message: String,
    /// Weight id being installed or used.
    pub model_id: String,
    /// Provider that owns the weight (`qwenvl`, …).
    #[serde(default)]
    pub provider_id: Option<String>,
    /// Weight filename when a specific file is in flight.
    #[serde(default)]
    pub filename: Option<String>,
}

/// Return type of `comfyui_status`.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ComfyStatus {
    /// OS process is running (may still be booting).
    pub process_alive: bool,
    /// HTTP `/system_stats` succeeded on `port`.
    pub healthy: bool,
    /// Port the portable listen on (default 8188).
    pub port: u16,
    /// DB row for this install, when one exists.
    pub runtime: Option<crate::db::RuntimeInstall>,
}

/// One entry in the serial ComfyUI work queue (`jobs://queue`).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct JobQueueItem {
    /// Host job id.
    pub job_id: String,
    /// Queue kind (`generate`, `prompt-tools`, …).
    pub kind: String,
    /// Short chip label.
    pub label: String,
    /// Queue status (`waiting`, `running`, `paused`, …).
    pub status: String,
    /// Truncated positive prompt (generate / enhance), when known.
    pub prompt: Option<String>,
    /// Compact settings line, e.g. `1024×1024 · seed 0`.
    pub meta: Option<String>,
}

/// Snapshot of generate + Prompt Tools jobs waiting for / holding the GPU slot.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct JobQueueSnapshot {
    /// Queue in display order (running first, then waiting).
    pub items: Vec<JobQueueItem>,
}

/// Finished job row for the expand History view (with linked gallery items).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct JobHistoryItem {
    /// Host job id.
    pub job_id: String,
    /// Job kind (`generate`, `prompt-tools`, …).
    pub kind: String,
    /// Short history-row label.
    pub label: String,
    /// Terminal status (`completed`, `failed`, `cancelled`).
    pub status: String,
    /// Failure text when `status` is `failed`.
    pub error: Option<String>,
    /// Original submit params (JSON object as a string).
    pub params_json: String,
    /// Unix seconds when the job was created.
    pub created_at: i64,
    /// Unix seconds of the last status write.
    pub updated_at: i64,
    /// Gallery rows produced by this job (empty if none / deleted).
    pub gallery_items: Vec<crate::db::GalleryItem>,
}

/// Append `RECIPE_ARCHES` const to a Specta-generated TypeScript file.
///
/// # Errors
///
/// Returns an error if the file cannot be read or rewritten.
pub fn append_recipe_arches_const(ts_path: &std::path::Path) -> Result<(), String> {
    use crate::recipe::RecipeArch;
    use std::fs;
    use std::io::Write;

    let mut body = fs::read_to_string(ts_path).map_err(|e| e.to_string())?;
    // Drop a previous stamp if regenerating over an existing file.
    if let Some(idx) = body.find("\nexport const RECIPE_ARCHES") {
        body.truncate(idx);
    } else if let Some(idx) = body.find("export const RECIPE_ARCHES") {
        body.truncate(idx);
    }
    body = body.trim_end().to_string();
    body.push('\n');

    let items = RecipeArch::ALL
        .iter()
        .map(|a| format!("  \"{}\"", a.as_str()))
        .collect::<Vec<_>>()
        .join(",\n");

    let mut file = fs::OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(ts_path)
        .map_err(|e| e.to_string())?;

    writeln!(
        file,
        "{body}\n\
         /** Closed set of recipe arch ids - generated from `RecipeArch::ALL`. */\n\
         export const RECIPE_ARCHES = [\n{items}\n] as const satisfies readonly RecipeArch[]\n"
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Export TypeScript bindings (commands + types + RECIPE_ARCHES).
///
/// # Errors
///
/// Returns an error if Specta export fails or the generated files cannot be written.
pub fn export_typescript_bindings() -> Result<(), String> {
    use specta_typescript::Typescript;
    use std::path::PathBuf;

    let out =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../frontend/lib/generated/bindings.ts");
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let builder = crate::commands::specta_builder()
        .dangerously_cast_bigints_to_number()
        .disable_serde_phases();
    builder
        .export(Typescript::default(), &out)
        .map_err(|e| e.to_string())?;

    append_recipe_arches_const(&out)?;

    // Keep legacy path as a thin re-export so old imports keep working during migration.
    let ipc = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../frontend/lib/generated/ipc.ts");
    fs::write(
        &ipc,
        "// Regenerated by `npm run ipc:types` - do not edit.\n\
         // Prefer `@/lib/generated/bindings` (commands + types).\n\
         export * from \"./bindings\"\n",
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

use std::fs;

#[cfg(test)]
mod export_tests {
    #[test]
    fn export_ipc_types() {
        super::export_typescript_bindings().expect("export TypeScript IPC bindings");
    }
}
