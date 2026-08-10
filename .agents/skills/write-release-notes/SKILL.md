---
name: write-release-notes
description: >
  Drafts an Open Gen Studio release notes markdown file under docs/release-notes/
  from git history since the previous version tag. Use when the user asks for
  release notes, a changelog for a version, notes for a release, or after an
  app version bump (e.g. "release notes for 0.2.1", "what changed since 0.2.0").
---

# Write Release Notes

Create one markdown file per app release in `docs/release-notes/`.

## Location and naming

| Item       | Convention                                     |
| ---------- | ---------------------------------------------- |
| Directory  | `docs/release-notes/`                          |
| Filename   | `<semver>.md` (no `v` prefix), e.g. `0.2.1.md` |
| Title (H1) | Same as the version: `# 0.2.1`                 |

Do not put release notes in `CHANGELOG.md` or the repo root unless the user asks.

## Workflow

1. **Confirm target version** — Use the version the user gave (e.g. `0.2.1`). If they only said "this release", read the current app version from `backend/tauri.conf.json`.
2. **Find the previous release** — Prefer the previous git tag (`v0.2.0`, `0.2.0`, etc.). If no tag exists, use the commit that bumped the app version to the previous semver (`chore: update/bump app version to X.Y.Z`).
3. **Collect changes** — From the previous release commit/tag to `HEAD` (or to the target bump commit):

   ```powershell
   git log <prev>..HEAD --oneline
   git log <prev>..HEAD --pretty=format:"%h %s%n%b" --no-merges
   git diff --stat <prev>..HEAD
   ```

   Ignore pure version-bump chore commits in the narrative (still note the release itself).

4. **Orient with graphify** (project rule) before deep file reads:

   ```bash
   graphify query "<feature keywords from commits>"
   ```

5. **Write user-facing notes** — Prefer product impact over file lists. Group into Added / Fixed / Changed / Removed as applicable. Skip empty sections. Mention upgrade/migration only when needed.
6. **Link discovery** — If this is the first note or the docs index is missing the folder, add a row in `docs/contributing/README.md` and/or the root `README.md` Docs table pointing at `docs/release-notes/`.
7. **Do not commit** unless the user explicitly asks.
8. **Graphify** — After editing tracked project files, run `graphify update .` from the repo root when the graphify rule applies.

## Template

```markdown
# <semver>

**Released:** YYYY-MM-DD

One-line summary of the release focus.

## Highlights

- 1–3 bullets a user or Store reviewer would care about

## Added

- **Feature name** — short what/why

## Fixed

- **Bug** — short what/why

## Changed

- Behavioral or docs/packaging changes that are not fixes

## Removed

- Only if something user-visible was removed

## Upgrade notes

- "No migration required from **X.Y.Z**." or concrete steps
```

Omit unused sections. Date = release/tag day when known; otherwise today's date from user_info.

## Tone

- Concise, concrete, past tense for shipped changes
- Call out Store/MSIX, onboarding, and hardware gates when they change (they affect certification)
- Do not paste raw `git log` into the note
- Do not invent features not present in the diff

## Related

- Version file sync: skill `update-app-version` and `docs/contributing/release-version.md`
- After bumping the app version, offer or write the matching `docs/release-notes/<semver>.md` if missing
