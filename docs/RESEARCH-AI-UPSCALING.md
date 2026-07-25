# Research: Local AI Image Upscaling

> Status: research notes (2026-07-25)  
> Goal: explain how AI upscaling works, survey the local model landscape, and recommend what Open Gen AI should ship first.  
> Relates to: [`PLAN-RECIPE-BLUEPRINTS.md`](./PLAN-RECIPE-BLUEPRINTS.md) Phase D (shared refine / upscale, LoRA-style — not per-blueprint).

---

## 1. What “AI upscaling” actually is

Classical resize (bicubic / Lanczos) invents no new detail. It stretches existing pixels. Fine for a modest 1.5× nudge; soft and mushy at 2×–4×.

**AI upscalers** are neural nets trained to map a low-resolution image to a plausible higher-resolution one. They do not “recover” lost photons. They **hallucinate plausible detail** consistent with what they saw in training (edges, textures, skin, foliage, line art). That is why:

- Different models look different on the same photo.
- Aggressive models can invent pores, wood grain, or wrong lettering.
- Quality depends on content type (photo vs anime vs UI screenshot) as much as on “bigger model.”

For our product (local ComfyUI recipes), upscaling is almost always a **post-pass** after `txt2img`: generate at a comfortable resolution, then enlarge for display / print.

---

## 2. Two families of methods

### A. Single-pass super-resolution (GAN / transformer SR)

**Examples:** Real-ESRGAN, 4x-UltraSharp, Remacri, Nomos*, SwinIR, Real-CUGAN.

| Trait        | Typical                                                                           |
| ------------ | --------------------------------------------------------------------------------- |
| How it works | One (or few) forward passes through a dedicated SR network                        |
| Speed        | Fast (often &lt;1–3s for 1024→4K on a mid GPU)                                    |
| VRAM         | Low (~2–4 GB; tiling for huge images)                                             |
| Install size | Small weights (~5–70 MB)                                                          |
| Determinism  | Usually deterministic for a given model                                           |
| Look         | Sharpens / restores; limited semantic reimagining                                 |
| ComfyUI      | Native: `UpscaleModelLoader` → `ImageUpscaleWithModel` (`models/upscale_models/`) |

This is the **default** for local tools and for a first product feature.

### B. Diffusion / generative upscaling

**Examples:** Ultimate SD Upscale (tiled img2img), SUPIR (SDXL prior), SeedVR2 (ByteDance DiT, strong for video/restoration), cloud tools like Magnific / some Topaz modes.

| Trait        | Typical                                                                       |
| ------------ | ----------------------------------------------------------------------------- |
| How it works | Denoising / diffusion guided by the low-res image (+ often a prompt)          |
| Speed        | Slow (tens of seconds to minutes)                                             |
| VRAM         | High (often 12–24 GB for SUPIR-class)                                         |
| Install size | Large (full diffusion stack or multi‑GB checkpoints)                          |
| Look         | Can invent rich texture; may change identity / composition if denoise is high |
| ComfyUI      | Custom nodes / heavier graphs; not a tiny weight drop-in                      |

Better for **hero restoration** of damaged photos, not for “every generate gets a free 4×.”

**Face repair** (GFPGAN, CodeFormer) is a third, narrower tool: not a full-image upscaler, but a face-centric pass often chained _after_ ESRGAN.

---

## 3. Is there “just one” best model?

**No.** There is no single winner for every image. Consensus in the local / ComfyUI community (2025–2026) is a **small set of SR models** plus optional heavy diffusion for special cases.

### Practical shortlist (local, open, Comfy-friendly)

| Model                                       | Scale | Approx size | Best for                                                | Caveats                            |
| ------------------------------------------- | ----- | ----------- | ------------------------------------------------------- | ---------------------------------- |
| **RealESRGAN_x4plus**                       | 4×    | ~64 MB      | General photos, mixed / real-world degradation          | Can soften stylized art slightly   |
| **RealESRGAN_x2plus**                       | 2×    | ~64 MB      | Modest upscale; less “overcooked” than jumping to 4×    | Still GAN artifacts if abused      |
| **4x-UltraSharp**                           | 4×    | ~67 MB      | AI art, crisp edges, illustration, many SD/Flux outputs | Can oversharpen skin / print grain |
| **RealESRGAN_x4plus_anime_6B**              | 4×    | ~18 MB      | Anime, cel shading, hard lines                          | Wrong choice for photos            |
| **4x-Foolhardy Remacri**                    | 4×    | ~67 MB      | Texture-heavy / game-asset style detail                 | Taste-dependent                    |
| **Nomos family** (e.g. Nomos2 / Nomos8kDAT) | 4×    | varies      | Cleaner photoreal / portraits (softer than UltraSharp)  | More models to curate              |
| **realesr-general-x4v3**                    | 4×    | ~5 MB       | Low VRAM / speed                                        | Lower quality ceiling              |

**Heavy / later (not day-one defaults):**

| Approach                | When                                                                         | Why not first                                             |
| ----------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Ultimate SD Upscale** | Max quality, willing to wait; needs the same (or compatible) diffusion model | Slow, more knobs (denoise ~0.3–0.5), identity drift risk  |
| **SUPIR**               | Badly damaged photos, hero restoration                                       | 12–24 GB class, slow, non-trivial license/ops             |
| **SeedVR2**             | Especially video / strong restoration demos                                  | Larger stack; overkill for simple “refine after generate” |
| **Topaz Photo AI**      | Best polish UX if users already buy it                                       | Closed, paid, not embeddable as our engine                |

Commercial cloud upscalers (Magnific, Adobe Enhance, etc.) are out of scope for a **local-first** product.

---

## 4. How people usually combine them

Common patterns in ComfyUI / A1111-style UIs:

1. **Simple 4×** — ESRGAN only. Fast. Good default.
2. **2× then 2×** — sometimes cleaner than one hard 4×.
3. **ESRGAN → face restore** — GFPGAN / CodeFormer when portraits matter.
4. **ESRGAN base + Ultimate SD Upscale** — ESRGAN enlarges; diffusion re-details tiles at low denoise.
5. **Fit-for-content picker** — photo → Real-ESRGAN; digital art → UltraSharp; anime → anime_6B.

For Open Gen AI User Mode, (1) + a content-aware default model (or a short dropdown of 2–3) is enough for v1.

---

## 5. ComfyUI integration facts (relevant to us)

- Upscale weights live in **`models/upscale_models/`** (our host already knows an `upscale_models` path in `comfy.rs`).
- Built-in nodes: **Load Upscale Model** + **Upscale Image (using Model)**.
- No custom nodes required for the ESRGAN family.
- Recipe plan’s **refine** UI group is studio-shared (like LoRAs); compilers append an upscale subgraph after latent decode.

Single-pass SR is the easy slice (native Comfy nodes). Diffusion tiled refine is a separate product surface (custom node + arch-aware graph).

---

## 6. Ultimate SD Upscale — technique, not a model

**Correct:** Ultimate SD Upscale (USDU) is **not** an upscale weight. It is a **workflow / custom-node pack** that:

1. Optionally enlarges the image with a normal SR model (e.g. UltraSharp / Real-ESRGAN).
2. Cuts the large image into **tiles**.
3. Runs **img2img diffusion** on each tile with a loaded generative model (checkpoint / UNET stack).
4. Stitches tiles and optionally fixes seams.

Upstream: [ssitu/ComfyUI_UltimateSDUpscale](https://github.com/ssitu/ComfyUI_UltimateSDUpscale) (Comfy port of the A1111 Ultimate Upscale script). Lives under `custom_nodes/`, not `models/upscale_models/`.

So a typical “Ultimate SD Upscale” job still **uses one of our ESRGAN models** for the enlarge step, plus the **same recipe models** (UNET/TE/VAE or checkpoint) for the tiled redraw.

### Will it work with all arches?

**Not as a single universal graph.** USDU needs whatever the arch uses for sampling:

| Arch (ours)         | Feasible?          | Notes                                                                                                                                              |
| ------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sd15` / `sdxl`     | Yes (classic path) | Checkpoint + CLIP + VAE; well-trodden USDU setups                                                                                                  |
| `flux` / `flux2`    | Yes, with care     | Community workflows exist; conditioning differs (often no negative); tile size / denoise defaults differ from SDXL                                 |
| `z-image` / `krea2` | In principle yes   | Same idea: feed that arch’s MODEL + text encoders + VAE into a tiled img2img pass — **we must compile arch-specific graphs**; not “set and forget” |
| Turbo distillations | Risky              | Low-step turbo models are weaker at high-denoise redraw; keep **denoise low** (community often ~0.2–0.4) so structure stays                        |

So: **the technique is arch-agnostic; the wiring is not.** Each `compile_*` path would append its own USDU subgraph (or a shared helper that takes that arch’s model handles). Custom node must be installed once into the Comfy portable (we already have `customNodes` install plumbing in `blueprints.rs`).

Also: USDU quality depends on **using the same (or style-matched) generative model** that made the image. Running SDXL refine on a Flux render is the wrong tool.

---

## 7. Product decision (updated 2026-07-25)

Ship **both** modes from day one of upscale work.

### Shared SR weights (download into `upscale_models/`)

| Model                 | Role                             |
| --------------------- | -------------------------------- |
| **RealESRGAN_x4plus** | General / photo-like 4×          |
| **RealESRGAN_x2plus** | Modest 2× enlarge                |
| **4x-UltraSharp**     | Default for AI art / crisp edges |

### User Mode refine UI model

**Upscale model is primary. USDU is an optional layer on top — never required.**

| Control                 | Behavior                                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Enable upscale**      | Off by default. When on: pick an SR model (UltraSharp / RealESRGAN x2 / x4) and run native `ImageUpscaleWithModel`                                                                           |
| **Ultimate SD Upscale** | Separate **on/off toggle** (default off). Only meaningful when upscale is enabled. When on: same SR weight still selected, plus tiled img2img via USDU custom node + recipe generative stack |

Mental model for the user:

1. Choose an upscaler weight → always get a real enlarge.
2. Optionally turn on USDU → slower generative refine that _uses_ that weight (plus the recipe models).

Do **not** force USDU to use an upscaler, and do **not** hide raw SR behind an “Enhance-only” path. Power users who want crisp single-pass stay on SR alone.

### Shared across blueprints (like LoRAs)

Upscaling is a **studio-level** concern, not a blueprint pack:

|                          | LoRAs                                       | Upscale                                                           |
| ------------------------ | ------------------------------------------- | ----------------------------------------------------------------- |
| Owned by                 | Shared library (`loras/` + `models/loras/`) | Shared library (`models/upscale_models/` + one USDU custom node)  |
| In blueprint `models[]`? | **No**                                      | **No**                                                            |
| Per-recipe download?     | **No**                                      | **No**                                                            |
| User Mode                | Stack picker when generating                | Refine controls when generating (any image blueprint)             |
| Arch coupling            | Filter LoRA variants by blueprint `arch`    | SR weights are RGB-universal; USDU compile path differs by `arch` |

Do **not** ship UltraSharp / RealESRGAN inside each Official blueprint, and do **not** gate the SR picker on a per-blueprint `capabilities.upscale` flag. Every image recipe should be able to use the same upscalers. Compilers append the upscale (and optional USDU) subgraph after decode using the active blueprint’s arch for USDU wiring only.

USDU custom node: install once when the USDU toggle is first turned on (or with Official runtime bootstrap).

### Catalog (shipped)

SR (native Comfy): UltraSharp, RealESRGAN x2/x4, Nomos8k SC / Nomos8k DAT / Nomos2 HQ DAT2 / NomosUni SPAN.

Generative: optional USDU toggle on SR models with exposed **scale (2×/4×), steps, denoise**; **SUPIR** v0Q / v0F as catalog kind `supir` (kijai node + pruned weights + companion `sd_xl_base_1.0`). Install patches `sgm/util.py` so relative yaml imports work when the Comfy path contains dots (e.g. `com.open-gen-ai` AppData). Flux.2 USDU (guider node) only applies scale — steps/denoise come from the recipe sampler.

### Explicitly still deferred

- Face restore (CodeFormer / GFPGAN)
- SeedVR2 as product mode
- Paid Topaz
- Using a _different_ arch’s checkpoint to refine another arch’s image (USDU)
- Tile ControlNet as a required dependency (optional later quality add-on for SD1.5/SDXL)

---

## 8. Product UX notes (for when we implement)

- Upscale **opt-in** (default off). USDU **separately opt-in** (default off); warn: slower, may alter fine detail.
- SR-only path: upscale final RGB (not 4× latent generate).
- USDU path: enlarge capped at **2×** even when a 4× SR weight is selected (community pattern); denoise ~0.15 on turbo arches (`krea2` / `z-image`), ~0.2–0.25 elsewhere; reuse prompt/seed; still show which SR model is plugged in.
- Show estimated output size and rough time class (SR alone vs SR + USDU).
- Gallery metadata: `upscaleModel`, `usduEnabled`, scale, denoise (if USDU).
- Low VRAM: prefer SR-only; refuse or auto-tile USDU with a clear message.

---

## 9. Sources (surveyed)

- [ssitu/ComfyUI_UltimateSDUpscale](https://github.com/ssitu/ComfyUI_UltimateSDUpscale)
- [VideoProc — Ultimate SD Upscale (technique explanation)](https://www.videoproc.com/resource/ultimate-sd-upscale.htm)
- [Local AI Master — Local AI Image Upscaling (2026)](https://localaimaster.com/blog/ai-image-upscaling-local)
- [InsiderLLM — Local AI Upscaling guide](https://insiderllm.com/guides/local-ai-upscaling-guide/)
- [Botmonster — Real-ESRGAN vs Topaz vs SUPIR](https://botmonster.com/ai/local-ai-image-upscaling-real-esrgan-topaz-supir/)
- [PromptZone — ComfyUI ESRGAN + Ultimate SD Upscale](https://www.promptzone.com/tara_suzuki/how-to-upscale-images-in-comfyui-in-2026-esrgan-and-ultimate-sd-upscale-55bm)
- [cosmo-edge — ComfyUI upscale model comparison](https://cosmo-edge.com/ultimate-guide-comfyui-upscale-models/)
- [Real-ESRGAN (xinntao)](https://github.com/xinntao/Real-ESRGAN)
- [ComfyUI UpscaleModelLoader docs](https://docs.comfy.org/built-in-nodes/UpscaleModelLoader)

---

## 10. Bottom line

| Question                     | Answer                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Ultimate SD Upscale a model? | **No** — tiled img2img technique + custom nodes; usually still uses an ESRGAN weight for enlarge                |
| One graph for all arches?    | **No** — need arch-specific MODEL/CLIP/VAE wiring                                                               |
| Works with our arches?       | **Yes in principle** for `sd15`/`sdxl`/`flux`/`flux2`/`z-image`/`krea2` if we compile per arch and install USDU |
| Ship list                    | RealESRGAN x4 + x2, 4x-UltraSharp; USDU as optional toggle on top of chosen SR model                            |
| UI model                     | Pick SR model (raw upscale). Toggle USDU on/off separately — never required                                     |

Next implementation step: refine UI (upscale enable + model picker + USDU toggle) + download URLs for the three SR weights + `ComfyUI_UltimateSDUpscale` install + per-arch compiler appends.
