use crate::generate::types::ComfyImageRef;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::io::ErrorKind;
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{connect, Message, WebSocket};

pub(crate) fn job_cancelled(cancelled: &Mutex<HashSet<String>>, job_id: &str) -> bool {
    cancelled
        .lock()
        .map(|set| set.contains(job_id))
        .unwrap_or(false)
}

pub(crate) type ComfySocket = WebSocket<MaybeTlsStream<TcpStream>>;

pub(crate) fn connect_comfy_ws(port: u16, client_id: &str) -> Result<ComfySocket, String> {
    let url = format!("ws://127.0.0.1:{port}/ws?clientId={client_id}");
    let (mut socket, _) = connect(&url).map_err(|e| format!("Comfy /ws connect failed: {e}"))?;
    match socket.get_mut() {
        MaybeTlsStream::Plain(stream) => {
            stream
                .set_read_timeout(Some(Duration::from_millis(400)))
                .map_err(|e| e.to_string())?;
        }
        _ => {}
    }
    Ok(socket)
}

fn preview_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("previews"))
}

fn write_preview_frame(app: &AppHandle, job_id: &str, slot: u8, payload: &[u8]) -> Option<PathBuf> {
    // Classic Comfy binary preview: 4-byte type + 4-byte format + image bytes.
    let image = if payload.len() > 8
        && (payload[8..].starts_with(&[0xFF, 0xD8]) || payload[8..].starts_with(&[0x89, 0x50]))
    {
        &payload[8..]
    } else if payload.starts_with(&[0xFF, 0xD8]) || payload.starts_with(&[0x89, 0x50]) {
        payload
    } else if payload.len() > 8 {
        &payload[8..]
    } else {
        return None;
    };
    if image.is_empty() {
        return None;
    }
    let ext = if image.starts_with(&[0xFF, 0xD8]) {
        "jpg"
    } else if image.starts_with(&[0x89, 0x50]) {
        "png"
    } else {
        "bin"
    };
    let dir = preview_dir(app).ok()?;
    let _ = fs::create_dir_all(&dir);
    // A/B paths so the UI can keep reading the previous frame while we write the next.
    let path = dir.join(format!("{job_id}_{slot}.{ext}"));
    fs::write(&path, image).ok()?;
    Some(path)
}

fn history_entry(port: u16, prompt_id: &str) -> Result<Option<Value>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("http://127.0.0.1:{port}/history/{prompt_id}");
    let res = client.get(&url).send().map_err(|e| {
        format!(
            "ComfyUI is not responding on port {port} (it may have crashed while loading a model). {e}"
        )
    })?;
    if !res.status().is_success() {
        return Ok(None);
    }
    let history: Value = res.json().map_err(|e| e.to_string())?;
    Ok(history.get(prompt_id).cloned())
}

/// Collect STRING / text outputs from a finished Comfy history entry (utility jobs).
pub fn collect_text(entry: &Value) -> Result<String, String> {
    let Some(outputs) = entry.get("outputs").and_then(|v| v.as_object()) else {
        return Err("Comfy history has no outputs".into());
    };

    // Prefer caption-like keys; skip "PROMPT" when a sibling STRING exists (JoyCaption adv).
    let tier1 = ["captions", "STRING", "string", "text", "output"];
    let tier2 = ["PROMPT", "selected analyze"];

    let mut tier1_hits: Vec<String> = Vec::new();
    let mut tier2_hits: Vec<String> = Vec::new();
    let mut fallback: Vec<String> = Vec::new();

    for (_node_id, node_out) in outputs {
        let Some(obj) = node_out.as_object() else {
            continue;
        };
        for (key, val) in obj {
            let texts = strings_from_value(val);
            if texts.is_empty() {
                continue;
            }
            if tier1.iter().any(|p| key.eq_ignore_ascii_case(p)) {
                tier1_hits.extend(texts);
            } else if tier2.iter().any(|p| key.eq_ignore_ascii_case(p)) {
                tier2_hits.extend(texts);
            } else if key.eq_ignore_ascii_case("images")
                || key.eq_ignore_ascii_case("filenames")
                || key.eq_ignore_ascii_case("folder_path")
                || key.eq_ignore_ascii_case("batch_size")
            {
                continue;
            } else {
                fallback.extend(texts);
            }
        }
    }

    let joined = if !tier1_hits.is_empty() {
        tier1_hits.join("\n")
    } else if !tier2_hits.is_empty() {
        tier2_hits.join("\n")
    } else {
        fallback.join("\n")
    };
    let trimmed = joined.trim().to_string();
    if trimmed.is_empty() {
        return Err("Comfy finished but returned no text".into());
    }
    Ok(trimmed)
}

fn strings_from_value(val: &Value) -> Vec<String> {
    match val {
        Value::String(s) => normalize_text_string(s),
        Value::Array(arr) => arr
            .iter()
            .flat_map(|v| match v {
                Value::String(s) => normalize_text_string(s),
                _ => Vec::new(),
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// Unwrap PreviewAny / list-serialized captions (`["tags…"]`) into plain text.
fn normalize_text_string(s: &str) -> Vec<String> {
    let t = s.trim();
    if t.is_empty() {
        return Vec::new();
    }
    if t.starts_with('[') {
        if let Ok(Value::Array(arr)) = serde_json::from_str::<Value>(t) {
            let parts: Vec<String> = arr
                .iter()
                .filter_map(|v| v.as_str().map(|x| x.trim().to_string()))
                .filter(|x| !x.is_empty())
                .collect();
            if !parts.is_empty() {
                return vec![parts.join("\n")];
            }
        }
    }
    vec![t.to_string()]
}

fn text_from_history_entry(entry: &Value) -> Result<Option<String>, String> {
    if let Some(status) = entry.get("status") {
        let completed = status
            .get("completed")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let status_str = status
            .get("status_str")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if status_str.eq_ignore_ascii_case("error")
            || status_str.to_ascii_lowercase().contains("error")
        {
            let messages = status.get("messages").cloned().unwrap_or(json!([]));
            return Err(format!("Comfy job failed: {messages}"));
        }
        if completed || status_str.eq_ignore_ascii_case("success") {
            return Ok(Some(collect_text(entry)?));
        }
    }
    if entry.get("outputs").is_some() {
        if let Ok(text) = collect_text(entry) {
            return Ok(Some(text));
        }
    }
    Ok(None)
}

/// Wait for a text-producing Comfy prompt (history poll; no gallery).
pub fn wait_for_text(
    port: u16,
    prompt_id: &str,
    timeout: Duration,
    cancelled: &Mutex<HashSet<String>>,
    job_id: &str,
) -> Result<String, String> {
    let started = std::time::Instant::now();
    loop {
        if job_cancelled(cancelled, job_id) {
            return Err("cancelled".into());
        }
        if started.elapsed() > timeout {
            return Err(format!("timed out waiting for Comfy prompt {prompt_id}"));
        }
        if let Some(entry) = history_entry(port, prompt_id)? {
            if let Some(text) = text_from_history_entry(&entry)? {
                return Ok(text);
            }
        }
        thread::sleep(Duration::from_millis(800));
    }
}

fn outputs_from_history_entry(entry: &Value) -> Result<Option<Vec<ComfyImageRef>>, String> {
    if let Some(status) = entry.get("status") {
        let completed = status
            .get("completed")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let status_str = status
            .get("status_str")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if status_str.eq_ignore_ascii_case("error")
            || status_str.to_ascii_lowercase().contains("error")
        {
            let messages = status.get("messages").cloned().unwrap_or(json!([]));
            return Err(format!("Comfy job failed: {messages}"));
        }
        if completed || status_str.eq_ignore_ascii_case("success") {
            return Ok(Some(collect_images(entry)?));
        }
    }
    // Some builds populate outputs before status.completed flips.
    if entry.get("outputs").is_some() {
        let images = collect_images(entry)?;
        if !images.is_empty() {
            return Ok(Some(images));
        }
    }
    Ok(None)
}

/// Wait via Comfy `/ws` for progress + latent previews; fall back to `/history` poll.
/// Pass an already-open socket from before `/prompt` so previews are routed here.
pub fn wait_for_outputs(
    app: &AppHandle,
    socket: Option<ComfySocket>,
    port: u16,
    prompt_id: &str,
    timeout: Duration,
    cancelled: &Mutex<HashSet<String>>,
    job_id: &str,
) -> Result<Vec<ComfyImageRef>, String> {
    match socket {
        Some(socket) => wait_via_ws(app, socket, port, prompt_id, timeout, cancelled, job_id),
        None => wait_via_history(port, prompt_id, timeout, cancelled, job_id),
    }
}

fn wait_via_ws(
    app: &AppHandle,
    mut socket: ComfySocket,
    port: u16,
    prompt_id: &str,
    timeout: Duration,
    cancelled: &Mutex<HashSet<String>>,
    job_id: &str,
) -> Result<Vec<ComfyImageRef>, String> {
    let started = std::time::Instant::now();
    let mut last_step_emit = std::time::Instant::now()
        .checked_sub(Duration::from_secs(1))
        .unwrap_or_else(std::time::Instant::now);
    let mut preview_slot: u8 = 0;

    loop {
        if job_cancelled(cancelled, job_id) {
            let _ = socket.close(None);
            return Err("cancelled".into());
        }
        if started.elapsed() > timeout {
            let _ = socket.close(None);
            return Err(format!("timed out waiting for Comfy prompt {prompt_id}"));
        }

        match socket.read() {
            Ok(Message::Text(text)) => {
                let Ok(msg) = serde_json::from_str::<Value>(&text) else {
                    continue;
                };
                let msg_type = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
                let data = msg.get("data").cloned().unwrap_or(json!({}));
                let msg_prompt = data.get("prompt_id").and_then(|v| v.as_str()).unwrap_or("");

                if msg_type == "progress" && (msg_prompt.is_empty() || msg_prompt == prompt_id) {
                    let value = data.get("value").and_then(|v| v.as_u64()).unwrap_or(0);
                    let max = data.get("max").and_then(|v| v.as_u64()).unwrap_or(0);
                    // Throttle UI emits a bit - sampler can fire very fast.
                    if last_step_emit.elapsed() >= Duration::from_millis(120) || value >= max {
                        last_step_emit = std::time::Instant::now();
                        let message = if max > 0 {
                            format!("Sampling… {value}/{max}")
                        } else {
                            "Sampling…".into()
                        };
                        let _ = app.emit(
                            "jobs://progress",
                            crate::ipc::JobProgress {
                                step: Some(value as u32),
                                max: Some(max as u32),
                                ..crate::ipc::JobProgress::new(job_id, "step", message)
                            },
                        );
                    }
                } else if msg_type == "execution_error"
                    && (msg_prompt.is_empty() || msg_prompt == prompt_id)
                {
                    let _ = socket.close(None);
                    return Err(format!("Comfy execution error: {data}"));
                } else if msg_type == "executing"
                    && msg_prompt == prompt_id
                    && data.get("node").is_some_and(|v| v.is_null())
                {
                    let _ = socket.close(None);
                    // Done - pull final outputs from history.
                    for _ in 0..40 {
                        if let Some(entry) = history_entry(port, prompt_id)? {
                            if let Some(images) = outputs_from_history_entry(&entry)? {
                                return Ok(images);
                            }
                        }
                        thread::sleep(Duration::from_millis(200));
                    }
                    return Err("Comfy finished but history had no images".into());
                }
            }
            Ok(Message::Binary(bin)) => {
                if let Some(path) = write_preview_frame(app, job_id, preview_slot, &bin) {
                    preview_slot ^= 1;
                    let _ = app.emit(
                        "jobs://progress",
                        crate::ipc::JobProgress {
                            preview_path: Some(path.display().to_string()),
                            ..crate::ipc::JobProgress::new(job_id, "preview", "Preview")
                        },
                    );
                }
            }
            Ok(Message::Ping(p)) => {
                let _ = socket.send(Message::Pong(p));
            }
            Ok(Message::Close(_)) | Ok(Message::Frame(_)) => {}
            Ok(Message::Pong(_)) => {}
            Err(tungstenite::Error::Io(err))
                if err.kind() == ErrorKind::WouldBlock || err.kind() == ErrorKind::TimedOut =>
            {
                // Soft-poll history so we still finish if WS misses the done event.
                if let Ok(Some(entry)) = history_entry(port, prompt_id) {
                    if let Ok(Some(images)) = outputs_from_history_entry(&entry) {
                        let _ = socket.close(None);
                        return Ok(images);
                    }
                }
            }
            Err(e) => {
                let _ = socket.close(None);
                // Fall back to history polling if the socket dies mid-job.
                return wait_via_history(
                    port,
                    prompt_id,
                    timeout.saturating_sub(started.elapsed()),
                    cancelled,
                    job_id,
                )
                .map_err(|hist| format!("Comfy /ws error: {e}; history fallback: {hist}"));
            }
        }
    }
}

fn wait_via_history(
    port: u16,
    prompt_id: &str,
    timeout: Duration,
    cancelled: &Mutex<HashSet<String>>,
    job_id: &str,
) -> Result<Vec<ComfyImageRef>, String> {
    let started = std::time::Instant::now();
    loop {
        if job_cancelled(cancelled, job_id) {
            return Err("cancelled".into());
        }
        if started.elapsed() > timeout {
            return Err(format!("timed out waiting for Comfy prompt {prompt_id}"));
        }
        if let Some(entry) = history_entry(port, prompt_id)? {
            if let Some(images) = outputs_from_history_entry(&entry)? {
                return Ok(images);
            }
        }
        thread::sleep(Duration::from_millis(800));
    }
}

fn collect_images(entry: &Value) -> Result<Vec<ComfyImageRef>, String> {
    let mut out = Vec::new();
    let Some(outputs) = entry.get("outputs").and_then(|v| v.as_object()) else {
        return Ok(out);
    };
    for (_node_id, node_out) in outputs {
        let Some(images) = node_out.get("images").and_then(|v| v.as_array()) else {
            continue;
        };
        for img in images {
            let filename = img
                .get("filename")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if filename.is_empty() {
                continue;
            }
            out.push(ComfyImageRef {
                filename,
                subfolder: img
                    .get("subfolder")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                image_type: img
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("output")
                    .to_string(),
            });
        }
    }
    Ok(out)
}
