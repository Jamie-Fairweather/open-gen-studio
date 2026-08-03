# GPU support plan

Plan for expanding Open Gen Studio beyond the current **Windows + modern NVIDIA** ComfyUI portable.

Related: [`PLAN.md`](./PLAN.md) (runtime / portable decision), ComfyUI [Windows portable docs](https://docs.comfy.org/installation/comfyui_portable_windows) and [releases](https://github.com/comfyanonymous/ComfyUI/releases).

---

## Current state (as of Comfy pin `v0.28.0`)

| Area            | Behavior                                                                      |
| --------------- | ----------------------------------------------------------------------------- |
| GPU detect      | WMI adapters + `nvidia-smi` (`backend/src/gpu.rs`)                            |
| Runtime install | Chosen vendor from settings / single-vendor auto                              |
| Portable asset  | Vendor + NVIDIA modern/cu126 via pinned URLs                                  |
| CUDA branching  | `compute_cap` &lt; 7.5 or driver CUDA &lt; 13.0 → cu126                       |
| AMD / Intel     | Wired (official portables); hardware QA pending                               |
| Mixed vendors   | First-run picker; Settings → Change GPU                                       |
| Launch          | Vendor-agnostic: `python_embeded\python.exe -s ComfyUI\main.py …` (no `.bat`) |

Pinned URLs live in [`backend/src/pins.rs`](../backend/src/pins.rs). Selection gate is [`resolve_portable_url`](../backend/src/comfy/install.rs) + `effective_gpu_choice`.

---

## Official ComfyUI Windows portables

Same release tag we pin today ships four GPU builds:

| Asset                                      | Intended users                                        |
| ------------------------------------------ | ----------------------------------------------------- |
| `ComfyUI_windows_portable_nvidia.7z`       | Modern NVIDIA (current default; newer CUDA / PyTorch) |
| `ComfyUI_windows_portable_nvidia_cu126.7z` | Older NVIDIA stacks that need CUDA 12.6               |
| `ComfyUI_windows_portable_amd.7z`          | AMD (ROCm on Windows; hardware/driver limits apply)   |
| `ComfyUI_windows_portable_intel.7z`        | Intel GPUs                                            |

We keep pinning a **specific Comfy release tag** (no `/latest`). Each vendor variant we support gets its own pinned URL constant next to `COMFY_NVIDIA_PORTABLE_URL`.

---

## Goals

1. **Detect** vendor (+ enough capability signal to pick the right NVIDIA build).
2. **Ask once** when more than one _vendor_ is present (first-run GPU picker dialog).
3. **Install** the matching official portable for the chosen GPU.
4. **Surface** clear UI copy when the GPU is unsupported or needs an older driver / alternate build.
5. **Validate** Official blueprints + Prompt Tools on each supported path before marking it “supported.”

Non-goals for this plan: bundling Comfy in the app installer; community mega-portables; picking among multiple GPUs of the _same_ vendor (Comfy/default device handling is fine).

---

## Target matrix

| Priority | Platform | GPU                                                 | Portable                                    | Status                      |
| -------- | -------- | --------------------------------------------------- | ------------------------------------------- | --------------------------- |
| P0       | Windows  | NVIDIA (modern CUDA)                                | `…_nvidia.7z`                               | ✅ shipped                  |
| P1       | Windows  | NVIDIA (CUDA 12.6 / older drivers)                  | `…_nvidia_cu126.7z`                         | ✅ implemented              |
| P2       | Windows  | AMD (ROCm-capable, e.g. RDNA 3 / 3.5 / 4 per Comfy) | `…_amd.7z`                                  | ✅ implemented (QA pending) |
| P3       | Windows  | Intel                                               | `…_intel.7z`                                | ✅ implemented (QA pending) |
| UX       | Windows  | Mixed vendors (e.g. NVIDIA + Intel iGPU)            | First-run picker → chosen vendor’s portable | ✅ implemented              |

Exact AMD/Intel hardware floors should follow Comfy’s release notes for the pinned tag, not invent our own matrix.

---

## Detection design

Detect **all** adapters, then derive a preferred / chosen vendor for portable install.

```text
// Per adapter
vendor: nvidia | amd | intel | unknown
name, memory_total, driver_version
cuda_version?: string   // NVIDIA
capability / notes?: string  // e.g. "needs_cu126", "unsupported_amd_arch"

// App preference (persisted)
chosen_vendor?: nvidia | amd | intel   // set by first-run dialog or single-vendor auto-pick
```

### NVIDIA

Keep `nvidia-smi` as primary.

- Query name, memory, driver, and **CUDA version** when the CLI exposes it (e.g. `nvidia-smi` header / `--query-gpu=…` fields available on the user’s driver).
- Selection rule (draft — tune with smoke tests on the pinned Comfy tag):
  - Prefer **modern** `…_nvidia.7z` when CUDA / driver is new enough for that portable’s PyTorch wheel.
  - Fall back to **`…_nvidia_cu126.7z`** when the modern portable is known to fail (older driver / CUDA below threshold).
  - If `nvidia-smi` works but we cannot read CUDA version, default to **modern** and document the override (Settings → force cu126) once that UI exists.

Do **not** require a system CUDA toolkit install; the portable embeds what it needs. We only use CUDA _driver_ capability to pick which archive to download.

### AMD

Windows detection options (prefer simple + reliable):

1. DXGI / WMI adapter enumeration for vendor id `0x1002` + adapter name.
2. Optional: ROCm tools if present (nice-to-have, not required).

Gate install on “AMD discrete GPU present” first; refine with Comfy’s published ROCm Windows support list for the pin. Unsupported generations should get an explicit error, not a silent download.

### Intel

Same DXGI / WMI path with Intel vendor id. Treat as P3 once validated.

### Mixed vendors — first-run picker

Trigger only when detection finds **two or more different vendors** (typical case: discrete NVIDIA/AMD + Intel iGPU).

| Case                           | Behavior                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| One vendor (any count of GPUs) | Auto-pick that vendor. No dialog. Same-vendor multi-GPU is ignored.                                                         |
| Two+ vendors                   | First open: modal listing each distinct vendor (show a representative adapter name / VRAM). User picks one. Persist choice. |
| Choice already saved           | Skip dialog; use stored vendor for portable resolve.                                                                        |
| Change later                   | Settings can offer “Change GPU vendor…” (re-prompt; may require reinstalling the matching portable).                        |

Dialog should run **before** runtime download so we never pull the wrong ~2GB archive. Block install / generate until a choice exists when mixed vendors are present.

This is an **app** concern (which Comfy portable to install), not Comfy multi-GPU scheduling.

---

## Install / pin changes

Touch points (expected):

| File                                   | Change                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `backend/src/gpu.rs`                   | Enumerate adapters; multi-vendor detect; CUDA signal for NVIDIA                                        |
| `backend/src/pins.rs`                  | `COMFY_NVIDIA_CU126_PORTABLE_URL`, AMD, Intel URL constants                                            |
| `backend/src/comfy/install.rs`         | `resolve_portable_url` branches on _chosen_ vendor + NVIDIA variant; archive filename includes variant |
| `backend/src/download_manager/plan.rs` | Uses updated resolve (already calls it)                                                                |
| First-run / Settings UI                | Mixed-vendor picker dialog; show chosen vendor + portable; clearer errors                              |
| Persist preference                     | Setting / DB key for `chosen_vendor`                                                                   |
| `docs/PLAN.md`                         | Point here for GPU matrix detail                                                                       |

Launch path (`comfy/process.rs`) should stay vendor-agnostic unless a portable needs a specific flag (e.g. AMD cross-attention). Prefer documenting optional flags after hardware QA, not guessing up front.

Archive on disk today is named like `ComfyUI_windows_portable_nvidia_{version}.7z`. Variant-aware names avoid mixing modern vs cu126 extracts under one path.

---

## Phased rollout

### Phase 1 — NVIDIA modern + cu126

1. Detect CUDA/driver capability.
2. Pin both NVIDIA URLs for the same Comfy tag.
3. Branch `resolve_portable_url`.
4. Settings copy: which build was chosen and why.
5. Smoke: install + one Official blueprint on a modern GPU and on a machine that needs cu126 (or a forced override).

**Exit:** users with older NVIDIA drivers get a working install without manual Comfy downloads.

### Phase 2 — AMD + mixed-vendor picker

1. Vendor detect (DXGI/WMI); enumerate all adapters.
2. First-run dialog when vendors differ; persist `chosen_vendor`.
3. Pin `…_amd.7z` for the same Comfy tag; resolve from chosen vendor.
4. UI: AMD supported / unsupported messaging (ROCm driver expectations).
5. Smoke Official recipes + Prompt Tools on at least one supported Radeon.
6. Track custom-node / CUDA-only failure modes; disable or document features that do not run on ROCm.

**Exit:** supported AMD GPUs can install runtime and generate; dual-vendor machines (e.g. Radeon + Intel iGPU) pick explicitly before download.

### Phase 3 — Intel

1. Same pattern with `…_intel.7z`.
2. Picker already covers NVIDIA/AMD/Intel mixes from Phase 2.
3. Narrow “supported” claim until Official blueprints are validated on Intel hardware.

### Phase 4 — Polish

- Settings: change chosen vendor (warn if runtime reinstall needed).
- NVIDIA cu126 force override for mis-detect / edge drivers.
- VRAM guidance that mentions vendor quirks where we know them.
- README badge / system requirements updated from “NVIDIA” to the real matrix.

---

## Risks and validation

| Risk                                          | Mitigation                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| Modern NVIDIA portable fails on older drivers | Explicit cu126 branch + clear error if both fail                          |
| AMD ROCm Windows support is narrow            | Gate on documented arches; fail with link to requirements                 |
| Custom nodes / Prompt Tools assume CUDA       | Per-vendor smoke checklist before claiming support                        |
| Wrong archive extracted over existing install | Variant in archive path + pin marker; force re-extract on vendor mismatch |
| User picks iGPU over discrete by mistake      | Dialog labels (name + VRAM); allow change in Settings                     |
| Pin bump forgets non-NVIDIA URLs              | Checklist in release notes: bump all four assets for the tag              |

Minimum smoke per newly enabled path:

1. Fresh runtime download + extract + configure
2. Start Comfy, health check
3. One Official blueprint generate
4. Prompt Tools path if we claim it for that vendor

---

## Open questions

1. **cu126 threshold:** exact CUDA/driver cutoff for the pinned Comfy tag (confirm from Comfy release notes + one real older-driver machine).
2. **AMD iGPU / APUs:** in or out for v1 AMD support?
3. **Intel:** Arc only, or also integrated? (iGPU still appears in the mixed-vendor picker as a choice.)
4. **Existing installs:** migration when we detect user installed NVIDIA modern but needs cu126 — auto-reinstall vs prompt?
5. **Vendor change after install:** always require full portable re-download, or try to detect mismatch and prompt?

---

## Summary

Install path is **detect → (picker if mixed vendors) → pinned portable URL → extract → supervise**. Remaining work is hardware QA on AMD/Intel and tuning the cu126 threshold against real older drivers.
