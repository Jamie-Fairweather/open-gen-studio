---
name: check-line-coverage
description: >
  Runs bun run cleanup after every change (lint, typecheck, format) and
  gets frontend line coverage to 100%. Must always apply after a change
  has been completed.
---

# Check Line Coverage

Close-out after the change is complete. Not a substitute for TDD.

## Cleanup

After **every** change, from the repo root run `bun run cleanup`. It lint-fixes,
typechecks, formats, and updates graphify (`package.json` is the source of
truth). If it fails, fix the lint or TypeScript errors and re-run until it
exits 0. That run covers the project graphify-update rule — do not run
`graphify update .` again in the same close-out.

## Coverage

The bar is **100% lines**. Statements and branches can sit below that.

Skip coverage when the change never touched `frontend/**/*.{ts,tsx}`
(docs-only, Rust-only, skills-only).

1. From the repo root, run `bun run test:coverage`.
2. Read the **All files** `% Lines` cell. Done when it is `100`.
3. If not, take `Uncovered Line #s` from every file that is not already `100`
   lines. Those are the only lines to cover.
4. Cover them:
   - Prefer a test of the user-visible path that hits the line.
   - If the gap is a duplicate callback that the other Catalog section never
     reaches (Install on Installed, Uninstall on Not installed), share one
     renderer instead of testing an impossible control.
5. Re-run until All files `% Lines` is `100`.
6. If coverage work changed files, run `bun run cleanup` again.

Include/exclude live in `vitest.config.ts`. Files at `0%` that are barrels or
types (`index.ts` is already excluded) do not move the All files line total
when they have no statements.

## Done

`bun run cleanup` exited 0. If coverage ran, All files `% Lines` is `100` —
tell the user that number. Do not commit.
