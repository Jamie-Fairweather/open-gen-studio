//! Creator Mode: Comfy webview + workflow capture / packaging helpers.

use crate::blueprints::BlueprintControl;
use crate::comfy::{self, ProcessState};
use crate::db::Db;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const CREATOR_WINDOW_LABEL: &str = "creator-comfy";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedModel {
    pub filename: String,
    pub path: String,
    #[serde(default)]
    pub url: String,
    /// True when the download URL is a gated Hugging Face repo (needs token).
    #[serde(default)]
    pub gated: bool,
}

/// Model download metadata embedded in ComfyUI workflows / node properties
/// (same source as the Missing Models "Copy URL" / Download buttons).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedModel {
    pub name: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub directory: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturedWorkflow {
    pub workflow: Value,
    #[serde(default)]
    pub embedded_models: Vec<EmbeddedModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedControl {
    pub id: String,
    #[serde(rename = "type")]
    pub control_type: String,
    #[serde(default)]
    pub node_id: String,
    #[serde(default)]
    pub input: String,
    pub label: String,
    pub group: String,
    #[serde(default)]
    pub default: Option<Value>,
    /// Pre-checked in the Save dialog.
    pub include: bool,
    /// Required for the blueprint — locked in the Save dialog (always saved).
    #[serde(default)]
    pub fixed: bool,
}

/// Scalar widget input on a Comfy API workflow node (bindable to a UI slot).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BindableInput {
    pub node_id: String,
    pub input: String,
    pub class_type: String,
    /// "number" | "string" | "boolean"
    pub kind: String,
    pub current: Value,
    #[serde(default)]
    pub title: Option<String>,
}

struct UiSlot {
    id: &'static str,
    control_type: &'static str,
    label: &'static str,
    group: &'static str,
    fixed: bool,
    /// Always emit even when unbound (so the dialog can map it).
    always_emit: bool,
    /// Default include when matched.
    include_when_matched: bool,
}

/// Ensure Comfy is running and return its UI URL.
pub fn ensure_comfy_url(
    app: &AppHandle,
    db: &Mutex<Db>,
    processes: &Mutex<ProcessState>,
) -> Result<String, String> {
    let runtime = {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.get_runtime_by_engine(comfy::ENGINE)?
            .ok_or_else(|| "ComfyUI is not installed — open Settings to install".to_string())?
    };
    if runtime.install_path.is_empty()
        || runtime.status == "error"
        || runtime.status == "installing"
    {
        return Err("ComfyUI install is not ready — open Settings".into());
    }

    let port = runtime.port.unwrap_or(comfy::DEFAULT_PORT as i64) as u16;
    if !comfy::health(port)? {
        comfy::start(app, processes, &runtime, port)?;
        comfy::wait_until_healthy(port, 60)?;
        {
            let db = db.lock().map_err(|e| e.to_string())?;
            if let Ok(updated) =
                db.update_runtime_status(&runtime.id, "running", Some(port as i64), None)
            {
                let _ = app.emit("runtimes://updated", &updated);
            }
        }
        let _ = app.emit(
            "runtimes://progress",
            json!({
                "engine": comfy::ENGINE,
                "stage": "ready",
                "message": format!("ComfyUI is healthy on 127.0.0.1:{port}"),
            }),
        );
    }

    Ok(format!("http://127.0.0.1:{port}"))
}

/// Open (or focus) the Creator ComfyUI webview. Must be called from an async command on Windows.
pub async fn open_comfy_window(app: AppHandle, url: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(CREATOR_WINDOW_LABEL) {
        let _ = win.set_focus();
        let parsed = url.parse().map_err(|e| format!("invalid url: {e}"))?;
        let _ = win.navigate(parsed);
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app,
        CREATOR_WINDOW_LABEL,
        WebviewUrl::External(url.parse().map_err(|e| format!("invalid url: {e}"))?),
    )
    .title("Creator — ComfyUI")
    .inner_size(1280.0, 800.0)
    .resizable(true)
    .build()
    .map_err(|e| format!("failed to open Creator window: {e}"))?;

    Ok(())
}

/// Pull API-format workflow (+ embedded model URLs) from the Creator Comfy webview.
/// Uses a one-shot localhost POST bridge (Tauri eval cannot return values from external pages).
pub async fn capture_workflow(app: AppHandle) -> Result<CapturedWorkflow, String> {
    let win = app
        .get_webview_window(CREATOR_WINDOW_LABEL)
        .ok_or_else(|| {
            "Creator Comfy window is not open — click Open Comfy first".to_string()
        })?;
    capture_workflow_bridge(win).await
}

async fn capture_workflow_bridge(win: tauri::WebviewWindow) -> Result<CapturedWorkflow, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;

    let (tx, rx) = mpsc::channel::<Result<String, String>>();
    thread::spawn(move || {
        let deadline = std::time::Instant::now() + Duration::from_secs(20);
        let mut body_result: Option<Result<String, String>> = None;
        while std::time::Instant::now() < deadline {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                    let _ = stream.set_nonblocking(false);
                    let mut buf = Vec::new();
                    let mut tmp = [0u8; 8192];
                    while let Ok(n) = stream.read(&mut tmp) {
                        if n == 0 {
                            break;
                        }
                        buf.extend_from_slice(&tmp[..n]);
                        if buf.windows(4).any(|w| w == b"\r\n\r\n") {
                            // Got headers; if OPTIONS, reply CORS and continue.
                            let req = String::from_utf8_lossy(&buf);
                            if req.starts_with("OPTIONS") {
                                let _ = stream.write_all(
                                    b"HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: content-type\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                                );
                                break;
                            }
                            if let Some(body) = http_body_if_complete(&buf) {
                                let _ = stream.write_all(
                                    b"HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: text/plain\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok",
                                );
                                body_result = Some(Ok(body));
                                break;
                            }
                        }
                        if buf.len() > 32 * 1024 * 1024 {
                            body_result = Some(Err("capture payload too large".into()));
                            break;
                        }
                    }
                    if body_result.is_some() {
                        break;
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(20));
                }
                Err(e) => {
                    body_result = Some(Err(format!("capture accept: {e}")));
                    break;
                }
            }
        }
        let _ = tx.send(body_result.unwrap_or_else(|| {
            Err("timed out waiting for workflow from ComfyUI (is the Creator window loaded?)".into())
        }));
    });

    let js = format!(
        r#"(async () => {{
          try {{
            const app = window.app;
            if (!app || typeof app.graphToPrompt !== 'function') {{
              throw new Error('ComfyUI is still loading — wait a moment and try again');
            }}
            const collect = (graph, out) => {{
              if (!graph) return;
              for (const n of graph.nodes || []) {{
                for (const m of (n.properties && n.properties.models) || []) {{
                  if (m && m.name && m.url) out.push({{ name: m.name, url: m.url, directory: m.directory || '' }});
                }}
              }}
              for (const m of graph.models || []) {{
                if (m && m.name && m.url) out.push({{ name: m.name, url: m.url, directory: m.directory || '' }});
              }}
              const subs = (graph.definitions && graph.definitions.subgraphs)
                || (graph.extra && graph.extra.subgraphs) || [];
              for (const sg of subs) collect(sg, out);
            }};
            const embedded = [];
            // Live graph node properties (what Missing Models "Copy URL" uses).
            for (const n of (app.graph && (app.graph._nodes || app.graph.nodes)) || []) {{
              for (const m of (n.properties && n.properties.models) || []) {{
                if (m && m.name && m.url) embedded.push({{ name: m.name, url: m.url, directory: m.directory || '' }});
              }}
            }}
            const result = await app.graphToPrompt();
            const output = result && result.output ? result.output : result;
            collect(result && result.workflow, embedded);
            await fetch('http://127.0.0.1:{port}/capture', {{
              method: 'POST',
              headers: {{ 'Content-Type': 'application/json' }},
              body: JSON.stringify({{ workflow: output ?? {{}}, embeddedModels: embedded }}),
            }});
          }} catch (e) {{
            await fetch('http://127.0.0.1:{port}/capture', {{
              method: 'POST',
              headers: {{ 'Content-Type': 'application/json' }},
              body: JSON.stringify({{ __oga_error: String(e) }}),
            }});
          }}
        }})()"#,
        port = port
    );

    win.eval(&js).map_err(|e| format!("failed to run capture script: {e}"))?;

    let body = tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(Duration::from_secs(22))
            .map_err(|_| "timed out waiting for ComfyUI workflow".to_string())?
    })
    .await
    .map_err(|e| format!("capture wait failed: {e}"))??;

    let payload: Value =
        serde_json::from_str(&body).map_err(|e| format!("invalid workflow JSON: {e}"))?;
    if let Some(err) = payload.get("__oga_error").and_then(|v| v.as_str()) {
        return Err(err.to_string());
    }

    // Envelope from capture script; also accept bare API workflow for safety.
    let (workflow, embedded_models) = if payload.get("workflow").is_some() {
        let workflow = payload
            .get("workflow")
            .cloned()
            .unwrap_or(Value::Object(Default::default()));
        let embedded_models = payload
            .get("embeddedModels")
            .and_then(|v| serde_json::from_value::<Vec<EmbeddedModel>>(v.clone()).ok())
            .unwrap_or_default();
        (workflow, embedded_models)
    } else {
        (payload, Vec::new())
    };

    if !workflow.is_object() {
        return Err("Comfy returned an empty or non-object workflow".into());
    }
    Ok(CapturedWorkflow {
        workflow,
        embedded_models: dedupe_embedded(embedded_models),
    })
}

fn http_body_if_complete(buf: &[u8]) -> Option<String> {
    let text = std::str::from_utf8(buf).ok()?;
    let header_end = text.find("\r\n\r\n")?;
    let headers = &text[..header_end];
    let body = &text[header_end + 4..];
    let mut content_length = None;
    for line in headers.lines().skip(1) {
        let mut parts = line.splitn(2, ':');
        if let (Some(k), Some(v)) = (parts.next(), parts.next()) {
            if k.eq_ignore_ascii_case("content-length") {
                content_length = v.trim().parse::<usize>().ok();
            }
        }
    }
    if let Some(len) = content_length {
        if body.len() >= len {
            return Some(body[..len].to_string());
        }
        return None;
    }
    // No content-length — treat what we have as complete if connection likely done.
    if !body.is_empty() {
        Some(body.to_string())
    } else {
        None
    }
}

/// Scan API workflow for model loader filenames, filling download URLs from
/// Comfy embedded metadata when available.
pub fn suggest_models(workflow: &Value, embedded: &[EmbeddedModel]) -> Vec<SuggestedModel> {
    let Some(obj) = workflow.as_object() else {
        // UI-format import: still surface models that have URLs.
        return models_from_embedded_only(embedded);
    };

    // Bare API map is keyed by node id; UI save format has a top-level "nodes" array.
    if obj.contains_key("nodes") && !obj.values().any(|v| v.get("class_type").is_some()) {
        let from_ui = extract_embedded_from_ui(workflow);
        let merged = merge_embedded(embedded, &from_ui);
        return models_from_embedded_only(&merged);
    }

    let mut seen = HashSet::new();
    let mut out = Vec::new();

    for (_id, node) in obj {
        let class = node
            .get("class_type")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let inputs = node.get("inputs").and_then(|v| v.as_object());
        let Some(inputs) = inputs else { continue };

        let mapping: Option<(&str, &str)> = match class {
            "CheckpointLoaderSimple" => Some(("ckpt_name", "checkpoints")),
            "UNETLoader" | "UnetLoader" => Some(("unet_name", "diffusion_models")),
            "VAELoader" => Some(("vae_name", "vae")),
            "CLIPLoader" | "DualCLIPLoader" | "TripleCLIPLoader" => None,
            "LoraLoader" | "LoraLoaderModelOnly" => Some(("lora_name", "loras")),
            "ControlNetLoader" => Some(("control_net_name", "controlnet")),
            "UpscaleModelLoader" => Some(("model_name", "upscale_models")),
            _ => None,
        };

        if let Some((key, folder)) = mapping {
            if let Some(filename) = inputs.get(key).and_then(|v| v.as_str()) {
                push_model(&mut seen, &mut out, filename, folder, embedded);
            }
        }

        if matches!(
            class,
            "CLIPLoader" | "DualCLIPLoader" | "TripleCLIPLoader"
        ) {
            for key in ["clip_name", "clip_name1", "clip_name2", "clip_name3"] {
                if let Some(filename) = inputs.get(key).and_then(|v| v.as_str()) {
                    push_model(&mut seen, &mut out, filename, "text_encoders", embedded);
                }
            }
        }
    }

    // Include any embedded models the loader scan missed (custom nodes, etc.).
    for m in embedded {
        if m.name.is_empty() || m.url.is_empty() {
            continue;
        }
        let path = if m.directory.is_empty() {
            guess_folder_from_name(&m.name)
        } else {
            normalize_model_dir(&m.directory)
        };
        push_model(&mut seen, &mut out, &m.name, &path, embedded);
    }

    out
}

fn push_model(
    seen: &mut HashSet<String>,
    out: &mut Vec<SuggestedModel>,
    filename: &str,
    path: &str,
    embedded: &[EmbeddedModel],
) {
    if filename.is_empty() {
        return;
    }
    let key = format!("{path}/{filename}");
    if !seen.insert(key) {
        return;
    }
    out.push(SuggestedModel {
        filename: filename.into(),
        path: path.into(),
        url: lookup_embedded_url(embedded, filename, path),
        gated: false,
    });
}

/// Stamp `gated` on models by probing URLs anonymously (HF GatedRepo / 401).
pub fn mark_gated_models(models: &mut [SuggestedModel]) {
    for m in models.iter_mut() {
        if m.url.trim().is_empty() {
            m.gated = false;
            continue;
        }
        m.gated = crate::download::url_is_gated(&m.url);
    }
}

fn models_from_embedded_only(embedded: &[EmbeddedModel]) -> Vec<SuggestedModel> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for m in embedded {
        if m.name.is_empty() {
            continue;
        }
        let path = if m.directory.is_empty() {
            guess_folder_from_name(&m.name)
        } else {
            normalize_model_dir(&m.directory)
        };
        push_model(&mut seen, &mut out, &m.name, &path, embedded);
    }
    out
}

fn lookup_embedded_url(embedded: &[EmbeddedModel], filename: &str, path: &str) -> String {
    let base = filename.rsplit(['/', '\\']).next().unwrap_or(filename);
    let path_norm = normalize_model_dir(path);

    // Prefer name + directory match, then exact name, then basename.
    for m in embedded {
        if m.url.is_empty() {
            continue;
        }
        let dir = normalize_model_dir(&m.directory);
        if m.name == filename && (dir.is_empty() || dir == path_norm) {
            return m.url.clone();
        }
    }
    for m in embedded {
        if m.url.is_empty() {
            continue;
        }
        if m.name == filename || m.name == base {
            return m.url.clone();
        }
        let m_base = m.name.rsplit(['/', '\\']).next().unwrap_or(&m.name);
        if m_base == base {
            return m.url.clone();
        }
    }
    String::new()
}

fn normalize_model_dir(dir: &str) -> String {
    dir.trim()
        .trim_matches(['/', '\\'])
        .trim_start_matches("models/")
        .trim_start_matches("models\\")
        .replace('\\', "/")
}

fn guess_folder_from_name(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("lora") {
        "loras".into()
    } else if lower.contains("vae") || lower == "ae.safetensors" {
        "vae".into()
    } else if lower.contains("clip") || lower.contains("t5") || lower.contains("mistral") {
        "text_encoders".into()
    } else if lower.contains("control") {
        "controlnet".into()
    } else if lower.contains("upscale") || lower.contains("esrgan") {
        "upscale_models".into()
    } else {
        "diffusion_models".into()
    }
}

fn dedupe_embedded(models: Vec<EmbeddedModel>) -> Vec<EmbeddedModel> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for m in models {
        if m.name.is_empty() || m.url.is_empty() {
            continue;
        }
        let key = format!(
            "{}|{}|{}",
            m.name,
            normalize_model_dir(&m.directory),
            m.url
        );
        if seen.insert(key) {
            out.push(m);
        }
    }
    out
}

fn merge_embedded(a: &[EmbeddedModel], b: &[EmbeddedModel]) -> Vec<EmbeddedModel> {
    let mut all = a.to_vec();
    all.extend(b.iter().cloned());
    dedupe_embedded(all)
}

/// Pull `properties.models` / top-level `models` from a Comfy UI-format workflow JSON.
pub fn extract_embedded_from_ui(workflow: &Value) -> Vec<EmbeddedModel> {
    let mut out = Vec::new();
    collect_embedded_from_graph(workflow, &mut out);
    dedupe_embedded(out)
}

fn collect_embedded_from_graph(graph: &Value, out: &mut Vec<EmbeddedModel>) {
    if let Some(nodes) = graph.get("nodes").and_then(|v| v.as_array()) {
        for node in nodes {
            if let Some(models) = node
                .pointer("/properties/models")
                .and_then(|v| v.as_array())
            {
                for m in models {
                    push_embedded_value(m, out);
                }
            }
        }
    }
    if let Some(models) = graph.get("models").and_then(|v| v.as_array()) {
        for m in models {
            push_embedded_value(m, out);
        }
    }
    for key in [
        "/definitions/subgraphs",
        "/extra/subgraphs",
    ] {
        if let Some(subs) = graph.pointer(key).and_then(|v| v.as_array()) {
            for sg in subs {
                collect_embedded_from_graph(sg, out);
            }
        }
    }
}

fn push_embedded_value(m: &Value, out: &mut Vec<EmbeddedModel>) {
    let name = m.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let url = m.get("url").and_then(|v| v.as_str()).unwrap_or("");
    if name.is_empty() || url.is_empty() {
        return;
    }
    out.push(EmbeddedModel {
        name: name.into(),
        url: url.into(),
        directory: m
            .get("directory")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .into(),
    });
}

const UI_SLOTS: &[UiSlot] = &[
    UiSlot {
        id: "prompt",
        control_type: "textarea",
        label: "Prompt",
        group: "default",
        fixed: true,
        always_emit: true,
        include_when_matched: true,
    },
    UiSlot {
        id: "negative",
        control_type: "textarea",
        label: "Negative prompt",
        group: "default",
        fixed: true,
        always_emit: false, // only when the workflow has a negative encode
        include_when_matched: true,
    },
    UiSlot {
        id: "width",
        control_type: "number",
        label: "Width",
        group: "advanced",
        fixed: true,
        always_emit: true,
        include_when_matched: true,
    },
    UiSlot {
        id: "height",
        control_type: "number",
        label: "Height",
        group: "advanced",
        fixed: true,
        always_emit: true,
        include_when_matched: true,
    },
    UiSlot {
        id: "seed",
        control_type: "number",
        label: "Seed",
        group: "advanced",
        fixed: false,
        always_emit: true, // common — emit unbound so user can map noise_seed
        include_when_matched: true,
    },
    UiSlot {
        id: "steps",
        control_type: "number",
        label: "Steps",
        group: "advanced",
        fixed: false,
        always_emit: false,
        include_when_matched: true,
    },
    UiSlot {
        id: "cfg",
        control_type: "number",
        label: "CFG",
        group: "advanced",
        fixed: false,
        always_emit: false,
        include_when_matched: true,
    },
    UiSlot {
        id: "denoise",
        control_type: "number",
        label: "Denoise",
        group: "advanced",
        fixed: false,
        always_emit: false,
        include_when_matched: false,
    },
];

/// List scalar (non-link) inputs from an API-format workflow.
pub fn list_bindable_inputs(workflow: &Value) -> Vec<BindableInput> {
    let Some(obj) = workflow.as_object() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (node_id, node) in obj {
        // Skip non-node keys (UI-format roots, etc.)
        let class_type = match node.get("class_type").and_then(|v| v.as_str()) {
            Some(c) => c.to_string(),
            None => continue,
        };
        let Some(inputs) = node.get("inputs").and_then(|v| v.as_object()) else {
            continue;
        };
        let title = node
            .pointer("/_meta/title")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        for (input_name, value) in inputs {
            let Some(kind) = scalar_kind(value) else {
                continue;
            };
            out.push(BindableInput {
                node_id: node_id.clone(),
                input: input_name.clone(),
                class_type: class_type.clone(),
                kind: kind.into(),
                current: value.clone(),
                title: title.clone(),
            });
        }
    }
    out.sort_by(|a, b| {
        (&a.class_type, &a.node_id, &a.input).cmp(&(&b.class_type, &b.node_id, &b.input))
    });
    out
}

fn scalar_kind(value: &Value) -> Option<&'static str> {
    match value {
        Value::Number(_) => Some("number"),
        Value::String(_) => Some("string"),
        Value::Bool(_) => Some("boolean"),
        // Comfy link: ["nodeId", slotIndex]
        Value::Array(_) => None,
        Value::Null | Value::Object(_) => None,
    }
}

/// Map UI slots onto discovered workflow inputs (aliases + type).
pub fn suggest_controls(workflow: &Value) -> Vec<SuggestedControl> {
    let bindable = list_bindable_inputs(workflow);
    suggest_controls_from_bindable(&bindable)
}

pub fn suggest_controls_from_bindable(bindable: &[BindableInput]) -> Vec<SuggestedControl> {
    let mut claimed: HashSet<String> = HashSet::new();
    let mut out = Vec::new();

    // Prompt / negative from CLIP text encodes — prefer title hints, then order.
    let mut text_inputs: Vec<&BindableInput> = bindable
        .iter()
        .filter(|b| {
            b.input == "text"
                && b.kind == "string"
                && (b.class_type == "CLIPTextEncode"
                    || b.class_type == "CLIPTextEncodeSDXL"
                    || b.class_type == "CLIPTextEncodeFlux"
                    || b.class_type.contains("TextEncode"))
        })
        .collect();
    text_inputs.sort_by(|a, b| a.node_id.cmp(&b.node_id));

    let prompt_text = text_inputs
        .iter()
        .copied()
        .find(|b| title_hints_positive(b))
        .or_else(|| {
            text_inputs
                .iter()
                .copied()
                .find(|b| !title_hints_negative(b))
        })
        .or_else(|| text_inputs.first().copied());
    let prompt_key = prompt_text.map(binding_key);
    let negative_text = text_inputs
        .iter()
        .copied()
        .find(|b| title_hints_negative(b) && Some(binding_key(b)) != prompt_key)
        .or_else(|| {
            text_inputs
                .iter()
                .copied()
                .find(|b| Some(binding_key(b)) != prompt_key)
        });

    for slot in UI_SLOTS {
        let matched: Option<&BindableInput> = match slot.id {
            "prompt" => prompt_text,
            "negative" => negative_text,
            _ => find_alias_match(bindable, &claimed, slot),
        };

        if let Some(b) = matched {
            let key = binding_key(b);
            claimed.insert(key);
            out.push(SuggestedControl {
                id: slot.id.into(),
                control_type: slot.control_type.into(),
                node_id: b.node_id.clone(),
                input: b.input.clone(),
                label: slot.label.into(),
                group: slot.group.into(),
                default: Some(b.current.clone()),
                include: slot.include_when_matched || slot.fixed,
                fixed: slot.fixed,
            });
        } else if slot.fixed || slot.always_emit {
            out.push(SuggestedControl {
                id: slot.id.into(),
                control_type: slot.control_type.into(),
                node_id: String::new(),
                input: String::new(),
                label: slot.label.into(),
                group: slot.group.into(),
                default: None,
                include: slot.fixed,
                fixed: slot.fixed,
            });
        }
    }

    out
}

fn find_alias_match<'a>(
    bindable: &'a [BindableInput],
    claimed: &HashSet<String>,
    slot: &UiSlot,
) -> Option<&'a BindableInput> {
    let aliases: &[&str] = match slot.id {
        "width" => &["width"],
        "height" => &["height"],
        "seed" => &["seed", "noise_seed"],
        "steps" => &["steps"],
        "cfg" => &["cfg"],
        "denoise" => &["denoise"],
        _ => return None,
    };
    let want_kind = match slot.control_type {
        "number" | "slider" => "number",
        "textarea" => "string",
        _ => "string",
    };

    // Prefer exact alias order; among equals prefer shorter node ids (root over deep).
    for alias in aliases {
        let mut candidates: Vec<&BindableInput> = bindable
            .iter()
            .filter(|b| {
                b.input == *alias
                    && b.kind == want_kind
                    && !claimed.contains(&binding_key(b))
            })
            .collect();
        if candidates.is_empty() {
            continue;
        }
        candidates.sort_by(|a, b| {
            a.node_id
                .len()
                .cmp(&b.node_id.len())
                .then_with(|| a.node_id.cmp(&b.node_id))
        });
        return candidates.into_iter().next();
    }

    // PrimitiveInt/Float nodes often use input `value` with title Width/Height.
    if matches!(slot.id, "width" | "height") {
        let needle = slot.id;
        let mut candidates: Vec<&BindableInput> = bindable
            .iter()
            .filter(|b| {
                b.kind == "number"
                    && b.input == "value"
                    && !claimed.contains(&binding_key(b))
                    && b.title
                        .as_deref()
                        .map(|t| t.to_ascii_lowercase().contains(needle))
                        .unwrap_or(false)
            })
            .collect();
        candidates.sort_by(|a, b| a.node_id.cmp(&b.node_id));
        return candidates.into_iter().next();
    }

    None
}

fn title_hints_negative(b: &BindableInput) -> bool {
    let t = b.title.as_deref().unwrap_or("").to_ascii_lowercase();
    t.contains("negative")
}

fn title_hints_positive(b: &BindableInput) -> bool {
    let t = b.title.as_deref().unwrap_or("").to_ascii_lowercase();
    (t.contains("positive") || t.contains("prompt")) && !t.contains("negative")
}

fn binding_key(b: &BindableInput) -> String {
    format!("{}.{}", b.node_id, b.input)
}

/// Convert included suggestions into manifest controls.
pub fn controls_from_suggestions(suggestions: Vec<SuggestedControl>) -> Vec<BlueprintControl> {
    suggestions
        .into_iter()
        .filter(|c| (c.include || c.fixed) && !c.node_id.is_empty() && !c.input.is_empty())
        .map(|c| BlueprintControl {
            id: c.id,
            control_type: c.control_type,
            node_id: c.node_id,
            input: c.input,
            label: c.label,
            group: c.group,
            default: c.default,
        })
        .collect()
}
