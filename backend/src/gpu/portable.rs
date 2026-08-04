//! NVIDIA portable variant selection and GPU choice resolution.

use super::types::{
    GpuInfo, GpuVendor, NvidiaVariant, NVIDIA_MODERN_MIN_COMPUTE_CAP, NVIDIA_MODERN_MIN_DRIVER_CUDA,
};

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

pub(crate) fn parse_f32(s: &str) -> Option<f32> {
    s.trim().parse::<f32>().ok()
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
    use crate::gpu::{GpuAdapter, GpuVendor, NvidiaVariant, PortableKind};

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
