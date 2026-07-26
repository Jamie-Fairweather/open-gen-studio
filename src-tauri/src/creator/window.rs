use crate::comfy::{self, ProcessState};
use crate::creator::types::{CapturedWorkflow, EmbeddedModel};
use crate::db::Db;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const CREATOR_WINDOW_LABEL: &str = "creator-comfy";

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
        .ok_or_else(|| "Creator Comfy window is not open — click Open Comfy first".to_string())?;
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
            Err(
                "timed out waiting for workflow from ComfyUI (is the Creator window loaded?)"
                    .into(),
            )
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

    win.eval(&js)
        .map_err(|e| format!("failed to run capture script: {e}"))?;

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
        embedded_models: super::models::dedupe_embedded(embedded_models),
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
