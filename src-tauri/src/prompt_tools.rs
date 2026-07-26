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
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

const EVENT_PROGRESS: &str = "prompt-tools://progress";
const EVENT_UPDATED: &str = "prompt-tools://updated";

/// Shared Qwen3-VL-8B (HF transformers, 4-bit) for Image→Prompt + Prompt Enhancer.
/// GGUF/llama-cpp was tried first but hard-crashed Comfy on CUDA load (cu131 wheel vs cu130 torch).
pub const QWENVL_MODEL_ID: &str = "qwen3-vl-8b";
const QWENVL_MODEL_NAME: &str = "Qwen3-VL-8B-Instruct";
const QWENVL_HF_REPO: &str = "Qwen/Qwen3-VL-8B-Instruct";
const QWENVL_QUANT: &str = "4-bit (VRAM-friendly)";

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
    QwenVl,
}

impl Provider {
    fn pin_id(self) -> &'static str {
        "qwenvl"
    }

    fn id(self) -> &'static str {
        "qwenvl"
    }
}

fn provider_for_format(_format: PromptFormat) -> Provider {
    Provider::QwenVl
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
        "modelId": QWENVL_MODEL_ID,
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

fn portable_root(app: &AppHandle) -> Result<PathBuf, String> {
    comfy::find_portable_root(&comfy::runtimes_dir(app)?.join("portable")).map_err(|_| {
        "ComfyUI portable not found — install the runtime before Prompt Tools".to_string()
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

/// HF hub files for Qwen3-VL-8B-Instruct (skip README / .gitattributes).
pub const QWENVL_HF_FILES: &[&str] = &[
    "chat_template.json",
    "config.json",
    "generation_config.json",
    "merges.txt",
    "model-00001-of-00004.safetensors",
    "model-00002-of-00004.safetensors",
    "model-00003-of-00004.safetensors",
    "model-00004-of-00004.safetensors",
    "model.safetensors.index.json",
    "preprocessor_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "video_preprocessor_config.json",
    "vocab.json",
];

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
    Ok(vec![PromptToolWeightInfo {
        id: QWENVL_MODEL_ID.into(),
        name: "Qwen3-VL-8B Instruct (4-bit)".into(),
        description: "Image→Prompt + Prompt Enhancer (shared vision-language model)".into(),
        ready: node_ready(app, "qwenvl") && qwenvl_weights_ready(app),
        provider: "qwenvl".into(),
    }])
}

/// `restart_comfy` — caller should bounce the runtime so new pip packages / nodes load.
pub struct EnsureOutcome {
    pub restart_comfy: bool,
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
            emit_progress(app, "install", "Ensuring ComfyUI-QwenVL custom node…", None);
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
        Some(json!({ "providerId": "qwenvl", "filename": QWENVL_MODEL_NAME })),
    );
    Ok(EnsureOutcome { restart_comfy })
}

fn provider_required_nodes(_provider: Provider) -> &'static [&'static str] {
    &[
        "AILab_QwenVL",
        "AILab_QwenVL_PromptEnhancer",
        "PreviewAny",
    ]
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
            Some(json!({ "filename": filename })),
        );
        download::clear_cancel();
        download::download_file(app, &hf_resolve_url(filename), &dest, None)?;
        if !download::local_file_complete(&dest) {
            return Err(format!(
                "download incomplete for {filename} — reopen Downloads / retry Image→Prompt to resume"
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
        return Err("ComfyUI portable python.exe missing — cannot install QwenVL deps".into());
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
            Some(json!({ "filename": "requirements.txt" })),
        );
        let status = Command::new(&python)
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

/// Checklist so captions are dense enough to recreate the image as closely as text allows.
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

fn build_qwenvl_image(filename: &str, custom_prompt: &str) -> Value {
    json!({
        "1": {
            "class_type": "LoadImage",
            "inputs": { "image": filename }
        },
        "2": {
            "class_type": "AILab_QwenVL",
            "inputs": {
                "image": ["1", 0],
                "model_name": QWENVL_MODEL_NAME,
                "quantization": QWENVL_QUANT,
                "attention_mode": "auto",
                "preset_prompt": "🖼️ Detailed Description",
                "custom_prompt": custom_prompt,
                "max_tokens": 1024,
                "keep_model_loaded": false,
                "seed": 1
            }
        },
        "3": preview_any_node(("2", 0))
    })
}

fn build_enhance_workflow(prompt: &str, target: PromptTarget, mode: &str) -> Value {
    let system = enhance_system_prompt(target, mode);
    json!({
        "1": {
            "class_type": "AILab_QwenVL_PromptEnhancer",
            "inputs": {
                "model_name": QWENVL_MODEL_NAME,
                "quantization": QWENVL_QUANT,
                "attention_mode": "auto",
                "use_torch_compile": false,
                "device": "auto",
                "prompt_text": prompt,
                "enhancement_style": "📝 Enhance",
                "custom_system_prompt": system,
                "max_tokens": 768,
                "temperature": 0.7,
                "top_p": 0.9,
                "repetition_penalty": 1.1,
                "keep_model_loaded": false,
                "seed": 1
            }
        },
        "2": preview_any_node(("1", 0))
    })
}

fn build_workflow(
    format: PromptFormat,
    target: PromptTarget,
    filename: &str,
) -> Result<Value, String> {
    Ok(match format {
        PromptFormat::General => build_qwenvl_image(filename, &general_custom_prompt(target)),
        PromptFormat::Structured => {
            build_qwenvl_image(filename, &structured_custom_prompt(target))
        }
        PromptFormat::Json => build_qwenvl_image(filename, &json_custom_prompt(target)),
        PromptFormat::GraphicDesign => {
            build_qwenvl_image(filename, &graphic_custom_prompt(target))
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
