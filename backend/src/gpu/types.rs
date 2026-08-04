//! GPU types and portable archive identifiers.

use serde::{Deserialize, Serialize};
use specta::Type;

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

    pub(crate) fn from_pnp_ven(ven: &str) -> Option<Self> {
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
