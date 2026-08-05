#Requires -Version 5.1
<#
.SYNOPSIS
  Stage the Tauri release build and pack an unsigned MSIX for Microsoft Store upload.

.DESCRIPTION
  Builds (unless -SkipBuild), copies app.exe + blueprints/loras/resources into a clean
  staging folder, applies Partner Center identity from identity.json, and runs
  `winapp pack` without a production certificate (the Store signs on submission).

  For local sideload testing only, pass -SignLocal to generate/install a self-signed cert.

.PARAMETER SkipBuild
  Reuse an existing backend/target/release build.

.PARAMETER SignLocal
  Self-sign the MSIX for local install/testing (not for Store upload).

.PARAMETER IdentityFile
  Path to JSON with name, publisher, publisherDisplayName (see identity.json.example).
#>
param(
  [switch]$SkipBuild,
  [switch]$SignLocal,
  [string]$IdentityFile = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$BackendDir = Join-Path $RepoRoot "backend"
$ReleaseDir = Join-Path $BackendDir "target\release"
$StagingDir = Join-Path $PSScriptRoot "staging"
$OutDir = Join-Path $PSScriptRoot "out"
$ManifestTemplate = Join-Path $PSScriptRoot "Package.appxmanifest"
$IconsDir = Join-Path $BackendDir "icons"
$ContentBlueprints = Join-Path $RepoRoot "content\blueprints"
$ContentLoras = Join-Path $RepoRoot "content\loras"

if (-not $IdentityFile) {
  $IdentityFile = Join-Path $PSScriptRoot "identity.json"
}

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw @"
Required command '$Name' not found.
Install the winapp CLI: winget install microsoft.winappcli --source winget
"@
  }
}

function Read-AppVersion {
  $confPath = Join-Path $BackendDir "tauri.conf.json"
  $conf = Get-Content -LiteralPath $confPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $semver = [string]$conf.version
  if ($semver -notmatch '^\d+\.\d+\.\d+') {
    throw "Could not parse version from tauri.conf.json (got '$semver')"
  }
  $parts = $semver.Split(".")
  return "$($parts[0]).$($parts[1]).$($parts[2]).0"
}

function Read-Identity {
  param([string]$Path, [string]$Version)

  $identity = [ordered]@{
    name                  = $null
    publisher             = $null
    publisherDisplayName  = "Jamie Fairweather"
    version               = $Version
  }

  if (Test-Path -LiteralPath $Path) {
    $json = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    $props = @{}
    foreach ($p in $json.PSObject.Properties) { $props[$p.Name] = $p.Value }
    if ($props["name"]) { $identity.name = [string]$props["name"] }
    if ($props["publisher"]) { $identity.publisher = [string]$props["publisher"] }
    if ($props["publisherDisplayName"]) { $identity.publisherDisplayName = [string]$props["publisherDisplayName"] }
    if ($props["version"]) { $identity.version = [string]$props["version"] }
  }

  if ($env:MSIX_IDENTITY_NAME) { $identity.name = $env:MSIX_IDENTITY_NAME }
  if ($env:MSIX_IDENTITY_PUBLISHER) { $identity.publisher = $env:MSIX_IDENTITY_PUBLISHER }
  if ($env:MSIX_PUBLISHER_DISPLAY_NAME) { $identity.publisherDisplayName = $env:MSIX_PUBLISHER_DISPLAY_NAME }

  if (-not $identity.name -or $identity.name -like "REPLACE_*" -or $identity.name -like "YourPublisher*") {
    throw @"
Partner Center package identity Name is missing.
Copy packaging/msix/identity.json.example to packaging/msix/identity.json and fill in
values from Partner Center > Open Gen Studio > Product identity.
Or set MSIX_IDENTITY_NAME / MSIX_IDENTITY_PUBLISHER.
"@
  }
  if (-not $identity.publisher -or $identity.publisher -like "*REPLACE_*" -or $identity.publisher -like "*XXXXXXXX*") {
    throw "Partner Center Publisher (CN=...) is missing. Set it in identity.json or MSIX_IDENTITY_PUBLISHER."
  }
  if ($identity.publisher -notlike "CN=*") {
    throw "Publisher must be a certificate subject string starting with 'CN=' (from Partner Center)."
  }

  return [pscustomobject]$identity
}

function Write-StagedManifest {
  param(
    [string]$TemplatePath,
    [string]$DestinationPath,
    $Identity
  )

  [xml]$xml = Get-Content -LiteralPath $TemplatePath -Raw -Encoding UTF8
  $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
  $ns.AddNamespace("def", "http://schemas.microsoft.com/appx/manifest/foundation/windows10")

  $idNode = $xml.SelectSingleNode("//def:Identity", $ns)
  if (-not $idNode) { throw "Identity node not found in Package.appxmanifest" }
  $idNode.SetAttribute("Name", $Identity.name)
  $idNode.SetAttribute("Publisher", $Identity.publisher)
  $idNode.SetAttribute("Version", $Identity.version)

  $props = $xml.SelectSingleNode("//def:Properties", $ns)
  $pubDisplay = $props.SelectSingleNode("def:PublisherDisplayName", $ns)
  if ($pubDisplay) { $pubDisplay.InnerText = $Identity.publisherDisplayName }

  $settings = New-Object System.Xml.XmlWriterSettings
  $settings.Indent = $true
  $settings.Encoding = New-Object System.Text.UTF8Encoding($false)
  $writer = [System.Xml.XmlWriter]::Create($DestinationPath, $settings)
  try {
    $xml.Save($writer)
  } finally {
    $writer.Dispose()
  }
}

function Copy-DirectoryContents {
  param([string]$Source, [string]$Destination)
  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Required directory not found: $Source"
  }
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Copy-Item -LiteralPath (Join-Path $Source "*") -Destination $Destination -Recurse -Force
}

function Ensure-WideLogo {
  param([string]$SourcePng, [string]$DestPng)

  Add-Type -AssemblyName System.Drawing
  $src = [System.Drawing.Image]::FromFile($SourcePng)
  try {
    $bmp = New-Object System.Drawing.Bitmap 310, 150
    try {
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        $g.Clear([System.Drawing.Color]::FromArgb(255, 18, 18, 20))
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $scale = [Math]::Min(310.0 / $src.Width, 150.0 / $src.Height)
        $w = [int]($src.Width * $scale)
        $h = [int]($src.Height * $scale)
        $x = [int]((310 - $w) / 2)
        $y = [int]((150 - $h) / 2)
        $g.DrawImage($src, $x, $y, $w, $h)
      } finally {
        $g.Dispose()
      }
      $bmp.Save($DestPng, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $bmp.Dispose()
    }
  } finally {
    $src.Dispose()
  }
}

function Stage-Assets {
  param([string]$AssetsDest)

  New-Item -ItemType Directory -Force -Path $AssetsDest | Out-Null
  $required = @(
    "StoreLogo.png",
    "Square44x44Logo.png",
    "Square150x150Logo.png",
    "Square310x310Logo.png"
  )
  foreach ($name in $required) {
    $src = Join-Path $IconsDir $name
    if (-not (Test-Path -LiteralPath $src)) {
      throw "Missing Store icon: $src (regenerate with: bunx tauri icon backend/icons/icon.png)"
    }
    Copy-Item -LiteralPath $src -Destination (Join-Path $AssetsDest $name) -Force
  }

  $iconPng = Join-Path $IconsDir "icon.png"
  if (-not (Test-Path -LiteralPath $iconPng)) {
    $iconPng = Join-Path $IconsDir "Square310x310Logo.png"
  }
  Ensure-WideLogo -SourcePng $iconPng -DestPng (Join-Path $AssetsDest "Wide310x150Logo.png")
}

Write-Host "==> Open Gen Studio MSIX pack"

$version = Read-AppVersion
$identity = Read-Identity -Path $IdentityFile -Version $version
Write-Host "    Identity: $($identity.name)"
Write-Host "    Publisher: $($identity.publisher)"
Write-Host "    Version: $($identity.version)"

Assert-Command "winapp"

if (-not $SkipBuild) {
  Write-Host "==> tauri build (NSIS target from tauri.conf.json)"
  Push-Location $RepoRoot
  try {
    if (Get-Command bun -ErrorAction SilentlyContinue) {
      & bun run desktop:build
    } elseif (Get-Command npm -ErrorAction SilentlyContinue) {
      & npm run desktop:build
    } else {
      throw "Need bun or npm on PATH to run desktop:build"
    }
    if ($LASTEXITCODE -ne 0) { throw "desktop:build failed with exit code $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "==> Skipping build (-SkipBuild)"
}

$exePath = Join-Path $ReleaseDir "app.exe"
if (-not (Test-Path -LiteralPath $exePath)) {
  throw "Release binary not found: $exePath (run without -SkipBuild, or build first)"
}

Write-Host "==> Staging package contents"
if (Test-Path -LiteralPath $StagingDir) {
  Remove-Item -LiteralPath $StagingDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $StagingDir | Out-Null
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Copy-Item -LiteralPath $exePath -Destination (Join-Path $StagingDir "app.exe") -Force

$blueprintsSrc = Join-Path $ReleaseDir "blueprints"
if (-not (Test-Path -LiteralPath $blueprintsSrc)) { $blueprintsSrc = $ContentBlueprints }
$lorasSrc = Join-Path $ReleaseDir "loras"
if (-not (Test-Path -LiteralPath $lorasSrc)) { $lorasSrc = $ContentLoras }

Copy-DirectoryContents -Source $blueprintsSrc -Destination (Join-Path $StagingDir "blueprints")
Copy-DirectoryContents -Source $lorasSrc -Destination (Join-Path $StagingDir "loras")

$resourcesSrc = Join-Path $ReleaseDir "resources"
if (Test-Path -LiteralPath $resourcesSrc) {
  Copy-DirectoryContents -Source $resourcesSrc -Destination (Join-Path $StagingDir "resources")
}

Stage-Assets -AssetsDest (Join-Path $StagingDir "Assets")
Write-StagedManifest -TemplatePath $ManifestTemplate -DestinationPath (Join-Path $StagingDir "Package.appxmanifest") -Identity $identity

$outName = "OpenGenStudio_$($identity.version)_x64.msix"
$outPath = Join-Path $OutDir $outName

Write-Host "==> winapp pack"
$packArgs = @(
  "pack", $StagingDir,
  "--manifest", (Join-Path $StagingDir "Package.appxmanifest"),
  "--output", $outPath,
  "--executable", "app.exe"
)

if ($SignLocal) {
  $certPath = Join-Path $PSScriptRoot "devcert.pfx"
  Write-Host "    Local self-sign mode (not for Store upload)"
  & winapp cert generate --manifest (Join-Path $StagingDir "Package.appxmanifest") --output $certPath --if-exists Skip
  if ($LASTEXITCODE -ne 0) { throw "winapp cert generate failed" }
  $packArgs += @("--cert", $certPath)
} else {
  Write-Host "    Unsigned package for Microsoft Store (Store will sign on submission)"
}

& winapp @packArgs
if ($LASTEXITCODE -ne 0) { throw "winapp pack failed with exit code $LASTEXITCODE" }

if (-not (Test-Path -LiteralPath $outPath)) {
  # winapp may place the artifact next to CWD or alter the name; surface whatever landed in out/
  $found = Get-ChildItem -LiteralPath $OutDir -Filter "*.msix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($found) {
    $outPath = $found.FullName
  } else {
    throw "MSIX was not produced at $outPath"
  }
}

Write-Host ""
Write-Host "Done: $outPath"
if (-not $SignLocal) {
  Write-Host "Upload this unsigned .msix in Partner Center → Packages. Do not code-sign it yourself."
} else {
  Write-Host "Sideload test: winapp cert install `"$(Join-Path $PSScriptRoot 'devcert.pfx')`" then Add-AppxPackage `"$outPath`""
}
