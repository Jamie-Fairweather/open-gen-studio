# Official blueprint thumbnail prompts

Example prompts for generating `thumbnail.png` (or `.jpg` / `.webp`) for each official pack. Written to match how each model family actually wants prompts — but aimed at **showcase** images, not stock product shots.

**Showcase bar:** At card size, someone should instantly feel _why this pack exists_. Every image needs a clear **subject** (person, creature, or hero object) to look at — not empty scenery or signage alone. Text models still show readable type, but a person or creature should share the frame. Never put our app name (or product branding) in the prompt or in-image text.

**How to use**

1. Install / select the blueprint in Studio.
2. Paste the positive prompt (and negative if listed).
3. Use the pack’s default steps / CFG unless noted.
4. Prefer a square-ish crop that punches at picker size (~4:3). Save as `content/blueprints/<id>/thumbnail.png`.

**Negatives:** only when `capabilities.negative` is true. Distilled / guidance packs (Flux, Flux.2, Z-Image, Krea 2, Ideogram) — put quality into the positive instead.

**Encoding:** ASCII-friendly (hyphens, not fancy dashes).

---

## Prompting cheat sheet (by arch)

| Arch             | Prompt dialect                                                                          | Negatives            | Sources                                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flux` / `flux2` | Natural-language sentences; subject first; no `(word:1.2)` weights                      | No                   | [fal Flux guide](https://fal.ai/learn/tools/how-to-use-flux), [BFL prompting](https://bfl.mintlify.app/guides/prompting_unified_building)                             |
| `z-image`        | Natural language; bilingual EN/ZH text in quotes; avoid Danbooru tag salad              | No                   | [Comfy Z-Image](https://docs.comfy.org/tutorials/image/z-image/z-image), HF Z-Image Turbo READMEs                                                                     |
| `krea2`          | Full sentences (Qwen3-VL); no CLIP-style weights                                        | No                   | [Krea 2 prompt guide](https://www.instasd.com/post/krea-2-prompt-and-style-guide-comfyui)                                                                             |
| `ideogram4`      | **Structured JSON** (trained on JSON captions; paste JSON as the prompt)                | No (dual-model path) | [Comfy Ideogram 4](https://blog.comfy.org/p/ideogram-4-day-0-support-in-comfyui), [Ideogram 4 tech](https://ideogram.ai/blog/ideogram-4.0/)                           |
| `qwen-image`     | Natural language; put exact in-image text in quotes; multilingual OK                    | Yes                  | [Qwen-Image GitHub](https://github.com/QwenLM/Qwen-Image)                                                                                                             |
| `sdxl`           | Descriptive phrases + photo/camera terms; short negatives                               | Yes                  | SDXL prompt guides (natural language > SD1.5 tags)                                                                                                                    |
| `sd15`           | Comma tags / short phrases; longer quality negatives help                               | Yes                  | Classic A1111 / SD 1.5 practice                                                                                                                                       |
| `pony`           | Start with `score_9, score_8_up, score_7_up…`; Danbooru-ish tags; `rating_safe` for SFW | Yes                  | [Pony V6 model card](https://civitai.com/models/257749), [score tags explainer](https://civitai.com/articles/4248/what-is-score9-and-how-to-use-it-in-pony-diffusion) |
| `illustrious`    | Danbooru tags + quality prefix; Euler; CFG ~4-5                                         | Yes                  | [NoobAI V-Pred README](https://huggingface.co/Laxhar/noobai-XL-Vpred-0.75)                                                                                            |
| `sd3.5`          | Natural language; short focused negatives                                               | Yes                  | [SD 3.5 guides](https://apatero.com/blog/sd-35-large-complete-guide-comfyui-2025)                                                                                     |
| `chroma`         | Flux-like natural language + real CFG / negatives                                       | Yes                  | [lodestones/Chroma1-Base](https://huggingface.co/lodestones/Chroma1-Base)                                                                                             |

---

## `z-image-turbo` — Z-Image Turbo

**Showcase:** person + bilingual neon you can actually read — speed + text.

**Positive**

```
A young woman in a leather jacket standing under a rain-soaked neon storefront at night, looking toward camera. Behind her a glowing sign clearly reads "NIGHT OWL" in electric cyan English, and below it "夜猫子" in sharp magenta Chinese characters, both fully legible. Wet asphalt reflections, steam in the air, cinematic photograph, ultra detailed face and fabric, dramatic contrast.
```

**Negative:** _(not used)_

**Notes:** Exact strings in quotes. Keep the person large enough to read at card size; text sits behind/beside them. Turbo defaults (~8 steps, CFG 1).

---

## `z-image-base` — Z-Image Base

**Showcase:** person + bilingual signage with fuller detail / materials.

**Positive**

```
A street vendor in a warm coat standing beside a wooden night-market stall, smiling at camera, holding a paper lantern. Above the stall a hand-painted sign clearly reads "HOT BUNS" in cream English lettering, and beneath it gold calligraphy reads "热包子", both sharp and readable. Dense hanging lanterns, rich color, photorealistic skin and fabric, cinematic night photograph, ultra detailed.
```

**Negative:** _(not used)_

**Notes:** Use base pack defaults (higher steps / CFG). Subject first; keep sign text large enough to read at card size.

---

## `krea2-turbo` — Krea 2 Turbo

**Showcase:** hard prompt-following — counts, spatial layout, spectacle (not product flat-lays).

**Positive**

```
A colossal glass whale swimming through a flooded downtown street between skyscrapers, three bright orange life rafts floating around it, sunset light refracting through the whale's translucent body, reflections of neon and clouds on the water, surreal but photographically real, ultra detailed, awe-inspiring scale.
```

**Negative:** _(not used)_

**Notes:** Full sentences; call out counts and spatial relations (Krea’s Qwen3-VL strength). Avoid `(word:1.2)` weights.

---

## `krea2-raw` — Krea 2 RAW

**Showcase:** same wow language with fuller sampling — materials and atmosphere.

**Positive**

```
An astronaut standing on a shattered ice moon, Earth rising huge and blue behind their silhouette, cracked glacier underfoot catching golden rim light, tiny ice crystals floating in low gravity, IMAX still, extreme detail in the suit and ice, breathtaking scale.
```

**Negative:** _(not used)_

---

## `flux-dev` — Flux.1 Dev

**Showcase:** jaw-dropping photorealism — face, light, micro-detail.

**Positive**

```
Extreme close-up portrait of a weathered deep-sea diver just surfaced at golden hour, salt water beading on a freckled face, amber sunlight flaring in one eye, droplets frozen mid-air, 85mm photography, hyperreal skin texture, cinematic color grade, sharp catchlights, breathtaking realism.
```

**Negative:** _(not used — put quality in the positive)_

**Notes:** Subject first. Flux wants sentences, not tag salad.

---

## `flux-schnell` — Flux.1 Schnell

**Showcase:** Flux energy in four steps — bold color, instant read.

**Positive**

```
A scarlet sports car drifting through a tunnel of falling cherry blossoms at night, long exposure light trails, petals streaking past chrome, wet asphalt, cinematic low angle, vivid color, sharp car silhouette, electric atmosphere.
```

**Negative:** _(not used)_

---

## `flux2-dev` — Flux.2 Dev

**Showcase:** next-gen photoreal portrait detail — skin, hair, light (prompt locked from a good Studio run).

**Positive**

```
cinematic portrait photograph, extreme close-up of a young woman with medium-length dark brown wavy hair partially obscuring her face, golden-brown eyes gazing directly forward with intense focus, fair to olive-toned skin showing fine freckles across nose bridge and cheeks, thick defined eyebrows, lips slightly parted, wind-swept strands falling diagonally across forehead and cheekbone creating dramatic chiaroscuro effect from side-facing warm sunlight casting strong shadow along one half-face while illuminating other side with soft amber glow, no clothing visible except shoulder edge suggesting off-shoulder top, shallow depth-of-field blurring background into indistinct deep blue wall behind subject, composition centered on upper torso emphasizing facial geometry within tight vertical crop, camera positioned eye level capturing frontal three-quarters view, environmental setting appears indoors against solid monochromatic backdrop under late afternoon directional light source producing textured highlights on skin surface and individual hairs catching luminous reflection, rich earthy tones dominate palette with contrasting cool ambient darkness surrounding illuminated zone, raw photographic realism prioritizing tactile detail in skin pores, hair sheen, and cast shadows without artificial embellishment.
```

**Negative:** _(not used)_

**Notes:** Natural-language / descriptive Flux.2 style; long detailed portrait prompts work well here ([BFL Flux.2 prompting](https://bfl.mintlify.app/guides/prompting_unified_building)).

---

## `ideogram4` — Ideogram 4

**Showcase:** dramatic scene — person holding a sign to their chest with crisp readable text (JSON layout).

**Positive** — paste this entire JSON object as the prompt (no markdown fences):

```json
{
  "high_level_description": "A dramatic cinematic night scene of a young woman holding a cardboard protest sign against her chest in pouring rain, city lights behind her, intense emotion, razor-sharp readable text on the sign.",
  "style_description": {
    "aesthetics": "cinematic still, high contrast, emotional, photorealistic, no logos or watermarks",
    "lighting": "harsh side spotlight on her face and the sign, cool blue rain and neon glow in the background",
    "photo": "35mm cinematic photograph, shallow depth of field behind the subject",
    "medium": "photograph",
    "color_palette": ["#0B1220", "#F8FAFC", "#DC2626", "#38BDF8"]
  },
  "compositional_deconstruction": {
    "background": "rainy city street at night, blurred neon and car lights, wet asphalt reflections",
    "elements": [
      {
        "type": "obj",
        "bbox": [80, 180, 980, 820],
        "desc": "young woman facing camera, wet hair clinging to her face, leather jacket, both hands holding a cardboard sign firmly against her chest, intense determined expression, raindrops on skin",
        "color_palette": ["#0B1220", "#F8FAFC", "#38BDF8"]
      },
      {
        "type": "text",
        "text": "WAKE UP",
        "bbox": [420, 280, 620, 720],
        "desc": "large bold hand-painted black letters on a white cardboard sign held against her chest, perfectly sharp and fully legible, slightly weathered paint",
        "color_palette": ["#0B1220", "#F8FAFC", "#DC2626"]
      }
    ]
  }
}
```

**Negative:** _(not used in our recipe)_

**Notes:** Ideogram 4 was trained on structured JSON captions — plain sentences underuse it. `bbox` is `[y_min, x_min, y_max, x_max]` in 0–1000. Keep sign text short and large so it reads at card size. No code fences when pasting into Studio.

---

## `qwen-image` — Qwen Image

**Showcase:** person + dense readable multilingual text (Qwen’s party trick).

**Positive**

```
A barista standing in a glowing cafe doorway at night, half-turned toward camera, warm smile. Beside them a neon sign clearly reads "STARLIGHT CAFE" in bold English, a second neon line below reads "星光咖啡馆" in Chinese, and a chalkboard easel shows "OPEN 24/7" in chalk. Rain reflections, purple and teal glow, Ultra HD, cinematic composition, every letter sharp and correct.
```

**Negative**

```
blurry text, misspelled text, garbled letters, watermark, logo, low quality, distorted signage
```

**Notes:** Exact strings in quotes + a light quality suffix. Neutral fictional shop names only — no product or app branding.

---

## `qwen-image-distill` — Qwen Image Distill

**Showcase:** person + readable billboard text, faster pack.

**Positive**

```
A woman in a trench coat standing under a giant vintage movie billboard on a rainy city street, looking up at it. The billboard's painted letters across the top clearly read "REVOLUTION", a tagline beneath reads "觉醒之时", art-deco borders, dramatic spotlight from below, textured paper and paint, every character crisp, cinematic night photograph.
```

**Negative**

```
blurry text, illegible font, watermark, low quality, messy layout
```

---

## `sdxl-base` — SDXL 1.0 Base

**Showcase:** cinematic photoreal foundation — drama, not lifestyle stock.

**Positive**

```
cinematic photograph of a lone samurai standing on a stormy cliff edge overlooking crashing waves, wind tearing at a dark cloak, dramatic lightning illuminating the sea, rain streaks, 35mm anamorphic look, volumetric light, ultra detailed armor and fabric, epic atmosphere
```

**Negative**

```
cartoon, anime, illustration, 3d render, blurry, low quality, deformed hands, extra fingers, watermark, text
```

---

## `sd15` — Stable Diffusion 1.5

**Showcase:** simple single-subject scene SD1.5 can actually nail (keep it easy).

**Positive**

```
fluffy orange tabby cat sitting on a wooden windowsill, soft morning sunlight, looking at viewer, detailed fur, shallow depth of field, cozy room, highly detailed, sharp focus
```

**Negative**

```
ugly, blurry, low quality, lowres, bad anatomy, deformed, watermark, text, worst quality, jpeg artifacts, extra legs, mutated
```

**Notes:** Tag / phrase style. Generate at **512x512** (native) — complex multi-person / cyberpunk city prompts often fall apart on 1.5.

---

## `sd35-large` — SD 3.5 Large

**Showcase:** prompt adherence — a scene with several specific constraints.

**Positive**

```
A red fox and a white rabbit sitting side by side on a mossy log in an enchanted forest, bioluminescent mushrooms glowing blue around them, soft god rays through the canopy, dew on fur, highly detailed, coherent animals, magical but photoreal lighting.
```

**Negative**

```
blurry, low quality, deformed, watermark, text, oversaturated, extra limbs
```

**Notes:** Natural language. SD 3.5 shines when you stack clear constraints (two animals, colors, setting).

---

## `sd35-large-turbo` — SD 3.5 Large Turbo

**Showcase:** same adherence, few-step punch.

**Positive**

```
A giant mechanical owl perched on a gothic cathedral spire at midnight, moonlight on brass feathers, city lights far below, fog around the towers, dramatic low angle, sharp silhouette, epic mood.
```

**Negative**

```
blurry, low quality, deformed, watermark
```

---

## `pony-v6` — Pony Diffusion V6 XL

**Showcase:** high-impact anime character — score tags + strong pose.

**Positive**

```
score_9, score_8_up, score_7_up, score_6_up, rating_safe, source_anime, 1girl, long silver hair, glowing cyan eyes, ornate black and gold armor, cape flowing, standing on a floating ruin above the clouds, dramatic backlight, particles, looking at viewer, dynamic pose, detailed eyes, vibrant colors
```

**Negative**

```
score_4, score_5, score_6, ugly, deformed, bad hands, blurry, low quality, watermark, text, nsfw
```

**Notes:** Lead with the score chain. `rating_safe` for SFW Official thumbs.

---

## `noobai-vpred` — NoobAI XL V-Pred 1.0

**Showcase:** Illustrious / Danbooru polish — cinematic anime still.

**Positive**

```
masterpiece, best quality, newest, absurdres, highres, safe, 1girl, solo, long black hair, red eyes, black kimono, gold trim, cherry blossom petals, night shrine, glowing lanterns, wind, looking at viewer, dramatic lighting, detailed eyes, depth of field
```

**Negative**

```
nsfw, worst quality, old, early, low quality, lowres, signature, username, logo, bad hands, mutated hands
```

**Notes:** Euler, CFG ~4-5, steps ~28-35. Tags over prose.

---

## `chroma` — Chroma Unlocked

**Showcase:** bold color / fashion with real CFG + negatives.

**Positive**

```
A high-fashion close-up of a model with short platinum hair and clear sunglasses, fierce expression, bold teal and crimson split lighting slicing across the face, simple teal-green backdrop, sharp professional photo, vivid controlled color, magazine cover energy.
```

**Negative**

```
low quality, ugly, unfinished, out of focus, deformed, disfigure, blurry, smudged, restricted palette, flat colors
```

**Notes:** From the Chroma sample vibe — Flux-like sentences, but negatives actually matter.

---

## Thumbnail craft tips

- **Subject first.** Every thumb needs a person, creature, or hero object people can lock onto at a glance.
- **Wow at postage-stamp size.** If it only looks good zoomed in, it fails as a card thumb.
- **One hero idea.** Not a busy catalog page.
- **No app / product branding** in prompts or in-image text (use neutral fictional words).
- **Match the pitch.** Text packs → readable type _plus_ a subject. Anime → face + silhouette. Photo → light and scale.
- **SFW only** for Official.
- Lock a seed once you like a frame, then crop.
- Save as `thumbnail.png` (`.jpg` / `.webp` also work).
