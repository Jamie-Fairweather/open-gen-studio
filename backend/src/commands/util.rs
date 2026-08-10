use crate::gpu::{self, GpuInfo};
use crate::spellcheck;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SystemSpecs {
    /// Total physical RAM in bytes, when detectable.
    pub ram_bytes: Option<u64>,
    /// Best-effort VRAM in bytes from the preferred GPU adapter.
    pub vram_bytes: Option<u64>,
    pub gpu_name: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub fn detect_gpu() -> GpuInfo {
    gpu::detect_gpus()
}

/// RAM + VRAM snapshot for first-run hardware gating.
#[tauri::command]
#[specta::specta]
pub fn get_system_specs() -> SystemSpecs {
    let gpu = gpu::detect_gpus();
    let vram_bytes = gpu
        .adapters
        .iter()
        .filter_map(|a| parse_memory_to_bytes(a.memory_total.as_deref()))
        .max()
        .or_else(|| parse_memory_to_bytes(gpu.memory_total.as_deref()));
    SystemSpecs {
        ram_bytes: system_ram_bytes(),
        vram_bytes,
        gpu_name: gpu.name,
    }
}

fn parse_memory_to_bytes(raw: Option<&str>) -> Option<u64> {
    let raw = raw?.trim();
    if raw.is_empty() {
        return None;
    }
    let mut parts = raw.split_whitespace();
    let n: f64 = parts.next()?.parse().ok()?;
    if !n.is_finite() || n <= 0.0 {
        return None;
    }
    let unit = parts
        .next()
        .unwrap_or("mib")
        .trim_end_matches('s')
        .to_ascii_lowercase();
    let bytes = if unit.starts_with('t') {
        n * 1024.0 * 1024.0 * 1024.0 * 1024.0
    } else if unit.starts_with('g') {
        n * 1024.0 * 1024.0 * 1024.0
    } else if unit.starts_with('k') {
        n * 1024.0
    } else {
        // MiB / bare number (nvidia-smi nounits)
        n * 1024.0 * 1024.0
    };
    Some(bytes as u64)
}

#[cfg(windows)]
fn system_ram_bytes() -> Option<u64> {
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    unsafe {
        let mut status = MEMORYSTATUSEX {
            dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
            ..std::mem::zeroed()
        };
        GlobalMemoryStatusEx(&mut status).ok()?;
        if status.ullTotalPhys == 0 {
            return None;
        }
        Some(status.ullTotalPhys)
    }
}

#[cfg(not(windows))]
fn system_ram_bytes() -> Option<u64> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_memory_units() {
        assert_eq!(
            parse_memory_to_bytes(Some("8192 MiB")),
            Some(8192 * 1024 * 1024)
        );
        assert_eq!(
            parse_memory_to_bytes(Some("8 GiB")),
            Some(8 * 1024 * 1024 * 1024)
        );
        assert_eq!(
            parse_memory_to_bytes(Some("8192")),
            Some(8192 * 1024 * 1024)
        );
        assert_eq!(parse_memory_to_bytes(Some("0 MiB")), None);
        assert_eq!(parse_memory_to_bytes(None), None);
    }
}

/// OS spell suggestions for the custom editable context menu (empty if correct / unavailable).
#[tauri::command]
#[specta::specta]
pub async fn spellcheck_suggestions(word: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || spellcheck::suggest(&word))
        .await
        .map_err(|e| format!("spellcheck join: {e}"))?
}

/// Open an http(s) URL in the user's default system browser.
#[tauri::command]
#[specta::specta]
pub fn open_external_url(url: String) -> Result<(), String> {
    let url = url.trim();
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("only http(s) URLs can be opened".into());
    }
    #[cfg(windows)]
    {
        // `start` treats the first quoted arg as the window title.
        crate::process_cmd::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        crate::process_cmd::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        crate::process_cmd::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
    }
    Ok(())
}
