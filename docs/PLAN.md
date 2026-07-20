# Open Gen AI — Product & Architecture Plan

> Distilled from the [AI Runtime Platform Plan](https://chatgpt.com/share/6a5e4420-b980-83eb-8c01-e7e3c60146ff) chat, adapted to this repo’s existing stack and the decision to use **ZenStack** for data.

## Vision

Build a **local AI runtime platform** — not “another ComfyUI frontend.”

Think **Steam / Docker Desktop for local generative AI**: the app installs runtimes, models, and dependencies; queues jobs; manages the GPU; and exposes a simple UI. Inference always happens in external engines (ComfyUI, Whisper, Kokoro, Wan, Trellis2, vLLM/llama.cpp, etc.). Media modalities: **image → audio → video → 3D** (in that product order).

Inspiration (and what we want to improve on): [open-generative-ai](https://github.com/anil-matcha/open-generative-ai).

**Day-one promise:** pick an official Blueprint (e.g. FLUX Dev) → one-click install → generate. No GitHub, no Python, no node packing by hand.

---

## Core Principles

1. **The app never performs inference.** It orchestrates: install, start/stop services, queue jobs, unify results.
2. **Runtimes are plugins.** ComfyUI, Whisper, Kokoro, etc. implement a common interface.
3. **Publish Blueprints, not workflows.** A Blueprint packages workflow + models + runtime + deps + UI schema + docs + tests.
4. **Registry, not marketplace** (at least initially). Official Blueprints first; community later on the same rails.
5. **99% User Mode, 1% Creator Mode.** Most people never see a node graph. Creators embed the real ComfyUI to author Blueprints.

---

## Mental Model (UI language)

| Layer         | Meaning                                     | Examples                                    |
| ------------- | ------------------------------------------- | ------------------------------------------- |
| **Engine**    | Underlying AI stack                         | ComfyUI, llama.cpp, Whisper                 |
| **Runtime**   | Installed, managed instance of an engine    | ComfyUI 0.3.x in a managed venv             |
| **Blueprint** | Installable capability package              | “FLUX Dev”, “Wan 2.2”, “Kokoro”, “Trellis2” |
| **Preset**    | User-facing install of a Blueprint version  | Installed FLUX Dev 1.2.0                    |
| **Resources** | Shared assets                               | Models, LoRAs, custom nodes                 |
| **Projects**  | User workspaces / sessions                  | A portrait series                           |
| **Gallery**   | All outputs with metadata                   | Lightroom-style library                     |
| **Registry**  | Catalog of installable Blueprints/resources | Official → Community → Local                |

Users install **capabilities** (“cinematic images”). Power users can still see engines, nodes, and graphs when they want.

---

## Architecture

```
+------------------------------------------------+
|                  Next.js UI                    |
|  Generate · Registry · Models · Creator · …    |
+----------------------|-------------------------+
                       |  Tauri IPC
+------------------------------------------------+
|               Rust / Tauri host                |
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
```

### Stack (this repo)

| Area       | Choice                                 | Notes                                                                                            |
| ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Shell      | **Tauri 2**                            | Already scaffolded (`src-tauri/`)                                                                |
| UI         | **Next.js 16 + React 19 + Tailwind 4** | Already scaffolded; coss/Base UI components present                                              |
| Local data | **ZenStack + SQLite**                  | Schema + access policies; query from Next.js directly — **no hand-rolled REST API** for app data |
| Host logic | **Rust (Tauri)**                       | Process mgmt, downloads, GPU, runtime lifecycle via IPC                                          |
| State (UI) | TanStack Query + light client state    | As needed; prefer server/ZenStack for durable data                                               |
| Inference  | External runtimes only                 | GPU-first; no CPU-first path for heavy models                                                    |

### Why ZenStack here

- Model app entities (users/local profile, installed Blueprints, jobs, gallery items, settings, registry cache) in `.zmodel`.
- Use the ZenStack client from Next.js (Server Components, Server Actions, or the Next adapter) instead of building and maintaining a custom API layer.
- Keep **heavy orchestration** (spawn ComfyUI, resume 18GB downloads, nvidia-smi) in Rust — ZenStack owns **structured app state**, not GPU processes.

---

## Two Modes

### User Mode (default)

Simple form generated from a Blueprint’s **UI schema**:

- Prompt / negative prompt
- Aspect ratio, seed, etc.
- Generate → job queue → Gallery

No graph. No nodes.

### Creator Mode (advanced)

Embed the **real ComfyUI frontend** (not a reimplementation). Build → test → **Publish Blueprint**.

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

## Registry

Not a marketplace on day one — a **Registry** with an Official source.

```
Registry
├── Images     (FLUX, SDXL, SD3, …)
├── Audio      (Kokoro, Whisper, MusicGen, …)
├── Video      (Wan, CogVideoX, Hunyuan, …)
└── 3D         (Trellis2, …)          ← later phase
```

Each entry shows description, examples, VRAM/disk, install time estimate, runtime, GPU support, version.

### Install flow

```
Install → Download manifest → Resolve deps → Download runtime
  → Install runtime → Download models → Install nodes
  → Verify hashes → Register preset → Ready
```

Incremental resolution (like npm): skip already-installed ComfyUI / Impact Pack / shared models.

Sources over time: **Official · Community · Local** — same client, different remotes.

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

Prompt, negative, seed, cfg, runtime, workflow/Blueprint id, outputs, logs, timing, metadata → persisted via ZenStack and shown in Gallery.

---

## Unified capability API (app-facing)

Internally route to the right runtime; UI never talks to Comfy HTTP directly for normal User Mode:

- `generateImage()` / `generateAudio()` / `generateVideo()` / `generate3D()`
- `transcribe()` / `tts()` / `chat()`

---

## Data model sketch (ZenStack)

High-level entities to model in `.zmodel` (evolve as we implement):

- **Blueprint / BlueprintVersion** — registry metadata + manifest reference
- **InstalledPreset** — local install of a Blueprint version
- **RuntimeInstall** — installed engine instances
- **ModelAsset** — downloaded files, hashes, paths
- **Job** — queue + status + params + links to outputs
- **GalleryItem** — outputs + thumbnails + generation metadata
- **Setting** — directories, GPU preference, update prefs
- **RegistrySource** — Official / Community / Local endpoints

Access rules live in the schema (`@@allow` / `@@deny`) so the Next.js layer stays thin.

---

## Development roadmap

### Phase 1 — Core foundation

- Tauri + Next.js shell (in progress)
- Rust IPC: process manager, downloader (resume/checksum), GPU detect (NVIDIA), logging, settings
- ZenStack + SQLite wired into Next.js
- Job queue + Gallery scaffolding (no real inference yet)

### Phase 2 — Runtime framework

- Runtime trait + Python venv management
- Install / start / stop / health / versioning
- First runtime: **ComfyUI**

### Phase 3 — Image generation (first complete product)

- Auto-install ComfyUI + nodes + models (FLUX / SDXL)
- Blueprint install from Official Registry
- User Mode generate UI from UI schema
- Gallery + history + metadata

### Phase 4 — Creator Mode & Blueprint publishing

- Embed ComfyUI in Creator
- Dependency scanner → manifest → publish to Official (admin) / later Community
- Immutable versioning

### Phase 5 — Audio

- Whisper, Kokoro (+ optional MusicGen) on the same abstractions

### Phase 6 — Video

- Wan, CogVideoX, HunyuanVideo
- VRAM-aware scheduling / resource locks

### Phase 7 — 3D generation (after audio & video)

- Runtime/plugin for **Trellis2** (and similar image/text → 3D models)
- Official Blueprints under Registry → **3D**
- Gallery support for mesh outputs (e.g. GLB / OBJ) + simple 3D preview in User Mode
- Same install / job / Blueprint abstractions; no special-case host rewrite

### Phase 8 — Advanced

- Batch gen, LoRAs, ControlNet, auto-update
- Community Registry
- Remote execution, scripting / REST for power users

---

## Success criteria (near term)

1. Fresh machine → install Official **FLUX Dev** Blueprint → generate an image without touching a terminal.
2. Creator can open embedded ComfyUI, publish a Blueprint, and User Mode renders its controls automatically.
3. App data (jobs, installs, gallery) is queryable via ZenStack from Next.js with no custom CRUD API.

---

## Out of scope (for now)

- Training pipelines
- CPU-only inference as a first-class path for heavy models
- Fully open community uploads before Official Registry + publish pipeline are solid
- Replacing ComfyUI with a custom node editor

---

## Source

Planning conversation: [ChatGPT — AI Runtime Platform Plan](https://chatgpt.com/share/6a5e4420-b980-83eb-8c01-e7e3c60146ff)
