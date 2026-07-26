//! Blocking Image→Prompt and Prompt Enhancer pipelines.

use super::ensure::{
    emit_progress, ensure_comfy_with_nodes, ensure_provider, provider_required_nodes,
};
use super::io::stage_input_image;
use super::types::{
    provider_for_format, PromptFormat, PromptTarget, PromptToolResult, Provider,
    RunImageToPromptArgs, RunPromptEnhanceArgs,
};
use super::workflows::{build_enhance_workflow, build_workflow};
use crate::comfy::ProcessState;
use crate::db::{Db, Job, RuntimeInstall};
use crate::generate;
use serde_json::json;
use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

fn reject_model_error_text(text: &str) -> Result<String, String> {
    let t = text.trim();
    let lower = t.to_ascii_lowercase();
    if lower.starts_with("error loading model")
        || lower.starts_with("error:")
        || lower.contains("error loading model:")
        || lower.contains("object has no attribute")
        || lower.contains("qwen3vlchathandler")
    {
        return Err(format!(
            "QwenVL failed to load: {t}. Dependencies were installed — if this persists, restart ComfyUI from Settings and retry."
        ));
    }
    Ok(t.to_string())
}

fn refuse_if_generate_running(db: &Mutex<Db>) -> Result<(), String> {
    let jobs = {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.list_jobs()?
    };
    if jobs
        .iter()
        .any(|j| j.kind == "generate" && (j.status == "running" || j.status == "queued"))
    {
        return Err(
            "A generate job is running — wait for it to finish before using Prompt Tools".into(),
        );
    }
    Ok(())
}

fn suggest_negative(target: PromptTarget, _format: PromptFormat) -> Option<String> {
    if matches!(target, PromptTarget::StableDiffusion) {
        Some("blurry, low quality, distorted, watermark, text artifacts, extra limbs".into())
    } else {
        None
    }
}

pub(crate) fn job_cancelled(cancelled: &Mutex<HashSet<String>>, job_id: &str) -> bool {
    cancelled
        .lock()
        .map(|set| set.contains(job_id))
        .unwrap_or(false)
}

/// Blocking image→prompt pipeline.
pub fn run_image_to_prompt(
    app: &AppHandle,
    db: &Mutex<Db>,
    processes: &Mutex<ProcessState>,
    cancelled: &Mutex<HashSet<String>>,
    job: &Job,
    args: &RunImageToPromptArgs,
    runtime: &RuntimeInstall,
) -> Result<PromptToolResult, String> {
    refuse_if_generate_running(db)?;
    let format = PromptFormat::from_str(&args.format)?;
    let target = PromptTarget::from_str(&args.target)?.resolve(args.arch.as_deref());
    let provider = provider_for_format(format);

    emit_progress(
        app,
        "prepare",
        "Preparing Prompt Tools…",
        Some(json!({ "jobId": job.id, "provider": provider.id() })),
    );
    let dl = crate::download_manager::ensure(
        app,
        crate::download_manager::DownloadSpec::PromptTools {
            provider: provider.pin_id().into(),
        },
        crate::download_manager::EnsureOpts { wait: true },
    )?;
    if matches!(dl.status.as_str(), "error" | "cancelled") {
        return Err(dl
            .message
            .unwrap_or_else(|| format!("Prompt Tools install {}", dl.status)));
    }
    let ensured = ensure_provider(app, provider.pin_id())?;
    let port = ensure_comfy_with_nodes(
        app,
        db,
        processes,
        runtime,
        provider_required_nodes(provider),
        ensured.restart_comfy,
    )?;
    emit_progress(
        app,
        "free",
        "Freeing VRAM before tool run…",
        Some(json!({ "jobId": job.id })),
    );
    let _ = generate::free_vram(port);

    let filename = stage_input_image(app, &args.image_path)?;
    let workflow = build_workflow(format, target, &filename)?;

    if job_cancelled(cancelled, &job.id) {
        return Err("cancelled".into());
    }

    let client_id = Uuid::new_v4().to_string();
    emit_progress(
        app,
        "queue",
        "Running image→prompt…",
        Some(json!({ "jobId": job.id })),
    );
    let prompt_id = generate::queue_prompt(port, &workflow, &client_id)?;
    let text = reject_model_error_text(&generate::wait_for_text(
        port,
        &prompt_id,
        Duration::from_secs(20 * 60),
        cancelled,
        &job.id,
    )?)?;

    emit_progress(
        app,
        "free",
        "Freeing tool models from VRAM…",
        Some(json!({ "jobId": job.id })),
    );
    let _ = generate::free_vram(port);

    let _ = app.emit(
        "jobs://progress",
        json!({
            "jobId": job.id,
            "stage": "done",
            "message": "Prompt ready",
            "text": text,
        }),
    );

    Ok(PromptToolResult {
        prompt: text,
        negative: suggest_negative(target, format),
        provider: provider.id().into(),
        format: format.as_str().into(),
        target: match target {
            PromptTarget::Auto => "auto",
            PromptTarget::Flux => "flux",
            PromptTarget::StableDiffusion => "stableDiffusion",
            PromptTarget::Ideogram => "ideogram",
            PromptTarget::ZImageKrea => "zImageKrea",
        }
        .into(),
    })
}

/// Blocking prompt enhance pipeline.
pub fn run_prompt_enhance(
    app: &AppHandle,
    db: &Mutex<Db>,
    processes: &Mutex<ProcessState>,
    cancelled: &Mutex<HashSet<String>>,
    job: &Job,
    args: &RunPromptEnhanceArgs,
    runtime: &RuntimeInstall,
) -> Result<PromptToolResult, String> {
    refuse_if_generate_running(db)?;
    let prompt = args.prompt.trim();
    if prompt.is_empty() {
        return Err("Prompt is empty — use Image to Prompt or type an idea first".into());
    }
    let target = PromptTarget::from_str(&args.target)?.resolve(args.arch.as_deref());
    let mode = args.mode.as_deref().unwrap_or("expand");

    emit_progress(
        app,
        "prepare",
        "Preparing Prompt Enhancer…",
        Some(json!({ "jobId": job.id })),
    );
    let dl = crate::download_manager::ensure(
        app,
        crate::download_manager::DownloadSpec::PromptTools {
            provider: "qwenvl".into(),
        },
        crate::download_manager::EnsureOpts { wait: true },
    )?;
    if matches!(dl.status.as_str(), "error" | "cancelled") {
        return Err(dl
            .message
            .unwrap_or_else(|| format!("Prompt Tools install {}", dl.status)));
    }
    let ensured = ensure_provider(app, "qwenvl")?;
    let port = ensure_comfy_with_nodes(
        app,
        db,
        processes,
        runtime,
        provider_required_nodes(Provider::QwenVl),
        ensured.restart_comfy,
    )?;
    emit_progress(
        app,
        "free",
        "Freeing VRAM before tool run…",
        Some(json!({ "jobId": job.id })),
    );
    let _ = generate::free_vram(port);

    let workflow = build_enhance_workflow(prompt, target, mode);
    if job_cancelled(cancelled, &job.id) {
        return Err("cancelled".into());
    }

    let client_id = Uuid::new_v4().to_string();
    emit_progress(
        app,
        "queue",
        "Enhancing prompt…",
        Some(json!({ "jobId": job.id })),
    );
    let prompt_id = generate::queue_prompt(port, &workflow, &client_id)?;
    let text = reject_model_error_text(&generate::wait_for_text(
        port,
        &prompt_id,
        Duration::from_secs(15 * 60),
        cancelled,
        &job.id,
    )?)?;

    emit_progress(
        app,
        "free",
        "Freeing tool models from VRAM…",
        Some(json!({ "jobId": job.id })),
    );
    let _ = generate::free_vram(port);

    let _ = app.emit(
        "jobs://progress",
        json!({
            "jobId": job.id,
            "stage": "done",
            "message": "Enhanced prompt ready",
            "text": text,
        }),
    );

    Ok(PromptToolResult {
        prompt: text,
        negative: suggest_negative(target, PromptFormat::General),
        provider: Provider::QwenVl.id().into(),
        format: "enhance".into(),
        target: match target {
            PromptTarget::Auto => "auto",
            PromptTarget::Flux => "flux",
            PromptTarget::StableDiffusion => "stableDiffusion",
            PromptTarget::Ideogram => "ideogram",
            PromptTarget::ZImageKrea => "zImageKrea",
        }
        .into(),
    })
}
