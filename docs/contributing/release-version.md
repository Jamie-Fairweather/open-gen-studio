# Release version bumps

Keep these four sources in sync. They are the only places that define the **app** version (not dependency versions).

| File                      | Field                            | Notes                                  |
| ------------------------- | -------------------------------- | -------------------------------------- |
| `package.json`            | `"version"`                      | Root npm/bun package                   |
| `backend/tauri.conf.json` | `"version"`                      | Shown in installers / Tauri            |
| `backend/Cargo.toml`      | `[package] version`              | Rust crate `app`                       |
| `backend/Cargo.lock`      | `name = "app"` package `version` | Only the `[[package]]` block for `app` |

## Manual bump checklist

1. Pick the target semver (no `v` prefix), e.g. `0.2.0`.
2. Update all four files to that exact string.
3. In `Cargo.lock`, change **only** the `app` package entry:

   ```
   [[package]]
   name = "app"
   version = "<new>"
   ```

   Do not change other crates that share the old version number.

4. Verify the old app version is gone from those four files (ignore unrelated `0.x.y` in deps, docs, or IPs).
5. Do not bump dependency versions, skill metadata under `.agents/` / `.cursor/`, or runtime/engine fields as part of an app version bump.

Quick check:

```bash
rg -n '"version": "[0-9]' package.json backend/tauri.conf.json
rg -n '^version = "' backend/Cargo.toml
rg -n -A1 '^name = "app"$' backend/Cargo.lock
```

## Release-day note

GitHub Actions CI and issue/PR templates are intentionally deferred until release day. Until then, use the [local quality gates](./README.md#local-quality-gates) (`bun run check`, `bun run test`, `bun run check:full`, `bun run ipc:check`).
