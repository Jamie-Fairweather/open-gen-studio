# Language pass (from structure grill)

Docs in this pass match [`CONTEXT.md`](../../CONTEXT.md) and [ADR 0001](../adr/0001-catalog-and-registry.md). No folder or IPC renames. `recipe/` and `RecipeArch` stay.

## Done in docs

| File                                    | What changed                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `CONTEXT.md`                            | Glossary.                                                                      |
| `docs/adr/0001-catalog-and-registry.md` | Why Catalog ≠ Registry.                                                        |
| `docs/PLAN.md`                          | Mental model, data-plane names, UI diagram, Registry section, roadmap wording. |
| `PRODUCT.md`                            | Terms, core loop, version `0.2.2`.                                             |
| `README.md`                             | Drop `0.1.0`; product copy no longer says recipe / Registry-as-shipping.       |

## Done in UI

- Blueprint / LoRA dialogs: sections **Installed** / **Not installed**, origin pills **Official** / **Mine** (Registry when that source exists).
- Creator heading **New blueprint** / **Edit blueprint**. Create card no longer says recipe.
- Refine: “reuses the Blueprint sampler”.

## Later — UI

- When Registry ships: **Save to catalog** and **Save & install** on each item. Install still runs through Downloads.
- Runtime stays in the Catalog. Do not add a Runtime picker while there is only one.

## Later — leftover PLAN / DB words

- SQLite `installed_presets` is an old name. Do not revive Preset in UI. Rename the table only if you are already in a migration.
- PLAN still says “recipe” for the compile payload in `backend/src/recipe/`. That is code, not product copy.
- `frontend/components/libraries/` and the Downloads tab keep those names.

## Do not do

- Do not rename the Downloads tab to Registry or Catalog.
- Do not call Official or Mine “the Registry.”
- Do not say Available. It reads as usable now.
- Do not add a Projects workspace.
- Do not call `backend/resources/` (VC++ DLLs) a product layer.
