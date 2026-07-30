# Architecture catalog

Checklist of ComfyUI graph families worth supporting as a `RecipeArch`, vs what Open Gen Studio already ships.

**Source of truth for shipped ids:** `RecipeArch` in [`backend/src/recipe/arch_id.rs`](../../backend/src/recipe/arch_id.rs) → `bun run ipc:types` → `RECIPE_ARCHES`.

**How to add one:** [`adding-model-architectures.md`](./adding-model-architectures.md).

**v1 scope:** `flowType: txt2img` only. Edit / video need a new flow type, not just an arch id.

Legend: ✅ supported · ☐ candidate · — covered by an existing arch (no separate id) · ⏸ blocked on new flow type

---

## Supported today

|     | `arch` id     | Compiler / notes                                               | Official blueprint                 |
| --- | ------------- | -------------------------------------------------------------- | ---------------------------------- |
| ✅  | `z-image`     | `arch/z_image.rs`                                              | `z-image-turbo`, `z-image-base`    |
| ✅  | `krea2`       | `arch/krea2.rs`                                                | `krea2-turbo`, `krea2-raw`         |
| ✅  | `flux`        | `arch/flux.rs` (DualCLIP, guidance)                            | `flux-dev`, `flux-schnell`         |
| ✅  | `flux2`       | `arch/flux2.rs` (custom sampling / guider USDU)                | `flux2-dev`                        |
| ✅  | `ideogram4`   | `arch/ideogram4.rs`                                            | `ideogram4`                        |
| ✅  | `sdxl`        | shared `arch/checkpoint.rs`                                    | `sdxl-base`                        |
| ✅  | `sd15`        | shared `arch/checkpoint.rs`                                    | `sd15`                             |
| ✅  | `pony`        | `checkpoint.rs` + `CLIPSetLastLayer` (−2)                      | `pony-v6`                          |
| ✅  | `qwen-image`  | `arch/qwen_image.rs` (AuraFlow + EmptySD3)                     | `qwen-image`, `qwen-image-distill` |
| ✅  | `illustrious` | `checkpoint.rs` + clip skip + `ModelSamplingDiscrete` (v-pred) | `noobai-vpred`                     |
| ✅  | `sd3.5`       | `arch/sd35.rs` (TripleCLIP + ModelSamplingSD3)                 | `sd35-large`, `sd35-large-turbo`   |
| ✅  | `chroma`      | `arch/chroma.rs` (CLIP type chroma + AuraFlow)                 | `chroma`                           |

---

## Later / heavier (txt2img)

|     | Proposed `arch`        | Why hold                                                                  |
| --- | ---------------------- | ------------------------------------------------------------------------- |
| ☐   | `hidream` (HiDream-I1) | Strong adherence, MIT — four text encoders, heavy VRAM                    |
| ☐   | `hunyuan-image`        | Native Comfy examples; less consumer mindshare than Qwen / Flux / Z-Image |
| ☐   | `hidream-o1`           | Newer unified model; still early                                          |

---

## Covered without a new arch

Use an existing id; do not invent a duplicate `RecipeArch`.

| Model family                                | Use                                              |
| ------------------------------------------- | ------------------------------------------------ |
| Juggernaut / RealVis / most SDXL fine-tunes | `sdxl`                                           |
| Illustrious **EPS** (epsilon-pred)          | `sdxl` (or `pony` if clip skip 2 is enough)      |
| Illustrious / NoobAI **v-pred**             | `illustrious`                                    |
| Pony fine-tunes                             | `pony`                                           |
| Flux.2 Klein (different TE, same family)    | `flux2`                                          |
| AuraFlow / Lumina 2                         | Overlap with `z-image` / `flux` for this product |

---

## Needs a new flow type (not just an arch)

|     | Capability      | Notes                                                         |
| --- | --------------- | ------------------------------------------------------------- |
| ⏸   | Qwen-Image-Edit | Instruction / multi-image edit — needs edit / img2img flow    |
| ⏸   | Flux Kontext    | Character-consistent editing — same                           |
| ⏸   | Wan 2.1         | Dominant local **video** (1.3B ~8GB); new video pipeline + UI |
| ⏸   | Hunyuan Video   | Quality leader for local video; heavier than Wan              |

---

## Explicitly deprioritized

Niche or declining for a consumer recipe app — skip unless demand is clear.

- Stable Cascade
- PixArt Alpha / Sigma
- OmniGen 2
- Standalone AuraFlow (unless product wants it named)
- Older HunyuanDiT image (superseded by newer families)

---

## Suggested next product work

1. Edit flows (Qwen Edit / Kontext) before more niche txt2img arches
2. `wan` when video is an intentional product surface
3. Heavier txt2img candidates (`hidream`, `hunyuan-image`) only if demand is clear

Update this file when adding or retiring a `RecipeArch`. Keep the “Supported today” table aligned with `RecipeArch::ALL`.
