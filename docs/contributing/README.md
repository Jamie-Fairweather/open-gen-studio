# Contributing guides

Practical how-tos for extending Open Gen AI. Product/design background lives in [`docs/PLAN.md`](../PLAN.md) and [`docs/PLAN-RECIPE-BLUEPRINTS.md`](../PLAN-RECIPE-BLUEPRINTS.md) (design history — prefer these guides + `RecipeArch::ALL` / Creator `ARCHES` as source of truth).

| Guide                                                          | When to use it                                                                                     |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [Coding standards](./coding-standards.md)                      | House rules — especially **IPC: Rust → Specta → TypeScript**                                       |
| [Adding a model architecture](./adding-model-architectures.md) | New Comfy graph family (`RecipeArch`): compiler, Creator form, LoRAs, prompt tools, upscale, tests |
| [Dev notes: Specta → stable v2](./dev-notes-specta-v2.md)      | On **rc.25** + tauri-specta; bump to Specta **2.0 stable** when it ships                           |

## Local quality gates

No remote CI. Before a large change (or anytime you want a full local gate):

```bash
bun run check          # typecheck + lint
bun run check:full     # + recipe Rust tests (may fail on Windows — see below)
bun run ipc:check      # regenerate bindings; fail if lib/generated/ drifts
```

Pre-commit (husky) already runs `lint:fix` + `typecheck` + lint-staged.

**Windows note:** `bun run test:rust` / `check:full` skip recipe `cargo test --lib` on Windows (Tauri/WebView2 → `STATUS_ENTRYPOINT_NOT_FOUND`). They still run on Linux/mac.

More guides will land here as needed (e.g. official blueprints-only, LoRA packs-only, prompt dialects).
