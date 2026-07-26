//! Best-effort PNG / sidecar embedded prompt extractors.

use serde_json::Value;
use std::fs;
use std::path::Path;

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
        let len = u32::from_be_bytes([bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]]) as usize;
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
