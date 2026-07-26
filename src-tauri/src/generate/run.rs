use crate::blueprints;
use crate::comfy::{self, ProcessState};
use crate::db::{Db, GalleryItem, Job, RuntimeInstall};
use crate::generate::api::{download_view, queue_prompt};
use crate::generate::gallery::{
    gallery_day_dir, next_gallery_dest, remove_comfy_output, write_gallery_thumbnail,
};
use crate::generate::wait::{connect_comfy_ws, job_cancelled, wait_for_outputs};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

/// `seed: 0` means “pick a random seed” (common Comfy / UI convention).
fn resolve_random_seeds(values: &mut HashMap<String, Value>) {
    let Some(seed) = values.get("seed") else {
        return;
    };
    let is_zero = match seed {
        Value::Number(n) => {
            n.as_i64() == Some(0) || n.as_u64() == Some(0) || n.as_f64().is_some_and(|f| f == 0.0)
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
        if manifest.capabilities.loras {
            crate::loras::resolve_stack_for_generate(app, &manifest.arch, &mut values)?;
        } else if values
            .get("loras")
            .and_then(|v| v.as_array())
            .is_some_and(|a| !a.is_empty())
        {
            return Err("This blueprint does not support LoRAs".into());
        }
        if values.get("upscale").is_some() {
            let usdu = values
                .get("upscale")
                .and_then(|v| v.get("usdu"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let model_id = values
                .get("upscale")
                .and_then(|v| v.get("modelId"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let is_supir = model_id.starts_with("supir-");
            if is_supir {
                let _ = app.emit(
                    "jobs://progress",
                    json!({
                        "jobId": job.id,
                        "stage": "upscale",
                        "message": "Ensuring SUPIR…",
                    }),
                );
                crate::upscale::ensure_supir_custom_node(app)?;
            } else if usdu {
                let _ = app.emit(
                    "jobs://progress",
                    json!({
                        "jobId": job.id,
                        "stage": "upscale",
                        "message": "Ensuring Ultimate SD Upscale…",
                    }),
                );
                crate::upscale::ensure_usdu_custom_node(app)?;
            }
            crate::upscale::resolve_for_generate(app, &mut values)?;
        }
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
        let upscale_meta = values.get("upscale").cloned().unwrap_or(json!(null));
        let meta = json!({
            "version": 1,
            "blueprintId": blueprint_id,
            "blueprintName": manifest.name,
            "category": manifest.category,
            "runtime": manifest.runtime,
            "prompt": prompt,
            "promptId": prompt_id,
            "filename": image.filename,
            "upscaleModel": upscale_meta.get("modelId").cloned().unwrap_or(json!(null)),
            "usduEnabled": upscale_meta.get("usdu").cloned().unwrap_or(json!(false)),
            // Full control map used for this generate (prompt, seed, size, steps, …).
            "values": values,
        })
        .to_string();
        let thumb_path = write_gallery_thumbnail(&dest)
            .ok()
            .map(|p| p.display().to_string());
        let item = {
            let db = db.lock().map_err(|e| e.to_string())?;
            db.add_gallery_item(
                Some(&job.id),
                &dest.display().to_string(),
                thumb_path.as_deref(),
                &meta,
            )?
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
