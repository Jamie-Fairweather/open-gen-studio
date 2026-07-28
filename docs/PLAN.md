# Open Gen AI — Product & Architecture Plan

> **Design history + product direction.** For how-tos and source of truth, prefer [`docs/contributing/`](./contributing/) — especially `RecipeArch::ALL` / generated `RECIPE_ARCHES` and Creator `ARCHES` in `lib/creator-arches.ts`.

## Vision

Build a **local AI runtime platform** — not “another ComfyUI frontend.”

Think **Steam / Docker Desktop for local generative AI**: the app installs runtimes, models, and dependencies; queues jobs; manages the GPU; and exposes a simple UI. Inference always happens in external engines (ComfyUI, Whisper, Kokoro, Wan, Trellis2, vLLM/llama.cpp, etc.). Media modalities: **image → audio → video → 3D** (in that product order).

Inspiration (and what we want to improve on): [open-generative-ai](https://github.com/anil-matcha/open-generative-ai).

**Day-one promise:** pick an Official Blueprint (e.g. Z-Image Turbo) → one-click install → generate. End users never touch GitHub, Python, or node packing by hand. (We may _host_ Official Blueprint manifests on GitHub for the app to fetch — that is an implementation detail, not a user workflow.)

---

## Core Principles

1. **The app never performs inference.** It orchestrates: install, start/stop services, queue jobs, unify results.
2. **Runtimes are plugins.** ComfyUI, Whisper, Kokoro, etc. implement a common interface.
3. **Publish Blueprints, not workflows.** Image Blueprints are **recipes** (arch + models + sampler + capabilities). The host **compiles** a Comfy API graph at generate time — we do not ship frozen `workflow.api.json` as the product path.
4. **Two data planes — never mix them.** Local app state (jobs, installs, gallery) vs Blueprint catalog (read-only manifests; Official ships in-repo today).
5. **No hosted marketplace database.** Official/community presets are files the app reads; not a public cloud DB.
6. **99% User Mode, 1% Creator Mode.** Most people never see a node graph. Creator authors **recipes** via a form; optional “Open ComfyUI” is a power-user escape hatch, not the happy path.

---

## Mental Model (UI language)

| Layer         | Meaning                                    | Examples                                         |
| ------------- | ------------------------------------------ | ------------------------------------------------ |
| **Engine**    | Underlying AI stack                        | ComfyUI, llama.cpp, Whisper                      |
| **Runtime**   | Installed, managed instance of an engine   | Official ComfyUI Windows Portable under app data |
| **Blueprint** | Installable capability package             | “Z-Image Turbo”, “Wan 2.2”, “Kokoro”, “Trellis2” |
| **Preset**    | User-facing install of a Blueprint version | Installed Z-Image Turbo                          |
| **Resources** | Shared assets                              | Models, LoRAs, upscalers, custom nodes           |
| **Projects**  | User workspaces / sessions                 | A portrait series                                |
| **Gallery**   | All outputs with metadata                  | Lightroom-style library                          |
| **Registry**  | Catalog UI over Blueprint sources          | Official (bundled) → later Community → Local     |

Users install **capabilities** (“cinematic images”). Power users can still open Comfy when they want.

---

## Data planes (critical separation)

Keep these mentally and in code as **two different systems**:

| Plane                 | What it stores                                                                                | Where it lives                           | Who reads/writes                                 |
| --------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------ |
| **Local store**       | Jobs, gallery, installed presets, runtime installs, model assets, settings, download progress | **SQLite owned by Rust**                 | Rust writes natively; UI via Tauri IPC / events  |
| **Blueprint catalog** | Official (later community) Blueprint manifests, model download URLs/hashes                    | **In-repo Official** today; GitHub later | App **reads** only; authors publish via git / PR |

Do **not** put marketplace/catalog rows into the local SQLite as source of truth. Optional: cache a fetched catalog snapshot locally for offline browsing — still clearly “cache of GitHub,” not the registry itself.

There is **no** hosted Open Gen AI database for presets/marketplace.

### Why not ZenStack

ZenStack is a poor fit here and is **not used**:

- Single-user desktop — access policies add nothing.
- Rust is the orchestrator and must write job/download/runtime state directly; putting the DB behind Next/ZenStack forces an extra localhost HTTP hop and an always-on Node data server for no real gain.
- Catalog is files, not an ORM-backed multi-tenant DB — ZenStack’s strengths never apply.
- UI can get live updates via **Tauri events** + IPC queries; no need for a Next CRUD layer.

Revisit only if we later build a real multi-user cloud product. Not for the local store.

---

## Architecture

```
+------------------------------------------------+
|                  Next.js UI                    |
|  Generate · Registry · Models · Creator · …    |
+----------------------|-------------------------+
                       |  Tauri IPC + events
                       |  (queries, commands, progress)
+------------------------------------------------+
|               Rust / Tauri host                |
|  SQLite (local store)                          |
|  Job queue · Model mgr · Runtime mgr           |
|  GPU detect · Downloader · Process mgr         |
|  Recipe compiler · Blueprint runner            |
+----------------------|-------------------------+
          |            |            |
       ComfyUI   Whisper   Kokoro / Wan / Trellis2 / …
          +----------+----------+----------+
                       |
                  CUDA / ROCm / …
                       |
                   Local GPU

Catalog (today): blueprints/official/ (bundled)
Catalog (later): GitHub Blueprint repo ──fetch──► Registry UI / installer
```

**Implication:** Next.js stays a **UI shell** (static export / Tauri `frontendDist` is fine). All durable local state and orchestration live in Rust. No Next.js API routes required for the local store.

### Stack (this repo)

| Area        | Choice                                 | Notes                                  |
| ----------- | -------------------------------------- | -------------------------------------- |
| Shell       | **Tauri 2**                            | Already scaffolded (`src-tauri/`)      |
| UI          | **Next.js 16 + React 19 + Tailwind 4** | coss/Base UI; talks to Rust via IPC    |
| Local store | **SQLite in Rust** (`rusqlite`)        | Single writer next to the orchestrator |
| Host logic  | **Rust (Tauri)**                       | Processes, GPU, downloads, jobs        |
| Catalog     | **Bundled Official** (+ GitHub later)  | Blueprint manifests; no cloud DB       |
| Realtime UI | Tauri events + client state            | e.g. job progress / gallery inserts    |
| Inference   | External runtimes only                 | GPU-first                              |

### Local store access

- Rust opens SQLite under the app data dir; owns migrations and writes.
- UI uses Tauri **commands** for reads/writes it initiates (list gallery, enqueue job, update settings).
- Long-running host work **emits events** (`job://updated`, `download://progress`) so the UI stays live without polling a HTTP API.
- Next.js does not own or proxy the database.

---

## Two Modes

### User Mode (default)

Simple form synthesized from the recipe’s **arch + capabilities** (not a frozen per-node UI schema):

- Prompt / negative prompt (when capable)
- Size, seed, steps, CFG / guidance
- LoRA stack + Refine (shared libraries — not per-blueprint models)
- Generate → job queue → Gallery
- **Tools** (Image to Prompt, Prompt Enhancer) — Comfy utility jobs (QwenVL) that write back into Image Studio

No graph. No nodes.

### Creator Mode (advanced)

**Recipe authoring form:** choose arch → fill model slots → sampler/defaults/capabilities → save to My blueprints (`%APPDATA%/…/blueprints/user/<id>/`). No Comfy capture required.

Optional: open the managed ComfyUI webview for exploration. Promoting a user pack into `blueprints/official/` is a manual copy / PR — the app never writes Official.

---

## Image Blueprints (recipes) — current path

A Blueprint is an immutable, versioned package. For **image / txt2img**, the payload is a **recipe**, not a frozen Comfy graph.

```
Blueprint (recipe)
├── Metadata          (name, category, tags, VRAM, license)
├── Arch + flowType   (e.g. z-image / txt2img)
├── Models            (role, filename, path, URL)
├── Sampler / scheduler + defaults
├── Capabilities      (negative, loras, controlnet, …)
├── Runtime           (engine + constraints)
├── customNodes[]     (optional)
├── Documentation / thumbnail / examples
└── Tests             (compile smoke tests in Rust)
```

Supported arches (v1): `z-image`, `krea2`, `flux`, `flux2`, `ideogram4`, `sdxl`, `sd15` — see [`blueprints/official/README.md`](../blueprints/official/README.md) and [`adding-model-architectures.md`](./contributing/adding-model-architectures.md).

Official packs today: `z-image-turbo`, `krea2-turbo`, `ideogram4`.

### Models (preset download)

```json
{
  "models": [
    {
      "role": "unet",
      "filename": "z_image_turbo_bf16.safetensors",
      "path": "diffusion_models",
      "url": "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors"
    }
  ]
}
```

Install lands files in the shared library: `app_data/models/<path>/<filename>` (wired into Comfy via `extra_model_paths.yaml`). Completeness = local file size vs remote `Content-Length` (HEAD/Range probe) — not hardcoded sizes in the manifest. Optional `sha256` for verify.

### Shared libraries (not blueprint `models[]`)

| Library   | Location                           | Notes                                 |
| --------- | ---------------------------------- | ------------------------------------- |
| LoRAs     | `loras/official` + user packs      | Arch-filtered stack at generate       |
| Upscalers | `models/upscale_models/` (+ SUPIR) | Refine UI: SR / USDU / SUPIR — shared |

---

## Registry / Official Blueprints

UI still feels like a Registry. **Official Blueprints ship inside the app** — not a hosted marketplace DB.

```
blueprints/official/<id>/
  manifest.json        # recipe (arch, models, defaults, capabilities)
  thumbnail.png        # optional
```

No `workflow.api.json`. No `controls[]`. See [`blueprints/official/README.md`](../blueprints/official/README.md).

```
Registry (UI)
├── Official   ← read from blueprints/official/ (built-in)
├── Community  ← later: GitHub repo(s) of the same folder shape
└── Local      ← My blueprints / user-added on disk
```

### Install / generate flow (Official)

```
App lists blueprints/official/*
  → User picks Blueprint → ensure Comfy runtime + models (+ nodes)
  → Compile Comfy API graph from arch + recipe + live settings
  → POST Comfy /prompt → poll → Gallery
```

Incremental resolution (like npm): skip already-installed ComfyUI / shared models.

---

## Runtime plugin interface

Every engine implements roughly:

```
install() · update() · start() · stop() · health() · run(job)
```

Capabilities the UI adapts to (declared by plugins):

`generateImage` · `generateAudio` · `generateVideo` · `generate3D` · `transcribe` · `tts` · `chat` · …

First concrete runtime: **ComfyUI**. Others plug in without rewriting the host.

---

## ComfyUI packaging decision

How we ship/install ComfyUI under the host (researched against current Comfy-Org options).

### Options considered

| Option                                                                                    | What it is                                                                                                                                                                                                                                                                                 | Verdict for Open Gen AI                                          |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| **Official Windows Portable**                                                             | Self-contained folder: `python_embeded` + `ComfyUI` + run/update scripts. Published on [ComfyUI releases](https://github.com/comfyanonymous/ComfyUI/releases) / [portable docs](https://docs.comfy.org/installation/comfyui_portable_windows). GPU-specific builds (NVIDIA / AMD / Intel). | **Primary choice on Windows**                                    |
| **Comfy Desktop** ([Comfy-Org/Comfy-Desktop](https://github.com/Comfy-Org/Comfy-Desktop)) | Official multi-install _launcher_ app; provisions “standalone” envs. Explicitly not for headless/server use.                                                                                                                                                                               | **Do not depend on it** — we _are_ the launcher                  |
| **comfy-cli / git + venv**                                                                | Scriptable clone + pip/uv into a venv                                                                                                                                                                                                                                                      | Fallback for Linux/macOS; more CUDA/pip failure modes on Windows |
| **Community mega-portables** (e.g. preloaded custom-node packs)                           | Third-party fat archives                                                                                                                                                                                                                                                                   | Avoid as default — size, trust, version drift                    |

### Decision

**Windows:** install the **official ComfyUI Windows Portable** that matches detected GPU:

- NVIDIA (modern): `ComfyUI_windows_portable_nvidia.7z`
- NVIDIA (older / CUDA 12.6): `ComfyUI_windows_portable_nvidia_cu126.7z`
- AMD / Intel: matching official portable when we expand GPU support

Flow:

```
Detect GPU → pick release asset URL → download (.7z, resume+checksum)
  → extract under app data (runtimes/comfyui/<version>/)
  → write extra_model_paths.yaml → shared models dir
  → start: python_embeded\python.exe -s ComfyUI\main.py
       --listen 127.0.0.1 --port <managed>
       (no auto-browser; we own the UI / optional Creator embed)
  → health-check HTTP → register runtime_installs row
```

Why portable (not “build our own venv”):

- No system Python / Git / CUDA toolkit required
- Official, relocatable, same artifact end users already trust
- Matches our orchestrator model: download → extract → supervise process → talk HTTP API
- Updates: use portable’s `update/` scripts or re-download a pinned release asset from Blueprints’ runtime pin

**Linux / macOS (later):** prefer **git clone + isolated venv (uv/pip)** or, if stable enough, reuse Comfy-Org [Standalone Environments](https://github.com/Comfy-Org/ComfyUI-Standalone-Environments) (what Comfy Desktop provisions). Same Runtime trait; different `install()` implementation per OS.

**Not bundling Comfy inside our installer by default** — too large; install on demand when the user (or a Blueprint) needs the Comfy runtime.

### Host implications

- Downloader must support **`.7z` extract** (portable is 7z, not zip). Pure Rust via **sevenz-rust2** (always works); optional system 7-Zip CLI when present for a faster path.
- Process manager launches `python_embeded\python.exe`, not `run_nvidia_gpu.bat` (bats are for humans; we pass flags ourselves).
- Shared **model library** outside the portable tree via `extra_model_paths.yaml` so Blueprint installs don’t duplicate multi‑GB weights per Comfy copy.
- Optional Creator Comfy view: point a WebView at `http://127.0.0.1:<port>` of _our_ managed Comfy process.

---

## Host subsystems (Rust)

| Subsystem       | Responsibility                                    |
| --------------- | ------------------------------------------------- |
| GPU detection   | NVIDIA (`nvidia-smi`) first; ROCm / Metal later   |
| Downloader      | Resume, parallel, checksums, extract, retries     |
| Process manager | Spawn/supervise runtime processes                 |
| Job queue       | Queued → Running → Completed / Failed / Cancelled |
| Runtime manager | Lifecycle + health of installed engines           |
| Model manager   | Paths, versions, shared cache                     |
| Recipe compiler | `arch` + settings → Comfy API JSON                |
| Plugin loader   | `plugin.json` + dynamic runtime adapters          |

### Job record (conceptual)

Prompt, negative, seed, cfg, runtime, Blueprint id/version, outputs, logs, timing, metadata → persisted in **local SQLite** by Rust; UI listens to Tauri events for live Gallery / job status.

---

## Unified capability API (app-facing)

Internally route to the right runtime; UI never talks to Comfy HTTP directly for normal User Mode:

- `generateImage()` / `generateAudio()` / `generateVideo()` / `generate3D()`
- `transcribe()` / `tts()` / `chat()`

---

## Data model sketch (local SQLite)

Tables are **machine-local**. Catalog Blueprints are not authoritative rows here.

- **installed_presets** — local install of a Blueprint (id, version, source URL, install path, status)
- **runtime_installs** — installed engine instances
- **model_assets** — downloaded files, hashes, paths
- **jobs** — queue + status + params + links to outputs
- **gallery_items** — outputs + thumbnails + generation metadata
- **settings** — directories, GPU preference, update prefs, Official catalog repo URL
- **catalog_cache** (optional) — last-fetched GitHub index snapshot for offline browse

Migrations live in the Rust host (versioned SQL / rusqlite).

---

## Development roadmap

### Done (image foundation)

- Next UI + Tauri shell; SQLite in Rust; IPC + events
- ComfyUI Windows Portable install + supervisor + shared models
- Recipe Official Blueprints + runtime graph compiler (`src-tauri/src/recipe/`)
- Creator recipe form; My blueprints; generate recipe-only
- LoRA library + Refine (SR / USDU / SUPIR)
- Tools: Image to Prompt + Prompt Enhance (QwenVL via Comfy)

### Next — ControlNet & polish

- ControlNet group (capability-gated)
- Batch gen, auto-update, Official catalog polish

### Later — Audio

- Whisper, Kokoro (+ optional MusicGen) on the same abstractions

### Later — Video

- Wan, CogVideoX, HunyuanVideo
- VRAM-aware scheduling / resource locks

### Later — 3D generation (after audio & video)

- Runtime/plugin for **Trellis2** (and similar image/text → 3D models)
- Official Blueprints under Registry → **3D**
- Gallery support for mesh outputs (e.g. GLB / OBJ) + simple 3D preview in User Mode

### Later — Advanced

- Community catalog (second GitHub source)
- Remote execution, scripting / REST for power users
- Optional static-workflow packaging for power users only (not the default path)

---

## Success criteria (near term)

1. Fresh machine → install an Official image Blueprint (e.g. Z-Image Turbo) → generate without touching a terminal.
2. Creator can author a shareable recipe (arch + model slots) into My blueprints; User Mode synthesizes controls from the recipe.
3. Rust owns local SQLite; UI stays live via Tauri IPC/events as jobs update (no ZenStack / Next data API).

---

## Out of scope (for now)

- ZenStack / Next.js-owned local database
- Hosted marketplace / public cloud database for presets
- Training pipelines
- CPU-only inference as a first-class path for heavy models
- Fully open community uploads before Official catalog + publish pipeline are solid
- Replacing ComfyUI with a custom node editor
- Shipping frozen `workflow.api.json` as the primary Blueprint format

---

## Source

Planning conversation: [ChatGPT — AI Runtime Platform Plan](https://chatgpt.com/share/6a5e4420-b980-83eb-8c01-e7e3c60146ff)
