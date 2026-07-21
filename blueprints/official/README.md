# Official Blueprints (built into the app)

Drop ComfyUI workflows here. They ship with the desktop build — no GitHub fetch required for Official.

## Layout

```
blueprints/official/
  <blueprint-id>/
    manifest.json       # metadata + UI controls + model deps
    workflow.api.json   # ComfyUI API-format workflow (required)
    thumbnail.png       # optional
```

## Workflow JSON format

Use **API format**, not the normal Save format:

1. Open the workflow in ComfyUI
2. **File → Export Workflow (API)**
3. Save as `workflow.api.json` in the blueprint folder

The `/prompt` endpoint needs this format (numeric node IDs, no canvas layout).

## `manifest.json` (minimal)

```json
{
  "id": "flux-dev",
  "name": "FLUX Dev",
  "category": "image",
  "description": "Official FLUX Dev text-to-image",
  "runtime": "comfyui",
  "minimumVramGb": 12,
  "models": [
    {
      "filename": "model.safetensors",
      "path": "diffusion_models",
      "url": "https://huggingface.co/…/resolve/main/model.safetensors"
    }
  ],
  "controls": [
    {
      "id": "prompt",
      "type": "textarea",
      "nodeId": "6",
      "input": "text",
      "label": "Prompt",
      "group": "default"
    },
    {
      "id": "steps",
      "type": "number",
      "nodeId": "3",
      "input": "steps",
      "label": "Steps",
      "default": 28,
      "group": "advanced"
    }
  ]
}
```

### Control `group`

| Value      | UI behaviour                                        |
| ---------- | --------------------------------------------------- |
| `default`  | Always shown in User Mode                           |
| `advanced` | Hidden until the user toggles **Advanced controls** |

If `group` is omitted, treat as `default`.

`controls[].nodeId` + `input` map User Mode fields onto nodes in `workflow.api.json`.

### `models[]` (preset download)

When the user installs a Blueprint, the app downloads each entry into the **shared** models library:

`%APPDATA%/com.open-gen-ai/models/<path>/<filename>`

(Comfy sees these via `extra_model_paths.yaml`.)

| Field      | Required | Meaning                                                                                |
| ---------- | -------- | -------------------------------------------------------------------------------------- |
| `filename` | yes      | Exact name the workflow loader expects                                                 |
| `path`     | yes      | Comfy subfolder: `diffusion_models`, `text_encoders`, `vae`, `checkpoints`, `loras`, … |
| `url`      | yes      | Direct download URL (Hugging Face `resolve/main/…`)                                    |
| `sha256`   | no       | Optional integrity check after download                                                |

**Sizes are not stored in the manifest.** The app probes each URL (HTTP HEAD / Range) for `Content-Length`, reads the local file size on disk, and skips download when they match. Optional `sha256` still verifies after download.

## Tips

- Keep ids stable (`z-image-turbo`, not `Z Image Turbo v2`)
- Put prompt / aspect-ratio-style fields in `default`; sampler math (steps, cfg, seed, raw width/height) in `advanced`
- Match `path` to the Comfy loader folder (UNET → `diffusion_models`, CLIP/text → `text_encoders` or `clip`, VAE → `vae`)
- Use Hugging Face `…/resolve/main/…` URLs, not the `/blob/` page links
- Community / remote catalogs can come later; Official stays in this folder
- **Creator Mode** saves to the user folder (`%APPDATA%/com.open-gen-ai/blueprints/user/`), not here. To ship an Official pack, copy a finished user blueprint folder into this tree by hand.
