//! GPU detection and Comfy portable variant selection (Windows).

mod detect;
mod portable;
mod types;

#[allow(unused_imports)]
pub use detect::{detect_gpus, parse_cuda_version_from_smi};
#[allow(unused_imports)]
pub use portable::{resolve_choice, select_nvidia_variant};
#[allow(unused_imports)]
pub use types::{
    GpuAdapter, GpuInfo, GpuVendor, NvidiaVariant, PortableKind, NVIDIA_MODERN_MIN_COMPUTE_CAP,
    NVIDIA_MODERN_MIN_DRIVER_CUDA, SETTING_GPU_VENDOR, SETTING_NVIDIA_PORTABLE_OVERRIDE,
};
