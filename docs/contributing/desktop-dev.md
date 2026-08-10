# Desktop development

How to run and debug the Tauri + Next desktop app locally.

## Start

```bash
bun install
bun run desktop          # Tauri shell + Next on http://localhost:3000
```

`desktop` is the normal day-to-day path: Rust host (downloads, SQLite, Comfy supervision, IPC) plus the React UI. Primary supported path today is **Windows + NVIDIA** (official ComfyUI Windows Portable).

## When to use which gate

| Command                 | Use when                                                                         |
| ----------------------- | -------------------------------------------------------------------------------- |
| `bun run check`         | Quick TS + ESLint before a PR-sized change                                       |
| `bun run test`          | Frontend Vitest (`frontend/**/*.{test,spec}.{ts,tsx}`)                           |
| `bun run test:coverage` | Same suite + V8 coverage report (`coverage/index.html`)                          |
| `bun run check:full`    | `check` + Rust recipe tests + Vitest (recipe `cargo test` is skipped on Windows) |
| `bun run ipc:types`     | After changing Specta/IPC types in Rust — regenerates `frontend/lib/generated/`  |
| `bun run ipc:check`     | Fail if generated bindings drifted without a regen                               |

**Coverage:** `bun run test:coverage` reports V8 coverage for app frontend (excludes generated bindings, `components/ui`, `.next`, config/d.ts, test helpers, re-export barrels). Open `coverage/index.html`. There is no hard 100% threshold yet — raise coverage opportunistically; full branch/statement gate can come later.

Pre-commit (husky) already runs lint-fix + typecheck + lint-staged.

## Tokens and settings

HF / CivitAI tokens and paths live in the in-app **Settings** UI and the host credential store — not in `.env` for day-to-day desktop use. If installs fail with gated models, open Settings and set the matching token, then retry the Blueprint or LoRA download.

## Preview the Hardware onboarding step

Machines that meet min specs skip that screen. To force it in dev:

1. Copy `frontend/.env.example` → `frontend/.env.local`
2. Set `NEXT_PUBLIC_FORCE_ONBOARDING_SPECS=1`
3. Restart `bun run desktop`

That re-opens onboarding and lands on Hardware even when RAM/VRAM are fine. **Continue anyway** still advances for the session; each app restart shows Hardware again while the flag is on.

`frontend/.env*.local` is ignored by `bun run build` / `bun run desktop:build` so local preview flags are never baked into the packaged app.

## Related

- [Coding standards](./coding-standards.md) — IPC: Rust → Specta → TypeScript
- [Architecture catalog](./architecture-catalog.md) — shipped vs candidate arches
- [Contributing index](./README.md) — full guide list + quality gates
