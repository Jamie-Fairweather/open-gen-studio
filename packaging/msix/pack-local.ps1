#Requires -Version 5.1
<#
.SYNOPSIS
  Pack a self-signed MSIX for local sideload testing (not for Store upload).

.DESCRIPTION
  Same staging as pack.ps1, but signs with packaging/msix/devcert.pfx.
  Upload to Partner Center must use the unsigned pack.ps1 / desktop:pack:msix.

.PARAMETER SkipBuild
  Reuse an existing backend/target/release build.

.PARAMETER IdentityFile
  Optional path to identity.json (passed through to pack.ps1).
#>
param(
  [switch]$SkipBuild,
  [string]$IdentityFile = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$pack = Join-Path $PSScriptRoot "pack.ps1"
$forward = @{
  SignLocal = $true
}
if ($SkipBuild) { $forward.SkipBuild = $true }
if ($IdentityFile) { $forward.IdentityFile = $IdentityFile }

& $pack @forward
if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$cert = Join-Path $PSScriptRoot "devcert.pfx"
$outDir = Join-Path $PSScriptRoot "out"
Write-Host ""
Write-Host "Local install (admin PowerShell; cert install once per machine):"
Write-Host "  winapp cert install `"$cert`""
Write-Host "  Add-AppxPackage -Path `"$outDir\OpenGenStudio_*_x64.msix`""
Write-Host ""
Write-Host "Do NOT upload this signed package to Partner Center."
