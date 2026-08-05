# Contributing guides

Practical how-tos for extending Open Gen Studio. Product/design background lives in [`docs/PLAN.md`](../PLAN.md) (design history - prefer these guides + `RecipeArch::ALL` / Creator `ARCHES` as source of truth).

| Guide                                                            | When to use it                                                                                     |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [Coding standards](./coding-standards.md)                        | House rules - especially **IPC: Rust → Specta → TypeScript**                                       |
| [Desktop development](./desktop-dev.md)                          | Run/debug Tauri + Next locally; which check/test commands to use                                   |
| [Release version bumps](./release-version.md)                    | Keep `package.json` / Tauri / Cargo app versions in sync                                           |
| [Adding a model architecture](./adding-model-architectures.md)   | New Comfy graph family (`RecipeArch`): compiler, Creator form, LoRAs, prompt tools, upscale, tests |
| [Architecture catalog](./architecture-catalog.md)                | Checklist of shipped vs candidate arches (txt2img, edit, video)                                    |
| [Blueprint thumbnail prompts](../blueprint-thumbnail-prompts.md) | Example prompts (per-model dialect) for Official pack `thumbnail.png` files                        |
| [GPU support plan](../gpu-support-plan.md)                       | NVIDIA (modern + cu126), AMD, Intel — detection, portable selection, phased rollout                |
| [Dev notes: Specta → stable v2](./dev-notes-specta-v2.md)        | On **rc.25** + tauri-specta; bump to Specta **2.0 stable** when it ships                           |

## Local quality gates

No remote CI. Before a large change (or anytime you want a full local gate):

```bash
bun run check          # typecheck + lint
bun run test           # frontend Vitest (pure helpers)
bun run check:full     # check + recipe Rust tests + Vitest (may skip Rust on Windows - see below)
bun run ipc:check      # regenerate bindings; fail if frontend/lib/generated/ drifts
```

Pre-commit (husky) already runs `lint:fix` + `typecheck` + lint-staged.

**Windows note:** `bun run test:rust` skips recipe `cargo test --lib` on Windows (Tauri/WebView2 → `STATUS_ENTRYPOINT_NOT_FOUND`). Vitest still runs as part of `check:full`.

More guides will land here as needed (e.g. official blueprints-only, LoRA packs-only, prompt dialects).
