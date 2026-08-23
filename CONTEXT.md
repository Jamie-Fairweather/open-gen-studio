# Open Gen Studio

A local desktop studio for generative media. The app orchestrates installs, jobs, and a gallery; engines perform inference.

## Language

**Engine**:
The underlying AI stack that performs inference.
_Avoid_: backend, model server

**Runtime**:
An installed, managed instance of an Engine. There is one Runtime today; it lives in the Catalog but is not shown as a filtered list.
_Avoid_: Comfy install, portable (as the product word)

**Blueprint**:
An installable capability package the host compiles at generate time. Creator screens are **New blueprint** / **Edit blueprint**.
_Avoid_: workflow, preset, recipe (in product copy)

**Official**:
Origin of Catalog rows that ship with the app — Blueprints, LoRAs, a fixed upscaler set, and Prompt Tools. Shown as a pill, not a list section.
_Avoid_: bundled, stock, included (as the catalog word)

**Mine**:
Origin of Catalog rows the user authored (Creator → My blueprints). Shown as a pill.
_Avoid_: user pack, local (as the origin word)

**Catalog**:
The single set of installable things: Blueprints, LoRAs, upscalers, Prompt Tools, and Runtimes. Each row is **Not installed** or **Installed**. Blueprint, LoRA, and upscaler dialogs show a filter of this set. Runtime and Prompt Tools live in the Catalog but are not shown as a filtered list. Origin is a pill: Official, Mine, or Registry. Not a tab.
_Avoid_: Registry (for the set), Downloads (for the set), Libraries (as the product word), Available (for Not installed)

**Prompt Tools**:
Studio tools that turn an image or a prompt into a better prompt (Image to Prompt, Prompt Enhance). Their weights are Catalog rows, presented on the Tools screens — not as a Catalog dialog filter.
_Avoid_: utility model, Qwen (as the name of the set)

**Not installed**:
A Catalog row the user cannot use yet. Official rows can ship in this state. Registry **Save to catalog** creates this state.
_Avoid_: Available

**Installed**:
A Catalog row that is ready to use.
_Avoid_: Preset (for an installed Blueprint)

**Registry**:
A future place to add extra Blueprints and LoRAs to the Catalog. Each item can **Save to catalog** (Not installed) or **Save & install** (save, then install via Downloads). Not in the app today.
_Avoid_: Resources, marketplace, using Registry for Official, Mine, the current pickers, Downloads, or the Catalog

**Downloads**:
The queue and history of transfers onto the machine while a Catalog row is being installed.
_Avoid_: Registry (for transfers), Catalog (for the transfer queue)

**First-run**:
The studio stays gated until Runtime is ready and at least one Official Blueprint is Installed.
_Avoid_: onboarding (as the product word)

**Job**:
A GPU-queue item — generate or Prompt Tools. Not a Downloads transfer.
_Avoid_: Downloads (for GPU work), Catalog (for the queue)

**Gallery**:
The user's generated outputs with metadata.
_Avoid_: library (for outputs), Projects
