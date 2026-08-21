# Microsoft Store MSIX packaging

Tauri does not emit MSIX. This folder stages the release build and packs an **unsigned** `.msix` for Partner Center. The Store signs it on submission — no paid code-signing certificate required.

Keep the Partner Center product type as **MSIX or PWA app** (not EXE/MSI).

## Prerequisites

1. [winapp CLI](https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/):

   ```powershell
   winget install microsoft.winappcli --source winget
   ```

2. Partner Center identity for **Open Gen Studio** → **Product management** → **Product identity**:
   - Package/Identity/Name
   - Package/Identity/Publisher (`CN=...`)
   - Package/Identity/PublisherDisplayName

3. Copy the example identity file and fill it in (gitignored):

   ```powershell
   copy packaging\msix\identity.json.example packaging\msix\identity.json
   ```

## Build Store MSIX

```bash
bun run desktop:pack:msix
```

This runs `tauri build`, stages `app.exe` plus `blueprints/`, `loras/`, and Store logos, then `winapp pack` into:

`packaging/msix/out/OpenGenStudio_<version>_x64.msix`

The pack script **refuses to continue** if staged `blueprints/` or `loras/` have no `manifest.json` files (an empty catalog fails Store certification on the first-run Blueprint picker).

Reuse an existing release build:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packaging/msix/pack.ps1 -SkipBuild
```

## Upload

1. Partner Center → Open Gen Studio → submission → **Packages**
2. Upload the **unsigned** `.msix` from `packaging/msix/out/`
3. Do **not** sign it yourself before Store upload

## Store certification notes

Policy **10.1.2.10** (“crashes at launch”) often means the process starts with
**no visible window**. This app boots with `visible: false` for splash handoff;
Rust setup + the startup overlay both call `show()`, and window-state no longer
persists visibility (so a fresh Store install cannot restore a hidden window).

Also verify on a **clean** machine / VM (or Surface-class iGPU) via local
sideload — not only on a developer PC that already has app data / WebView2 warm.

Declare Partner Center system requirements honestly (min ~16GB RAM / 8GB VRAM);
first-run onboarding warns and can be bypassed when hardware is under-spec.

### First-run “Install Python packages” / extensions

Certification PCs may lack **git** or have flaky PyPI. The install pipeline
hard-fails (Retry) instead of soft-skipping; onboarding already requires
internet:

1. **Install Python packages** — copies bundled **VC++ runtime DLLs**
   (`backend/resources/vc140/`) next to portable `python.exe` (MSIX/clean VMs
   cannot rely on System32 alone), then `ensurepip` / get-pip → PyPI
   `pip install -r manager_requirements.txt` (retries).
2. **Install extensions** — managed custom nodes via **GitHub codeload zip**
   - `.oga_node_pin` marker; `git` only as fallback.
3. **Long paths** — MSIX AppData under `Packages\…\LocalCache\…` exceeds
   Windows MAX_PATH for pip (junctions are not enough — Python resolves them).
   Default library root is `%USERPROFILE%\Open Gen Studio`. If a portable
   install is already under Packages, it is relocated to
   `%USERPROFILE%\.ogs\cui` before pip, with a junction left at the old path.

Before Store resubmit, sideload the MSIX on a **clean VM without git** and
confirm first-run completes through both steps.

## Local sideload test (optional)

Self-sign only for installing on your machine (**not** for Store upload):

```bash
bun run desktop:pack:msix:local
```

Reuse an existing release build:

```bash
bun run desktop:pack:msix:local:skip-build
```

Same via the wrapper script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packaging/msix/pack-local.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File packaging/msix/pack-local.ps1 -SkipBuild
```

Then install the generated cert (once) and the package:

```powershell
winapp cert install packaging\msix\devcert.pfx
Add-AppxPackage packaging\msix\out\OpenGenStudio_*_x64.msix
```

## Also available

`bun run desktop:build` still produces the NSIS setup `.exe` for direct / non-Store distribution.
