# Coding standards

Conventions for this repo. Prefer small diffs that match existing style; this doc only covers house rules that are easy to miss.

Related: [Contributing guides](./README.md), [Adding a model architecture](./adding-model-architectures.md).

---

## IPC contracts (Rust → TypeScript)

**Rust is the source of truth** for types that cross the Tauri boundary (command args/returns and event payloads).

1. Define the type in Rust with `Serialize` / `Deserialize` (as needed) and `#[derive(specta::Type)]`.
2. Expose it via a `#[specta::specta]` command **or** register with `.typ::<T>()` in `commands::specta_builder()` (events / allowlists not in signatures).
3. Regenerate bindings:

   ```bash
   bun run ipc:types
   ```

4. Import from `@/lib/generated/bindings` (usually via `lib/host.ts` / `lib/arch.ts`). **Do not** hand-copy IPC shapes into TypeScript.

| Lives in Rust + generated TS                                              | Stays TypeScript-only                                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Commands + DTOs / enums (`RecipeArch`, `PromptFormat`, `DownloadSpec`, …) | UI registries (`ARCHES` slot tables, prompt format **labels**, enhance modes) |
| Named progress payloads (`JobProgress`, `LoraProgress`, …)                | Studio tab state, gallery helpers, Comfy sampler name lists                   |

### Rules

- Prefer a named Rust struct over `serde_json::json!({…})` for anything the frontend listens to.
- Prefer a Rust enum over duplicated string unions when the set is closed (`RecipeArch`, `PromptFormat`, `UpscaleKind`, …).
- Manifests on disk may still store free-form strings (e.g. `"arch": "flux"`); parse into the enum at the boundary (`RecipeArch::parse`).
- Do not commit hand-edits to `frontend/lib/generated/bindings.ts` or `ipc.ts`.
- `serde_json::Value` / open maps: mark with `#[specta(type = specta_typescript::Any)]` or use `JsonValue` / `JsonMap` - Specta will stack-overflow if it tries to inline recursive `Value`.
- Specta is pinned to **2.0.0-rc.25** (+ tauri-specta) - when stable v2 ships, follow [Dev notes: Specta stable v2](./dev-notes-specta-v2.md).

### Adding a field or enum variant

1. Change the Rust type (and `#[specta::specta]` / `.typ::<T>()` if new).
2. Run `bun run ipc:types`.
3. Update call sites / UI that need the new field.

---

## Recipe architectures

`RecipeArch` is the closed allowlist (Rust enum → generated TS union). Creator **metadata** (model slots, default URLs, capabilities) lives in [`lib/creator-arches.ts`](../../lib/creator-arches.ts) as `ARCHES` - that is product data, not an IPC DTO.

When adding an arch, follow [Adding a model architecture](./adding-model-architectures.md): compiler + `RecipeArch` variant + Creator `ARCHES` entry + regenerate IPC types.

### Local checks

```bash
bun run check       # typecheck + lint
bun run check:full  # also recipe Rust tests (see contributing README for Windows)
bun run ipc:check   # after IPC/DTO changes - fail if generated bindings drift
```

---

## Frontend

- Prefer existing `lib/host.ts` wrappers over raw `invoke` in components.
- Match neighboring file style (imports, naming, coss UI primitives).
- Do not add `useMemo` / `useCallback` by default; follow React Compiler guidance in the project skills.

---

## Rust

- Keep domain modules focused (`recipe/`, `blueprints/`, `prompt_tools/`, …); Specta command collection lives in `commands::specta_builder`, shared DTOs / export helpers in `ipc.rs`.
- `cargo fmt` via project format scripts / husky.

---

## Docs

- Contributor how-tos under `docs/contributing/`.
- Product/design background under `docs/PLAN.md` - update when arch lists or IPC conventions change.
