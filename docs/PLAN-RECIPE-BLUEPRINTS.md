# Recipe Blueprints & Dynamic Graph Generation

> Status: **proposal** (2026-07-21)  
> Relates to: [`PLAN.md`](./PLAN.md) — revises Creator Mode and what a Blueprint stores for image generation.

## Summary

Stop shipping full ComfyUI workflow JSON as the core of an image Blueprint.

Instead:

1. A Blueprint is a **recipe**: flow type, architecture, models (+ URLs), sampler/scheduler, defaults, and capability flags.
2. **Generate** compiles a known-good Comfy API graph at runtime from that recipe + the current User Mode settings.
3. **Creator** becomes a form for authoring recipes (no embedded ComfyUI required for the happy path).

ComfyUI remains the **engine**. The app owns the **graph**.

---

## Why

The current model (capture / import arbitrary Comfy graphs) creates recurring product failures:

| Pain                         | Cause                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| Prompt bindings missing      | Graphs use custom nodes (`easy positive`, etc.) that aren’t installed or don’t survive `graphToPrompt` |
| Unshareable Creator packs    | Manifest saves `"customNodes": []` — another user gets models but not extensions                       |
| Stale / empty model URLs     | CivitAI graphs embed wrong `properties.models` metadata                                                |
| Combinatorial support burden | Every community graph is a unique snowflake                                                            |

Recipe blueprints fix the happy path: we only generate graphs we know how to run, install, and share.

This matches the existing product principle — **99% User Mode** — more closely than “Creator = embed full Comfy.”

---

## Mental model

| Term                   | Meaning                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| **Flow type**          | Product intent: `txt2img`, later `img2img`, etc.                             |
| **Architecture**       | Graph family the compiler implements: e.g. `sdxl`, `flux`, `z-image`         |
| **Recipe / Blueprint** | Models + sampler + defaults + capabilities for one flow+arch                 |
| **Settings**           | Live User Mode values (prompt, size, seed, …) grouped in the UI              |
| **Graph compiler**     | Rust (or host) code that emits Comfy API JSON for `(arch, settings, recipe)` |

Official / My blueprints stay installable packages on disk; only the **payload shape** changes (recipe JSON instead of — or ahead of — a frozen `workflow.api.json`).

---

## User Mode settings (modular groups)

Reuse the existing control `group` idea. Target groups:

| Group          | Controls                            | Notes                                                 |
| -------------- | ----------------------------------- | ----------------------------------------------------- |
| **prompt**     | Positive; negative (when capable)   | Negative visibility is dynamic (see below)            |
| **basic**      | Image count, width, height          | Aspect presets can stay as UX sugar over width/height |
| **core**       | Seed, steps, CFG                    | Seed `0` = random (already)                           |
| **refine**     | Upscale / detailer toggles + params | Later; only if `capabilities.upscale`                 |
| **controlnet** | Enable + model + strength + image   | Later; only if `capabilities.controlnet`              |

LoRAs can live under **core** or a dedicated **models** strip — product choice. Compiler treats them as optional stack inputs when `capabilities.loras` is true.

Settings that a recipe does not support are hidden, not shown disabled for every pack.

---

## Blueprint shape (recipe)

Illustrative manifest (names can evolve; keep camelCase JSON consistent with today):

```json
{
  "id": "into-realism-z-image",
  "name": "Into Realism Z-Image",
  "category": "image",
  "description": "…",
  "runtime": "comfyui",
  "flowType": "txt2img",
  "arch": "z-image",
  "sampler": "euler",
  "scheduler": "simple",
  "capabilities": {
    "negative": false,
    "loras": true,
    "controlnet": false,
    "upscale": false
  },
  "defaults": {
    "steps": 8,
    "cfg": 1,
    "width": 1024,
    "height": 1024,
    "seed": 0
  },
  "models": [
    {
      "role": "unet",
      "filename": "IntoRealismZIT4.safetensors",
      "path": "diffusion_models",
      "url": "https://…"
    },
    {
      "role": "vae",
      "filename": "ae.safetensors",
      "path": "vae",
      "url": "https://…"
    },
    {
      "role": "text_encoder",
      "filename": "zImage_textEncoder.safetensors",
      "path": "text_encoders",
      "url": "https://…"
    }
  ],
  "customNodes": []
}
```

### Roles (not raw loader class names)

Preferred model roles the compiler understands:

- `checkpoint` — single-file SD1.5 / SDXL style
- `unet` / `diffusion`
- `vae`
- `text_encoder` (repeatable)
- `lora` (optional list / user-picked)
- later: `controlnet`, `upscale`

`path` still maps to the shared models library folders. `url` remains optional when the file is already local.

### `customNodes`

Only for deps the **compiler** needs (ideally none for v1 arches that use Comfy core nodes only). If an arch requires a pack (e.g. GGUF loader), list it here so install still `git clone`s into portable `custom_nodes/`.

---

## Generate: dynamic graph compile

```
User clicks Generate
        │
        ▼
Load recipe (Blueprint) + current settings
        │
        ▼
Validate capabilities (e.g. reject ControlNet if unsupported)
        │
        ▼
Pick compiler for recipe.arch (+ flowType)
        │
        ▼
Emit Comfy API prompt JSON
        │
        ▼
Queue to managed ComfyUI (/prompt) — same job/gallery path as today
```

### Compiler responsibilities

- Wire loaders from `models[]` by role
- Encode prompts (skip / omit negative branch when disabled)
- Empty latent from width/height/(batch)
- KSampler (or arch-equivalent) with recipe sampler/scheduler + settings
- Optional: LoRA stack, upscale pass, ControlNet apply
- Always produce **API-format** JSON (numeric node ids) suitable for `/prompt`

### Non-goals for v1 compilers

- Arbitrary third-party node graphs
- Faithful import of CivitAI mega-workflows
- FaceDetailer / UltimateSDUpscale / easy-use chains

Those stay out until we explicitly add an optional block + tested compiler path.

---

## Architectures (graph families)

Do **not** build one universal graph. Build one compiler per family:

| `arch`          | Typical loaders                          | Typical CFG | Negative   |
| --------------- | ---------------------------------------- | ----------- | ---------- |
| `sd15` / `sdxl` | Checkpoint (+ optional VAE)              | 5–7         | Yes        |
| `flux`          | UNET + TE(s) + VAE                       | ~1          | Usually no |
| `z-image`       | UNET + TE + VAE (Z-Image / Lumina-style) | ~1          | Usually no |

Ship **two** arches first (one checkpoint-style, one UNET+TE+VAE). Add families only when we have a tested graph and an Official recipe.

---

## Negative prompt (dynamic)

For classic CFG guidance (SD1.5 / SDXL):

- If **CFG ≤ 1**, negative conditioning has little/no effect → hide or disable Negative in the UI.
- If **CFG > 1**, show Negative when `capabilities.negative` is true.

Rules:

1. `capabilities.negative === false` → never show Negative (Flux / Z-Image packs).
2. `capabilities.negative === true` → show Negative when `cfg > 1` (optional soft rule; can always show but no-op in the compiler when `cfg ≤ 1`).

Do **not** assume CFG semantics are universal across arches — the capability flag is the source of truth; CFG only refines UX for CFG-based arches.

---

## Creator Mode (reworked)

Creator is **recipe authoring**, not Comfy embedding.

### Flow

1. Choose **flow type** (v1: Text to image only).
2. Choose **architecture** (drives which model slots appear).
3. Fill model slots (filename, folder, download URL) — same packaging UX as today.
4. Pick sampler / scheduler (constrained list per arch).
5. Set defaults (steps, CFG, size, …).
6. Capability toggles where the arch allows (e.g. “supports negative prompt”).
7. Save → My blueprints (`manifest` recipe; no captured `workflow.api.json` required).

### What goes away (for the happy path)

- Embedded Creator Comfy webview as the primary authoring tool
- Capture / bind-node mapping dialog for prompts and sampler fields
- Expectation that users import arbitrary CivitAI graphs into shareable packs

### Optional later

- **Advanced: custom workflow Blueprint** — restore frozen `workflow.api.json` + control bindings for power users / Official edge cases. Same install/generate shell, different execution backend (`compiled` vs `static workflow`). Not required for v1 of this plan.

---

## Install path

Unchanged in spirit:

1. Ensure ComfyUI runtime (+ Manager as already planned).
2. Install `customNodes[]` if any.
3. Download `models[]` into the shared library.

No change to “models already on disk ⇒ skip download.”

---

## Migration

| Existing asset                          | Approach                                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Official packs with `workflow.api.json` | Keep running via **static workflow** path until rewritten as recipes, **or** dual-read: if `arch`+`flowType` present → compile; else → patch frozen workflow (current behavior) |
| User blueprints from Creator capture    | Leave runnable as static; new Creator writes recipes only                                                                                                                       |
| Gallery reuse (prompt / size)           | Still applies — settings are first-class                                                                                                                                        |

Prefer a **compatibility flag** on the manifest, e.g. `"execution": "recipe" | "workflow"` (default `workflow` when only `workflow.api.json` exists).

---

## Phased delivery

### Phase A — Foundation

- Manifest fields: `flowType`, `arch`, `sampler`, `scheduler`, `capabilities`, `defaults`, model `role`
- Dual execution: recipe vs frozen workflow
- Settings groups aligned in User Mode (prompt / basic / core)
- Dynamic negative visibility for CFG-capable recipes

### Phase B — First compilers

- `txt2img` + checkpoint arch (`sdxl` or `sd15`)
- `txt2img` + UNET+TE+VAE arch (`flux` or `z-image`)
- One Official recipe each; generate without `workflow.api.json`

### Phase C — Creator form

- Replace Comfy-embed Creator with recipe form
- Save My blueprints as `execution: "recipe"`

### Phase D — Optional blocks

- LoRA stack in UI + compiler
- Upscale refine group
- ControlNet group

### Phase E — (Optional) Advanced custom workflows

- Reintroduce static workflow packaging for power users only

---

## Success criteria

- A user can install a recipe Blueprint on a clean machine and generate **without** opening Comfy or installing random node packs (beyond what the recipe lists).
- Creator can publish a shareable pack in minutes by filling model slots — no node binding UI.
- Negative prompt appears only when it can matter.
- Adding ControlNet/upscale later does not require rewriting existing recipes (capabilities default false).

---

## Open questions

1. Exact `arch` enum and which two ship first.
2. Whether LoRAs are blueprint-owned, user-picked at generate time, or both.
3. Sampler/scheduler lists per arch (expose full Comfy enums vs curated).
4. Image count / batch: Comfy latent batch vs queued jobs.
5. How aggressively to deprecate frozen-workflow Official packs.

---

## Out of scope (this doc)

- Non-image modalities (audio / video / 3D)
- Replacing ComfyUI as the image engine
- Hosted marketplace / cloud inference
- Auto-translating arbitrary CivitAI workflows into recipes
