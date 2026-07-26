use crate::blueprints;
use crate::comfy;
use crate::commands::AppState;
use crate::db::DownloadStepRow;
use crate::download;
use crate::loras;
use crate::prompt_tools;
use crate::upscale;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use super::api::emit_snapshot;

pub(crate) fn run_step(
    app: &AppHandle,
    _job_id: &str,
    step: &DownloadStepRow,
) -> Result<(), String> {
    let spec: Value = serde_json::from_str(&step.spec_json).unwrap_or(json!({}));
    match step.step_kind.as_str() {
        "http" => {
            let url = spec
                .get("url")
                .and_then(|v| v.as_str())
                .ok_or("http step missing url")?;
            let dest = PathBuf::from(
                spec.get("dest")
                    .and_then(|v| v.as_str())
                    .ok_or("http step missing dest")?,
            );
            if download::local_file_complete(&dest) {
                if let Ok(len) = dest.metadata().map(|m| m.len() as i64) {
                    let state = app.state::<AppState>();
                    let db = state.db.lock().map_err(|e| e.to_string())?;
                    let _ = db.update_download_step_status(
                        &step.id,
                        "running",
                        None,
                        Some(len),
                        Some(len),
                    );
                }
                return Ok(());
            }
            use std::sync::atomic::{AtomicBool, Ordering};
            let stop = std::sync::Arc::new(AtomicBool::new(false));
            let stop_t = stop.clone();
            let app_tick = app.clone();
            let sid = step.id.clone();
            let dest_tick = dest.clone();
            let tick = thread::spawn(move || {
                while !stop_t.load(Ordering::SeqCst) {
                    if let Ok(meta) = std::fs::metadata(&dest_tick) {
                        let state = app_tick.state::<AppState>();
                        if let Ok(db) = state.db.lock() {
                            let _ = db.update_download_step_status(
                                &sid,
                                "running",
                                None,
                                Some(meta.len() as i64),
                                None,
                            );
                        };
                    }
                    emit_snapshot(&app_tick);
                    thread::sleep(Duration::from_millis(800));
                }
            });

            let result = download::download_file(app, url, &dest, None);
            stop.store(true, Ordering::SeqCst);
            let _ = tick.join();
            result?;
            if !download::local_file_complete(&dest) {
                return Err("download incomplete".into());
            }
            if let Ok(len) = dest.metadata().map(|m| m.len() as i64) {
                let state = app.state::<AppState>();
                let db = state.db.lock().map_err(|e| e.to_string())?;
                let _ =
                    db.update_download_step_status(&step.id, "running", None, Some(len), Some(len));
            }
            Ok(())
        }
        "git_node" => {
            let pin_id = spec
                .get("pinId")
                .and_then(|v| v.as_str())
                .ok_or("git_node missing pinId")?;
            upscale::ensure_pinned_node(app, pin_id)
        }
        "pip" => {
            let action = spec.get("action").and_then(|v| v.as_str()).unwrap_or("");
            match action {
                "qwenvl_deps" => {
                    let _ = prompt_tools::install_qwenvl_python_deps(app)?;
                    Ok(())
                }
                other => Err(format!("unknown pip action: {other}")),
            }
        }
        "action" => {
            let action = spec
                .get("action")
                .and_then(|v| v.as_str())
                .ok_or("action step missing action")?;
            match action {
                "blueprint" => {
                    let id = spec
                        .get("id")
                        .and_then(|v| v.as_str())
                        .ok_or("blueprint id missing")?;
                    blueprints::install_models(app, id)
                }
                "lora" => {
                    let id = spec
                        .get("id")
                        .and_then(|v| v.as_str())
                        .ok_or("lora id missing")?;
                    let arch = spec
                        .get("arch")
                        .and_then(|v| v.as_str())
                        .ok_or("lora arch missing")?;
                    loras::install_variant(app, id, arch)
                }
                "upscale" => {
                    let id = spec
                        .get("id")
                        .and_then(|v| v.as_str())
                        .ok_or("upscale id missing")?;
                    if id == "usdu" {
                        upscale::ensure_usdu_custom_node(app)
                    } else if id == "supir" {
                        upscale::ensure_supir_custom_node(app)
                    } else {
                        upscale::install_upscaler(app, id)
                    }
                }
                "runtime" => {
                    let engine = spec
                        .get("engine")
                        .and_then(|v| v.as_str())
                        .ok_or("runtime engine missing")?;
                    if engine != comfy::ENGINE {
                        return Err(format!("unknown engine: {engine}"));
                    }
                    let existing = {
                        let state = app.state::<AppState>();
                        let db = state.db.lock().map_err(|e| e.to_string())?;
                        db.get_runtime_by_engine(comfy::ENGINE)?
                    };
                    let runtime = comfy::install_portable(app, existing.as_ref(), false)?;
                    {
                        let state = app.state::<AppState>();
                        let db = state.db.lock().map_err(|e| e.to_string())?;
                        let _ = db.upsert_runtime(&runtime);
                    }
                    let _ = app.emit("runtimes://updated", &runtime);
                    Ok(())
                }
                other => Err(format!("unknown action: {other}")),
            }
        }
        other => Err(format!("unknown step kind: {other}")),
    }
}
