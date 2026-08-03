---
name: update-app-version
description: >
  Bumps the Open Gen Studio app version across all canonical version files
  (package.json, Tauri config, Cargo.toml, Cargo.lock). Use when the user asks
  to update, bump, or set the app version, release version, or semver
  (e.g. "update to 0.2.0", "bump version", "set app version").
---

# Update App Version

Keep these four sources in sync. They are the only places that define the
**app** version (not dependency versions).

| File                      | Field                            | Notes                                  |
| ------------------------- | -------------------------------- | -------------------------------------- |
| `package.json`            | `"version"`                      | Root npm/bun package                   |
| `backend/tauri.conf.json` | `"version"`                      | Shown in installers / Tauri            |
| `backend/Cargo.toml`      | `[package] version`              | Rust crate `app`                       |
| `backend/Cargo.lock`      | `name = "app"` package `version` | Only the `[[package]]` block for `app` |

## Workflow

1. **Confirm target version** — Use the version the user gave (e.g. `0.2.0`). If they said "bump patch/minor/major" without a number, read the current version from `backend/tauri.conf.json` and compute the next semver.
2. **Update all four files** to that exact version string (no `v` prefix).
3. **Cargo.lock care** — Change only the `app` package entry:

   ```
   [[package]]
   name = "app"
   version = "<new>"
   ```

   Do **not** change other crates that happen to share the old version number.

4. **Verify** — Grep for the old app version in those four files only; confirm none still show it for the app. Ignore unrelated `0.x.y` strings in deps, docs, or IPs.
5. **Graphify** — After editing, run `graphify update .` from the repo root (project rule).
6. **Do not commit** unless the user explicitly asks.

## Do not touch

- Dependency versions in `package.json`, `Cargo.toml`, or lockfiles
- Skill/metadata `version` fields under `.agents/`, `.cursor/`, etc.
- Runtime/engine version fields (ComfyUI, models) in frontend or DB code
- `bun.lock` unless a real package change requires it (version-only bumps do not)

## Quick check

```bash
# After update, these should all print the new version:
rg -n '"version": "[0-9]' package.json backend/tauri.conf.json
rg -n '^version = "' backend/Cargo.toml
rg -n -A1 '^name = "app"$' backend/Cargo.lock
```
