# Research: Prompt / Style Library (deferred)

> Status: **deferred** (2026-07-26)  
> Follow-up later. Active work is image→prompt + prompt enhance — see [`RESEARCH-PROMPT-TOOLS.md`](./RESEARCH-PROMPT-TOOLS.md).  
> Relates to: [`PLAN.md`](./PLAN.md), [`PLAN-RECIPE-BLUEPRINTS.md`](./PLAN-RECIPE-BLUEPRINTS.md) shared-library pattern (LoRAs / upscale).

---

## Idea

**Prompt / style library:** multi-select reusable prompt fragments; append (or `{prompt}`-wrap) when the user presses Generate. Forge / A1111 “Styles” UX.

No Comfy / no inference — pure app UI + local packs.

---

## Direction (updated)

**Author our own Official styles** so we do not need to credit or redistribute third-party catalogs.

Earlier research surveyed existing packs (twri MIT, Fooocus GPL, Forge AGPL) as a shortcut. That path is **not** the plan for Official content. Third-party lists remain useful only as:

- UX / schema inspiration (`name`, `prompt` with `{prompt}`, `negative_prompt`)
- Optional **user import** formats later (JSON / Forge CSV) — not Official catalog source

---

## Product sketch (when we pick this up)

- Multi-select near the prompt bar (or Advanced → Styles).
- On **Generate**, merge selected styles into positive / negative **for that job only** (textbox stays clean).
- Optional “Apply into prompt” to materialize and clear selection (Forge pattern).
- Support `{prompt}` in style body.
- Fields: `id`, `name`, `prompt`, `negativePrompt?`, `tags[]`, `thumbnail?`, `source` (official | user).
- Storage: `styles/official/*.json` + `styles/user/*.json` (shared library like LoRAs).

Merge algorithm:

```
finalPositive =
  style.prompt contains "{prompt}"
    ? style.prompt.replace("{prompt}", userPrompt)
    : join(userPrompt, style.prompt)

finalNegative = join(userNegative, style.negativePrompt)
```

Multi-select: selection order; recommend **only the first selected style may use `{prompt}`**, others append.

Do **not** confuse with LoRA `triggerWords` — styles compose with LoRAs.

Negative-only styles only matter when blueprint `capabilities.negative` is true.

---

## Schema (JSON)

```json
[
  {
    "name": "cinematic",
    "prompt": "cinematic film still of {prompt}, shallow depth of field, 35mm",
    "negative_prompt": "cartoon, anime, text, watermark"
  }
]
```

Missing `prompt` → negative-only append.

---

## Prior art (reference only — not Official sources)

| Source                                                                                                                      | Format         | Approx count | License  | Notes                                              |
| --------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------ | -------- | -------------------------------------------------- |
| [twri/sdxl_prompt_styler](https://github.com/twri/sdxl_prompt_styler)                                                       | JSON           | ~107         | MIT      | Good schema / UX reference                         |
| [Fooocus `sdxl_styles/`](https://github.com/lllyasviel/Fooocus/tree/main/sdxl_styles)                                       | JSON + samples | ~277         | GPL-3.0  | Preview JPG pattern worth copying for _our_ styles |
| [Forge `styles_integrated.csv`](https://github.com/lllyasviel/stable-diffusion-webui-forge/blob/main/styles_integrated.csv) | CSV            | ~213         | AGPL-3.0 | Import-format inspiration for power users          |

---

## Open questions (for later)

1. Merge in UI vs Rust `generate_image`?
2. How many Official styles to hand-author for v1 (quality over quantity)?
3. Arch-specific packs vs universal strings?
4. User import of Forge CSV / twri JSON?
5. Thumbnails: generate ourselves vs ship text-only first?

---

## Bottom line

| Item               | Status                                                                            |
| ------------------ | --------------------------------------------------------------------------------- |
| Feature            | Deferred                                                                          |
| Official content   | **Write our own** — no third-party credit burden                                  |
| Implementation     | App-side shared library; same pattern as LoRAs                                    |
| Active prompt work | [`RESEARCH-PROMPT-TOOLS.md`](./RESEARCH-PROMPT-TOOLS.md) (image→prompt + enhance) |
