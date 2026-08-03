//! GPU detection and Comfy portable variant selection (Windows).

use crate::process_cmd;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::BTreeMap;

pub const SETTING_GPU_VENDOR: &str = "gpu_vendor";
pub const SETTING_NVIDIA_PORTABLE_OVERRIDE: &str = "nvidia_portable_override";

/// Compute capability below this → cu126 portable (GTX 10-series and older).
pub const NVIDIA_MODERN_MIN_COMPUTE_CAP: f32 = 7.5;
/// Driver max CUDA below this → cu126 (modern portable ships PyTorch CUDA 13).
pub const NVIDIA_MODERN_MIN_DRIVER_CUDA: f32 = 13.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum GpuVendor {
    Nvidia,
    Amd,
    Intel,
}

impl GpuVendor {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Nvidia => "nvidia",
            Self::Amd => "amd",
            Self::Intel => "intel",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "nvidia" => Some(Self::Nvidia),
            "amd" => Some(Self::Amd),
            "intel" => Some(Self::Intel),
            _ => None,
        }
    }

    fn from_pnp_ven(ven: &str) -> Option<Self> {
        match ven.to_ascii_uppercase().as_str() {
            "10DE" => Some(Self::Nvidia),
            "1002" => Some(Self::Amd),
            "8086" => Some(Self::Intel),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum NvidiaVariant {
    Modern,
    Cu126,
}

impl NvidiaVariant {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Modern => "modern",
            Self::Cu126 => "cu126",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "modern" => Some(Self::Modern),
            "cu126" => Some(Self::Cu126),
            _ => None,
        }
    }
}

/// Archive / pin id: `nvidia`, `nvidia_cu126`, `amd`, `intel`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PortableKind {
    NvidiaModern,
    NvidiaCu126,
    Amd,
    Intel,
}

impl PortableKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NvidiaModern => "nvidia",
            Self::NvidiaCu126 => "nvidia_cu126",
            Self::Amd => "amd",
            Self::Intel => "intel",
        }
    }

    pub fn from_choice(vendor: GpuVendor, nvidia: Option<NvidiaVariant>) -> Self {
        match vendor {
            GpuVendor::Nvidia => match nvidia.unwrap_or(NvidiaVariant::Modern) {
                NvidiaVariant::Modern => Self::NvidiaModern,
                NvidiaVariant::Cu126 => Self::NvidiaCu126,
            },
            GpuVendor::Amd => Self::Amd,
            GpuVendor::Intel => Self::Intel,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GpuAdapter {
    pub vendor: GpuVendor,
    pub name: String,
    pub memory_total: Option<String>,
    pub driver_version: Option<String>,
    pub compute_cap: Option<String>,
    pub cuda_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub available: bool,
    pub name: Option<String>,
    pub memory_total: Option<String>,
    pub driver_version: Option<String>,
    pub vendor: Option<GpuVendor>,
    pub nvidia_variant: Option<NvidiaVariant>,
    pub adapters: Vec<GpuAdapter>,
    /// True when ≥2 distinct vendors are present (caller checks persisted choice).
    pub needs_vendor_choice: bool,
    pub error: Option<String>,
}

/// Pick NVIDIA portable from compute capability and/or driver CUDA version.
pub fn select_nvidia_variant(
    compute_cap: Option<&str>,
    driver_cuda: Option<&str>,
) -> NvidiaVariant {
    if let Some(cap) = compute_cap.and_then(parse_f32) {
        if cap < NVIDIA_MODERN_MIN_COMPUTE_CAP {
            return NvidiaVariant::Cu126;
        }
    }
    if let Some(cuda) = driver_cuda.and_then(parse_f32) {
        if cuda < NVIDIA_MODERN_MIN_DRIVER_CUDA {
            return NvidiaVariant::Cu126;
        }
    }
    NvidiaVariant::Modern
}

fn parse_f32(s: &str) -> Option<f32> {
    s.trim().parse::<f32>().ok()
}

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

/// Resolve vendor + NVIDIA variant from detection + settings map.
pub fn resolve_choice(
    info: &GpuInfo,
    gpu_vendor_setting: Option<&str>,
    nvidia_override: Option<&str>,
) -> Result<(GpuVendor, Option<NvidiaVariant>), String> {
    if !info.available || info.adapters.is_empty() {
        return Err(info
            .error
            .clone()
            .unwrap_or_else(|| "No supported GPU detected".into()));
    }

    let present: Vec<GpuVendor> = {
        let mut v = Vec::new();
        for a in &info.adapters {
            if !v.contains(&a.vendor) {
                v.push(a.vendor);
            }
        }
        v
    };

    let vendor = if let Some(raw) = gpu_vendor_setting {
        let parsed =
            GpuVendor::parse(raw).ok_or_else(|| format!("Invalid gpu_vendor setting: {raw}"))?;
        if !present.contains(&parsed) {
            return Err(format!(
                "Saved GPU vendor ({}) is not present. Pick a GPU in Settings.",
                parsed.as_str()
            ));
        }
        parsed
    } else if present.len() == 1 {
        present[0]
    } else {
        return Err(
            "Multiple GPU vendors detected - choose which GPU to use before installing the runtime"
                .into(),
        );
    };

    let nvidia = if vendor == GpuVendor::Nvidia {
        let override_v = nvidia_override.and_then(NvidiaVariant::parse);
        Some(override_v.unwrap_or_else(|| {
            let rep = info
                .adapters
                .iter()
                .find(|a| a.vendor == GpuVendor::Nvidia)
                .unwrap_or(&info.adapters[0]);
            select_nvidia_variant(rep.compute_cap.as_deref(), rep.cuda_version.as_deref())
        }))
    } else {
        None
    };

    Ok((vendor, nvidia))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nvidia_variant_by_compute_cap() {
        assert_eq!(
            select_nvidia_variant(Some("6.1"), Some("12.6")),
            NvidiaVariant::Cu126
        );
        assert_eq!(
            select_nvidia_variant(Some("7.5"), Some("12.8")),
            NvidiaVariant::Cu126
        );
        assert_eq!(
            select_nvidia_variant(Some("7.5"), Some("13.0")),
            NvidiaVariant::Modern
        );
        assert_eq!(
            select_nvidia_variant(Some("8.9"), Some("12.7")),
            NvidiaVariant::Cu126
        );
        assert_eq!(
            select_nvidia_variant(Some("8.9"), Some("13.0")),
            NvidiaVariant::Modern
        );
        assert_eq!(select_nvidia_variant(None, None), NvidiaVariant::Modern);
    }

    #[test]
    fn parse_cuda_banner() {
        let sample = "\
+-----------------------------------------------------------------------------------------+
| NVIDIA-SMI 560.94                 Driver Version: 560.94         CUDA Version: 12.6     |
+-----------------------------------------------------------------------------------------+
";
        assert_eq!(parse_cuda_version_from_smi(sample).as_deref(), Some("12.6"));
    }

    #[test]
    fn resolve_single_vendor_auto() {
        let info = GpuInfo {
            available: true,
            name: Some("RTX 4090".into()),
            memory_total: Some("24576 MiB".into()),
            driver_version: Some("560.94".into()),
            vendor: Some(GpuVendor::Nvidia),
            nvidia_variant: Some(NvidiaVariant::Modern),
            adapters: vec![GpuAdapter {
                vendor: GpuVendor::Nvidia,
                name: "RTX 4090".into(),
                memory_total: Some("24576 MiB".into()),
                driver_version: Some("560.94".into()),
                compute_cap: Some("8.9".into()),
                cuda_version: Some("13.0".into()),
            }],
            needs_vendor_choice: false,
            error: None,
        };
        let (v, n) = resolve_choice(&info, None, None).unwrap();
        assert_eq!(v, GpuVendor::Nvidia);
        assert_eq!(n, Some(NvidiaVariant::Modern));
    }

    #[test]
    fn resolve_mixed_requires_setting() {
        let info = GpuInfo {
            available: true,
            name: Some("RTX 4070".into()),
            memory_total: None,
            driver_version: None,
            vendor: Some(GpuVendor::Nvidia),
            nvidia_variant: Some(NvidiaVariant::Modern),
            adapters: vec![
                GpuAdapter {
                    vendor: GpuVendor::Nvidia,
                    name: "RTX 4070".into(),
                    memory_total: None,
                    driver_version: None,
                    compute_cap: Some("8.9".into()),
                    cuda_version: Some("13.0".into()),
                },
                GpuAdapter {
                    vendor: GpuVendor::Intel,
                    name: "Intel UHD".into(),
                    memory_total: None,
                    driver_version: None,
                    compute_cap: None,
                    cuda_version: None,
                },
            ],
            needs_vendor_choice: true,
            error: None,
        };
        assert!(resolve_choice(&info, None, None).is_err());
        let (v, _) = resolve_choice(&info, Some("intel"), None).unwrap();
        assert_eq!(v, GpuVendor::Intel);
    }

    #[test]
    fn nvidia_override() {
        let info = GpuInfo {
            available: true,
            name: Some("RTX 4090".into()),
            memory_total: None,
            driver_version: None,
            vendor: Some(GpuVendor::Nvidia),
            nvidia_variant: Some(NvidiaVariant::Modern),
            adapters: vec![GpuAdapter {
                vendor: GpuVendor::Nvidia,
                name: "RTX 4090".into(),
                memory_total: None,
                driver_version: None,
                compute_cap: Some("8.9".into()),
                cuda_version: Some("13.0".into()),
            }],
            needs_vendor_choice: false,
            error: None,
        };
        let (_, n) = resolve_choice(&info, Some("nvidia"), Some("cu126")).unwrap();
        assert_eq!(n, Some(NvidiaVariant::Cu126));
    }

    #[test]
    fn portable_kind_ids() {
        assert_eq!(
            PortableKind::from_choice(GpuVendor::Nvidia, Some(NvidiaVariant::Cu126)).as_str(),
            "nvidia_cu126"
        );
        assert_eq!(
            PortableKind::from_choice(GpuVendor::Amd, None).as_str(),
            "amd"
        );
    }
}
