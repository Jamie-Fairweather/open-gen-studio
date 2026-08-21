//! GPU detection (Windows WMI + nvidia-smi).

use crate::process_cmd;
use std::collections::BTreeMap;
use std::time::Duration;

use super::portable::select_nvidia_variant;
use super::types::{GpuAdapter, GpuInfo, GpuVendor};

/// Probes must not hang install/onboarding (VMs / broken nvidia-smi are common).
const PROBE_TIMEOUT: Duration = Duration::from_secs(12);

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

    // DXGI DedicatedVideoMemory is what Task Manager uses — works for many
    // Hyper-V GPU-P guests where WMI AdapterRAM / registry VRAM are empty.
    for dxgi in detect_dxgi_adapters() {
        let key = adapter_key(&dxgi.vendor, &dxgi.name);
        if let Some(existing) = by_key.get_mut(&key) {
            if existing.memory_total.is_none() {
                existing.memory_total = dxgi.memory_total.clone();
            }
        } else if let Some((_, existing)) = by_key.iter_mut().find(|(k, _)| {
            let name = k.split_once(':').map(|(_, n)| n).unwrap_or(k.as_str());
            names_loosely_match(name, &dxgi.name)
        }) {
            if existing.memory_total.is_none() {
                existing.memory_total = dxgi.memory_total.clone();
            }
        } else {
            by_key.insert(key, dxgi);
        }
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
        } else if let Some((_, existing)) = by_key.iter_mut().find(|(k, v)| {
            v.vendor == GpuVendor::Nvidia
                && names_loosely_match(
                    k.split_once(':').map(|(_, n)| n).unwrap_or(k.as_str()),
                    &nvidia.name,
                )
        }) {
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

fn names_loosely_match(a: &str, b: &str) -> bool {
    let a = a.to_ascii_lowercase();
    let b = b.to_ascii_lowercase();
    if a == b || a.contains(&b) || b.contains(&a) {
        return true;
    }
    // "nvidia geforce rtx 4080 super" vs truncated DXGI/WMI variants
    let tokens = |s: &str| -> Vec<String> {
        s.split(|c: char| !c.is_ascii_alphanumeric())
            .filter(|t| t.len() >= 3 && *t != "nvidia" && *t != "geforce" && *t != "radeon")
            .map(|t| t.to_string())
            .collect()
    };
    let ta = tokens(&a);
    let tb = tokens(&b);
    !ta.is_empty() && ta.iter().all(|t| tb.contains(t))
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
    let mut cmd = process_cmd::new("nvidia-smi");
    cmd.args([
        "--query-gpu=name,memory.total,driver_version,compute_cap",
        "--format=csv,noheader,nounits",
    ]);
    let Ok(out) = process_cmd::output_timed(cmd, PROBE_TIMEOUT) else {
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
    let output = process_cmd::output_timed(process_cmd::new("nvidia-smi"), PROBE_TIMEOUT).ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    parse_cuda_version_from_smi(&text)
}

/// True when the NVIDIA user-mode CUDA driver is present (`nvcuda.dll` or working `nvidia-smi`).
///
/// DXGI can list an RTX adapter on Hyper-V GPU-P even when the guest has no CUDA driver —
/// PyTorch then fails with WinError 126 loading `torch_python.dll`.
pub fn cuda_user_mode_driver_present() -> bool {
    #[cfg(windows)]
    {
        let windir = std::env::var_os("SystemRoot").unwrap_or_else(|| r"C:\Windows".into());
        if std::path::Path::new(&windir)
            .join("System32")
            .join("nvcuda.dll")
            .is_file()
        {
            return true;
        }
    }
    process_cmd::output_timed(process_cmd::new("nvidia-smi"), PROBE_TIMEOUT)
        .map(|o| o.status.success())
        .unwrap_or(false)
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
    // AdapterCompatibility + display-class registry help Hyper-V GPU-P / DDA guests
    // where PNP VEN_* is Microsoft but the Name is still "NVIDIA GeForce…".
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$controllers = @(Get-CimInstance Win32_VideoController |
  Select-Object Name, AdapterRAM, DriverVersion, PNPDeviceID, AdapterCompatibility)
$regs = @()
$class = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
Get-ChildItem $class | ForEach-Object {
  $desc = $_.GetValue('DriverDesc')
  if (-not $desc) { return }
  $mem = $_.GetValue('HardwareInformation.qwMemorySize')
  if ($null -eq $mem) { $mem = $_.GetValue('HardwareInformation.MemorySize') }
  $regs += [pscustomobject]@{ Name = [string]$desc; MemoryBytes = $mem }
}
[pscustomobject]@{ Controllers = $controllers; Registry = $regs } | ConvertTo-Json -Compress -Depth 5
"#;
    let mut cmd = process_cmd::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
    ]);
    let Ok(out) = process_cmd::output_timed(cmd, PROBE_TIMEOUT) else {
        return vec![];
    };
    if !out.status.success() {
        return vec![];
    }
    let text = String::from_utf8_lossy(&out.stdout);
    parse_wmi_json(&text)
}

fn parse_wmi_json(text: &str) -> Vec<GpuAdapter> {
    let text = text.trim();
    if text.is_empty() {
        return vec![];
    }
    let value: serde_json::Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    let (items, registry_mem) = match &value {
        // New shape: { Controllers: [...], Registry: [{ Name, MemoryBytes }] }
        serde_json::Value::Object(map) if map.contains_key("Controllers") => {
            let items = map
                .get("Controllers")
                .map(collect_json_objects)
                .unwrap_or_default();
            let reg = map
                .get("Registry")
                .map(registry_memory_by_name)
                .unwrap_or_default();
            (items, reg)
        }
        // Legacy: bare array / single controller object.
        other => (collect_json_objects(other), BTreeMap::new()),
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
        let lower = name.to_ascii_lowercase();
        if lower.contains("basic render")
            || lower.contains("microsoft basic")
            || lower.contains("remote display")
            || lower.contains("hyper-v video")
        {
            continue;
        }
        let pnp = item
            .get("PNPDeviceID")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let compat = item
            .get("AdapterCompatibility")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let Some(vendor) = vendor_from_pnp(pnp)
            .or_else(|| vendor_from_text(compat))
            .or_else(|| vendor_from_text(&name))
        else {
            continue;
        };

        let memory_total = lookup_memory_bytes(&registry_mem, &lower)
            .or_else(|| wmi_adapter_ram_bytes(item.get("AdapterRAM")))
            .filter(|&b| b > 0)
            .map(|bytes| format!("{} MiB", bytes / (1024 * 1024)));

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

fn collect_json_objects(value: &serde_json::Value) -> Vec<&serde_json::Value> {
    match value {
        serde_json::Value::Array(arr) => arr.iter().filter(|v| v.is_object()).collect(),
        serde_json::Value::Object(_) => vec![value],
        _ => vec![],
    }
}

fn registry_memory_by_name(value: &serde_json::Value) -> BTreeMap<String, u64> {
    let mut out = BTreeMap::new();
    for item in collect_json_objects(value) {
        let name = item
            .get("Name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if name.is_empty() {
            continue;
        }
        let Some(bytes) = json_u64(item.get("MemoryBytes")).filter(|&b| b > 0) else {
            continue;
        };
        out.insert(name.to_ascii_lowercase(), bytes);
    }
    out
}

fn lookup_memory_bytes(map: &BTreeMap<String, u64>, name_lower: &str) -> Option<u64> {
    if let Some(b) = map.get(name_lower) {
        return Some(*b);
    }
    map.iter()
        .find(|(k, _)| names_loosely_match(k, name_lower))
        .map(|(_, b)| *b)
}

/// DXGI adapter list — preferred source for dedicated VRAM on Windows.
#[cfg(windows)]
fn detect_dxgi_adapters() -> Vec<GpuAdapter> {
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE,
    };

    let factory: IDXGIFactory1 = match unsafe { CreateDXGIFactory1() } {
        Ok(f) => f,
        Err(_) => return vec![],
    };

    let mut adapters = Vec::new();
    let mut index = 0u32;
    loop {
        let adapter = match unsafe { factory.EnumAdapters1(index) } {
            Ok(a) => a,
            Err(_) => break,
        };
        index += 1;
        let Ok(desc) = (unsafe { adapter.GetDesc1() }) else {
            continue;
        };
        // Flags is a plain u32 in windows 0.61 (DXGI_ADAPTER_FLAG_SOFTWARE == 2).
        if (desc.Flags & (DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32)) != 0 {
            continue;
        }
        let end = desc
            .Description
            .iter()
            .position(|&c| c == 0)
            .unwrap_or(desc.Description.len());
        let name = String::from_utf16_lossy(&desc.Description[..end])
            .trim()
            .to_string();
        if name.is_empty() {
            continue;
        }
        let lower = name.to_ascii_lowercase();
        if lower.contains("basic render")
            || lower.contains("microsoft basic")
            || lower.contains("remote display")
            || lower.contains("hyper-v video")
        {
            continue;
        }
        let Some(vendor) = vendor_from_dxgi_id(desc.VendorId).or_else(|| vendor_from_text(&name))
        else {
            continue;
        };
        let dedicated = desc.DedicatedVideoMemory as u64;
        let memory_total = if dedicated > 0 {
            Some(format!("{} MiB", dedicated / (1024 * 1024)))
        } else {
            None
        };
        adapters.push(GpuAdapter {
            vendor,
            name,
            memory_total,
            driver_version: None,
            compute_cap: None,
            cuda_version: None,
        });
    }
    adapters
}

fn vendor_from_dxgi_id(vendor_id: u32) -> Option<GpuVendor> {
    match vendor_id {
        0x10DE => Some(GpuVendor::Nvidia),
        0x1002 => Some(GpuVendor::Amd),
        0x8086 => Some(GpuVendor::Intel),
        _ => None,
    }
}

/// WMI AdapterRAM is a broken uint32 for many 4GB+ cards (overflow placeholders).
fn wmi_adapter_ram_bytes(value: Option<&serde_json::Value>) -> Option<u64> {
    let bytes = json_u64(value)?;
    // Values in the top quarter of the uint32 range are almost never real.
    const UNRELIABLE: u64 = 3_840 * 1024 * 1024; // 3.75 GiB
    if bytes == 0 || bytes >= UNRELIABLE {
        return None;
    }
    Some(bytes)
}

fn json_u64(value: Option<&serde_json::Value>) -> Option<u64> {
    let value = value?;
    value
        .as_u64()
        .or_else(|| value.as_i64().and_then(|n| u64::try_from(n).ok()))
        .or_else(|| {
            value
                .as_f64()
                .filter(|n| n.is_finite() && *n >= 0.0)
                .map(|n| n as u64)
        })
}

fn vendor_from_pnp(pnp: &str) -> Option<GpuVendor> {
    // PCI\VEN_10DE&DEV_...
    let upper = pnp.to_ascii_uppercase();
    let idx = upper.find("VEN_")?;
    let ven = upper.get(idx + 4..idx + 8)?;
    GpuVendor::from_pnp_ven(ven)
}

/// Name / AdapterCompatibility fallback for VMs where PNP VEN is Microsoft.
fn vendor_from_text(text: &str) -> Option<GpuVendor> {
    let lower = text.to_ascii_lowercase();
    if lower.is_empty() {
        return None;
    }
    if lower.contains("nvidia")
        || lower.contains("geforce")
        || lower.contains("quadro")
        || lower.contains("tesla")
        || lower.contains("rtx ")
        || lower.starts_with("rtx")
    {
        return Some(GpuVendor::Nvidia);
    }
    if lower.contains("amd")
        || lower.contains("radeon")
        || lower.contains("rx ")
        || lower.starts_with("rx")
    {
        return Some(GpuVendor::Amd);
    }
    if lower.contains("intel") {
        return Some(GpuVendor::Intel);
    }
    None
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

    #[test]
    fn vendor_from_gpu_name_without_pnp() {
        assert_eq!(
            vendor_from_text("NVIDIA GeForce RTX 4080 SUPER"),
            Some(GpuVendor::Nvidia)
        );
        assert_eq!(
            vendor_from_text("AMD Radeon RX 7900 XTX"),
            Some(GpuVendor::Amd)
        );
        assert_eq!(vendor_from_text("Intel Arc A770"), Some(GpuVendor::Intel));
        assert_eq!(vendor_from_text("Generic PnP Monitor"), None);
    }

    #[test]
    fn parse_wmi_accepts_vm_style_nvidia_without_ven() {
        let json = r#"{
          "Controllers":[{
            "Name":"NVIDIA GeForce RTX 4080 SUPER",
            "AdapterRAM":4293918720,
            "DriverVersion":"10.0.26100.1150",
            "PNPDeviceID":"PCI\\VEN_1414&DEV_008E",
            "AdapterCompatibility":"NVIDIA"
          }],
          "Registry":[{
            "Name":"NVIDIA GeForce RTX 4080 SUPER",
            "MemoryBytes":17179869184
          }]
        }"#;
        let adapters = parse_wmi_json(json);
        assert_eq!(adapters.len(), 1);
        assert_eq!(adapters[0].vendor, GpuVendor::Nvidia);
        assert_eq!(adapters[0].memory_total.as_deref(), Some("16384 MiB"));
    }

    #[test]
    fn parse_wmi_skips_hyperv_and_basic_adapters() {
        let json = r#"[{
          "Name":"Microsoft Hyper-V Video",
          "PNPDeviceID":"PCI\\VEN_1414&DEV_5353"
        },{
          "Name":"Microsoft Basic Display Adapter",
          "PNPDeviceID":"ROOT\\BASICDISPLAY"
        }]"#;
        assert!(parse_wmi_json(json).is_empty());
    }

    #[test]
    fn loose_gpu_name_match() {
        assert!(names_loosely_match(
            "NVIDIA GeForce RTX 4080 SUPER",
            "nvidia geforce rtx 4080 super"
        ));
        assert!(names_loosely_match(
            "NVIDIA GeForce RTX 4080 SUPER",
            "RTX 4080 SUPER"
        ));
        assert!(!names_loosely_match(
            "NVIDIA GeForce RTX 4080 SUPER",
            "NVIDIA GeForce RTX 4090"
        ));
    }
}
