# Open Gen AI — Product & Architecture Plan

## Vision

Build a **local AI runtime platform** — not “another ComfyUI frontend.”

Think **Steam / Docker Desktop for local generative AI**: the app installs runtimes, models, and dependencies; queues jobs; manages the GPU; and exposes a simple UI. Inference always happens in external engines (ComfyUI, Whisper, Kokoro, Wan, Trellis2, vLLM/llama.cpp, etc.). Media modalities: **image → audio → video → 3D** (in that product order).

Inspiration (and what we want to improve on): [open-generative-ai](https://github.com/anil-matcha/open-generative-ai).

**Day-one promise:** pick an official Blueprint (e.g. FLUX Dev) → one-click install → generate. End users never touch GitHub, Python, or node packing by hand. (We may _host_ Official Blueprint manifests on GitHub for the app to fetch — that is an implementation detail, not a user workflow.)

---

## Core Principles

1. **The app never performs inference.** It orchestrates: install, start/stop services, queue jobs, unify results.
2. **Runtimes are plugins.** ComfyUI, Whisper, Kokoro, etc. implement a common interface.
3. **Publish Blueprints, not workflows.** A Blueprint packages workflow + models + runtime + deps + UI schema + docs + tests.
4. **Two data planes — never mix them.** Local app state (jobs, installs, gallery) vs Blueprint catalog (read-only manifests from GitHub).
5. **No hosted marketplace database.** Official/community presets are files in a GitHub repo the app reads; not a public cloud DB.
6. **99% User Mode, 1% Creator Mode.** Most people never see a node graph. Creators embed the real ComfyUI to author Blueprints.

---

## Mental Model (UI language)

| Layer         | Meaning                                    | Examples                                         |
| ------------- | ------------------------------------------ | ------------------------------------------------ |
| **Engine**    | Underlying AI stack                        | ComfyUI, llama.cpp, Whisper                      |
| **Runtime**   | Installed, managed instance of an engine   | Official ComfyUI Windows Portable under app data |
| **Blueprint** | Installable capability package             | “FLUX Dev”, “Wan 2.2”, “Kokoro”, “Trellis2”      |
| **Preset**    | User-facing install of a Blueprint version | Installed FLUX Dev 1.2.0                         |
| **Resources** | Shared assets                              | Models, LoRAs, custom nodes                      |
| **Projects**  | User workspaces / sessions                 | A portrait series                                |
| **Gallery**   | All outputs with metadata                  | Lightroom-style library                          |
| **Registry**  | Catalog UI over GitHub Blueprint sources   | Official repo → later Community → Local          |

Users install **capabilities** (“cinematic images”). Power users can still see engines, nodes, and graphs when they want.

---

## Data planes (critical separation)

Keep these mentally and in code as **two different systems**:

| Plane                 | What it stores                                                                                             | Where it lives               | Who reads/writes                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------ |
| **Local store**       | Jobs, gallery, installed presets, runtime installs, model assets, settings, download progress              | **SQLite owned by Rust**     | Rust writes natively; UI via Tauri IPC / events  |
| **Blueprint catalog** | Official (later community) Blueprint manifests, UI schemas, workflow JSON refs, model download URLs/hashes | **GitHub repo(s)** (raw/API) | App **reads** only; authors publish via git / PR |

Do **not** put marketplace/catalog rows into the local SQLite as source of truth. Optional: cache a fetched catalog snapshot locally for offline browsing — still clearly “cache of GitHub,” not the registry itself.

There is **no** hosted Open Gen AI database for presets/marketplace.

### Why not ZenStack

ZenStack is a poor fit here and is **not used**:

- Single-user desktop — access policies add nothing.
- Rust is the orchestrator and must write job/download/runtime state directly; putting the DB behind Next/ZenStack forces an extra localhost HTTP hop and an always-on Node data server for no real gain.
- Catalog is GitHub files, not an ORM-backed multi-tenant DB — ZenStack’s strengths never apply.
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
|  Plugin system · Workflow / Blueprint runner   |
+----------------------|-------------------------+
          |            |            |
       ComfyUI   Whisper   Kokoro / Wan / Trellis2 / …
          +----------+----------+----------+
                       |
                  CUDA / ROCm / …
                       |
                   Local GPU

Catalog (separate):
  GitHub Blueprint repo ──fetch manifests──► Registry UI / installer
```

**Implication:** Next.js stays a **UI shell** (static export / Tauri `frontendDist` is fine). All durable local state and orchestration live in Rust. No Next.js API routes required for the local store.

### Stack (this repo)

| Area        | Choice                                 | Notes                                  |
| ----------- | -------------------------------------- | -------------------------------------- |
| Shell       | **Tauri 2**                            | Already scaffolded (`src-tauri/`)      |
| UI          | **Next.js 16 + React 19 + Tailwind 4** | coss/Base UI; talks to Rust via IPC    |
| Local store | **SQLite in Rust** (`rusqlite` / sqlx) | Single writer next to the orchestrator |
| Host logic  | **Rust (Tauri)**                       | Processes, GPU, downloads, jobs        |
| Catalog     | **GitHub repo**                        | Blueprint manifests; no cloud DB       |
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

Simple form generated from a Blueprint’s **UI schema**:

- Prompt / negative prompt
- Aspect ratio, seed, etc.
- Generate → job queue → Gallery

No graph. No nodes.

### Creator Mode (advanced)

Embed the **real ComfyUI frontend** (not a reimplementation). Build → test → **Publish Blueprint** (package files → commit/PR to the Official GitHub Blueprints repo).

Later, Creator can grow beyond Comfy (video graphs, LLM flows, audio pipelines, 3D meshes) while still emitting the same Blueprint format.

---

## Blueprints

A Blueprint is an immutable, versioned package (npm-style — never overwrite; publish `1.0.0` → `1.1.0` → `2.0.0`).

```
Blueprint
├── Metadata          (name, category, tags, VRAM, disk, license)
├── Workflow          (e.g. Comfy JSON)
├── Models            (URLs, hashes, sizes)
├── Runtime           (engine + version constraints)
├── Dependencies      (custom nodes, Python packages, env)
├── UI Schema         (controls end users see)
├── Presets           (default parameter sets)
├── Documentation
├── Example outputs
├── Thumbnail
└── Tests             (smoke generate before publish)
```

### UI schema (example)

```json
{
  "controls": [
    {
      "id": "prompt",
      "type": "textarea",
      "group": "default",
      "nodeId": "…",
      "input": "text"
    },
    {
      "id": "aspect_ratio",
      "type": "select",
      "group": "default",
      "values": ["1:1", "16:9", "9:16"]
    },
    {
      "id": "steps",
      "type": "number",
      "group": "advanced",
      "default": 28,
      "nodeId": "…",
      "input": "steps"
    },
    {
      "id": "cfg",
      "type": "number",
      "group": "advanced",
      "default": 3.5,
      "nodeId": "…",
      "input": "cfg"
    }
  ]
}
```

`group` is `default` | `advanced`. User Mode always shows `default`; an **Advanced controls** toggle reveals `advanced`. Omit `group` → treat as `default`.

Creators annotate which workflow parameters are user-facing; the app **generates the form**.

### Models (preset download)

```json
{
  "models": [
    {
      "filename": "z_image_turbo_bf16.safetensors",
      "path": "diffusion_models",
      "url": "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors"
    }
  ]
}
```

Install lands files in the shared library: `app_data/models/<path>/<filename>` (wired into Comfy via `extra_model_paths.yaml`). Completeness = local file size vs remote `Content-Length` (HEAD/Range probe) — not hardcoded sizes in the manifest. Optional `sha256` for verify.

### Publish pipeline

```
Build workflow → Validate → Resolve deps → Generate manifest
  → Run test → Capture thumbnail → Package → Publish
```

**Dependency scanner** inspects the workflow and proposes the manifest (models, encoders, VAE, custom nodes, Python/torch versions). Author confirms — no hand-written YAML as the primary path.

---

## Registry / Official Blueprints

UI still feels like a Registry. **Official Blueprints ship inside the app** — not a hosted marketplace DB.

```
blueprints/official/<id>/
  manifest.json        # name, category, models, UI controls → node bindings
  workflow.api.json    # ComfyUI "Export Workflow (API)" JSON
  thumbnail.png        # optional
```

Drop API-format Comfy exports into that folder; they are bundled with the desktop build (Tauri resources). See [`blueprints/official/README.md`](../blueprints/official/README.md).

```
Registry (UI)
├── Official   ← read from blueprints/official/ (built-in)
├── Community  ← later: GitHub repo(s) of the same folder shape
└── Local      ← user-added blueprints on disk
```

**Workflow format:** use ComfyUI **File → Export Workflow (API)** (numeric node IDs). Normal Save/UI JSON is for Creator Mode editing only — `/prompt` needs API format.

**Community later** can reuse the same `manifest.json` + `workflow.api.json` layout on GitHub. Official stays in-repo so day-one generation does not depend on network catalogs.

### Install / generate flow (Official)

```
App lists blueprints/official/*
  → User picks Blueprint → ensure Comfy runtime + models
  → Patch workflow.api.json from UI controls (nodeId + input)
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

**Windows (Phase 2+):** install the **official ComfyUI Windows Portable** that matches detected GPU:

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
       (no auto-browser; we own the UI / Creator embed)
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
- Creator Mode: point a WebView / iframe at `http://127.0.0.1:<port>` of _our_ managed Comfy process (embed the real UI; don’t ship a second Comfy Desktop).

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

Migrations live in the Rust host (e.g. sqlx / refinery / simple versioned SQL).

---

## Development roadmap

### Phase 1 — Core foundation

- Keep Next as UI (static export OK); Tauri shell
- SQLite in Rust + migrations; minimal tables: settings, jobs, gallery_items
- Tauri commands + events for list/create job, settings, gallery
- Rust: GPU detect (NVIDIA), process manager stub, downloader (resume/checksum)
- UI: shell + job/gallery views driven by IPC/events (no real inference yet)

### Phase 2 — Runtime framework

- Runtime trait (`install` / `start` / `stop` / `health` / `run`)
- **ComfyUI Windows Portable** installer (GPU-matched release asset + 7z extract)
- **Auto-install on app startup** (background thread; UI stays responsive)
- Process supervisor for `python_embeded\python.exe` + HTTP health on managed port
- `extra_model_paths.yaml` → shared models directory
- Persist `runtime_installs` in SQLite

### Phase 3 — Image generation (first complete product)

- Load Official Blueprints from `blueprints/official/` (bundled)
- Ensure Comfy runtime installed + models from manifest
- User Mode form from manifest `controls` → patch `workflow.api.json` → Comfy `/prompt`
- Gallery + history + live job status via events

### Phase 4 — Creator Mode & Blueprint publishing

- Embed managed ComfyUI in a Creator webview (`app.graphToPrompt` capture)
- Light packaging: suggest models + User Mode controls from the API workflow
- **Save only to the user folder** `%APPDATA%/…/blueprints/user/<id>/` (same `manifest.json` + `workflow.api.json` shape as Official)
- **Never write Official** — promoting a user pack into `blueprints/official/` is a manual copy
- Picker lists **My blueprints** alongside Official; generate resolves user first by id

### Phase 5 — Audio

- Whisper, Kokoro (+ optional MusicGen) on the same abstractions

### Phase 6 — Video

- Wan, CogVideoX, HunyuanVideo
- VRAM-aware scheduling / resource locks

### Phase 7 — 3D generation (after audio & video)

- Runtime/plugin for **Trellis2** (and similar image/text → 3D models)
- Official Blueprints under Registry → **3D** (still GitHub manifests)
- Gallery support for mesh outputs (e.g. GLB / OBJ) + simple 3D preview in User Mode
- Same install / job / Blueprint abstractions; no special-case host rewrite

### Phase 8 — Advanced

- Batch gen, LoRAs, ControlNet, auto-update
- Community catalog (second GitHub source)
- Remote execution, scripting / REST for power users

---

## Success criteria (near term)

1. Fresh machine → install Official **FLUX Dev** Blueprint (from GitHub catalog) → generate an image without touching a terminal.
2. Creator can open embedded ComfyUI, package a Blueprint, and land it in the Official GitHub repo; User Mode renders its controls automatically.
3. Rust owns local SQLite; UI stays live via Tauri IPC/events as jobs update (no ZenStack / Next data API).

---

## Out of scope (for now)

- ZenStack / Next.js-owned local database
- Hosted marketplace / public cloud database for presets
- Training pipelines
- CPU-only inference as a first-class path for heavy models
- Fully open community uploads before Official GitHub catalog + publish pipeline are solid
- Replacing ComfyUI with a custom node editor

---

## Source

Planning conversation: [ChatGPT — AI Runtime Platform Plan](https://chatgpt.com/share/6a5e4420-b980-83eb-8c01-e7e3c60146ff)
