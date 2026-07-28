# Official Blueprints (built into the app)

Recipe packages that ship with the desktop build. Product background: [`docs/PLAN.md`](../../docs/PLAN.md).

Adding a new `arch` (compiler + Creator + LoRAs + prompt tools): [`docs/contributing/adding-model-architectures.md`](../../docs/contributing/adding-model-architectures.md).

## Layout

```
blueprints/official/
  <blueprint-id>/
    manifest.json       # recipe: arch, models, defaults, capabilities
    thumbnail.png       # optional
```

No `workflow.api.json`. No `controls[]`. At generate time the app compiles a Comfy API graph from `arch` + live settings. User Mode controls are synthesized from the recipe (prompt / basic / core, etc.).

## `manifest.json` (recipe)

```json
{
  "id": "z-image-turbo",
  "name": "Z-Image Turbo",
  "category": "image",
  "description": "…",
  "runtime": "comfyui",
  "minimumVramGb": 8,
  "flowType": "txt2img",
  "arch": "z-image",
  "sampler": "res_multistep",
  "scheduler": "simple",
  "capabilities": {
    "negative": false,
    "loras": false,
    "controlnet": false,
    "upscale": false
  },
  "defaults": {
    "width": 1024,
    "height": 1024,
    "steps": 8,
    "cfg": 1,
    "seed": 0
  },
  "models": [
    {
      "role": "unet",
      "filename": "model.safetensors",
      "path": "diffusion_models",
      "url": "https://huggingface.co/…/resolve/main/model.safetensors"
    }
  ],
  "customNodes": []
}
```

### Supported `arch` (v1)

| `arch`          | Loaders                                                                                                              | Negative                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `z-image`       | UNET + text encoder + VAE (+ AuraFlow)                                                                               | no                                          |
| `krea2`         | UNET + text encoder (`CLIPLoader` type `krea2`) + VAE + EmptyLatentImage                                             | no                                          |
| `flux`          | UNET + DualCLIP (`t5` + `clip_l`) + VAE (+ FluxGuidance / ModelSamplingFlux)                                         | no (use Guidance)                           |
| `flux2`         | UNET + CLIP (`clip`) + VAE (+ FluxGuidance / EmptyFlux2LatentImage / Flux2Scheduler)                                 | no (use Guidance)                           |
| `ideogram4`     | Dual UNET (`unet` + `unet_uncond`) + CLIP (`ideogram4`) + VAE (+ CFGOverride / DualModelGuider / Ideogram4Scheduler) | no                                          |
| `sdxl` / `sd15` | Checkpoint (+ optional VAE)                                                                                          | when `capabilities.negative` and CFG &gt; 1 |

### Model `role`

| Role            | Typical `path`                     |
| --------------- | ---------------------------------- |
| `unet`          | `diffusion_models`                 |
| `unet_uncond`   | `diffusion_models` (Ideogram 4)    |
| `text_encoder`  | `text_encoders`                    |
| `t5` / `clip_l` | `text_encoders` (Flux.1 DualCLIP)  |
| `clip`          | `text_encoders` (Flux.2 single TE) |
| `vae`           | `vae`                              |
| `checkpoint`    | `checkpoints`                      |

### `customNodes[]` (optional)

Git-cloned into portable `ComfyUI/custom_nodes/<name>` on install. Prefer arches that need **no** custom nodes.

### Seed

Default `0` = random each generate.

## Tips

- Keep ids stable (`z-image-turbo`)
- Folder names starting with `_` are ignored (e.g. `_example`)
- **Creator Mode** uses the recipe form (arch + models) - no Comfy capture required
