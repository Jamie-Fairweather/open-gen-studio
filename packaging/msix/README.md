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

Reuse an existing release build:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packaging/msix/pack.ps1 -SkipBuild
```

## Upload

1. Partner Center → Open Gen Studio → submission → **Packages**
2. Upload the **unsigned** `.msix` from `packaging/msix/out/`
3. Do **not** sign it yourself before Store upload

## Local sideload test (optional)

Self-sign only for installing on your machine (not for Store):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packaging/msix/pack.ps1 -SkipBuild -SignLocal
```

Then install the generated cert (once) and the package:

```powershell
winapp cert install packaging\msix\devcert.pfx
Add-AppxPackage packaging\msix\out\*.msix
```

## Also available

`bun run desktop:build` still produces the NSIS setup `.exe` for direct / non-Store distribution.
