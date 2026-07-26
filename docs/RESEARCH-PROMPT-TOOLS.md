# Research: AI Image→Prompt & Prompt Enhancer

> Status: implemented (shell + host + UI, 2026-07-26) — see Tools nav / `prompt_tools`

> Goal: how Open Gen AI should ship **AI image → prompt** and **AI prompt enhancer**, via ComfyUI only.  
> Relates to: [`PLAN.md`](./PLAN.md) (engines / no in-app inference), [`PLAN-RECIPE-BLUEPRINTS.md`](./PLAN-RECIPE-BLUEPRINTS.md) shared utility pattern (like upscale).  
> **Deferred:** prompt / style library → [`RESEARCH-PROMPT-STYLE-LIBRARY.md`](./RESEARCH-PROMPT-STYLE-LIBRARY.md).  
> **Product constraint (locked):** do **not** ship extra runtimes (Ollama, standalone llama.cpp, etc.). ComfyUI custom nodes + weights only.

---

## 0. Scope

| #   | Feature                | User intent                                                              | In scope?                        |
| --- | ---------------------- | ------------------------------------------------------------------------ | -------------------------------- |
| 1   | **AI image → prompt**  | Drop / pick an image → get a usable positive (and maybe negative) prompt | **Yes**                          |
| 2   | **AI prompt enhancer** | Short idea → richer, model-friendly prompt                               | **Yes**                          |
| 3   | Prompt / style library | Multi-select fragments appended on Gen                                   | Deferred — see style-library doc |

**Verdict:** both AI features are worth building. ComfyUI supports them via **custom nodes + models**, not stock core (same ops pattern as USDU / SUPIR).

---

## 1. How this fits Open Gen AI today

Current prompt path:

```
PromptBar (textarea) → studio settings → generate_image → recipe compiler → Comfy /prompt
```

- UI: [`components/prompt-bar.tsx`](../components/prompt-bar.tsx) — positive + optional negative; no AI helpers yet.
- Compile: [`src-tauri/src/recipe.rs`](../src-tauri/src/recipe.rs) — reads `prompt` / `negative` from settings.
- Product rule ([`PLAN.md`](./PLAN.md)): **the app never runs inference itself**. Helpers call the **existing ComfyUI runtime** (utility workflows / custom nodes).

Image→prompt and enhance are **utility Comfy jobs**: short runs that return **text**, then write into the prompt bar — not full gallery generations (unless the user generates afterward).

---

## 2. ComfyUI support

**Short answer: yes in the ecosystem, no in vanilla core.**

### 2.1 Image → prompt

| Approach                            | Typical stack                                        | Output style                          | VRAM / cost       | Notes                                          |
| ----------------------------------- | ---------------------------------------------------- | ------------------------------------- | ----------------- | ---------------------------------------------- |
| **CLIP Interrogator** (classic)     | BLIP + CLIP ranking; Mixlab / A1111-style ports      | Tag soup + art-medium / artist hints  | Medium; aging     | Good for SD1.5-era tags; weaker for Flux prose |
| **Florence-2** (kijai)              | `ComfyUI-Florence2` + HF Florence weights            | Captions / tags / `prompt_gen_*`      | Low–mid (~2–6 GB) | Fast, multi-task; not SD-prompt-tuned          |
| **Florence-2 PromptGen** (Miaoshou) | `ComfyUI-Miaoshouai-Tagger` + PromptGen fine-tunes   | Civitai-aligned tags / mixed captions | Low–mid           | Strong “real SD prompt” feel                   |
| **JoyCaption**                      | `ComfyUI-JoyCaption` + LLaVA-JoyCaption (HF or GGUF) | Dense natural language                | ~4–16 GB by quant | Best prose; great for Flux                     |
| **VLM GGUF inside Comfy**           | Prompt Rewriter / ThinkingLLM + Qwen-VL GGUF         | Flexible via system prompt            | Depends on VLM    | Can share stack with enhancer                  |
| **Janus Pro / other VLMs**          | Various custom nodes                                 | Scene description                     | Varies            | More moving parts                              |

Community consensus (2025–2026):

- **Tags / SDXL-ish:** Florence-2 PromptGen or WD14-style taggers.
- **Natural language / Flux:** JoyCaption (or a strong VLM + system prompt).
- Classic CLIP Interrogator is no longer the quality ceiling.

**Free companion:** PNG metadata (“read prompt from AI image”) when the file embeds Comfy/A1111 params — try before burning GPU on a VLM.

### 2.2 Prompt enhancer

**ComfyUI only.** Load a small GGUF (or HF) instruct model through a Comfy custom node, run a rewrite utility workflow, unload when done.

| Approach                               | Stack                                                                                                                                                                                                 | Pros                                        | Cons                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| **GGUF rewriter in Comfy (preferred)** | [ComfyUI-Prompt-Rewriter](https://github.com/BigStationW/ComfyUI-Prompt-Rewriter), [ComfyUI-GGUF-Prompt-Rewriter](https://github.com/hlibr/ComfyUI-GGUF-Prompt-Rewriter), ThinkingLLM Prompt Enhancer | Same Comfy we manage; optional VLM path too | Custom node + GGUF; VRAM fight if diffusion stays loaded |
| **HF LLM node in Comfy**               | Brekel Prompt Enhancer, etc.                                                                                                                                                                          | No separate GGUF tooling                    | Often heavier                                            |
| **Cloud APIs**                         | OpenAI / Anthropic nodes                                                                                                                                                                              | Easy quality                                | Not Official path (keys / privacy / offline)             |

Typical shape: **system prompt** (“expand for Flux / SDXL…”) + small **instruct LLM** (Qwen3-4B GGUF sweet spot) + mode presets. One node family can cover **both** enhance (text) and image→prompt (VLM GGUF + mmproj) if we want a single install.

---

## 3. Product UX — Tools (locked direction)

These are **tools**, not prompt-bar chrome or drop targets.

### 3.0 Information architecture

Add a top-level nav item **Tools** (alongside Image / Video / Audio / Downloads / Creator — see `STUDIO_TABS` / studio chrome).

```
Tools  →  tool index (list)
           ├─ Image to Prompt     →  /tools/image-to-prompt
           └─ Prompt Enhancer     →  /tools/prompt-enhancer
```

- Selecting a tool opens its **dedicated page** (upload / edit / run / result).
- Shortcuts elsewhere only **navigate** into that page (optionally with prefilled input).
- Room to grow: upscale-as-tool, caption batch, future utilities — without crowding Generate.

**Do not** use prompt-bar image drop for image→prompt. That surface stays free for later **inpaint / img2img / reference** flows.

### 3.1 Image → prompt

**Home:** `/tools/image-to-prompt`

**UX inspiration:** [ImagePrompt.org — Image to Prompt](https://imageprompt.org/image-to-prompt) — not a single “one prompt fits all” button. Users pick an **output style / target**, then generate. We take that structure and map it to **our** arches + local Comfy stack (no Midjourney, no cloud credits).

**Shortcuts (navigate + optional prefill):**

| From               | When                | Goes to                                |
| ------------------ | ------------------- | -------------------------------------- |
| Gallery / lightbox | “Image to Prompt”   | Tool page with that image pre-selected |
| Prompt bar         | Prompt is **empty** | Tool page (user picks image there)     |

#### Page layout (heavy inspo)

```
┌─────────────────────────────┬──────────────────────────────┐
│ Input                       │ Result                       │
│  Upload | Paste | Gallery   │  Source image preview        │
│  [drop zone / picker]       │  Generated prompt (editable) │
│                             │  Copy · Use in Studio        │
│ Format:  General Structured │  (Structured → field editors)│
│          Tags Graphic JSON  │                              │
│ Target:  Auto Flux SD …     │                              │
│ [Generate Prompt]           │                              │
└─────────────────────────────┴──────────────────────────────┘
```

- **Left:** image in + options + generate.
- **Right:** preview + editable result (their “showcase” pane).
- Drop / paste **on the tool page** is fine — only the **Generate prompt bar** stays drop-free for inpaint later.

#### Input methods (v1)

| Method                     | v1?   | Notes                                             |
| -------------------------- | ----- | ------------------------------------------------- |
| Upload file (PNG/JPG/WEBP) | Yes   | Primary                                           |
| Paste (Ctrl+V)             | Yes   | Same as their Paste tab                           |
| From Gallery               | Yes   | Prefill from shortcut / picker                    |
| Image URL                  | No    | Cloud-site pattern; low value locally             |
| Batch                      | Later | Their “Batch Image to Prompt” — nice, not day-one |

Also: if the file has **embedded Comfy/A1111 PNG metadata**, offer “Use embedded prompt” before burning VRAM on a VLM.

#### Output modes (pills) — not one-size-fits-all

Inspired by their General / Structured / Graphic Design / JSON / Flux / MJ / SD split. We split into two axes: **format** and **target**.

**A. Format** (how the text is shaped)

| Mode               | What user gets                                                                                                           | Why                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| **General**        | Dense natural-language description                                                                                       | Default; good for Flux / modern prose models           |
| **Structured**     | Labeled sections (subject, setting, style, lighting, camera, mood, colors…) — editable fields that flatten to one prompt | Their strongest differentiator; easy to tweak one part |
| **Tags**           | Comma-separated / booru-ish tag soup                                                                                     | SD1.5 / SDXL / anime checkpoints                       |
| **Graphic design** | Layout / type / brand-asset oriented wording                                                                             | Logos, posters, UI-ish refs                            |
| **JSON**           | Machine-readable structured caption                                                                                      | Power users / Creator; optional v1.1                   |

**B. Target** (which “dialect” to optimize for)

Default = **active Image studio blueprint arch** when known; else user picks.

| Target               | Maps to our `arch` | Prompt dialect                                         |
| -------------------- | ------------------ | ------------------------------------------------------ |
| **Auto**             | Current blueprint  | Best guess from studio selection                       |
| **Flux**             | `flux`, `flux2`    | Natural prose, cinematography, fewer quality tags      |
| **Stable Diffusion** | `sdxl`, `sd15`     | Tags + quality boosters; optional negative suggestions |
| **Ideogram**         | `ideogram4`        | Clean subject + style; text-in-image aware if relevant |
| **Z-Image / Krea**   | `z-image`, `krea2` | Short–medium prose tuned for turbo arches              |

**Do not ship Midjourney** as a target — out of product scope.

#### UI control model — **locked: Format + Target (option A)**

Two independent pill rows (not a single collapsed preset row):

```
Format:   [ General ] [ Structured ] [ Tags ] [ Graphic design ] [ JSON ]
Target:   [ Auto ] [ Flux ] [ Stable Diffusion ] [ Ideogram ] [ Z-Image / Krea ]
```

- User can mix freely (e.g. Structured × Flux, Tags × Stable Diffusion, General × Ideogram).
- **Auto** target follows the active Image studio blueprint `arch` when set.
- Invalid / weak combos still run (we route to the best provider + system prompt); soft-hint in UI if e.g. Tags × Flux is unusual (“Tags work best with Stable Diffusion”).

Ship all formats above for quality launch — JSON and Graphic design included, not deferred “nice to haves.”

#### Result actions

- Edit text (and structured fields → re-flatten).
- **Copy**
- **Use in Studio** → write positive (and negative if any + blueprint supports it) on Image studio, navigate to Image.
- Optional: “Enhance this prompt” → hand off to Prompt Enhancer tool with text prefilled (cross-tool).

#### History

Local session history on the tool page (last N runs); persist to SQLite if cheap. Not a cloud account.

#### Language

**English first** for launch quality (system prompts tuned in EN). Multi-language only after EN paths are excellent.

#### Backend — quality first, multi-provider (not MVP)

One vision model does **not** win every format. Ship **multiple Comfy providers** and **route** by Format (Target mostly changes the system / post-prompt dialect).

| Provider                                                                          | Role                                | Best for                                                               |
| --------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| **JoyCaption** (GGUF, quality quant e.g. Q5/Q6 or IQ4_XS on low VRAM)             | Flagship natural-language captioner | **General**, prose-heavy **Flux / Ideogram / Z-Image / Krea** targets  |
| **Florence-2 PromptGen** (Miaoshou)                                               | SD-oriented tags / analyze          | **Tags**, SD-target boost, fast analyze                                |
| **Instruct VLM** (e.g. Qwen2.5/3-VL GGUF via Prompt-Rewriter / ThinkingLLM class) | Controllable schema + instructions  | **Structured**, **JSON**, **Graphic design**, target-specific rewrites |
| **PNG metadata reader**                                                           | No VRAM                             | Embedded prompt when present (offer before VLM)                        |

**Routing (host decides; user sees Format × Target only):**

| Format         | Default provider   | Notes                                                                                          |
| -------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| General        | JoyCaption         | Target system-prompt overlay (Flux vs turbo vs Ideogram)                                       |
| Structured     | Instruct VLM       | JSON/schema out → field UI; JoyCaption fallback → regex/heuristic section split if parse fails |
| Tags           | Florence PromptGen | Target=SD implied; if Target=Flux, still tags but warn                                         |
| Graphic design | Instruct VLM       | Design-focused system prompt                                                                   |
| JSON           | Instruct VLM       | Strict schema; validate + one retry                                                            |

Target dialect = **system prompt appendix** (and optional negative suggestion for SD). Same provider can serve multiple targets.

**Install posture:** Official “Prompt Tools” resource pack installs **all** providers + recommended weights (not Florence-only). Lazy-download per provider on first use is OK if the UI shows what’s missing — but the **product bar is best quality**, so document full install size honestly (~several GB for JoyCaption + Florence + small VLM).

**VRAM:** bidirectional unload still applies; only **one** provider loaded at a time; unload after each run. Switching Format may swap providers (expect a load pause).

Risks: larger download; more custom-node surface; structured parse failures (mitigate with schema + retry + fallback).

### 3.2 Prompt enhancer

**Home:** `/tools/prompt-enhancer` — edit text, choose mode, run, preview, “Use in Studio”.

**Shortcuts:**

| From       | When                    | Goes to                                |
| ---------- | ----------------------- | -------------------------------------- |
| Prompt bar | Prompt is **non-empty** | Tool page with that text **prefilled** |

- No enhance button when the prompt is empty (show Image to Prompt shortcut instead — see above).
- Modes: Expand · lighting/camera · Flux-friendly · tag-dense · keep short.
- Preview before apply; never silent overwrite of the studio bar until “Use in Studio”.
- Never auto-run on every Generate.

Risks: system-prompt quality per arch; prompt bloat; unload GGUF after the utility job.

**Architecture preference:**

1. Reuse the **Instruct VLM / GGUF** Comfy pack from Image to Prompt for enhance (text-only path) — quality instruct model, not the smallest toy GGUF.
2. Target-aware enhance modes mirror Image to Prompt targets (Flux / SD / …).
3. Still Comfy-only; bidirectional VRAM unload.

---

## 4. Recommended approach

### Principle

| Feature        | Where it lives                                                            |
| -------------- | ------------------------------------------------------------------------- |
| Image → prompt | Managed **Comfy** utilities, **multi-provider routed** by Format × Target |
| Prompt enhance | Managed **Comfy** instruct LLM/VLM (shared pack where possible)           |

**No new runtimes. Quality over minimal install.**

### Ship order

| Phase     | What                                                                                                                         | Why                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **P1**    | Tools shell + Image to Prompt: Format × Target UI, JoyCaption + Florence + Instruct VLM routing, PNG metadata, paste/gallery | Full feature quality      |
| **P2**    | Prompt Enhancer on shared instruct stack                                                                                     | Sibling tool              |
| **Later** | Batch image→prompt; non-English                                                                                              | After EN quality is solid |

### Concrete stack (quality launch)

| Piece                       | Ship                                                                    |
| --------------------------- | ----------------------------------------------------------------------- |
| UI                          | **Format row + Target row** (locked)                                    |
| Prose caption               | **JoyCaption** GGUF (best practical quant per VRAM tier)                |
| Tags                        | **Florence-2 PromptGen** (Miaoshou)                                     |
| Structured / JSON / Graphic | **Instruct VLM** GGUF (Qwen-VL class) + schema prompts                  |
| Enhancer                    | Same instruct stack, text-only; strong Qwen3 instruct if VLM not needed |
| System prompts              | Official in-app pack per Format × Target                                |
| Install                     | Official Prompt Tools pack (multi-node + multi-weight); lazy pull OK    |

Hide behind app UI; User Mode never opens the node graph.

---

## 5. Architecture sketch

```
Nav: Image | … | Tools | …
                    │
                    ▼
              Tools index
               /tools
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
 /tools/image-to-prompt   /tools/prompt-enhancer
        │                       │
        └───────────┬───────────┘
                    ▼
            Comfy utility job
                    │
                    ▼
         “Use in Studio” → Image prompt bar
```

**Deep-link / prefill (illustrative):**

- `/tools/image-to-prompt?from=gallery&imageId=…`
- `/tools/prompt-enhancer?prompt=…` (or session/state handoff if URL length is a concern)

### API / host surface (illustrative)

- `interrogate_image(path | bytes, mode)` → `{ positive, negative? }` (Comfy)
- `enhance_prompt(text, mode, arch?)` → `{ positive, negative? }` (Comfy)

### Install / resources

Mirror upscale:

- Interrogate pack: Comfy custom node + Florence/JoyCaption weights in shared `models/`.
- Enhancer: Comfy custom node + GGUF under Comfy’s `models/LLM/` (or whatever the node expects) — still Comfy-managed.

Do **not** put these weights in every image blueprint’s `models[]`.

---

## 6. UX details worth locking early

1. **Tools are pages**, not modals that steal the Generate surface.
2. **Prompt-bar drop reserved** for future inpaint / img2img — never image→prompt.
3. **Prompt-bar shortcuts are contextual:** empty → Image to Prompt; non-empty → Enhance (prefill).
4. **Gallery shortcut** prefills the selected image on the Image to Prompt tool.
5. **“Use in Studio”** is the apply path (replace Image studio prompt + navigate back). Tool page keeps its own draft until then.
6. **VRAM (bidirectional — locked):** see §6.1.
7. **Not installed:** tool page shows Install (node + model) like upscale USDU.

### 6.1 VRAM handoff (Generate ↔ Tools)

Comfy keeps models loaded after a job. Diffusion after Image Gen and VLMs/LLMs after a tool both linger unless we free them. We must **not** let both families sit in VRAM at once.

| Transition                             | Action                                                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Tools → after tool finishes**        | Unload tool models (VLM / instruct GGUF / Florence, etc.) so Image Gen can reclaim VRAM                                                   |
| **Generate → Tools (before tool run)** | Unload the loaded **image / diffusion** stack first (checkpoint, UNET, TE, VAE, LoRAs as Comfy has them cached), then load / run the tool |
| **Tools → Generate (next Gen)**        | Tools already cleared after finish; first generate reloads the blueprint models as usual                                                  |

Notes:

- Prefer Comfy’s free / unload APIs (e.g. unload models + soft empty cache) via the host — same runtime, no second engine.
- Do this **automatically** on tool start / tool complete; optional toast (“Freed image models for tools”) so a brief pause is expected.
- If a generate job is still **queued or running**, refuse or wait — do not yank models mid-job.
- Low-VRAM machines especially need this; high-VRAM can still do it for simplicity and fewer OOM edge cases.

---

## 7. Risks and non-goals

| Risk                              | Mitigation                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| Custom-node bitrot                | Pin node commit / version in Official resource manifest; smoke-test on Comfy bumps |
| VRAM OOM (Gen + tool both loaded) | **Bidirectional unload** (§6.1) before tool run and after tool finish              |
| Enhancer ruins short prompts      | Modes + max tokens + preview                                                       |
| Cloud LLM temptation              | Local-first Official path only                                                     |

**Non-goals:**

- Extra runtimes (Ollama, app-managed llama.cpp)
- Dropping images on the prompt bar for captioning
- Running enhance inline without leaving Generate
- Full chat agent in the prompt bar
- Automatic enhance on every generation
- Training / fine-tuning custom captioners
- Style library (deferred)

---

## 8. Open questions

1. **Exact node pins:** JoyCaption pack + Miaoshou/Florence + which Instruct VLM node (Prompt-Rewriter vs ThinkingLLM) — spike and pin commits.
2. **Structured UI:** real field editors vs labeled markdown blocks that re-join on Use in Studio?
3. Prefill via query string vs in-memory studio handoff?
4. After “Use in Studio”, always go to Image tab?
5. Default quants per VRAM tier (e.g. 8 / 12 / 24 GB) for JoyCaption + VLM?
6. Should Target=Auto also **pre-highlight** a suggested Format (e.g. SD blueprint → suggest Tags)?

---

## 9. Sources (surveyed)

### UX

- [ImagePrompt.org — Image to Prompt](https://imageprompt.org/image-to-prompt) — **primary UX inspo** (modes / targets / two-pane layout)
- [Stable Diffusion Art — prompts from images](https://stable-diffusion-art.com/prompts-from-images/)

### Comfy helpers

- [kijai/ComfyUI-Florence2](https://github.com/kijai/ComfyUI-Florence2) — caption / `prompt_gen_*`
- [miaoshouai/ComfyUI-Miaoshouai-Tagger](https://github.com/miaoshouai/ComfyUI-Miaoshouai-Tagger) — Florence-2 PromptGen
- [1038lab/ComfyUI-JoyCaption](https://github.com/1038lab/ComfyUI-JoyCaption) — JoyCaption GGUF
- [BigStationW/ComfyUI-Prompt-Rewriter](https://github.com/BigStationW/ComfyUI-Prompt-Rewriter) — GGUF rewrite + VLM in Comfy
- [hlibr/ComfyUI-GGUF-Prompt-Rewriter](https://github.com/hlibr/ComfyUI-GGUF-Prompt-Rewriter) — focused GGUF rewriter (MIT)
- [Brekel/ComfyUI-Brekel](https://github.com/Brekel/ComfyUI-Brekel) — HF LLM enhancer nodes
- [pharmapsychotic/clip-interrogator](https://github.com/pharmapsychotic/clip-interrogator) — classic baseline

---

## 10. Bottom line

| Question         | Answer                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Extra runtimes?  | **No** — Comfy custom nodes + weights only                                                               |
| UX home          | **Tools** nav → tool index → dedicated tool pages                                                        |
| Image→prompt UI  | **Format × Target** two rows (locked) — inspo [ImagePrompt.org](https://imageprompt.org/image-to-prompt) |
| Formats          | General · Structured · Tags · Graphic design · JSON                                                      |
| Targets          | Auto · Flux · SD · Ideogram · Z-Image/Krea — **not** Midjourney                                          |
| Backend          | **Multi-provider:** JoyCaption + Florence PromptGen + Instruct VLM — route by format                     |
| Bar              | **Best quality**, not MVP / Florence-only                                                                |
| Prompt-bar drop? | **No** — reserved for inpaint; tool page may upload/paste                                                |
| Shortcuts        | Gallery → Image to Prompt; empty prompt → Image to Prompt; non-empty → Enhancer                          |
| VRAM             | Bidirectional unload; one tool provider loaded at a time                                                 |
| Enhancer?        | Sibling tool on shared instruct stack; P2                                                                |
| Style library?   | Deferred — [`RESEARCH-PROMPT-STYLE-LIBRARY.md`](./RESEARCH-PROMPT-STYLE-LIBRARY.md)                      |

**Implemented:** Tools nav (`/tools`, image-to-prompt, prompt-enhancer); host `free_comfy_vram` + text jobs; pins JoyCaption / Miaoshou PromptGen / Prompt-Rewriter; Format×Target UI; gallery + prompt-bar shortcuts; bidirectional `/free` around runs.
