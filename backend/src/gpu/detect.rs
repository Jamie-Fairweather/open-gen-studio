//! GPU detection (Windows WMI + nvidia-smi).

use crate::process_cmd;
use std::collections::BTreeMap;

use super::portable::select_nvidia_variant;
use super::types::{GpuAdapter, GpuInfo, GpuVendor};

/// Full detection for Settings / install.
pub fn detect_gpus() -> GpuInfo {
    #[cfg(windows)]
    {
        detect_gpus_windows()
    }
    #[cfg(not(windows))]
    {
        GpuInfo {
            available: false,
            name: None,
            memory_total: None,
            driver_version: None,
            vendor: None,
            nvidia_variant: None,
            adapters: vec![],
            needs_vendor_choice: false,
            error: Some("GPU detection is Windows-only".into()),
        }
    }
}

#[cfg(windows)]
fn detect_gpus_windows() -> GpuInfo {
    let driver_cuda = probe_driver_cuda_version();
    let mut by_key: BTreeMap<String, GpuAdapter> = BTreeMap::new();

    for adapter in detect_wmi_adapters() {
        let key = adapter_key(&adapter.vendor, &adapter.name);
        by_key.insert(key, adapter);
    }

    for mut nvidia in detect_nvidia_adapters() {
        if nvidia.cuda_version.is_none() {
            nvidia.cuda_version = driver_cuda.clone();
        }
        let key = adapter_key(&GpuVendor::Nvidia, &nvidia.name);
        if let Some(existing) = by_key.get_mut(&key) {
            existing.driver_version = nvidia
                .driver_version
                .clone()
                .or_else(|| existing.driver_version.clone());
            existing.memory_total = nvidia
                .memory_total
                .clone()
                .or_else(|| existing.memory_total.clone());
            existing.compute_cap = nvidia.compute_cap.clone();
            existing.cuda_version = nvidia.cuda_version.clone();
        } else {
            by_key.insert(key, nvidia);
        }
    }

    let adapters: Vec<GpuAdapter> = by_key.into_values().collect();
    summarize_adapters(adapters)
}

fn adapter_key(vendor: &GpuVendor, name: &str) -> String {
    format!("{}:{}", vendor.as_str(), name.to_ascii_lowercase())
}

fn summarize_adapters(adapters: Vec<GpuAdapter>) -> GpuInfo {
    if adapters.is_empty() {
        return GpuInfo {
            available: false,
            name: None,
            memory_total: None,
            driver_version: None,
            vendor: None,
            nvidia_variant: None,
            adapters,
            needs_vendor_choice: false,
            error: Some("No supported GPU detected".into()),
        };
    }

    let mut vendors: Vec<GpuVendor> = Vec::new();
    for a in &adapters {
        if !vendors.contains(&a.vendor) {
            vendors.push(a.vendor);
        }
    }
    let needs_vendor_choice = vendors.len() >= 2;

    // Representative: prefer NVIDIA, then AMD, then Intel; first adapter of that vendor.
    let preferred_vendor = [GpuVendor::Nvidia, GpuVendor::Amd, GpuVendor::Intel]
        .into_iter()
        .find(|v| vendors.contains(v))
        .unwrap_or(adapters[0].vendor);

    let rep = adapters
        .iter()
        .find(|a| a.vendor == preferred_vendor)
        .unwrap_or(&adapters[0]);

    let nvidia_variant = if preferred_vendor == GpuVendor::Nvidia {
        Some(select_nvidia_variant(
            rep.compute_cap.as_deref(),
            rep.cuda_version.as_deref(),
        ))
    } else {
        adapters
            .iter()
            .find(|a| a.vendor == GpuVendor::Nvidia)
            .map(|a| select_nvidia_variant(a.compute_cap.as_deref(), a.cuda_version.as_deref()))
    };

    GpuInfo {
        available: true,
        name: Some(rep.name.clone()),
        memory_total: rep.memory_total.clone(),
        driver_version: rep.driver_version.clone(),
        vendor: Some(preferred_vendor),
        nvidia_variant,
        adapters,
        needs_vendor_choice,
        error: None,
    }
}

fn detect_nvidia_adapters() -> Vec<GpuAdapter> {
    let output = process_cmd::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total,driver_version,compute_cap",
            "--format=csv,noheader,nounits",
        ])
        .output();

    let Ok(out) = output else {
        return vec![];
    };
    if !out.status.success() {
        return vec![];
    }
    let text = String::from_utf8_lossy(&out.stdout);
    text.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let parts: Vec<_> = line.split(',').map(|s| s.trim().to_string()).collect();
            let name = parts.first()?.clone();
            if name.is_empty() {
                return None;
            }
            Some(GpuAdapter {
                vendor: GpuVendor::Nvidia,
                name,
                memory_total: parts.get(1).map(|m| format!("{m} MiB")),
                driver_version: parts.get(2).cloned().filter(|s| !s.is_empty()),
                compute_cap: parts.get(3).cloned().filter(|s| !s.is_empty()),
                cuda_version: None,
            })
        })
        .collect()
}

fn probe_driver_cuda_version() -> Option<String> {
    let output = process_cmd::new("nvidia-smi").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    parse_cuda_version_from_smi(&text)
}

/// Parse `CUDA Version: 12.6` from nvidia-smi banner.
pub fn parse_cuda_version_from_smi(text: &str) -> Option<String> {
    for line in text.lines() {
        if let Some(idx) = line.find("CUDA Version:") {
            let rest = line[idx + "CUDA Version:".len()..].trim();
            let ver = rest
                .split_whitespace()
                .next()
                .unwrap_or("")
                .trim_matches(|c: char| !c.is_ascii_digit() && c != '.');
            if !ver.is_empty() {
                return Some(ver.to_string());
            }
        }
    }
    None
}

#[cfg(windows)]
fn detect_wmi_adapters() -> Vec<GpuAdapter> {
    let script = r#"
Get-CimInstance Win32_VideoController |
  Select-Object Name, AdapterRAM, DriverVersion, PNPDeviceID |
  ConvertTo-Json -Compress
"#;
    let output = process_cmd::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .output();

    let Ok(out) = output else {
        return vec![];
    };
    if !out.status.success() {
        return vec![];
    }
    let text = String::from_utf8_lossy(&out.stdout);
    parse_wmi_json(&text)
}

#[cfg(windows)]
fn parse_wmi_json(text: &str) -> Vec<GpuAdapter> {
    let text = text.trim();
    if text.is_empty() {
        return vec![];
    }
    // PowerShell may emit a single object or an array.
    let value: serde_json::Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return vec![],
    };
    let items: Vec<&serde_json::Value> = match &value {
        serde_json::Value::Array(arr) => arr.iter().collect(),
        serde_json::Value::Object(_) => vec![&value],
        _ => return vec![],
    };

    let mut adapters = Vec::new();
    for item in items {
        let name = item
            .get("Name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if name.is_empty() {
            continue;
        }
        // Skip Microsoft Basic Display Adapter etc.
        let lower = name.to_ascii_lowercase();
        if lower.contains("basic render") || lower.contains("microsoft basic") {
            continue;
        }
        let pnp = item
            .get("PNPDeviceID")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let Some(vendor) = vendor_from_pnp(pnp) else {
            continue;
        };
        let memory_total = item.get("AdapterRAM").and_then(|v| {
            let bytes = v.as_u64().or_else(|| v.as_i64().map(|n| n as u64))?;
            if bytes == 0 {
                return None;
            }
            Some(format!("{} MiB", bytes / (1024 * 1024)))
        });
        let driver_version = item
            .get("DriverVersion")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        adapters.push(GpuAdapter {
            vendor,
            name,
            memory_total,
            driver_version,
            compute_cap: None,
            cuda_version: None,
        });
    }
    adapters
}

fn vendor_from_pnp(pnp: &str) -> Option<GpuVendor> {
    // PCI\VEN_10DE&DEV_...
    let upper = pnp.to_ascii_uppercase();
    let idx = upper.find("VEN_")?;
    let ven = upper.get(idx + 4..idx + 8)?;
    GpuVendor::from_pnp_ven(ven)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_cuda_banner() {
        let sample = "\
+-----------------------------------------------------------------------------------------+
| NVIDIA-SMI 560.94                 Driver Version: 560.94         CUDA Version: 12.6     |
+-----------------------------------------------------------------------------------------+
";
        assert_eq!(parse_cuda_version_from_smi(sample).as_deref(), Some("12.6"));
    }
}
