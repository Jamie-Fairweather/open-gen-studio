# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: creative people who want strong local images without becoming ML engineers — people leaving cloud apps for privacy, or leaving ComfyUI / A1111 because the tooling feels like a science project.

Secondary (confirmed, not primary): Creator Mode authors who use New blueprint / Edit blueprint; they still do not use an in-app node graph.

## Product Purpose

Open Gen Studio is a local desktop image studio. Users pick an Official Blueprint (or their own), install what it needs, prompt, generate, and work in a gallery — while the app quietly runs the host (ComfyUI), downloads, and job queue.

Success in a session means both: a clean first path (Blueprint → install → prompt → image) and a durable studio loop (iterate, LoRAs, refine, tools). When those conflict, keep the first path short and the ongoing loop free — not locked to Official content only.

Early product (`0.2.2`): images first; audio, video, and 3D later.

## Positioning

Local, private generation on the user’s GPU, with a focused product UI — not a node graph, not an extension maze, not a cloud subscription.

Underneath it can use the same engines power users already know (ComfyUI today). The product difference is the surface: curated Official Blueprints and LoRAs that install with a click, plus freedom to add Hugging Face / CivitAI models and user Blueprints without hand-wiring graphs or downloads.

Neighboring tools that are _not_ this product: living in Comfy’s node UI, A1111/Forge’s extension maze, or cloud apps that hold the GPU and the files.

## Operating Context

Desktop app (Tauri 2) with a Next.js web UI. Primary target environment today: Windows + NVIDIA GPU via Official ComfyUI Windows Portable.

Core loop: Catalog (Official / Mine Blueprints) → install via Downloads → User Mode form → Generate → job queue → Gallery; LoRAs and upscalers; Tools (Image to Prompt, Prompt Enhance); Creator Mode New/Edit blueprint. Registry is later (Save to catalog / Save & install extras).

Terminology: [`CONTEXT.md`](./CONTEXT.md) — Engine, Runtime, Blueprint, Official, Mine, Catalog, Not installed, Installed, Registry (later), Downloads, Gallery. Do not say Preset, Projects, Resources, Available, or recipe in product copy. The host compiles a Blueprint at generate time — not a shipped frozen `workflow.api.json`.

## Capabilities and Constraints

Confirmed:

- User Mode: Blueprint-driven forms (prompt, size, seed, LoRAs, refine); no node graph in-app.
- Official Blueprints and LoRAs ship in the Catalog; users install them, then can also bring their own (Mine).
- LoRAs and upscalers shared across Blueprints.
- Tools: Image to Prompt and Prompt Enhance (via Comfy utility jobs).
- Host (Rust/Tauri): SQLite local store, downloads, GPU detect, Comfy supervision, Blueprint compile (`recipe/` in code), IPC.
- The app never performs inference; external runtimes do.
- No hosted marketplace database; Official manifests are bundled files. A later Registry adds extras to the Catalog.
- 99% User Mode / 1% Creator Mode product balance.

Undecided / open:

- Accessibility standard (no product-specific requirement established).
- Brand voice beyond the product name and README tone (no separate brand guide confirmed).
- Non-Windows / non-NVIDIA paths beyond the primary Windows + NVIDIA story.

## Brand Commitments

Product name: **Open Gen Studio** (identifier `studio.opengen`). Voice in shipping docs is plain, product-first, anti-ceremony (“feels like a product, not a science project”). No separate logo/brand system confirmed as binding beyond existing app icons under `icons/`.

## Evidence on Hand

- README and `docs/PLAN.md` — vision, architecture, roadmap.
- Official Blueprints under `content/blueprints/`; Official LoRAs under `content/loras/`.
- Runnable UI and host in-repo (Tauri + Next studio).

Do not fabricate testimonials, benchmarks, customer logos, pricing, or marketplace claims.

## Product Principles

1. **Stay a studio, not a dashboard or a node graph.** Optimize for making images, not for administering an ML stack.
2. **One-click Official path, open escape hatches.** Ship curated Blueprints and LoRAs that just install; never trap users inside Official-only content.
3. **Orchestrate, don’t infer.** The app installs, queues, and supervises; engines do the GPU work.
4. **Blueprints over workflows.** Publish Blueprints; compile graphs at generate time; never make users pack nodes by hand for the happy path.
5. **Local and private by default.** User GPU, user files, no cloud product dependency for core generation.
