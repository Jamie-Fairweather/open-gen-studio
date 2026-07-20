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

| Layer         | Meaning                                    | Examples                                    |
| ------------- | ------------------------------------------ | ------------------------------------------- |
| **Engine**    | Underlying AI stack                        | ComfyUI, llama.cpp, Whisper                 |
| **Runtime**   | Installed, managed instance of an engine   | ComfyUI 0.3.x in a managed venv             |
| **Blueprint** | Installable capability package             | “FLUX Dev”, “Wan 2.2”, “Kokoro”, “Trellis2” |
| **Preset**    | User-facing install of a Blueprint version | Installed FLUX Dev 1.2.0                    |
| **Resources** | Shared assets                              | Models, LoRAs, custom nodes                 |
| **Projects**  | User workspaces / sessions                 | A portrait series                           |
| **Gallery**   | All outputs with metadata                  | Lightroom-style library                     |
| **Registry**  | Catalog UI over GitHub Blueprint sources   | Official repo → later Community → Local     |

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

```yaml
controls:
  - id: prompt
    type: textarea
  - id: negative_prompt
    type: textarea
  - id: aspect_ratio
    type: select
    values: [1:1, 16:9, 9:16]
  - id: steps
    type: slider
    min: 10
    max: 50
    default: 28
    advanced: true
  - id: cfg
    type: slider
    min: 1
    max: 10
    default: 3.5
    advanced: true
```

Creators annotate which workflow parameters are user-facing; the app **generates the form**.

### Publish pipeline

```
Build workflow → Validate → Resolve deps → Generate manifest
  → Run test → Capture thumbnail → Package → Publish
```

**Dependency scanner** inspects the workflow and proposes the manifest (models, encoders, VAE, custom nodes, Python/torch versions). Author confirms — no hand-written YAML as the primary path.

---

## Registry (GitHub-backed catalog)

UI still feels like a Registry. Backend is **not** a marketplace DB — it is one or more **GitHub repositories** of Blueprint packages (YAML/JSON manifests + workflow files + thumbnails).

```
Registry (UI)
├── Images     (FLUX, SDXL, SD3, …)
├── Audio      (Kokoro, Whisper, MusicGen, …)
├── Video      (Wan, CogVideoX, Hunyuan, …)
└── 3D         (Trellis2, …)          ← later phase

Catalog source (implementation)
└── github.com/<org>/open-gen-ai-blueprints   (example)
    ├── blueprints/flux-dev/1.0.0/manifest.yaml
    ├── blueprints/flux-dev/1.0.0/workflow.json
    └── …
```

Each entry shows description, examples, VRAM/disk, install time estimate, runtime, GPU support, version — all derived from the manifest files.

**Publishing Official Blueprints** = commit / PR to that repo (Creator Mode can automate packaging; git remains the distribution channel). Community later can be a second repo or fork policy — still files, still no hosted DB.

### Install flow

```
Browse Registry (fetch index from GitHub)
  → Install → Download manifest → Resolve deps → Download runtime
  → Install runtime → Download models → Install nodes
  → Verify hashes → Write InstalledPreset to local SQLite → Ready
```

Incremental resolution (like npm): skip already-installed ComfyUI / Impact Pack / shared models.

Sources over time: **Official (GitHub) · Community (GitHub) · Local (disk)** — same installer, different catalog URLs.

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

- Runtime trait + Python venv management
- Install / start / stop / health / versioning
- First runtime: **ComfyUI**
- Persist runtime_installs / progress in SQLite

### Phase 3 — Image generation (first complete product)

- Fetch Official Blueprints from GitHub catalog repo
- Auto-install ComfyUI + nodes + models (FLUX / SDXL)
- User Mode generate UI from UI schema
- Gallery + history + live job status via events

### Phase 4 — Creator Mode & Blueprint publishing

- Embed ComfyUI in Creator
- Dependency scanner → manifest → package
- Publish path: commit/PR to Official GitHub Blueprints repo (not a cloud DB)
- Immutable versioning (dirs / tags per version)

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
