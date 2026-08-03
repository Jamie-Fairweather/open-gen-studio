use super::types::DownloadSpec;
use crate::blueprints;
use crate::comfy;
use crate::commands::AppState;
use crate::db::{DownloadJobRow, DownloadStepRow};
use crate::loras;
use crate::prompt_tools;
use crate::upscale;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use super::api::emit_snapshot;
use super::worker::notify_worker;

pub(crate) fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub(crate) fn spec_job_key(spec: &DownloadSpec) -> String {
    match spec {
        DownloadSpec::Blueprint { id } => format!("blueprint:{id}"),
        DownloadSpec::Lora { id, arch } => format!("lora:{id}:{arch}"),
        DownloadSpec::Upscale { id } => format!("upscale:{id}"),
        DownloadSpec::PromptTools { provider } => {
            let p = if matches!(
                provider.as_str(),
                "qwenvl" | "qwen3-vl-8b" | "enhancer" | "instruct-gguf" | "joycaption"
            ) {
                prompt_tools::QWENVL_MODEL_ID
            } else {
                provider.as_str()
            };
            format!("prompt-tools:{p}")
        }
        DownloadSpec::Runtime { engine } => format!("runtime:{engine}"),
    }
}

pub(crate) fn spec_title(spec: &DownloadSpec) -> String {
    match spec {
        DownloadSpec::Blueprint { id } => format!("Blueprint {id}"),
        DownloadSpec::Lora { id, arch } => format!("LoRA {id} ({arch})"),
        DownloadSpec::Upscale { id } => format!("Upscale {id}"),
        DownloadSpec::PromptTools { .. } => "Qwen3-VL-8B (Prompt Tools)".into(),
        DownloadSpec::Runtime { .. } => format!("ComfyUI {}", comfy::pinned_version()),
    }
}

pub(crate) fn spec_kind(spec: &DownloadSpec) -> &'static str {
    match spec {
        DownloadSpec::Blueprint { .. } => "blueprint",
        DownloadSpec::Lora { .. } => "lora",
        DownloadSpec::Upscale { .. } => "upscale",
        DownloadSpec::PromptTools { .. } => "promptTools",
        DownloadSpec::Runtime { .. } => "runtime",
    }
}

pub(crate) fn is_ready(app: &AppHandle, spec: &DownloadSpec) -> Result<bool, String> {
    Ok(match spec {
        DownloadSpec::Blueprint { id } => {
            let detail = blueprints::get_detail(app, id)?;
            detail.models_ready >= detail.model_count
        }
        DownloadSpec::Lora { id, arch } => {
            let pack = loras::get_lora(app, id)?;
            let arch_s = arch.as_str();
            pack.variants.iter().any(|v| v.arch == arch_s && v.ready)
        }
        DownloadSpec::Upscale { id } => {
            if id == "usdu" {
                upscale::usdu_at_pin(app)
            } else if id == "supir" {
                upscale::supir_at_pin(app)
            } else {
                upscale::list_upscalers(app)?
                    .into_iter()
                    .any(|m| m.id == *id && m.ready)
            }
        }
        DownloadSpec::PromptTools { provider } => prompt_tools::provider_ready(app, provider),
        DownloadSpec::Runtime { engine } => {
            if engine != comfy::ENGINE {
                return Err(format!("unknown runtime engine: {engine}"));
            }
            // Must match the chosen GPU portable pin (e.g. nvidia vs amd), not just files on disk.
            let Ok(kind) = comfy::portable_kind_for_app(app) else {
                return Ok(false);
            };
            let state = app.state::<AppState>();
            let db = state.db.lock().map_err(|e| e.to_string())?;
            match db.get_runtime_by_engine(comfy::ENGINE)? {
                Some(rt) => {
                    let path = PathBuf::from(&rt.install_path);
                    !rt.install_path.is_empty()
                        && rt.status != "error"
                        && rt.status != "installing"
                        && path.join("python_embeded").join("python.exe").is_file()
                        && comfy::portable_pin_matches(&path, kind.as_str())
                }
                None => false,
            }
        }
    })
}

#[derive(Debug, Clone)]
pub(crate) struct PlannedStep {
    step_kind: String,
    label: String,
    spec: Value,
    bytes_total: Option<i64>,
}

fn http_step(
    label: String,
    url: &str,
    dest: &std::path::Path,
    sha256: Option<&str>,
) -> PlannedStep {
    // Local size only — never HEAD the network here. Blocking probes during
    // enqueue freeze the UI; the worker fills bytes_total via seed_http_totals.
    let bytes_total = dest
        .metadata()
        .ok()
        .map(|m| m.len())
        .filter(|&n| n > 0)
        .map(|n| n as i64);
    PlannedStep {
        step_kind: "http".into(),
        label,
        spec: json!({
            "url": url,
            "dest": dest.to_string_lossy(),
            "filename": dest.file_name().and_then(|n| n.to_str()).unwrap_or(""),
            "sha256": sha256,
        }),
        bytes_total,
    }
}

pub(crate) fn plan_steps(
    app: &AppHandle,
    spec: &DownloadSpec,
    force: bool,
) -> Result<Vec<PlannedStep>, String> {
    match spec {
        DownloadSpec::PromptTools { .. } => {
            let mut steps = vec![
                PlannedStep {
                    step_kind: "git_node".into(),
                    label: "ComfyUI-QwenVL custom node".into(),
                    spec: json!({ "pinId": "qwenvl" }),
                    bytes_total: None,
                },
                PlannedStep {
                    step_kind: "pip".into(),
                    label: "QwenVL Python dependencies".into(),
                    spec: json!({ "action": "qwenvl_deps" }),
                    bytes_total: None,
                },
            ];
            for (filename, url, dest) in prompt_tools::qwenvl_http_files(app)? {
                steps.push(http_step(filename, &url, &dest, None));
            }
            Ok(steps)
        }
        DownloadSpec::Blueprint { id } => {
            let (_dir, manifest) = blueprints::load_manifest(app, id)?;
            let models_root = comfy::models_dir(app)?;
            let mut steps = Vec::new();
            if !manifest.custom_nodes.is_empty() {
                steps.push(PlannedStep {
                    step_kind: "action".into(),
                    label: "Install custom nodes".into(),
                    spec: json!({ "action": "blueprint_nodes", "id": id }),
                    bytes_total: None,
                });
            }
            for model in &manifest.models {
                if model.url.trim().is_empty() {
                    continue;
                }
                if model.filename.is_empty()
                    || model.path.is_empty()
                    || model.filename.contains("..")
                    || model.path.contains("..")
                    || model.filename.contains('/')
                    || model.filename.contains('\\')
                    || std::path::Path::new(&model.path).is_absolute()
                {
                    return Err(format!("invalid model entry: {}", model.filename));
                }
                let dest = models_root.join(&model.path).join(&model.filename);
                steps.push(http_step(
                    model.filename.clone(),
                    &model.url,
                    &dest,
                    model.sha256.as_deref(),
                ));
            }
            if steps.is_empty() {
                // Local-only manifests still need the legacy install path.
                steps.push(PlannedStep {
                    step_kind: "action".into(),
                    label: format!("Install blueprint {id}"),
                    spec: json!({ "action": "blueprint", "id": id }),
                    bytes_total: None,
                });
            }
            Ok(steps)
        }
        DownloadSpec::Lora { id, arch } => {
            let plan = loras::variant_download(app, id, arch.as_str())?;
            Ok(vec![http_step(
                plan.filename.clone(),
                &plan.url,
                &plan.dest,
                None,
            )])
        }
        DownloadSpec::Upscale { id } => {
            let mut steps = Vec::new();
            if let Some(pin) = upscale::node_pin_for_download(id) {
                steps.push(PlannedStep {
                    step_kind: "git_node".into(),
                    label: if pin == "usdu" {
                        "Ultimate SD Upscale".into()
                    } else {
                        "SUPIR custom node".into()
                    },
                    spec: json!({ "pinId": pin }),
                    bytes_total: None,
                });
            }
            if id != "usdu" && id != "supir" {
                for (filename, url, dest) in upscale::http_files(app, id)? {
                    steps.push(http_step(filename, &url, &dest, None));
                }
            }
            if steps.is_empty() {
                return Err(format!("Unknown upscale id: {id}"));
            }
            Ok(steps)
        }
        DownloadSpec::Runtime { engine } => {
            if engine != comfy::ENGINE {
                return Err(format!("unknown runtime engine: {engine}"));
            }
            let kind = comfy::portable_kind_for_app(app)?;
            let url = comfy::resolve_portable_url(kind)?;
            let dest = comfy::portable_archive_path(app, kind)?;
            let ver = comfy::pinned_version();
            Ok(vec![
                http_step(
                    format!("Download ComfyUI {ver} ({})", kind.as_str()),
                    url,
                    &dest,
                    None,
                ),
                PlannedStep {
                    step_kind: "action".into(),
                    label: "Extract".into(),
                    spec: json!({
                        "action": "runtime_extract",
                        "engine": engine,
                        "force": force,
                    }),
                    bytes_total: None,
                },
                PlannedStep {
                    step_kind: "action".into(),
                    label: "Configure".into(),
                    spec: json!({
                        "action": "runtime_configure",
                        "engine": engine,
                        "force": force,
                    }),
                    bytes_total: None,
                },
                PlannedStep {
                    step_kind: "action".into(),
                    label: "Install extensions".into(),
                    spec: json!({ "action": "runtime_extensions", "engine": engine }),
                    bytes_total: None,
                },
            ])
        }
    }
}

pub(crate) fn enrich_title(app: &AppHandle, spec: &DownloadSpec) -> String {
    match spec {
        DownloadSpec::Blueprint { id } => blueprints::get_detail(app, id)
            .map(|b| b.name)
            .unwrap_or_else(|_| spec_title(spec)),
        DownloadSpec::Lora { id, arch } => loras::get_lora(app, id)
            .map(|p| format!("{} ({arch})", p.name))
            .unwrap_or_else(|_| spec_title(spec)),
        DownloadSpec::Upscale { id } => {
            if id == "usdu" {
                "Ultimate SD Upscale".into()
            } else if id == "supir" {
                "SUPIR".into()
            } else {
                upscale::list_upscalers(app)
                    .ok()
                    .and_then(|list| list.into_iter().find(|m| m.id == *id))
                    .map(|m| m.name)
                    .unwrap_or_else(|| spec_title(spec))
            }
        }
        DownloadSpec::Runtime { .. } => format!("ComfyUI {}", comfy::pinned_version()),
        DownloadSpec::PromptTools { .. } => spec_title(spec),
    }
}

pub(crate) fn enqueue_job(
    app: &AppHandle,
    spec: &DownloadSpec,
    force: bool,
) -> Result<String, String> {
    let job_key = spec_job_key(spec);
    let title = enrich_title(app, spec);
    let kind = spec_kind(spec).to_string();
    let planned = plan_steps(app, spec, force)?;
    let ts = now_secs();
    let job_id = Uuid::new_v4().to_string();

    {
        let state = app.state::<AppState>();
        let db = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(existing) = db.get_download_job_by_key(&job_key)? {
            if matches!(existing.status.as_str(), "queued" | "running" | "paused") {
                return Ok(existing.id);
            }
            // Terminal job with same key - allow re-enqueue by deleting old row.
            let _ = db.delete_download_job(&existing.id);
        }
        let sort = db.next_download_sort_order()?;
        db.insert_download_job(&DownloadJobRow {
            id: job_id.clone(),
            job_key,
            title,
            kind,
            status: "queued".into(),
            error: None,
            sort_order: sort,
            created_at: ts,
            updated_at: ts,
            started_at: None,
            finished_at: None,
        })?;
        for (i, step) in planned.iter().enumerate() {
            db.insert_download_step(&DownloadStepRow {
                id: Uuid::new_v4().to_string(),
                job_id: job_id.clone(),
                idx: i as i64,
                step_kind: step.step_kind.clone(),
                label: step.label.clone(),
                spec_json: step.spec.to_string(),
                status: "queued".into(),
                bytes_done: 0,
                bytes_total: step.bytes_total,
                error: None,
                updated_at: ts,
            })?;
        }
    }
    notify_worker();
    emit_snapshot(app);
    Ok(job_id)
}
