//! Provider readiness, weight downloads, pip deps, and Comfy node checks.

use super::types::{
    EnsureOutcome, PromptToolWeightInfo, Provider, QWENVL_HF_FILES, QWENVL_HF_REPO,
    QWENVL_MODEL_ID, QWENVL_MODEL_NAME,
};
use crate::comfy::{self, ProcessState};
use crate::db::{Db, RuntimeInstall};
use crate::download;
use crate::pins;
use crate::process_cmd;
use crate::upscale;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub(crate) const EVENT_PROGRESS: &str = "prompt-tools://progress";
const EVENT_UPDATED: &str = "prompt-tools://updated";

pub(crate) fn emit_progress(
    app: &AppHandle,
    stage: &str,
    message: &str,
    provider_id: Option<&str>,
    filename: Option<&str>,
) {
    let _ = app.emit(
        EVENT_PROGRESS,
        crate::ipc::PromptToolsProgress {
            stage: stage.into(),
            message: message.into(),
            model_id: QWENVL_MODEL_ID.into(),
            provider_id: provider_id.map(str::to_string),
            filename: filename.map(str::to_string),
        },
    );
}

fn portable_root(app: &AppHandle) -> Result<PathBuf, String> {
    comfy::find_portable_root(&comfy::runtimes_dir(app)?.join("portable")).map_err(|_| {
        "ComfyUI portable not found - install the runtime before Prompt Tools".to_string()
    })
}

fn qwenvl_model_dir(app: &AppHandle) -> Result<PathBuf, String> {
    // Matches ComfyUI-QwenVL ensure_model(): models/LLM/Qwen-VL/<repo_name>
    let dir = comfy::models_dir(app)?
        .join("LLM")
        .join("Qwen-VL")
        .join(QWENVL_MODEL_NAME);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn qwenvl_weights_ready(app: &AppHandle) -> bool {
    let Ok(dir) = qwenvl_model_dir(app) else {
        return false;
    };
    // All hub files, and safetensors must be fully present (not just a valid header).
    QWENVL_HF_FILES
        .iter()
        .all(|f| download::local_file_complete(&dir.join(f)))
}

/// `(filename, url, dest)` for Download Manager expansion.
pub fn qwenvl_http_files(app: &AppHandle) -> Result<Vec<(String, String, PathBuf)>, String> {
    let dir = qwenvl_model_dir(app)?;
    Ok(QWENVL_HF_FILES
        .iter()
        .map(|f| {
            (
                (*f).to_string(),
                format!("https://huggingface.co/{QWENVL_HF_REPO}/resolve/main/{f}"),
                dir.join(f),
            )
        })
        .collect())
}

pub fn provider_ready(app: &AppHandle, provider_id: &str) -> bool {
    match provider_id {
        "qwenvl" | "qwen3-vl-8b" | "enhancer" | "instruct-gguf" | "joycaption" => {
            node_ready(app, "qwenvl") && qwenvl_weights_ready(app)
        }
        _ => false,
    }
}

fn node_ready(app: &AppHandle, pin_id: &str) -> bool {
    let Some(pin) = pins::node_pin(pin_id) else {
        return false;
    };
    let Ok(runtimes) = comfy::runtimes_dir(app) else {
        return false;
    };
    let Ok(portable) = comfy::find_portable_root(&runtimes.join("portable")) else {
        return false;
    };
    let dest = portable
        .join("ComfyUI")
        .join("custom_nodes")
        .join(pin.folder);
    if !dest.is_dir() {
        return false;
    }
    let Ok(out) = process_cmd::new("git")
        .current_dir(&dest)
        .args(["rev-parse", "HEAD"])
        .output()
    else {
        return false;
    };
    if !out.status.success() {
        return false;
    }
    let head = String::from_utf8_lossy(&out.stdout).trim().to_string();
    head.starts_with(pin.commit) || pin.commit.starts_with(&head) || head == pin.commit
}

pub fn list_weights(app: &AppHandle) -> Result<Vec<PromptToolWeightInfo>, String> {
    Ok(vec![PromptToolWeightInfo {
        id: QWENVL_MODEL_ID.into(),
        name: "Qwen3-VL-8B Instruct (4-bit)".into(),
        description: "Image→Prompt + Prompt Enhancer (shared vision-language model)".into(),
        ready: node_ready(app, "qwenvl") && qwenvl_weights_ready(app),
        provider: "qwenvl".into(),
    }])
}

fn ensure_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

pub fn ensure_provider(app: &AppHandle, provider_id: &str) -> Result<EnsureOutcome, String> {
    let _gate = ensure_lock()
        .lock()
        .map_err(|e| format!("prompt-tools ensure lock: {e}"))?;
    let mut restart_comfy = false;
    match provider_id {
        "qwenvl" | "qwen3-vl-8b" | "enhancer" | "instruct-gguf" | "joycaption" => {
            let was_ready = node_ready(app, "qwenvl");
            emit_progress(
                app,
                "install",
                "Ensuring ComfyUI-QwenVL custom node…",
                None,
                None,
            );
            upscale::ensure_pinned_node(app, "qwenvl")?;
            if !was_ready {
                restart_comfy = true;
            }
            if install_qwenvl_python_deps(app)? {
                restart_comfy = true;
            }
            let _ = ensure_qwenvl_weights(app)?;
            if !was_ready {
                restart_comfy = true;
            }
        }
        other => return Err(format!("unknown prompt-tools provider: {other}")),
    }
    let _ = app.emit(EVENT_UPDATED, provider_id);
    emit_progress(
        app,
        "done",
        "Qwen3-VL-8B ready",
        Some("qwenvl"),
        Some(QWENVL_MODEL_NAME),
    );
    Ok(EnsureOutcome { restart_comfy })
}

pub(crate) fn provider_required_nodes(_provider: Provider) -> &'static [&'static str] {
    &["AILab_QwenVL", "AILab_QwenVL_PromptEnhancer", "PreviewAny"]
}

fn comfy_has_node_type(port: u16, class_type: &str) -> bool {
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    let url = format!("http://127.0.0.1:{port}/object_info/{class_type}");
    match client.get(&url).send() {
        Ok(res) if res.status().is_success() => res
            .json::<Value>()
            .ok()
            .and_then(|v| v.as_object().map(|o| o.contains_key(class_type)))
            .unwrap_or(false),
        _ => false,
    }
}

/// Start Comfy if needed; restart once when required custom nodes are not loaded yet.
pub(crate) fn ensure_comfy_with_nodes(
    app: &AppHandle,
    db: &Mutex<Db>,
    processes: &Mutex<ProcessState>,
    runtime: &RuntimeInstall,
    required: &[&str],
    force_restart: bool,
) -> Result<u16, String> {
    if force_restart {
        emit_progress(
            app,
            "restart",
            "Restarting ComfyUI to load Prompt Tools nodes…",
            None,
            None,
        );
        let _ = comfy::stop(processes);
    }
    let port = ensure_comfy_running(app, db, processes, runtime)?;
    let missing: Vec<&str> = required
        .iter()
        .copied()
        .filter(|c| !comfy_has_node_type(port, c))
        .collect();
    if missing.is_empty() {
        return Ok(port);
    }
    if force_restart {
        return Err(format!(
            "ComfyUI is missing required nodes after restart: {}. Check custom node install / Comfy logs.",
            missing.join(", ")
        ));
    }
    emit_progress(
        app,
        "restart",
        &format!(
            "Restarting ComfyUI to load missing nodes ({})…",
            missing.join(", ")
        ),
        None,
        None,
    );
    let _ = comfy::stop(processes);
    let port = ensure_comfy_running(app, db, processes, runtime)?;
    let still_missing: Vec<&str> = required
        .iter()
        .copied()
        .filter(|c| !comfy_has_node_type(port, c))
        .collect();
    if !still_missing.is_empty() {
        return Err(format!(
            "ComfyUI is missing required nodes: {}. Custom node may have failed to import - check Comfy logs.",
            still_missing.join(", ")
        ));
    }
    Ok(port)
}

fn hf_resolve_url(filename: &str) -> String {
    format!("https://huggingface.co/{QWENVL_HF_REPO}/resolve/main/{filename}")
}

/// Download HF transformers weights into models/LLM/Qwen-VL/<name>. Returns true if anything new.
fn ensure_qwenvl_weights(app: &AppHandle) -> Result<bool, String> {
    if qwenvl_weights_ready(app) {
        return Ok(false);
    }
    let dir = qwenvl_model_dir(app)?;
    let mut changed = false;
    let total = QWENVL_HF_FILES.len();
    for (i, filename) in QWENVL_HF_FILES.iter().enumerate() {
        let dest = dir.join(filename);
        if download::local_file_complete(&dest) {
            continue;
        }
        let resume = dest.is_file();
        emit_progress(
            app,
            "download",
            &format!(
                "{} {filename} ({}/{})…",
                if resume { "Resuming" } else { "Downloading" },
                i + 1,
                total
            ),
            None,
            Some(filename),
        );
        download::clear_cancel();
        download::download_file(app, &hf_resolve_url(filename), &dest, None)?;
        if !download::local_file_complete(&dest) {
            return Err(format!(
                "download incomplete for {filename} - reopen Downloads / retry Image→Prompt to resume"
            ));
        }
        changed = true;
    }
    if !qwenvl_weights_ready(app) {
        return Err("Qwen3-VL-8B download finished but weights look incomplete".into());
    }
    Ok(changed)
}

pub fn install_qwenvl_python_deps(app: &AppHandle) -> Result<bool, String> {
    let root = portable_root(app)?;
    // New marker: prior GGUF path wrote `.oga_qwenvl_deps` after llama-cpp install.
    let marker = root.join(".oga_qwenvl_hf_deps");
    if marker.is_file() {
        return Ok(false);
    }
    let python = root.join("python_embeded").join("python.exe");
    if !python.is_file() {
        return Err("ComfyUI portable python.exe missing - cannot install QwenVL deps".into());
    }
    let reqs = root
        .join("ComfyUI")
        .join("custom_nodes")
        .join("ComfyUI-QwenVL")
        .join("requirements.txt");
    if reqs.is_file() {
        emit_progress(
            app,
            "install",
            "Installing ComfyUI-QwenVL Python dependencies…",
            None,
            Some("requirements.txt"),
        );
        let status = process_cmd::new(&python)
            .args([
                "-m",
                "pip",
                "install",
                "-r",
                reqs.to_str().ok_or("invalid requirements path")?,
            ])
            .status()
            .map_err(|e| format!("failed to run pip for QwenVL: {e}"))?;
        if !status.success() {
            return Err("QwenVL requirements.txt pip install failed".into());
        }
    }
    fs::write(&marker, b"ok").map_err(|e| e.to_string())?;
    Ok(true)
}

fn free_port(runtime: &RuntimeInstall) -> Result<u16, String> {
    Ok(runtime.port.unwrap_or(comfy::DEFAULT_PORT as i64) as u16)
}

pub(crate) fn ensure_comfy_running(
    app: &AppHandle,
    db: &Mutex<Db>,
    processes: &Mutex<ProcessState>,
    runtime: &RuntimeInstall,
) -> Result<u16, String> {
    let port = free_port(runtime)?;
    if !comfy::health(port)? {
        if runtime.install_path.is_empty() {
            return Err("ComfyUI is not installed".into());
        }
        emit_progress(app, "start", "Starting runtime…", None, None);
        comfy::start(app, processes, runtime, port)?;
        comfy::wait_until_healthy(port, 60)?;
        if let Ok(db) = db.lock() {
            if let Ok(updated) =
                db.update_runtime_status(&runtime.id, "running", Some(port as i64), None)
            {
                let _ = app.emit("runtimes://updated", &updated);
            }
        }
    }
    Ok(port)
}
