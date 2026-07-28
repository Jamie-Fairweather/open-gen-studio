# Dev notes: Specta → stable v2

**Status:** on Specta / tauri-specta **`2.0.0-rc.25`** (authors: last RC before stable) + `specta-serde` / `specta-typescript` `0.0.12`.  
**Ship path:** when **2.0 stable** lands, bump pins and re-run `bun run ipc:types` - expect little churn from rc.25.

Upstream: [specta releases](https://github.com/specta-rs/specta/releases) · [crates.io/specta](https://crates.io/crates/specta) · [tauri-specta](https://crates.io/crates/tauri-specta)

---

## What we use today

- **`tauri-specta`** collects commands (`commands::specta_builder`) and exports `lib/generated/bindings.ts` (typed `commands.*` + DTO types).
- **`bun run ipc:types`** → `cargo run --bin export-ipc` (not a unit test - Windows lib tests can fail with `STATUS_ENTRYPOINT_NOT_FOUND` when linking heavy Tauri/specta).
- **`ErrorHandlingMode::Throw`** so generated invokes match prior `host.ts` / raw `invoke` (errors throw).
- Opaque JSON (`serde_json::Value`) must not be inlined by Specta - use `#[specta(type = specta_typescript::Any)]` on fields, or `JsonValue` / `JsonMap` at command boundaries (`src-tauri/src/json_any.rs`).
- `RECIPE_ARCHES` is appended from `RecipeArch::ALL` after export.
- Prefer `@/lib/generated/bindings` (or `lib/host.ts` / `lib/arch.ts` re-exports). `lib/generated/ipc.ts` is a thin re-export for old imports.

---

## When stable v2 is out - checklist

1. Bump `specta`, `tauri-specta`, `specta-typescript`, `specta-serde` in `src-tauri/Cargo.toml` to the stable line.
2. `bun run ipc:types` - skim `bindings.ts` for shape drift.
3. `bun run typecheck` + smoke a few invokes in the app.
4. Update this file + [`coding-standards.md`](./coding-standards.md) if the pin text still says RC.

---

## Out of scope here

- Creator `ARCHES` UI metadata - product data, not Specta.
- Switching away from Specta unless stable v2 is abandoned.
