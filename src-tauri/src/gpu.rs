use crate::process_cmd;
use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub available: bool,
    pub name: Option<String>,
    pub memory_total: Option<String>,
    pub driver_version: Option<String>,
    pub error: Option<String>,
}

/// Detect NVIDIA GPU via `nvidia-smi`. Other vendors later.
pub fn detect_nvidia() -> GpuInfo {
    let output = process_cmd::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total,driver_version",
            "--format=csv,noheader,nounits",
        ])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout);
            let line = text.lines().next().unwrap_or("").trim();
            if line.is_empty() {
                return GpuInfo {
                    available: false,
                    name: None,
                    memory_total: None,
                    driver_version: None,
                    error: Some("nvidia-smi returned no GPUs".into()),
                };
            }
            let parts: Vec<_> = line.split(',').map(|s| s.trim().to_string()).collect();
            GpuInfo {
                available: true,
                name: parts.first().cloned(),
                memory_total: parts.get(1).map(|m| format!("{m} MiB")),
                driver_version: parts.get(2).cloned(),
                error: None,
            }
        }
        Ok(out) => GpuInfo {
            available: false,
            name: None,
            memory_total: None,
            driver_version: None,
            error: Some(String::from_utf8_lossy(&out.stderr).trim().to_string()),
        },
        Err(e) => GpuInfo {
            available: false,
            name: None,
            memory_total: None,
            driver_version: None,
            error: Some(format!("nvidia-smi not available: {e}")),
        },
    }
}
