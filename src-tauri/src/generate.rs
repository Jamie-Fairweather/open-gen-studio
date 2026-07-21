use crate::blueprints::{self, BlueprintControl};
use crate::comfy::{self, ProcessState};
use crate::db::{Db, GalleryItem, Job, RuntimeInstall};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{ErrorKind, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{connect, Message, WebSocket};
use uuid::Uuid;

/// Apply User Mode control values onto a Comfy API workflow object.
pub fn patch_workflow(
    workflow: &mut Value,
    controls: &[BlueprintControl],
    values: &HashMap<String, Value>,
) -> Result<(), String> {
    let obj = workflow
        .as_object_mut()
        .ok_or_else(|| "workflow must be a JSON object".to_string())?;

    for control in controls {
        let Some(value) = values.get(&control.id) else {
            continue;
        };
        if value.is_null() {
            continue;
        }

        let node = obj.get_mut(&control.node_id).ok_or_else(|| {
            format!(
                "workflow missing node '{}' for control '{}'",
                control.node_id, control.id
            )
        })?;
        let inputs = node
            .get_mut("inputs")
            .and_then(|v| v.as_object_mut())
            .ok_or_else(|| {
                format!(
                    "node '{}' has no inputs object (control '{}')",
                    control.node_id, control.id
                )
            })?;

        let coerced = coerce_value(&control.control_type, value)?;
        inputs.insert(control.input.clone(), coerced);
    }
    Ok(())
}

fn coerce_value(control_type: &str, value: &Value) -> Result<Value, String> {
    match control_type {
        "number" | "slider" => {
            if let Some(n) = value.as_f64() {
                // Prefer integers when whole.
                if n.fract() == 0.0 && n >= i64::MIN as f64 && n <= i64::MAX as f64 {
                    return Ok(json!(n as i64));
                }
                return Ok(json!(n));
            }
            if let Some(s) = value.as_str() {
                let n: f64 = s
                    .parse()
                    .map_err(|_| format!("expected number, got '{s}'"))?;
                if n.fract() == 0.0 {
                    return Ok(json!(n as i64));
                }
                return Ok(json!(n));
            }
            Err(format!("expected number, got {value}"))
        }
        _ => {
            if let Some(s) = value.as_str() {
                Ok(json!(s))
            } else if value.is_string() || value.is_number() || value.is_boolean() {
                Ok(value.clone())
            } else {
                Ok(json!(value.to_string()))
            }
        }
    }
}

pub fn queue_prompt(port: u16, workflow: &Value, client_id: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let body = json!({
        "prompt": workflow,
        "client_id": client_id,
    });
    let url = format!("http://127.0.0.1:{port}/prompt");
    let res = client
        .post(&url)
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Comfy /prompt failed ({status}): {text}"));
    }
    let parsed: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if let Some(err) = parsed.get("error") {
        return Err(format!("Comfy rejected prompt: {err}"));
    }
    parsed
        .get("prompt_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Comfy /prompt response missing prompt_id: {text}"))
}

pub fn interrupt(port: u16) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("http://127.0.0.1:{port}/interrupt");
    let res = client.post(&url).send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Comfy /interrupt failed: HTTP {}", res.status()));
    }
    Ok(())
}

fn job_cancelled(cancelled: &Mutex<HashSet<String>>, job_id: &str) -> bool {
    cancelled
        .lock()
        .map(|set| set.contains(job_id))
        .unwrap_or(false)
}

type ComfySocket = WebSocket<MaybeTlsStream<TcpStream>>;

fn connect_comfy_ws(port: u16, client_id: &str) -> Result<ComfySocket, String> {
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

fn write_preview_frame(
    app: &AppHandle,
    job_id: &str,
    slot: u8,
    payload: &[u8],
) -> Option<PathBuf> {
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
    let res = client.get(&url).send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok(None);
    }
    let history: Value = res.json().map_err(|e| e.to_string())?;
    Ok(history.get(prompt_id).cloned())
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
                let msg_prompt = data
                    .get("prompt_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                if msg_type == "progress" && (msg_prompt.is_empty() || msg_prompt == prompt_id) {
                    let value = data.get("value").and_then(|v| v.as_u64()).unwrap_or(0);
                    let max = data.get("max").and_then(|v| v.as_u64()).unwrap_or(0);
                    // Throttle UI emits a bit — sampler can fire very fast.
                    if last_step_emit.elapsed() >= Duration::from_millis(120) || value >= max {
                        last_step_emit = std::time::Instant::now();
                        let message = if max > 0 {
                            format!("Sampling… {value}/{max}")
                        } else {
                            "Sampling…".into()
                        };
                        let _ = app.emit(
                            "jobs://progress",
                            json!({
                                "jobId": job_id,
                                "stage": "step",
                                "message": message,
                                "step": value,
                                "max": max,
                            }),
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
                    // Done — pull final outputs from history.
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
                        json!({
                            "jobId": job_id,
                            "stage": "preview",
                            "message": "Preview",
                            "previewPath": path.display().to_string(),
                        }),
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
                return wait_via_history(port, prompt_id, timeout.saturating_sub(started.elapsed()), cancelled, job_id)
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

#[derive(Debug, Clone)]
pub struct ComfyImageRef {
    pub filename: String,
    pub subfolder: String,
    pub image_type: String,
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

pub fn download_view(
    port: u16,
    image: &ComfyImageRef,
    dest: &PathBuf,
) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!(
        "http://127.0.0.1:{port}/view?filename={}&subfolder={}&type={}",
        urlencoding_filename(&image.filename),
        urlencoding_filename(&image.subfolder),
        urlencoding_filename(&image.image_type),
    );
    let mut res = client.get(&url).send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!(
            "Comfy /view failed for {}: HTTP {}",
            image.filename,
            res.status()
        ));
    }
    let mut file = fs::File::create(dest).map_err(|e| e.to_string())?;
    std::io::copy(&mut res, &mut file).map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())?;
    Ok(())
}

fn urlencoding_filename(s: &str) -> String {
    // Minimal encode for query values (Comfy filenames are usually safe).
    s.replace(' ', "%20")
        .replace('&', "%26")
        .replace('?', "%3F")
        .replace('#', "%23")
}

pub fn gallery_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("gallery"))
}

/// `seed: 0` means “pick a random seed” (common Comfy / UI convention).
fn resolve_random_seeds(values: &mut HashMap<String, Value>) {
    let Some(seed) = values.get("seed") else {
        return;
    };
    let is_zero = match seed {
        Value::Number(n) => n.as_i64() == Some(0) || n.as_u64() == Some(0),
        Value::String(s) => s.trim() == "0",
        _ => false,
    };
    if !is_zero {
        return;
    }
    // Keep within JS-safe integer range for UI reuse.
    let random = (Uuid::new_v4().as_u128() % 9_007_199_254_740_991) as i64;
    // Avoid landing on 0 again (would look like “random” on reuse).
    let random = if random == 0 { 1 } else { random };
    values.insert("seed".into(), json!(random));
}

/// Full generate pipeline (blocking) — call from a background thread.
pub fn run_generate(
    app: &AppHandle,
    db: &Mutex<Db>,
    processes: &Mutex<ProcessState>,
    cancelled_jobs: &Mutex<HashSet<String>>,
    job: &Job,
    blueprint_id: &str,
    mut values: HashMap<String, Value>,
    runtime: &RuntimeInstall,
) -> Result<Vec<GalleryItem>, String> {
    if job_cancelled(cancelled_jobs, &job.id) {
        return Err("cancelled".into());
    }

    let detail = blueprints::get_detail(app, blueprint_id)?;
    if detail.model_count > 0 && detail.models_ready < detail.model_count {
        return Err(format!(
            "Blueprint models not installed ({}/{})",
            detail.models_ready, detail.model_count
        ));
    }

    let (manifest, mut workflow) = blueprints::load_workflow(app, blueprint_id)?;
    resolve_random_seeds(&mut values);
    patch_workflow(&mut workflow, &manifest.controls, &values)?;

    let port = runtime.port.unwrap_or(comfy::DEFAULT_PORT as i64) as u16;

    if !comfy::health(port)? {
        if runtime.install_path.is_empty() {
            return Err("ComfyUI is not installed".into());
        }
        let _ = app.emit(
            "jobs://progress",
            json!({
                "jobId": job.id,
                "stage": "start",
                "message": "Starting ComfyUI…",
            }),
        );
        comfy::start(app, processes, runtime, port)?;
        comfy::wait_until_healthy(port, 60)?;
        // Mark runtime running so UI clears the "Starting ComfyUI…" toast.
        {
            let db = db.lock().map_err(|e| e.to_string())?;
            if let Ok(updated) = db.update_runtime_status(
                &runtime.id,
                "running",
                Some(port as i64),
                None,
            ) {
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

    if job_cancelled(cancelled_jobs, &job.id) {
        return Err("cancelled".into());
    }

    let client_id = Uuid::new_v4().to_string();
    // Subscribe before /prompt so Comfy routes progress + latent previews here.
    let socket = connect_comfy_ws(port, &client_id).ok();
    let _ = app.emit(
        "jobs://progress",
        json!({
            "jobId": job.id,
            "stage": "queue",
            "message": "Submitting prompt to ComfyUI…",
        }),
    );

    let prompt_id = queue_prompt(port, &workflow, &client_id)?;
    let _ = app.emit(
        "jobs://progress",
        json!({
            "jobId": job.id,
            "stage": "run",
            "message": "Generating…",
        }),
    );

    let images = wait_for_outputs(
        app,
        socket,
        port,
        &prompt_id,
        Duration::from_secs(15 * 60),
        cancelled_jobs,
        &job.id,
    )?;
    if images.is_empty() {
        return Err("Comfy finished but returned no images".into());
    }

    let dir = gallery_dir(app)?.join(&job.id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for (i, image) in images.iter().enumerate() {
        let dest = dir.join(format!("{:02}_{}", i, image.filename));
        download_view(port, image, &dest)?;
        let prompt = values
            .get("prompt")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let meta = json!({
            "version": 1,
            "blueprintId": blueprint_id,
            "blueprintName": manifest.name,
            "category": manifest.category,
            "runtime": manifest.runtime,
            "prompt": prompt,
            "promptId": prompt_id,
            "filename": image.filename,
            // Full control map used for this generate (prompt, seed, size, steps, …).
            "values": values,
        })
        .to_string();
        let item = {
            let db = db.lock().map_err(|e| e.to_string())?;
            db.add_gallery_item(Some(&job.id), &dest.display().to_string(), None, &meta)?
        };
        let _ = app.emit("gallery://updated", &item);
        items.push(item);
    }

    let _ = app.emit(
        "jobs://progress",
        json!({
            "jobId": job.id,
            "stage": "done",
            "message": format!("Saved {} image(s)", items.len()),
        }),
    );

    Ok(items)
}
