use crate::blueprints;
use crate::comfy::{self, ProcessState};
use crate::db::{Db, GalleryItem, Job, RuntimeInstall};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{ErrorKind, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{connect, Message, WebSocket};
use uuid::Uuid;

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

/// `gallery/YYYY-MM-DD` (local calendar day).
fn gallery_day_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let day = chrono::Local::now().format("%Y-%m-%d").to_string();
    Ok(gallery_dir(app)?.join(day))
}

/// Comfy-style name: `{prefix}_{NNNNN}_.ext` with a day-folder counter.
/// (Deleting Comfy's output makes it reuse `00001_`, so we own the sequence.)
fn next_gallery_dest(dir: &Path, prefix: &str, ext: &str) -> PathBuf {
    let prefix = {
        let p = prefix.trim();
        if p.is_empty() { "image" } else { p }
    };
    let ext = ext.trim_start_matches('.');
    let ext = if ext.is_empty() { "png" } else { ext };
    let mut max = 0u32;
    if let Ok(entries) = fs::read_dir(dir) {
        for ent in entries.flatten() {
            let name = ent.file_name();
            let Some(name) = name.to_str() else { continue };
            if let Some(n) = gallery_sequence_number(name, prefix, ext) {
                max = max.max(n);
            }
        }
    }
    let mut next = max.saturating_add(1).max(1);
    loop {
        let dest = dir.join(format!("{prefix}_{next:05}_.{ext}"));
        if !dest.exists() {
            return dest;
        }
        next = next.saturating_add(1);
        if next > 99_999 {
            return dir.join(format!("{prefix}_{}_.{}", Uuid::new_v4().simple(), ext));
        }
    }
}

/// `krea2-turbo_00007_.png` → Some(7); ignores collision junk like `…_00001_2.png`.
fn gallery_sequence_number(filename: &str, prefix: &str, ext: &str) -> Option<u32> {
    let suffix = format!(".{ext}");
    if !filename.starts_with(prefix) || !filename.ends_with(&suffix) {
        return None;
    }
    let mid = &filename[prefix.len()..filename.len() - suffix.len()];
    let mid = mid.strip_prefix('_')?;
    let digits = mid.strip_suffix('_')?;
    if digits.len() == 5 && digits.bytes().all(|b| b.is_ascii_digit()) {
        digits.parse().ok()
    } else {
        None
    }
}

/// On-disk ComfyUI file for a `/view` image ref (portable layout).
fn comfy_disk_path(runtime: &RuntimeInstall, image: &ComfyImageRef) -> Option<PathBuf> {
    if runtime.install_path.is_empty() {
        return None;
    }
    let folder = match image.image_type.as_str() {
        "temp" => "temp",
        "input" => "input",
        _ => "output",
    };
    let mut path = PathBuf::from(&runtime.install_path)
        .join("ComfyUI")
        .join(folder);
    if !image.subfolder.is_empty() {
        // Reject path traversal in Comfy-reported subfolders.
        if image.subfolder.split(['/', '\\']).any(|p| p == ".." || p.is_empty()) {
            return None;
        }
        path.push(&image.subfolder);
    }
    if image.filename.contains("..")
        || image.filename.contains('/')
        || image.filename.contains('\\')
    {
        return None;
    }
    path.push(&image.filename);
    Some(path)
}

fn remove_comfy_output(runtime: &RuntimeInstall, image: &ComfyImageRef) {
    let Some(path) = comfy_disk_path(runtime, image) else {
        return;
    };
    if path.is_file() {
        let _ = fs::remove_file(path);
    }
}

/// `seed: 0` means “pick a random seed” (common Comfy / UI convention).
fn resolve_random_seeds(values: &mut HashMap<String, Value>) {
    let Some(seed) = values.get("seed") else {
        return;
    };
    let is_zero = match seed {
        Value::Number(n) => {
            n.as_i64() == Some(0)
                || n.as_u64() == Some(0)
                || n.as_f64().is_some_and(|f| f == 0.0)
        }
        Value::String(s) => {
            let t = s.trim();
            t == "0" || t.parse::<f64>().is_ok_and(|f| f == 0.0)
        }
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

    resolve_random_seeds(&mut values);
    let (manifest, workflow) = {
        let (_dir, manifest) = blueprints::load_manifest(app, blueprint_id)?;
        let workflow = crate::recipe::compile(&manifest, &values)?;
        (manifest, workflow)
    };

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
                "message": "Starting runtime…",
            }),
        );
        comfy::start(app, processes, runtime, port)?;
        comfy::wait_until_healthy(port, 60)?;
        // Mark runtime running so UI clears the "Starting runtime…" toast.
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
                "message": "Runtime is ready",
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

    let dir = gallery_day_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for image in images.iter() {
        let ext = Path::new(&image.filename)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("png");
        let dest = next_gallery_dest(&dir, blueprint_id, ext);
        download_view(port, image, &dest)?;
        // Only drop Comfy's copy after we have a non-empty gallery file.
        if fs::metadata(&dest).map(|m| m.len() > 0).unwrap_or(false) {
            remove_comfy_output(runtime, image);
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn gallery_dest_increments_comfy_counter() {
        let dir = std::env::temp_dir().join(format!("oga-gal-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&dir).unwrap();
        let first = next_gallery_dest(&dir, "krea2-turbo", "png");
        assert_eq!(first.file_name().unwrap(), "krea2-turbo_00001_.png");
        fs::File::create(&first).unwrap().write_all(b"x").unwrap();
        // Legacy collision names must not break the sequence.
        fs::File::create(dir.join("krea2-turbo_00001_2.png"))
            .unwrap()
            .write_all(b"x")
            .unwrap();
        let second = next_gallery_dest(&dir, "krea2-turbo", "png");
        assert_eq!(second.file_name().unwrap(), "krea2-turbo_00002_.png");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn comfy_path_under_output() {
        let runtime = RuntimeInstall {
            id: "r1".into(),
            engine: "comfyui".into(),
            version: "x".into(),
            install_path: r"C:\ComfyUI_windows_portable".into(),
            port: Some(8188),
            status: "running".into(),
            error: None,
            created_at: 0,
            updated_at: 0,
        };
        let image = ComfyImageRef {
            filename: "krea2-turbo_00001_.png".into(),
            subfolder: String::new(),
            image_type: "output".into(),
        };
        let path = comfy_disk_path(&runtime, &image).unwrap();
        assert!(path.ends_with(r"ComfyUI\output\krea2-turbo_00001_.png") || path.ends_with("ComfyUI/output/krea2-turbo_00001_.png"));
    }
}
