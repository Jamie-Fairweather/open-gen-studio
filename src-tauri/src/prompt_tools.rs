//! Prompt Tools: Image→Prompt + Prompt Enhancer via Comfy utility workflows.
//! Bidirectional VRAM free around runs; text-only history collect (no gallery).

use crate::comfy::{self, ProcessState};
use crate::db::{Db, Job, RuntimeInstall};
use crate::download;
use crate::generate;
use crate::pins;
use crate::upscale;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

const EVENT_PROGRESS: &str = "prompt-tools://progress";
const EVENT_UPDATED: &str = "prompt-tools://updated";

/// Instruct GGUF used by Prompt Rewriter (text enhance + optional VLM pack).
pub const INSTRUCT_GGUF_FILENAME: &str = "qwen2.5-3b-instruct-q4_k_m.gguf";
const INSTRUCT_GGUF_URL: &str =
    "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PromptFormat {
    General,
    Structured,
    #[serde(rename = "graphicDesign")]
    GraphicDesign,
    Json,
}

impl PromptFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            PromptFormat::General => "general",
            PromptFormat::Structured => "structured",
            PromptFormat::GraphicDesign => "graphicDesign",
            PromptFormat::Json => "json",
        }
    }

    fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "general" => Ok(Self::General),
            "structured" => Ok(Self::Structured),
            "graphicDesign" | "graphic_design" | "graphic-design" => Ok(Self::GraphicDesign),
            "json" => Ok(Self::Json),
            other => Err(format!("unknown prompt format: {other}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PromptTarget {
    Auto,
    Flux,
    StableDiffusion,
    Ideogram,
    #[serde(rename = "zImageKrea")]
    ZImageKrea,
}

impl PromptTarget {
    fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "auto" => Ok(Self::Auto),
            "flux" => Ok(Self::Flux),
            "stableDiffusion" | "sd" | "sdxl" | "sd15" => Ok(Self::StableDiffusion),
            "ideogram" => Ok(Self::Ideogram),
            "zImageKrea" | "z-image" | "krea" | "krea2" => Ok(Self::ZImageKrea),
            other => Err(format!("unknown prompt target: {other}")),
        }
    }

    fn resolve(self, arch: Option<&str>) -> Self {
        if self != PromptTarget::Auto {
            return self;
        }
        match arch.unwrap_or("").to_ascii_lowercase().as_str() {
            "flux" | "flux2" => PromptTarget::Flux,
            "sdxl" | "sd15" | "sd" => PromptTarget::StableDiffusion,
            "ideogram4" | "ideogram" => PromptTarget::Ideogram,
            "z-image" | "krea2" | "krea" => PromptTarget::ZImageKrea,
            _ => PromptTarget::Flux,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Provider {
    JoyCaption,
    InstructGguf,
}

impl Provider {
    fn pin_id(self) -> &'static str {
        match self {
            Provider::JoyCaption => "joycaption",
            Provider::InstructGguf => "llm-session",
        }
    }

    fn id(self) -> &'static str {
        match self {
            Provider::JoyCaption => "joycaption",
            Provider::InstructGguf => "instruct-gguf",
        }
    }
}

fn provider_for_format(format: PromptFormat) -> Provider {
    match format {
        PromptFormat::General
        | PromptFormat::Structured
        | PromptFormat::GraphicDesign
        | PromptFormat::Json => Provider::JoyCaption,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptToolWeightInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub ready: bool,
    pub provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptToolResult {
    pub prompt: String,
    pub negative: Option<String>,
    pub provider: String,
    pub format: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunImageToPromptArgs {
    pub image_path: String,
    pub format: String,
    pub target: String,
    pub arch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunPromptEnhanceArgs {
    pub prompt: String,
    pub target: String,
    pub arch: Option<String>,
    pub mode: Option<String>,
}

fn emit_progress(app: &AppHandle, stage: &str, message: &str, extra: Option<Value>) {
    let mut payload = json!({
        "stage": stage,
        "message": message,
    });
    if let Some(Value::Object(map)) = extra {
        if let Some(obj) = payload.as_object_mut() {
            for (k, v) in map {
                obj.insert(k, v);
            }
        }
    }
    let _ = app.emit(EVENT_PROGRESS, payload);
}

fn models_llm_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = comfy::models_dir(app)?.join("LLM");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn models_gguf_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = models_llm_dir(app)?.join("gguf");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Prompt Rewriter hardcodes `ComfyUI/models/LLM/gguf` (ignores extra_model_paths).
fn comfy_gguf_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = portable_root(app)?
        .join("ComfyUI")
        .join("models")
        .join("LLM")
        .join("gguf");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn prompt_rewriter_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(portable_root(app)?
        .join("ComfyUI")
        .join("custom_nodes")
        .join("ComfyUI-Prompt-Rewriter"))
}

fn instruct_gguf_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(models_gguf_dir(app)?.join(INSTRUCT_GGUF_FILENAME))
}

fn instruct_gguf_ready(app: &AppHandle) -> bool {
    instruct_gguf_path(app)
        .map(|p| download::local_file_usable(&p))
        .unwrap_or(false)
}

fn find_llama_server(app: &AppHandle) -> Option<PathBuf> {
    let dir = prompt_rewriter_dir(app).ok()?;
    let mut best: Option<(String, PathBuf)> = None;
    let entries = fs::read_dir(&dir).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("llama_binaries_") || !entry.path().is_dir() {
            continue;
        }
        let exe = entry.path().join(if cfg!(target_os = "windows") {
            "llama-server.exe"
        } else {
            "llama-server"
        });
        if !exe.is_file() {
            continue;
        }
        if best
            .as_ref()
            .map(|(n, _)| name.as_str() > n.as_str())
            .unwrap_or(true)
        {
            best = Some((name, exe));
        }
    }
    best.map(|(_, p)| p)
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
    let Ok(out) = std::process::Command::new("git")
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
    Ok(vec![
        PromptToolWeightInfo {
            id: "joycaption".into(),
            name: "JoyCaption".into(),
            description: "Natural-language captions (General / Structured / Graphic / JSON)"
                .into(),
            ready: node_ready(app, "joycaption"),
            provider: "joycaption".into(),
        },
        PromptToolWeightInfo {
            id: "instruct-gguf".into(),
            name: "Instruct GGUF (Qwen2.5-3B)".into(),
            description: "Prompt Enhancer rewrite model".into(),
            ready: node_ready(app, "llm-session")
                && instruct_gguf_ready(app)
                && find_llama_server(app).is_some(),
            provider: "instruct-gguf".into(),
        },
    ])
}

/// `restart_comfy` — caller should bounce the runtime so new pip packages load.
pub struct EnsureOutcome {
    pub restart_comfy: bool,
}

pub fn ensure_provider(app: &AppHandle, provider_id: &str) -> Result<EnsureOutcome, String> {
    let mut restart_comfy = false;
    match provider_id {
        "joycaption" => {
            let was_ready = node_ready(app, "joycaption");
            emit_progress(app, "install", "Ensuring JoyCaption custom node…", None);
            upscale::ensure_pinned_node(app, "joycaption")?;
            if !was_ready {
                restart_comfy = true;
            }
            if patch_joycaption(app)? {
                restart_comfy = true;
            }
            if install_joycaption_python_deps(app)? {
                restart_comfy = true;
            }
        }
        "instruct-gguf" | "llm-session" | "enhancer" => {
            let was_ready = node_ready(app, "llm-session");
            emit_progress(app, "install", "Ensuring Prompt Rewriter…", None);
            upscale::ensure_pinned_node(app, "llm-session")?;
            if install_prompt_rewriter_python_deps(app)? {
                restart_comfy = true;
            }
            if ensure_instruct_gguf(app)? {
                // Dropdown is built at Comfy load; new GGUF needs a bounce.
                restart_comfy = true;
            }
            ensure_llama_server(app)?;
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
        "Provider ready",
        Some(json!({ "providerId": provider_id })),
    );
    Ok(EnsureOutcome { restart_comfy })
}

fn provider_required_nodes(provider: Provider) -> &'static [&'static str] {
    match provider {
        Provider::JoyCaption => &["JC", "JC_adv", "PreviewAny"],
        Provider::InstructGguf => &["PromptRewriterOptionsZ", "PromptRewriterZ", "PreviewAny"],
    }
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
fn ensure_comfy_with_nodes(
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
            "ComfyUI is missing required nodes: {}. Custom node may have failed to import — check Comfy logs.",
            still_missing.join(", ")
        ));
    }
    Ok(port)
}

fn install_prompt_rewriter_python_deps(app: &AppHandle) -> Result<bool, String> {
    let root = portable_root(app)?;
    let marker = root.join(".oga_prompt_rewriter_deps");
    if marker.is_file() {
        return Ok(false);
    }
    let python = root.join("python_embeded").join("python.exe");
    if !python.is_file() {
        return Err("ComfyUI portable python.exe missing — cannot install Prompt Rewriter deps".into());
    }
    let reqs = root
        .join("ComfyUI")
        .join("custom_nodes")
        .join("ComfyUI-Prompt-Rewriter")
        .join("requirements.txt");
    if !reqs.is_file() {
        return Ok(false);
    }
    emit_progress(
        app,
        "install",
        "Installing Prompt Rewriter Python dependencies…",
        None,
    );
    let output = Command::new(&python)
        .args([
            "-s",
            "-m",
            "pip",
            "install",
            "-r",
            reqs.to_str().ok_or("invalid Prompt Rewriter requirements path")?,
        ])
        .current_dir(&root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("failed to run pip for Prompt Rewriter: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Prompt Rewriter pip install failed: {}",
            stderr.chars().take(800).collect::<String>()
        ));
    }
    fs::write(&marker, b"ok").map_err(|e| e.to_string())?;
    Ok(true)
}

fn portable_root(app: &AppHandle) -> Result<PathBuf, String> {
    comfy::find_portable_root(&comfy::runtimes_dir(app)?.join("portable")).map_err(|_| {
        "ComfyUI portable not found — install the runtime first".to_string()
    })
}

/// Install JoyCaption pip deps (bitsandbytes, transformers extras). Returns true if newly installed.
fn install_joycaption_python_deps(app: &AppHandle) -> Result<bool, String> {
    let root = portable_root(app)?;
    let marker = root.join(".oga_joycaption_deps");
    if marker.is_file() {
        return Ok(false);
    }

    let python = root.join("python_embeded").join("python.exe");
    if !python.is_file() {
        return Err("ComfyUI portable python.exe missing — cannot install JoyCaption deps".into());
    }
    let reqs = root
        .join("ComfyUI")
        .join("custom_nodes")
        .join("ComfyUI-JoyCaption")
        .join("requirements.txt");
    if !reqs.is_file() {
        return Err("JoyCaption requirements.txt missing after clone".into());
    }

    emit_progress(
        app,
        "install",
        "Installing JoyCaption Python dependencies (bitsandbytes, etc.)…",
        None,
    );

    let output = Command::new(&python)
        .args([
            "-s",
            "-m",
            "pip",
            "install",
            "-r",
            reqs.to_str().ok_or("invalid JoyCaption requirements path")?,
        ])
        .current_dir(&root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("failed to run pip for JoyCaption: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "JoyCaption pip install failed: {}",
            stderr.chars().take(800).collect::<String>()
        ));
    }

    fs::write(&marker, b"ok").map_err(|e| e.to_string())?;
    Ok(true)
}

/// Patch JoyCaption for transformers SizeDict + safer cleanup. Returns true if the file changed.
fn patch_joycaption(app: &AppHandle) -> Result<bool, String> {
    let jc = portable_root(app)?
        .join("ComfyUI")
        .join("custom_nodes")
        .join("ComfyUI-JoyCaption")
        .join("JC.py");
    if !jc.is_file() {
        return Ok(false);
    }
    let mut src = fs::read_to_string(&jc).map_err(|e| e.to_string())?;
    let original = src.clone();

    // 1) Don't mask load failures when self.model was never set.
    let cleanup_needle = "cleanup_model_resources(self.model, self.processor)";
    let cleanup_fix = "cleanup_model_resources(getattr(self, \"model\", None), getattr(self, \"processor\", None))  # OGA_JOYCAPTION_CLEANUP_FIX";
    if src.contains(cleanup_needle) {
        src = src.replace(cleanup_needle, cleanup_fix);
    }

    // 2) Newer transformers returns SizeDict (not dict) for image_processor.size —
    //    JoyCaption then does resize((SizeDict, SizeDict)) and PIL throws TypeError.
    if !src.contains("OGA_JOYCAPTION_SIZEDICT_FIX") {
        const OLD_SIZE_BLOCK: &str = r#"if hasattr(self.processor, 'image_processor') and hasattr(self.processor.image_processor, 'size'):
            expected_size = self.processor.image_processor.size
            if isinstance(expected_size, dict):
                self.target_size = (expected_size.get('height', 336), expected_size.get('width', 336))
            elif isinstance(expected_size, (list, tuple)):
                self.target_size = tuple(expected_size) if len(expected_size) == 2 else (expected_size[0], expected_size[0])
            else:
                self.target_size = (expected_size, expected_size)
        else:
            self.target_size = (336, 336)"#;

        const NEW_SIZE_BLOCK: &str = r#"# OGA_JOYCAPTION_SIZEDICT_FIX — coerce CLIP size (incl. SizeDict) to int tuple for PIL
        expected_size = None
        if hasattr(self.processor, 'image_processor') and hasattr(self.processor.image_processor, 'size'):
            expected_size = self.processor.image_processor.size
        def _oga_joy_size(sz):
            if sz is None:
                return (336, 336)
            if isinstance(sz, (tuple, list)) and len(sz) >= 2 and all(isinstance(x, int) for x in sz[:2]):
                return (int(sz[0]), int(sz[1]))
            if isinstance(sz, dict) or hasattr(sz, 'get'):
                try:
                    short = sz.get('shortest_edge', None)
                    h = sz.get('height', short if short is not None else 336)
                    w = sz.get('width', short if short is not None else 336)
                    return (int(h), int(w))
                except Exception:
                    return (336, 336)
            try:
                v = int(sz)
                return (v, v)
            except Exception:
                return (336, 336)
        self.target_size = _oga_joy_size(expected_size)"#;

        if src.contains(OLD_SIZE_BLOCK) {
            src = src.replace(OLD_SIZE_BLOCK, NEW_SIZE_BLOCK);
        } else {
            // Fallback: harden the resize call site.
            let resize_old = "image = image.resize(self.target_size, Image.Resampling.LANCZOS)";
            let resize_new = r#"_oga_ts = self.target_size
        if not (isinstance(_oga_ts, (tuple, list)) and len(_oga_ts) >= 2 and all(isinstance(x, int) for x in _oga_ts[:2])):
            if hasattr(_oga_ts, 'get'):
                _short = _oga_ts.get('shortest_edge', 336)
                _oga_ts = (int(_oga_ts.get('height', _short)), int(_oga_ts.get('width', _short)))
            elif isinstance(_oga_ts, (tuple, list)) and len(_oga_ts) >= 2 and hasattr(_oga_ts[0], 'get'):
                _s0, _s1 = _oga_ts[0], _oga_ts[1]
                _oga_ts = (int(_s0.get('height', _s0.get('shortest_edge', 336))), int(_s1.get('width', _s1.get('shortest_edge', 336))))
            else:
                _oga_ts = (336, 336)
        image = image.resize(_oga_ts, Image.Resampling.LANCZOS)  # OGA_JOYCAPTION_SIZEDICT_FIX"#;
            if src.contains(resize_old) {
                src = src.replace(resize_old, resize_new);
            }
        }
    }

    if src == original {
        return Ok(false);
    }
    fs::write(&jc, &src).map_err(|e| e.to_string())?;
    Ok(true)
}

fn reject_model_error_text(text: &str) -> Result<String, String> {
    let t = text.trim();
    let lower = t.to_ascii_lowercase();
    if lower.starts_with("error loading model")
        || lower.starts_with("error:")
        || lower.contains("error loading model:")
        || lower.contains("object has no attribute")
    {
        return Err(format!(
            "JoyCaption failed to load: {t}. Dependencies were installed — if this persists, restart ComfyUI from Settings and retry."
        ));
    }
    Ok(t.to_string())
}

/// Download shared GGUF and place it where Prompt Rewriter scans.
/// Returns `true` when the Comfy-local file was newly created (caller should restart Comfy).
fn ensure_instruct_gguf(app: &AppHandle) -> Result<bool, String> {
    let shared = instruct_gguf_path(app)?;
    if !download::local_file_usable(&shared) {
        emit_progress(
            app,
            "download",
            &format!("Downloading {INSTRUCT_GGUF_FILENAME}…"),
            Some(json!({ "filename": INSTRUCT_GGUF_FILENAME })),
        );
        download::clear_cancel();
        download::download_file(app, INSTRUCT_GGUF_URL, &shared, None)?;
        if !download::local_file_usable(&shared) {
            return Err(format!(
                "download produced unusable file: {INSTRUCT_GGUF_FILENAME}"
            ));
        }
    }

    let comfy_dest = comfy_gguf_dir(app)?.join(INSTRUCT_GGUF_FILENAME);
    if download::local_file_usable(&comfy_dest) {
        return Ok(false);
    }
    if comfy_dest.exists() {
        let _ = fs::remove_file(&comfy_dest);
    }

    emit_progress(
        app,
        "install",
        "Linking instruct GGUF into ComfyUI models/LLM/gguf…",
        Some(json!({ "filename": INSTRUCT_GGUF_FILENAME })),
    );
    match fs::hard_link(&shared, &comfy_dest) {
        Ok(()) => Ok(true),
        Err(link_err) => {
            fs::copy(&shared, &comfy_dest).map_err(|e| {
                format!(
                    "failed to place GGUF for Prompt Rewriter (hardlink: {link_err}; copy: {e})"
                )
            })?;
            Ok(true)
        }
    }
}

fn comfy_rewriter_model_list(port: u16) -> Option<Vec<String>> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .ok()?;
    let url = format!("http://127.0.0.1:{port}/object_info/PromptRewriterOptionsZ");
    let v: Value = client.get(&url).send().ok()?.json().ok()?;
    let models = v
        .pointer("/PromptRewriterOptionsZ/input/required/model/0")?
        .as_array()?;
    Some(
        models
            .iter()
            .filter_map(|m| m.as_str().map(|s| s.to_string()))
            .collect(),
    )
}

fn comfy_sees_instruct_gguf(port: u16) -> bool {
    match comfy_rewriter_model_list(port) {
        Some(list) => list.iter().any(|m| {
            m == INSTRUCT_GGUF_FILENAME || m.trim_start_matches('⬇').trim() == INSTRUCT_GGUF_FILENAME
        }),
        None => false,
    }
}

/// Prompt Rewriter's model combo is filled at Comfy startup — bounce once if our GGUF is absent.
fn ensure_comfy_sees_instruct_gguf(
    app: &AppHandle,
    db: &Mutex<Db>,
    processes: &Mutex<ProcessState>,
    runtime: &RuntimeInstall,
    port: u16,
) -> Result<u16, String> {
    if comfy_sees_instruct_gguf(port) {
        return Ok(port);
    }
    emit_progress(
        app,
        "restart",
        "Restarting ComfyUI so Prompt Rewriter can see the instruct GGUF…",
        None,
    );
    let _ = comfy::stop(processes);
    let port = ensure_comfy_running(app, db, processes, runtime)?;
    if !comfy_sees_instruct_gguf(port) {
        let list = comfy_rewriter_model_list(port)
            .map(|l| l.join(", "))
            .unwrap_or_else(|| "(unavailable)".into());
        return Err(format!(
            "Prompt Rewriter still reports no usable models after placing {INSTRUCT_GGUF_FILENAME}. \
Seen: [{list}]. Expected file under ComfyUI/models/LLM/gguf/."
        ));
    }
    Ok(port)
}

/// Download CUDA llama-server into Prompt Rewriter's `llama_binaries_*` folder.
fn ensure_llama_server(app: &AppHandle) -> Result<(), String> {
    if find_llama_server(app).is_some() {
        return Ok(());
    }

    emit_progress(
        app,
        "download",
        "Downloading llama.cpp CUDA binaries for Prompt Rewriter…",
        None,
    );

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(120))
        .user_agent("open-gen-ai")
        .build()
        .map_err(|e| e.to_string())?;
    let releases: Value = client
        .get("https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=20")
        .send()
        .map_err(|e| format!("llama.cpp releases request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("llama.cpp releases HTTP error: {e}"))?
        .json()
        .map_err(|e| format!("llama.cpp releases JSON error: {e}"))?;

    let releases = releases
        .as_array()
        .ok_or_else(|| "llama.cpp releases: expected array".to_string())?;

    let mut chosen: Option<(String, String, Option<String>)> = None; // tag, main_url, cudart_url
    for rel in releases {
        let tag = rel
            .get("tag_name")
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string();
        let assets = match rel.get("assets").and_then(|a| a.as_array()) {
            Some(a) => a,
            None => continue,
        };
        let mut cuda_zips: Vec<(u32, String, String)> = Vec::new(); // cuda_major, name, url
        let mut cudart: Vec<(String, String)> = Vec::new(); // cuda_ver, url
        for asset in assets {
            let name = asset
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or("")
                .to_string();
            let url = asset
                .get("browser_download_url")
                .and_then(|u| u.as_str())
                .unwrap_or("")
                .to_string();
            if name.is_empty() || url.is_empty() || !name.ends_with(".zip") {
                continue;
            }
            // e.g. llama-b7436-bin-win-cuda-12.4.zip
            if name.starts_with("llama-") && name.contains("bin-win-cuda") {
                let cuda_ver = name
                    .split("cuda-")
                    .nth(1)
                    .and_then(|s| s.strip_suffix(".zip"))
                    .unwrap_or("");
                let major = cuda_ver
                    .split('.')
                    .next()
                    .and_then(|s| s.parse::<u32>().ok())
                    .unwrap_or(0);
                cuda_zips.push((major, name, url));
            } else if name.contains("cudart-") && name.contains("win-cuda") {
                let ver = name
                    .split("cuda-")
                    .nth(1)
                    .and_then(|s| s.strip_suffix(".zip"))
                    .unwrap_or("")
                    .to_string();
                cudart.push((ver, url));
            }
        }
        if cuda_zips.is_empty() {
            continue;
        }
        cuda_zips.sort_by(|a, b| b.0.cmp(&a.0));
        let (_major, main_name, main_url) = cuda_zips.remove(0);
        let cuda_ver = main_name
            .split("cuda-")
            .nth(1)
            .and_then(|s| s.strip_suffix(".zip"))
            .unwrap_or("")
            .to_string();
        let cudart_url = cudart
            .iter()
            .find(|(v, _)| *v == cuda_ver)
            .map(|(_, u)| u.clone());
        chosen = Some((tag, main_url, cudart_url));
        break;
    }

    let (tag, main_url, cudart_url) =
        chosen.ok_or_else(|| "no win-cuda llama.cpp release asset found".to_string())?;
    let dest_dir = prompt_rewriter_dir(app)?.join(format!("llama_binaries_{tag}"));
    if dest_dir.exists() {
        fs::remove_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let main_zip = dest_dir.join("main.zip");
    download::clear_cancel();
    download::download_file(app, &main_url, &main_zip, None)?;
    extract_zip_flat(&main_zip, &dest_dir)?;
    let _ = fs::remove_file(&main_zip);

    if let Some(url) = cudart_url {
        let cudart_zip = dest_dir.join("cudart.zip");
        download::download_file(app, &url, &cudart_zip, None)?;
        extract_zip_flat(&cudart_zip, &dest_dir)?;
        let _ = fs::remove_file(&cudart_zip);
    }

    if find_llama_server(app).is_none() {
        return Err(format!(
            "llama.cpp extract finished but llama-server.exe missing under {}",
            dest_dir.display()
        ));
    }
    Ok(())
}

fn extract_zip_flat(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let status = Command::new("tar")
        .args([
            "-xf",
            zip_path
                .to_str()
                .ok_or_else(|| "invalid zip path".to_string())?,
            "-C",
            dest.to_str()
                .ok_or_else(|| "invalid extract dest".to_string())?,
        ])
        .status()
        .map_err(|e| format!("failed to run tar for zip extract: {e}"))?;
    if !status.success() {
        return Err(format!(
            "tar extract failed for {}",
            zip_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("archive")
        ));
    }

    // llama.cpp zips nest under llama-* / cudart-*; flatten one level.
    let entries: Vec<_> = fs::read_dir(dest)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.is_dir()
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("llama-") || n.starts_with("cudart-"))
                    .unwrap_or(false)
        })
        .collect();
    for nested in entries {
        for child in fs::read_dir(&nested).map_err(|e| e.to_string())?.flatten() {
            let to = dest.join(child.file_name());
            if to.exists() {
                if to.is_dir() {
                    let _ = fs::remove_dir_all(&to);
                } else {
                    let _ = fs::remove_file(&to);
                }
            }
            fs::rename(child.path(), &to).map_err(|e| {
                format!(
                    "failed to flatten {} → {}: {e}",
                    child.path().display(),
                    to.display()
                )
            })?;
        }
        let _ = fs::remove_dir_all(&nested);
    }
    Ok(())
}

fn comfy_input_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let portable = comfy::find_portable_root(&comfy::runtimes_dir(app)?.join("portable"))
        .map_err(|_| "ComfyUI portable not found — install the runtime first".to_string())?;
    let dir = portable.join("ComfyUI").join("input");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn stage_input_image(app: &AppHandle, image_path: &str) -> Result<String, String> {
    let src = PathBuf::from(image_path);
    if !src.is_file() {
        return Err(format!("image not found: {image_path}"));
    }
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase();
    let filename = format!("oga_prompt_{}.{}", Uuid::new_v4().simple(), ext);
    let dest = comfy_input_dir(app)?.join(&filename);
    fs::copy(&src, &dest).map_err(|e| format!("failed to stage image: {e}"))?;
    Ok(filename)
}

fn target_dialect_hint(target: PromptTarget) -> &'static str {
    match target {
        PromptTarget::Auto => "",
        PromptTarget::Flux => {
            " Optimize for Flux: natural prose, cinematography, lighting, and materials. Avoid quality-tag spam (masterpiece, 8k)."
        }
        PromptTarget::StableDiffusion => {
            " Optimize for Stable Diffusion / SDXL: comma-separated tags and quality boosters are welcome."
        }
        PromptTarget::Ideogram => {
            " Optimize for Ideogram: clear subject and style; note any text that should appear in the image."
        }
        PromptTarget::ZImageKrea => {
            " Optimize for Z-Image / Krea turbo models: concise medium-length prose, strong subject focus."
        }
    }
}

/// Checklist so JoyCaption captions are dense enough to recreate the image as closely as text allows.
fn recreation_detail_instruction() -> &'static str {
    "Goal: a prompt that could recreate this image as closely as possible. Describe only what is \
visible — do not invent props, logos, or celebrity names. Cover all of the following when present:\n\
1) Medium & style — photo, illustration, anime, 3D render, painting, etc.; art style or look.\n\
2) Subjects — count and who/what; for people: apparent age range, gender presentation, body type, \
hair (color, length, style), facial features, expression, skin tone, distinctive marks; for objects: \
shape, material, color, condition.\n\
3) Pose & action — facing direction (toward camera, away, left, right, three-quarter), body pose, \
hand positions, gaze, what they are doing. Never say only \"a person\".\n\
4) Clothing & accessories — garments, colors, materials/textures, jewelry, bags, glasses, hats.\n\
5) Composition — where subjects sit in frame (left/center/right, foreground/mid/background), \
relative positions, framing, aspect (portrait/landscape/square).\n\
6) Camera — shot type (extreme close-up through extreme wide), angle, vantage height (eye-level, \
low, high, bird's-eye), depth of field (background sharp or blurred).\n\
7) Setting — environment, architecture, props, weather, time of day, indoor/outdoor.\n\
8) Lighting — direction, hard/soft, color temperature, key shadows, rim/backlight, reflections.\n\
9) Color & texture — dominant palette, contrast, notable materials (metal, fabric, skin, glass).\n\
10) Text — quote any readable text, logos, or signage exactly; omit if none."
}

fn general_custom_prompt(target: PromptTarget) -> String {
    format!(
        "Write a single dense text-to-image prompt that could recreate this image almost 1:1.\n\
{}\n\
Weave the checklist into flowing generation-ready language (not a numbered list). Prefer concrete \
nouns and visual facts over mood words. Avoid meta phrases like \"This image shows\" or \
\"You are looking at\". Output ONLY the prompt.{}",
        recreation_detail_instruction(),
        target_dialect_hint(target)
    )
}

fn structured_custom_prompt(target: PromptTarget) -> String {
    format!(
        "Analyze this image for near-1:1 recreation. Output ONLY these labeled sections, one per line, \
using exactly these labels:\n\
Medium: …\n\
Subject: … (appearance, count, expression — never vague)\n\
Pose: … (facing, body, hands, gaze, action)\n\
Clothing: …\n\
Composition: … (placement in frame, foreground/mid/background, aspect)\n\
Setting: …\n\
Style: …\n\
Lighting: … (direction, quality, color temp, DOF)\n\
Camera: … (shot type, angle, height)\n\
Colors: …\n\
Text: … (quote exactly, or none)\n\
Details: … (props, materials, anything else needed to recreate)\n\
{}. Do not add other commentary.{}",
        recreation_detail_instruction(),
        target_dialect_hint(target)
    )
}

fn json_custom_prompt(target: PromptTarget) -> String {
    format!(
        "Analyze this image for near-1:1 recreation. Respond with ONLY a valid JSON object (no markdown) \
using keys: medium, subject, pose_and_facing, clothing, composition, camera_shot, setting, style, \
lighting, colors (array of strings), visible_text, details, \
negative_suggestions (array of strings for things that would break the recreation). \
Fill every key with concrete visual facts. {}.{}",
        recreation_detail_instruction(),
        target_dialect_hint(target)
    )
}

fn graphic_custom_prompt(target: PromptTarget) -> String {
    format!(
        "Describe this image as a graphic-design brief that could recreate the layout almost 1:1: \
medium, layout grid, typography (font feel, weight, size hierarchy), brand feel, exact color palette, \
composition hierarchy, subject placement/facing if figures are present, negative space, and any \
visible text (quote exactly). {}. Write a single cohesive prompt.{}",
        recreation_detail_instruction(),
        target_dialect_hint(target)
    )
}

/// Comfy rejects graphs with no `OUTPUT_NODE`. Caption nodes return STRING but are not
/// output nodes — terminate every utility graph with built-in PreviewAny.
fn preview_any_node(source: (&str, usize)) -> Value {
    json!({
        "class_type": "PreviewAny",
        "inputs": {
            "source": [source.0, source.1]
        }
    })
}


fn build_joycaption_general(filename: &str, target: PromptTarget) -> Value {
    // JC_adv + custom prompt (JC's built-in "Straightforward" style is too terse for pose/facing).
    build_joycaption_custom(filename, &general_custom_prompt(target))
}

fn build_joycaption_custom(filename: &str, custom_prompt: &str) -> Value {
    // JC_adv RETURN_NAMES: PROMPT (template), STRING (caption)
    json!({
        "1": {
            "class_type": "LoadImage",
            "inputs": { "image": filename }
        },
        "2": {
            "class_type": "JC_adv",
            "inputs": {
                "image": ["1", 0],
                "model": "joycaption-beta-one",
                "quantization": "Maximum Savings (4-bit)",
                "prompt_style": "Descriptive",
                "caption_length": "very long",
                "max_new_tokens": 1024,
                "temperature": 0.6,
                "top_p": 0.9,
                "top_k": 0,
                "custom_prompt": custom_prompt,
                "memory_management": "Clear After Run"
            }
        },
        "3": preview_any_node(("2", 1))
    })
}

fn style_look_bit(look: &str) -> &'static str {
    match look {
        "anime" => {
            "Rewrite as an ANIME / manga illustration prompt (not a photo). State the medium up front \
(e.g. anime still, 2D illustration). Keep the same person, outfit, pose, and setting, but replace \
photographic language (photograph, DSLR, realistic skin pores, cinematic photo lighting) with \
anime cues: clean linework, cel shading, expressive eyes, illustrative hair, vibrant colors. \
The result must clearly read as anime-styled."
        }
        "product" => {
            "Rewrite as a commercial PRODUCT shot. Keep the core subject, but reframe as studio \
catalog lighting, simple backdrop, sharp material/finish detail, and advertising composition. \
Remove unrelated lifestyle clutter when it fights a clean product read."
        }
        "portrait" => {
            "Rewrite as a PORTRAIT prompt: face and upper body focus, flattering light, shallow \
depth of field, expression and wardrobe detail. Keep identity and outfit; de-emphasize wide \
environment unless it supports the portrait."
        }
        // cinematic (default)
        _ => {
            "Rewrite as a CINEMATIC film still: dramatic keyed light, lens/camera language, \
color grade, atmosphere, and composition. Keep the same subject and scene; make it feel like \
a movie frame rather than a casual snapshot."
        }
    }
}

fn enhance_system_prompt(target: PromptTarget, mode: &str) -> String {
    let style_look = mode
        .strip_prefix("style:")
        .or_else(|| (mode == "style").then_some("cinematic"));
    let mode_bit = if let Some(look) = style_look {
        style_look_bit(look)
    } else {
        match mode {
            "short" => {
                "Keep the result concise (under ~40 words). Cut filler; keep subject, key look, and one setting cue."
            }
            "tags" => {
                "Convert the idea into comma-separated descriptive tags for Stable Diffusion \
(booru-ish / SDXL style). No full sentences, no preamble. Keep subject and important details; \
drop prose connectors."
            }
            "lighting" => {
                "Rewrite so lighting and camera are central: light direction/quality, color temperature, \
lens/focal length, depth of field, and atmosphere. Keep the same subject; trim details that \
don't serve light or camera."
            }
            "clean" => {
                "Declutter only: remove fluff, contradictions, and quality-tag spam \
(masterpiece, 8k, best quality, ultra detailed). Do not add new scene details. Keep subject \
and intent; tighten wording."
            }
            "composition" => {
                "Rewrite with composition first: framing (close-up/wide/etc.), camera angle, \
lens/focal length, depth of field, and subject placement in the frame. Keep the same subject \
and setting; make shot geometry explicit."
            }
            "concrete" => {
                "Replace vague adjectives (beautiful, nice, amazing) with specific materials, \
colors, props, textures, and countable details. Do not invent a new subject or location — \
only sharpen what is already implied."
            }
            _ => {
                "Expand into a richer, ready-to-use image prompt with clearer detail and context. \
Add useful sensory/scene specifics without changing the core subject."
            }
        }
    };
    let style_override = if style_look.is_some() {
        " Style mode: you MUST change the visual medium/look as instructed — do not lightly paraphrase. \
If the input says photograph/realistic/cinematic photo, override that to match the requested look."
    } else {
        ""
    };
    format!(
        "You rewrite user ideas into text-to-image prompts. Preserve core subject and intent. \
Output ONLY the final prompt, no preamble. {mode_bit}{style_override}{}",
        target_dialect_hint(target)
    )
}

fn build_enhance_workflow(prompt: &str, target: PromptTarget, mode: &str) -> Value {
    let system = enhance_system_prompt(target, mode);
    json!({
        "1": {
            "class_type": "PromptRewriterOptionsZ",
            "inputs": {
                "model": INSTRUCT_GGUF_FILENAME,
                "gpu_layers": "",
                "enable_thinking": false,
                "context_size": 4096,
                "max_tokens": 1024,
                "flash_attention": true,
                "system_prompt": system,
                "use_model_default_sampling": false,
                "temperature": 0.7,
                "top_p": 0.9,
                "top_k": 40,
                "min_p": 0.05,
                "repeat_penalty": 1.05
            }
        },
        "2": {
            "class_type": "PromptRewriterZ",
            "inputs": {
                "prompt": prompt,
                "seed": 0,
                "backend": "CUDA",
                "options": ["1", 0],
                "show_everything_in_console": false,
                "keep_mmproj_loaded": false,
                "stop_server_after": true
            }
        },
        "3": preview_any_node(("2", 0))
    })
}

fn build_workflow(
    format: PromptFormat,
    target: PromptTarget,
    filename: &str,
) -> Result<Value, String> {
    Ok(match format {
        PromptFormat::General => build_joycaption_general(filename, target),
        PromptFormat::Structured => {
            build_joycaption_custom(filename, &structured_custom_prompt(target))
        }
        PromptFormat::Json => build_joycaption_custom(filename, &json_custom_prompt(target)),
        PromptFormat::GraphicDesign => {
            build_joycaption_custom(filename, &graphic_custom_prompt(target))
        }
    })
}

fn free_port(runtime: &RuntimeInstall) -> Result<u16, String> {
    Ok(runtime.port.unwrap_or(comfy::DEFAULT_PORT as i64) as u16)
}

fn ensure_comfy_running(
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
        emit_progress(app, "start", "Starting runtime…", None);
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
        Some(
            "blurry, low quality, distorted, watermark, text artifacts, extra limbs"
                .into(),
        )
    } else {
        None
    }
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
    let ensured = ensure_provider(app, "instruct-gguf")?;
    let port = ensure_comfy_with_nodes(
        app,
        db,
        processes,
        runtime,
        provider_required_nodes(Provider::InstructGguf),
        ensured.restart_comfy,
    )?;
    let port = ensure_comfy_sees_instruct_gguf(app, db, processes, runtime, port)?;
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
        provider: Provider::InstructGguf.id().into(),
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

fn job_cancelled(cancelled: &Mutex<HashSet<String>>, job_id: &str) -> bool {
    cancelled
        .lock()
        .map(|set| set.contains(job_id))
        .unwrap_or(false)
}

/// Best-effort PNG / sidecar embedded prompt (A1111 parameters, Comfy prompt JSON).
pub fn read_embedded_prompt(image_path: &str) -> Result<Option<String>, String> {
    let path = Path::new(image_path);
    if !path.is_file() {
        return Err(format!("image not found: {image_path}"));
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if bytes.len() < 8 || &bytes[0..8] != b"\x89PNG\r\n\x1a\n" {
        return Ok(None);
    }
    if let Some(text) = scan_png_text(&bytes) {
        return Ok(Some(text));
    }
    Ok(None)
}

fn scan_png_text(bytes: &[u8]) -> Option<String> {
    let mut i = 8usize;
    while i + 12 <= bytes.len() {
        let len = u32::from_be_bytes([bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]])
            as usize;
        let ctype = &bytes[i + 4..i + 8];
        let data_start = i + 8;
        let data_end = data_start.saturating_add(len);
        if data_end + 4 > bytes.len() {
            break;
        }
        let data = &bytes[data_start..data_end];
        if ctype == b"tEXt" || ctype == b"iTXt" {
            if let Some(s) = parse_text_chunk(ctype, data) {
                return Some(s);
            }
        }
        if ctype == b"IEND" {
            break;
        }
        i = data_end + 4;
    }
    None
}

fn parse_text_chunk(ctype: &[u8], data: &[u8]) -> Option<String> {
    let nul = data.iter().position(|&b| b == 0)?;
    let key = std::str::from_utf8(&data[..nul]).ok()?.to_ascii_lowercase();
    let rest = &data[nul + 1..];
    let value = if ctype == b"tEXt" {
        String::from_utf8_lossy(rest).to_string()
    } else {
        // iTXt: compression flag, method, language, translated key, then text
        if rest.len() < 3 {
            return None;
        }
        let mut r = rest;
        // skip compression flag + method
        r = &r[2..];
        // language tag
        let lang_end = r.iter().position(|&b| b == 0)?;
        r = &r[lang_end + 1..];
        // translated keyword
        let tk_end = r.iter().position(|&b| b == 0)?;
        r = &r[tk_end + 1..];
        String::from_utf8_lossy(r).to_string()
    };
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    if key == "parameters" {
        // A1111: positive is before "Negative prompt:"
        let positive = value
            .split("Negative prompt:")
            .next()
            .unwrap_or(value)
            .trim();
        if !positive.is_empty() {
            return Some(positive.to_string());
        }
    }
    if key == "prompt" {
        // Comfy often stores JSON workflow; try to pull a string prompt field.
        if let Ok(v) = serde_json::from_str::<Value>(value) {
            if let Some(s) = extract_prompt_from_comfy_json(&v) {
                return Some(s);
            }
        }
        if !value.starts_with('{') {
            return Some(value.to_string());
        }
    }
    if key == "comment" || key == "description" {
        return Some(value.to_string());
    }
    None
}

fn extract_prompt_from_comfy_json(v: &Value) -> Option<String> {
    if let Some(s) = v.as_str() {
        let t = s.trim();
        if !t.is_empty() && !t.starts_with('{') {
            return Some(t.to_string());
        }
    }
    if let Some(obj) = v.as_object() {
        for key in ["text", "prompt", "positive", "string"] {
            if let Some(s) = obj.get(key).and_then(|x| x.as_str()) {
                let t = s.trim();
                if !t.is_empty() {
                    return Some(t.to_string());
                }
            }
        }
        for (_k, val) in obj {
            if let Some(s) = extract_prompt_from_comfy_json(val) {
                return Some(s);
            }
        }
    }
    if let Some(arr) = v.as_array() {
        for item in arr {
            if let Some(s) = extract_prompt_from_comfy_json(item) {
                return Some(s);
            }
        }
    }
    None
}

/// Persist bytes from the webview (upload / paste) into app temp for Comfy staging.
pub fn save_temp_image(app: &AppHandle, bytes: Vec<u8>, ext: &str) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("empty image data".into());
    }
    let ext_lower = ext.trim().trim_start_matches('.').to_ascii_lowercase();
    let safe_ext = match ext_lower.as_str() {
        "jpg" | "jpeg" => "jpg",
        "webp" => "webp",
        "png" | "" => "png",
        other if other.len() <= 8 && other.chars().all(|c| c.is_ascii_alphanumeric()) => other,
        _ => "png",
    };
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("prompt-tools");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("upload_{}.{}", Uuid::new_v4().simple(), safe_ext));
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

/// Free Comfy VRAM if the runtime is up (no-op if unhealthy).
pub fn free_comfy_vram(
    app: &AppHandle,
    db: &Mutex<Db>,
    processes: &Mutex<ProcessState>,
) -> Result<(), String> {
    let runtime = {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
            .ok_or_else(|| "ComfyUI is not installed".to_string())?
    };
    let port = ensure_comfy_running(app, db, processes, &runtime)?;
    generate::free_vram(port)?;
    Ok(())
}
