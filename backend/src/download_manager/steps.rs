use crate::blueprints;
use crate::comfy;
use crate::commands::AppState;
use crate::db::DownloadStepRow;
use crate::download;
use crate::loras;
use crate::prompt_tools;
use crate::upscale;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use super::api::emit_snapshot;

/// Fill missing `bytes_total` on http steps so overall job % can include waiting files.
pub(crate) fn seed_http_totals(app: &AppHandle, job_id: &str) {
    let steps = {
        let state = app.state::<AppState>();
        let Ok(db) = state.db.lock() else {
            return;
        };
        db.list_download_steps(job_id).unwrap_or_default()
    };
    let mut changed = false;
    for step in steps {
        if step.step_kind != "http" || step.bytes_total.is_some() {
            continue;
        }
        let spec: Value = serde_json::from_str(&step.spec_json).unwrap_or(json!({}));
        let Some(url) = spec.get("url").and_then(|v| v.as_str()) else {
            continue;
        };
        let dest = spec.get("dest").and_then(|v| v.as_str()).map(PathBuf::from);
        let total = blueprints::probe_remote_size(url).or_else(|| {
            dest.as_ref()
                .and_then(|p| p.metadata().ok().map(|m| m.len()))
                .filter(|&n| n > 0)
        });
        let Some(total) = total else {
            continue;
        };
        let state = app.state::<AppState>();
        if let Ok(db) = state.db.lock() {
            let _ = db.update_download_step_status(
                &step.id,
                &step.status,
                None,
                None,
                Some(total as i64),
            );
            changed = true;
        };
    }
    if changed {
        emit_snapshot(app);
    }
}

pub(crate) fn run_step(
    app: &AppHandle,
    job_id: &str,
    step: &DownloadStepRow,
) -> Result<(), String> {
    let spec: Value = serde_json::from_str(&step.spec_json).unwrap_or(json!({}));
    match step.step_kind.as_str() {
        "http" => {
            // Ensure sibling file sizes are known for combined job progress.
            seed_http_totals(app, job_id);

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
                let len = dest.metadata().map(|m| m.len()).unwrap_or(0);
                // When remote size is known, only skip if the file fully matches
                // (avoids treating a partial .7z / binary as done).
                let remote = download::remote_content_length(url).ok().flatten();
                let complete = match remote {
                    Some(r) => len == r,
                    None => true,
                };
                if complete {
                    // Already on disk — mark complete so Downloads shows the step as done.
                    let state = app.state::<AppState>();
                    let db = state.db.lock().map_err(|e| e.to_string())?;
                    let _ = db.update_download_step_status(
                        &step.id,
                        "done",
                        None,
                        Some(len as i64),
                        Some(len as i64),
                    );
                    return Ok(());
                }
            }

            // Probe size up front so the UI can show "done / total" and %.
            download::sync_provider_tokens(app);
            let existing = dest.metadata().map(|m| m.len() as i64).unwrap_or(0);
            let total = download::remote_content_length(url)
                .ok()
                .flatten()
                .map(|n| n as i64);
            {
                let state = app.state::<AppState>();
                let db = state.db.lock().map_err(|e| e.to_string())?;
                let _ = db.update_download_step_status(
                    &step.id,
                    "running",
                    None,
                    Some(existing),
                    total,
                );
            }
            emit_snapshot(app);

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
                                None, // keep probed bytes_total via COALESCE
                            );
                        };
                    }
                    emit_snapshot(&app_tick);
                    thread::sleep(Duration::from_millis(800));
                }
            });

            let result = download::download_file(
                app,
                url,
                &dest,
                spec.get("sha256").and_then(|v| v.as_str()),
            );
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
                "blueprint_nodes" => {
                    let id = spec
                        .get("id")
                        .and_then(|v| v.as_str())
                        .ok_or("blueprint id missing")?;
                    let (_dir, manifest) = blueprints::load_manifest(app, id)?;
                    blueprints::install_custom_nodes(app, &manifest.custom_nodes)
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
                "runtime" | "runtime_install" => {
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
                    // Full "runtime" / legacy "runtime_install" keep the combined path.
                    let runtime = if action == "runtime" {
                        comfy::install_portable(app, existing.as_ref(), false)?
                    } else {
                        comfy::install_portable_core(app, existing.as_ref(), false)?
                    };
                    {
                        let state = app.state::<AppState>();
                        let db = state.db.lock().map_err(|e| e.to_string())?;
                        let _ = db.upsert_runtime(&runtime);
                    }
                    let _ = app.emit("runtimes://updated", &runtime);
                    Ok(())
                }
                "runtime_extract" => {
                    let engine = spec
                        .get("engine")
                        .and_then(|v| v.as_str())
                        .ok_or("runtime engine missing")?;
                    if engine != comfy::ENGINE {
                        return Err(format!("unknown engine: {engine}"));
                    }
                    let force = spec.get("force").and_then(|v| v.as_bool()).unwrap_or(false);
                    comfy::emit_runtime_progress(app, "extract", "Extracting ComfyUI…");
                    let existing = {
                        let state = app.state::<AppState>();
                        let db = state.db.lock().map_err(|e| e.to_string())?;
                        db.get_runtime_by_engine(comfy::ENGINE)?
                    };
                    // Stop any running Comfy before wipe/extract (Windows file locks).
                    {
                        let state = app.state::<AppState>();
                        let _ = comfy::stop(&state.processes);
                    }
                    if let Some(ref rt) = existing {
                        if !rt.install_path.is_empty() {
                            comfy::kill_portable_python(Path::new(&rt.install_path));
                        }
                    }
                    comfy::extract_portable_core(app, existing.as_ref(), force)
                }
                "runtime_configure" => {
                    let engine = spec
                        .get("engine")
                        .and_then(|v| v.as_str())
                        .ok_or("runtime engine missing")?;
                    if engine != comfy::ENGINE {
                        return Err(format!("unknown engine: {engine}"));
                    }
                    let force = spec.get("force").and_then(|v| v.as_bool()).unwrap_or(false);
                    comfy::emit_runtime_progress(app, "configure", "Configuring ComfyUI…");
                    let existing = {
                        let state = app.state::<AppState>();
                        let db = state.db.lock().map_err(|e| e.to_string())?;
                        db.get_runtime_by_engine(comfy::ENGINE)?
                    };
                    let runtime = comfy::configure_portable_core(app, existing.as_ref(), force)?;
                    {
                        let state = app.state::<AppState>();
                        let db = state.db.lock().map_err(|e| e.to_string())?;
                        let _ = db.upsert_runtime(&runtime);
                    }
                    let _ = app.emit("runtimes://updated", &runtime);
                    Ok(())
                }
                "runtime_extensions" => {
                    let engine = spec
                        .get("engine")
                        .and_then(|v| v.as_str())
                        .ok_or("runtime engine missing")?;
                    if engine != comfy::ENGINE {
                        return Err(format!("unknown engine: {engine}"));
                    }
                    comfy::emit_runtime_progress(app, "configure", "Installing extensions…");
                    upscale::ensure_managed_nodes(app)?;
                    // Same as install_portable: reinstall QwenVL pip deps after a wipe/restore.
                    let _ = prompt_tools::install_qwenvl_python_deps(app)?;
                    Ok(())
                }
                other => Err(format!("unknown action: {other}")),
            }
        }
        other => Err(format!("unknown step kind: {other}")),
    }
}
