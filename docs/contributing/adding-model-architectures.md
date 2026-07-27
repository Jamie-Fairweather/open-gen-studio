# Adding a model architecture

An **architecture** (`arch`) is a graph family the recipe compiler knows how to build at generate time — for example `z-image`, `flux`, or `sdxl`. Blueprints (recipes) pick an `arch`; the Rust compiler emits Comfy API JSON from that recipe plus live User Mode settings.

**Closed id set:** `RecipeArch` in Rust (`src-tauri/src/recipe/arch_id.rs`), exported to TypeScript via Specta (`lib/generated/ipc.ts`). Manifests still store a string; parse with `RecipeArch::parse` / `isRecipeArch`.

**Creator metadata** (slots, default URLs, capabilities) is separate — still authored in `ARCHES` inside [`lib/creator-arches.ts`](../../lib/creator-arches.ts). That is product data, not an IPC DTO. See [Coding standards](./coding-standards.md).

**Best copy target:** `z-image` — compiler `src-tauri/src/recipe/arch/z_image.rs`, official recipe `blueprints/official/z-image-turbo/`, Creator entry in `lib/creator-arches.ts`.

Related: [`PLAN-RECIPE-BLUEPRINTS.md`](../PLAN-RECIPE-BLUEPRINTS.md), [`blueprints/official/README.md`](../../blueprints/official/README.md), [`loras/official/README.md`](../../loras/official/README.md).

---

## Mental model

| Piece                      | Role                                                          |
| -------------------------- | ------------------------------------------------------------- |
| **`RecipeArch`**           | Closed allowlist (Rust enum → generated TS union)             |
| **Manifest `arch` string** | On-disk / IPC field; must parse as `RecipeArch` to generate   |
| **Rust compiler**          | `recipe::compile` matches on `RecipeArch`                     |
| **Creator `ARCHES`**       | Per-arch UI metadata — slots, defaults, capabilities          |
| **`lib/arch.ts`**          | Re-exports generated `RECIPE_ARCHES` for pickers              |
| **Official blueprint**     | Optional package under `blueprints/official/<id>/`            |
| **LoRA variants**          | Packs declare per-arch files; stack filtered by active `arch` |
| **Prompt tools**           | Map `arch` → prompt dialect (`PromptTarget`)                  |

Supported today: `z-image`, `krea2`, `flux`, `flux2`, `ideogram4`, `sdxl`, `sd15`.

Flow type is `txt2img` only for v1.

---

## Checklist (do in this order)

1. Design the Comfy API graph and model **roles**.
2. Add a `RecipeArch` variant in `arch_id.rs` (serde + specta renames).
3. Add `src-tauri/src/recipe/arch/<name>.rs` with `finish_recipe` (LoRA + upscale wiring).
4. Register the module in `arch/mod.rs` and the match arm in `recipe/mod.rs`.
5. Tune `controls.rs` and `values.rs` (defaults, sampler/scheduler, guidance vs CFG).
6. Upscale / refine: `upscale_tail.rs`, mirror defaults in `lib/host.ts`, update `refine-controls.tsx` if needed.
7. Run **`npm run ipc:types`** so `lib/generated/ipc.ts` picks up the new `RecipeArch` variant.
8. Creator UI: add an `ARCHES` entry in `lib/creator-arches.ts` (id typed as `RecipeArch`). Run `npm run ipc:types` so `RECIPE_ARCHES` regenerates from Rust.
9. Prompt tools: extend `PromptTarget::resolve` / `targetFromArch` if needed (new dialect only if needed).
10. Optional: official recipe + LoRA variants; update READMEs.
11. Add compile tests in `recipe/tests.rs`.

**Minimum viable (generate works):** steps 2–4 + any user/official manifest with that `arch`.  
**Product-complete:** all of 1–12.

LoRA “Add pack” uses `RECIPE_ARCHES` — no separate `ARCH_OPTIONS` list.

---

## 1. Design the graph

Before writing code, freeze:

- **Loaders** — UNET + CLIP + VAE, DualCLIP, Checkpoint, custom sampling, etc.
- **Model roles** — strings the compiler looks up via `model_by_role` (e.g. `unet`, `text_encoder`, `vae`, `t5`/`clip_l`, `checkpoint`). Prefer roles over raw Comfy class names in the manifest.
- **Conditioning** — positive-only + `ConditioningZeroOut`, real negative text, Flux guidance, etc.
- **Sampler path** — classic `KSampler` vs custom guider / scheduler nodes (Flux.2, Ideogram 4).
- **Capabilities** — `negative`, `loras`, `controlnet`, `upscale` flags on the recipe.
- **Custom nodes** — prefer Comfy core. If you need a pack, list it in manifest `customNodes[]` so install clones it.

Official role cheat sheet: [`blueprints/official/README.md`](../../blueprints/official/README.md).

---

## 2. `RecipeArch` + Rust compiler

### Enum variant

In `src-tauri/src/recipe/arch_id.rs`, add a variant with matching serde/specta renames, extend `ALL` / `as_str` / `parse`.

### New compiler module

Add `src-tauri/src/recipe/arch/<name>.rs` with `compile_<name>(manifest, values)`.

Pattern (from Z-Image):

1. Resolve models by role.
2. Read live values (`prompt`, `width`, `height`, `seed`, `steps`, `cfg` / `guidance`, …).
3. Build a `serde_json::json!({ ... })` Comfy API graph with stable string node ids.
4. Call **`finish_recipe`** so LoRAs and the shared upscale tail rewire correctly.

```rust
finish_recipe(
    graph,
    values,
    manifest,
    ("1", 0),           // model source (UNET / checkpoint MODEL output)
    ("2", 0),           // clip source
    &[("7", "model")],  // nodes that consume MODEL (post-LoRA rewire)
    &[("4", "clip")],   // nodes that consume CLIP
    UpscaleWiring {
        model_from: ("8", "model"),
        positive: ("4", 0),
        negative: ("5", 0),
        vae: ("3", 0),
        decode_id: "9",
        save_id: "10",
        guider: None,   // Some(...) for Flux.2 / Ideogram-style custom sampling
    },
)?;
```

If the arch uses a **guider** path for Ultimate SD Upscale, set `UpscaleWiring.guider` (see `flux2.rs` / `ideogram4.rs`) and update Refine UI (step 6).

### Register

**`src-tauri/src/recipe/arch/mod.rs`** — `mod` + `pub(crate) use`.

**`src-tauri/src/recipe/mod.rs`** — match on `RecipeArch` (error string comes from `RecipeArch::supported_list()`).

### Controls and sampler fallbacks

**`src-tauri/src/recipe/controls.rs`**

- `synthetic_controls` — Flux-like arches use **Guidance** instead of CFG. Extend if your arch is guidance-based.
- `default_steps` / `default_cfg` — add match arms for sensible fallbacks.

**`src-tauri/src/recipe/values.rs`**

- `sampler_name` / `scheduler_name` — fallbacks when the manifest leaves them empty.

Only touch `lib/comfy-samplers.ts` if Comfy exposes a **new** sampler/scheduler name the UI must list.

### Regenerate IPC types

```bash
npm run ipc:types
```

Then run `npm run ipc:types` so generated `RECIPE_ARCHES` includes the id.

---

## 3. Creator page (recipe form)

Creator Mode authors recipes without embedding Comfy.

**`lib/creator-arches.ts`**

1. `ArchId` is already `RecipeArch` — no union edit once the generated type + `RECIPE_ARCHES` are updated.
2. Add a full `ArchDef` to `ARCHES`:

| Field                   | Purpose                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `id` / `label`          | Arch id and display name                                                                  |
| `slots[]`               | Model inputs: `role`, `path` (library folder), `label`, `required`, optional `defaultUrl` |
| `sampler` / `scheduler` | Written into the saved manifest                                                           |
| `capabilities`          | `negative`, `loras`, `controlnet`, `upscale`                                              |
| `usesGuidance`          | Optional — Flux-style guidance UI                                                         |
| `defaults`              | Size, steps, cfg/guidance, plus arch keys (`clipType`, `auraShift`, `mu`, …)              |

`creator-panel.tsx` only hosts the form — usually no change. Slots/roles must match what the Rust compiler expects.

---

## 4. Official blueprint (optional)

Ship a package under `blueprints/official/<blueprint-id>/`:

```
manifest.json    # required — includes "arch": "your-arch"
thumbnail.png    # optional
```

Folders starting with `_` are ignored (e.g. `_example`). Resources are already bundled via `src-tauri/tauri.conf.json`.

Update the supported-`arch` table in [`blueprints/official/README.md`](../../blueprints/official/README.md).

---

## 5. LoRA support

LoRAs are a **shared library**, not blueprint `models[]`. Generate resolves the stack with `resolve_stack_for_generate(…, &manifest.arch, …)` and the compiler inserts `LoraLoader` nodes via `finish_recipe` / `finish_with_loras`.

| Touchpoint                 | Change                                                                 |
| -------------------------- | ---------------------------------------------------------------------- |
| Compiler                   | Call `finish_recipe` with correct model/clip consumers                 |
| `lib/creator-arches.ts`    | New `ARCHES` entry; `npm run ipc:types` refreshes `RECIPE_ARCHES`      |
| `loras/official/README.md` | Document the new `arch`                                                |
| Official / user packs      | Optional: `{ "arch": "your-arch", "filename", "path", "url" }` variant |

Enable `capabilities.loras: true` on recipes that should show the LoRA stack.

---

## 6. Prompt tools (Image to Prompt & Enhance)

Keep TS and Rust mappings in sync.

**`lib/prompt-tools.ts`** — `targetFromArch` (ids are generated `PromptTarget`).

**`src-tauri/src/prompt_tools/types.rs`** — `PromptTarget::resolve` (prefer matching on `RecipeArch::parse`).

If the arch needs a **new dialect**, add a `PromptTarget` variant + `#[derive(Type)]`, dialect text in `prompts.rs`, UI labels in `PROMPT_TARGETS`, then `npm run ipc:types`. If it fits an existing dialect, only extend the arch→target maps.

Panels already call `targetFromArch(studio.activeArch)`.

---

## 7. Upscale / Refine

| File                                   | What                                                               |
| -------------------------------------- | ------------------------------------------------------------------ |
| `src-tauri/src/recipe/upscale_tail.rs` | `usdu_denoise` / `usdu_steps`; guider wiring                       |
| `lib/host.ts`                          | `defaultUsduSteps` / `defaultUsduDenoise` — keep aligned with Rust |
| `components/refine-controls.tsx`       | `turboArch` caution; `guiderUsdu` for custom-sampling arches       |

---

## 8. Tests and docs

**`src-tauri/src/recipe/tests.rs`** — add `compiles_<arch>_graph` (and USDU/guider cases if applicable).

Keep README / PLAN tables in sync. No database migration — recipes and LoRA packs are files.

---

## Touchpoint index

| Area                    | Paths                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Allowlist enum          | `src-tauri/src/recipe/arch_id.rs` → `npm run ipc:types` → `lib/generated/bindings.ts` + `lib/arch.ts` |
| Creator metadata        | `lib/creator-arches.ts` (`ARCHES`)                                                                    |
| Compiler                | `src-tauri/src/recipe/arch/*`, `recipe/mod.rs`                                                        |
| Finish / LoRA / upscale | `recipe/upscale_tail.rs`, `recipe/lora.rs`                                                            |
| Controls / values       | `recipe/controls.rs`, `recipe/values.rs`                                                              |
| Official recipes        | `blueprints/official/<id>/manifest.json`                                                              |
| LoRA packs              | `loras/official/<pack>/manifest.json`                                                                 |
| Prompt tools            | `lib/prompt-tools.ts`, `prompt_tools/types.rs`, `prompts.rs`                                          |
| USDU defaults UI        | `lib/host.ts`, `components/refine-controls.tsx`                                                       |
| IPC standards           | [`coding-standards.md`](./coding-standards.md)                                                        |
| Tests                   | `src-tauri/src/recipe/tests.rs`                                                                       |

---

## End-to-end example: `z-image`

| Step            | Location                                            |
| --------------- | --------------------------------------------------- |
| Enum            | `RecipeArch::ZImage` (`"z-image"`)                  |
| Compiler        | `arch/z_image.rs` → `finish_recipe`                 |
| Dispatch        | `recipe/mod.rs` match                               |
| Creator         | `ARCHES` entry with unet / text_encoder / vae slots |
| Official recipe | `blueprints/official/z-image-turbo/`                |
| LoRAs           | Variants with `"arch": "z-image"`                   |
| Prompt tools    | Maps to `zImageKrea`                                |
| Upscale         | Denoise 0.15, steps cap 8                           |
| Tests           | `compiles_z_image_graph`                            |

**Secondary reference:** `flux` — DualCLIP, `usesGuidance: true`, PromptTarget `Flux`.

---

## Common pitfalls

- Adding a compiler without a `RecipeArch` variant → generate rejects the arch.
- Forgetting `npm run ipc:types` / `RECIPE_ARCHES` → Creator/LoRA pickers miss the id.
- Creator slots/roles that don’t match `model_by_role` → “recipe missing model”.
- Skipping `finish_recipe` → LoRAs and Refine never rewire.
- Updating only TS or only Rust prompt-target maps → Auto dialect disagrees.
- Guider arches with `guider: None` or wrong Refine `guiderUsdu` → USDU breaks.
- Hand-editing `lib/generated/ipc.ts` → overwritten on next export.
