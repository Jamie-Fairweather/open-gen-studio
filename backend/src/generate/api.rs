use crate::generate::types::ComfyImageRef;
use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

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

/// Ask ComfyUI to unload models and free VRAM (`POST /free`).
pub fn free_vram(port: u16) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("http://127.0.0.1:{port}/free");
    let res = client
        .post(&url)
        .json(&json!({
            "unload_models": true,
            "free_memory": true,
        }))
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Comfy /free failed: HTTP {}", res.status()));
    }
    Ok(())
}

pub fn download_view(port: u16, image: &ComfyImageRef, dest: &PathBuf) -> Result<(), String> {
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
