# Official LoRA packs

Each folder is one logical LoRA with **per-arch variants** (`manifest.json`).

Files download into the shared `models/loras/` library on install/use — manifests are metadata only.

Supported `arch` values match recipe compilers: `krea2`, `z-image`, `flux`, `flux2`, `ideogram4`, `sdxl`, `sd15`.

When adding a new architecture, see [`docs/contributing/adding-model-architectures.md`](../../docs/contributing/adding-model-architectures.md) (LoRA section; pickers use `RECIPE_ARCHES`).
