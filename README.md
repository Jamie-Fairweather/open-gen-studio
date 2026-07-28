<div align="center">

# Open Gen Studio

### **Local image generation that feels like a product, not a science project.**

<p>
  <img src="https://img.shields.io/badge/status-0.1.0-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/platform-Windows-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/GPU-NVIDIA-success?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Built%20with-Tauri%202-7C3AED?style=for-the-badge" />
</p>

</div>

---

Most local AI tools make you become the engineer: install Python, hunt weights, wire nodes, babysit a server. Open Gen Studio is the opposite. A beautiful desktop studio where you pick a Blueprint, automatically install what it needs, and generate. The app quietly runs the host (ComfyUI), downloads, and job queue so you can stay focused on making images.

> **Early development (`0.1.0`). Images first; audio, video, and 3D later.**

---

# Why this instead of the alternatives

| If you’ve tried…  | Open Gen Studio is for when you want…                                                       |
| ----------------- | ------------------------------------------------------------------------------------------- |
| **ComfyUI**       | The same power underneath, without living in a node graph every time you make an image      |
| **A1111 / Forge** | A modern, focused UI: curated installs, not a maze of extensions and tabs                   |
| **Cloud apps**    | Private, local, on _your_ GPU, with a polished experience that doesn’t feel like a terminal |

---

# What you get

- 🚀 **One-click Blueprints.** Official packs (Z-Image Turbo, Krea2, Ideogram 4, …) that install models and deps for you
- 🎨 **A studio, not a dashboard.** Prompt, generate, gallery, refine. Calm UI built for making images
- 🧩 **LoRAs & upscale that just work.** Shared libraries across Blueprints, not per-pack scavenger hunts
- ✨ **Smart helpers.** Image to Prompt and Prompt Enhance when you need a push
- 📦 **Bring your own models.** Paste a Hugging Face or CivitAI link, fill the recipe, and generate. No node graph, no manual downloads.

> You shouldn’t need a weekend of setup to make one good image. That’s the bar.

---

# Features

|                            |                                                                         |
| -------------------------- | ----------------------------------------------------------------------- |
| 👤 **User Mode**           | recipe-driven forms (prompt, size, seed, LoRAs, refine). No node graph. |
| 📦 **Official Blueprints** | bundled recipes; the host compiles a Comfy API graph at generate time.  |
| 🛠 **Creator Mode**         | arch + model slots + defaults. Recipe form only; no Comfy UI in-app.    |
| 📚 **Shared libraries**    | LoRAs and upscalers (SR / USDU / SUPIR).                                |
| 🤖 **Tools**               | Image to Prompt and Prompt Enhance (QwenVL via Comfy).                  |
| ⚙️ **Host**                | Tauri + Rust for SQLite, downloads, GPU detect, Comfy supervision.      |

---

# Stack

| Layer   | Choice                                        |
| ------- | --------------------------------------------- |
| Shell   | **Tauri 2**                                   |
| UI      | **Next.js 16 · React 19 · Tailwind 4 · coss** |
| Host    | **Rust** (`rusqlite`, recipe compilers, IPC)  |
| IPC     | **Specta / tauri-specta → `lib/generated/`**  |
| Package | **Bun**                                       |

---

# Prerequisites

- Bun
- Rust (stable)
- Tauri deps for your OS
- **Windows + NVIDIA** is the primary ComfyUI path today (official Windows Portable)

---

# Develop

```bash
bun install
bun run desktop          # Tauri + Next (http://localhost:3000)
```

### Useful scripts

```bash
bun run check            # typecheck + lint
bun run check:full       # + recipe Rust tests (skipped on Windows; see contributing)
bun run ipc:types        # regenerate Specta bindings
bun run ipc:check        # fail if lib/generated/ drifts
bun run desktop:build    # production desktop build
```

---

# Docs

| Doc                                                                            | Purpose                         |
| ------------------------------------------------------------------------------ | ------------------------------- |
| [Contributing](docs/contributing/README.md)                                    | How-tos + local quality gates   |
| [Coding standards](docs/contributing/coding-standards.md)                      | IPC: Rust → Specta → TypeScript |
| [Adding a model architecture](docs/contributing/adding-model-architectures.md) | New `RecipeArch` end-to-end     |
| [Product plan](docs/PLAN.md)                                                   | Vision, architecture, roadmap   |
| [Official Blueprints](blueprints/official/README.md)                           | Recipe manifest layout          |
| [Official LoRAs](loras/official/README.md)                                     | Multi-arch LoRA packs           |

---

# Status

🟢 **Shipped:** Comfy runtime install, recipe compile, Official packs, Creator form, LoRAs, Refine, prompt Tools, gallery/jobs via IPC.

🟡 **Next:** ControlNet, polish, then audio / video / 3D.
