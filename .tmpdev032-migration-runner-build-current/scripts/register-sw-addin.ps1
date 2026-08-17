param(
    [string]$DllPath = (Join-Path (Resolve-Path "$PSScriptRoot\..") "sw-addin\bin\Release\AiPdmAddin.dll"),
    [switch]$Unregister
)

$ErrorActionPreference = "Stop"

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
    throw "Run this script from an elevated Administrator PowerShell session. COM registration writes machine-level registry keys."
}

$resolvedDll = Resolve-Path -LiteralPath $DllPath
$regAsm = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe"
if (-not (Test-Path -LiteralPath $regAsm)) {
    throw "RegAsm.exe was not found at $regAsm"
}

if ($Unregister) {
    & $regAsm $resolvedDll.Path /unregister
    if ($LASTEXITCODE -ne 0) {
        throw "RegAsm unregister failed with exit code $LASTEXITCODE"
    }
    Write-Host "AI PDM SolidWorks Add-in unregistered:"
    Write-Host $resolvedDll.Path
    exit 0
}

& $regAsm $resolvedDll.Path /codebase
if ($LASTEXITCODE -ne 0) {
    throw "RegAsm registration failed with exit code $LASTEXITCODE"
}

Write-Host "AI PDM SolidWorks Add-in registered:"
Write-Host $resolvedDll.Path
Write-Host ""
Write-Host "Next manual checks:"
Write-Host "1. Open SolidWorks."
Write-Host "2. Confirm AI PDM Add-in appears in Tools > Add-Ins."
Write-Host "3. Enable the Add-in and confirm the AI PDM command is visible."
Write-Host "4. Fill data/sw-addin-test-reports/<reportId>/report.json and run qc:sw-addin-real-machine-report."
