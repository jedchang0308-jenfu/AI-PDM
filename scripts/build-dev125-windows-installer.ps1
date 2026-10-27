[CmdletBinding()]
param(
  [ValidatePattern('^[a-f0-9]{40}$')][string]$SourceRevision = $env:PDM_SOURCE_REVISION,
  [ValidatePattern('^[0-9A-Za-z._-]{1,40}$')][string]$Version = $env:PDM_WINDOWS_SERVICE_VERSION,
  [ValidatePattern('^https://[^/]+$')][string]$BaseUrl = 'https://ai-pdm-prod-9536592944.asia-east1.run.app',
  [string]$OutputRoot,
  [string]$NodeExecutable = $null
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
if ($SourceRevision -notmatch '^[a-f0-9]{40}$') { throw 'DEV125_SOURCE_REVISION_REQUIRED' }
if ($Version -notmatch '^[0-9A-Za-z._-]{1,40}$') { throw 'DEV125_WINDOWS_SERVICE_VERSION_REQUIRED' }

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $OutputRoot) { $OutputRoot = Join-Path $root '.tmp\dev125-windows-installer' }
$output = [IO.Path]::GetFullPath($OutputRoot)
$allowedPrefix = [IO.Path]::GetFullPath((Join-Path $root '.tmp')) + [IO.Path]::DirectorySeparatorChar
if (-not ($output + [IO.Path]::DirectorySeparatorChar).StartsWith($allowedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'DEV125_OUTPUT_ROOT_MUST_BE_UNDER_REPOSITORY_TMP'
}

$node = if ($NodeExecutable) { [IO.Path]::GetFullPath($NodeExecutable) } else { (Get-Command node.exe).Source }
$nodeVersion = (& $node --version).Trim()
if ($nodeVersion -notmatch '^v24\.') { throw "DEV125_NODE_24_REQUIRED:$nodeVersion" }

$csc = @(
  'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe',
  'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $csc) { throw 'DEV125_DOTNET_FRAMEWORK_CSC_UNAVAILABLE' }

$dependencyRoot = Join-Path $root '.tmp\dev125-deps'
$winSwPath = Join-Path $dependencyRoot 'WinSW-x64.exe'
$nsisZip = Join-Path $dependencyRoot 'nsis-3.11.zip'
$nsisRoot = Join-Path $dependencyRoot 'nsis-3.11'
$winSwSha256 = '05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da'
$nsisSha256 = 'c7d27f780ddb6cffb4730138cd1591e841f4b7edb155856901cdf5f214394fa1'

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Write-Utf8NoBom([string]$Path, [string]$Value) {
  [IO.File]::WriteAllText($Path, $Value, (New-Object Text.UTF8Encoding($false)))
}

function Get-PinnedFile([string]$Path, [string]$Url, [string]$ExpectedSha256) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  if (-not (Test-Path -LiteralPath $Path) -or (Get-Sha256 $Path) -ne $ExpectedSha256) {
    Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    & curl.exe -L --fail --retry 2 --output $Path $Url
  }
  $actual = Get-Sha256 $Path
  if ($actual -ne $ExpectedSha256) { throw "DEV125_DEPENDENCY_DIGEST_MISMATCH:${Path}:$actual" }
}

Get-PinnedFile $winSwPath 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe' $winSwSha256
Get-PinnedFile $nsisZip 'https://sourceforge.net/projects/nsis/files/NSIS%203/3.11/nsis-3.11.zip/download?use_mirror=altushost-swe' $nsisSha256
if (Test-Path -LiteralPath $nsisRoot) {
  $resolvedNsis = [IO.Path]::GetFullPath($nsisRoot)
  if (-not ($resolvedNsis + [IO.Path]::DirectorySeparatorChar).StartsWith($allowedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'DEV125_NSIS_PATH_OUTSIDE_TMP'
  }
  Remove-Item -LiteralPath $resolvedNsis -Recurse -Force
}
Expand-Archive -LiteralPath $nsisZip -DestinationPath $nsisRoot
$makensis = Get-ChildItem -LiteralPath $nsisRoot -Filter makensis.exe -Recurse | Select-Object -First 1 -ExpandProperty FullName
if (-not $makensis) { throw 'DEV125_MAKENSIS_UNAVAILABLE' }

$stage = Join-Path $output 'stage'
$downloadDirectory = Join-Path $output 'worker-downloads\windows-service'
if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage,$downloadDirectory,
  (Join-Path $stage 'runtime'),(Join-Path $stage 'service'),(Join-Path $stage 'tools'),
  (Join-Path $stage 'extractors') | Out-Null

Copy-Item -LiteralPath $node -Destination (Join-Path $stage 'runtime\node.exe')
Copy-Item -LiteralPath $winSwPath -Destination (Join-Path $stage 'AipdmWindowsParsing.exe')
Copy-Item -LiteralPath (Join-Path $root 'windows-service\service\AipdmWindowsParsing.xml') -Destination (Join-Path $stage 'AipdmWindowsParsing.xml')
Copy-Item -Path (Join-Path $root 'windows-service\service\*.mjs') -Destination (Join-Path $stage 'service')
Copy-Item -LiteralPath (Join-Path $root 'config\solidworks-metadata-field-aliases.json') -Destination (Join-Path $stage 'service\solidworks-metadata-field-aliases.json')
Copy-Item -LiteralPath (Join-Path $root 'windows-service\THIRD-PARTY-NOTICES.txt') -Destination (Join-Path $stage 'THIRD-PARTY-NOTICES.txt')

$product = [ordered]@{
  contractVersion = 'ai-pdm.windows-service-product.v1'
  sourceRevision = $SourceRevision
  version = $Version
  protocolVersion = 1
  baseUrl = $BaseUrl.TrimEnd('/')
  dependencies = [ordered]@{
    node = $nodeVersion
    winsw = [ordered]@{ version = '2.12.0'; sha256 = $winSwSha256 }
    nsis = [ordered]@{ version = '3.11'; sha256 = $nsisSha256 }
    dotNetFramework = '4.8'
    solidworksDocumentManager = [ordered]@{
      binding = 'late-bound-com'
      progId = 'SwDocumentMgr.SwDMClassFactory'
      redistribution = 'not-bundled'
    }
  }
}
Write-Utf8NoBom (Join-Path $stage 'product.json') ($product | ConvertTo-Json -Depth 8)

& $csc /nologo /platform:x64 /target:exe "/out:$(Join-Path $stage 'tools\AipdmCredentialHelper.exe')" `
  /reference:System.Security.dll (Join-Path $root 'windows-service\tools\AipdmCredentialHelper.cs')
& $csc /nologo /platform:x64 /target:winexe "/out:$(Join-Path $stage 'AipdmWindowsConfigurator.exe')" `
  "/win32manifest:$(Join-Path $root 'windows-service\configurator\app.manifest')" `
  /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll `
  /reference:System.Security.dll /reference:System.Web.Extensions.dll /reference:System.Windows.Forms.dll `
  (Join-Path $root 'windows-service\configurator\AipdmWindowsConfigurator.cs')
& $csc /nologo /platform:x64 /target:exe "/out:$(Join-Path $stage 'AipdmDocumentManagerProbe.exe')" `
  /reference:System.dll /reference:System.Core.dll /reference:System.Security.dll /reference:System.Web.Extensions.dll `
  (Join-Path $root 'windows-service\tools\AipdmDocumentManagerProbe.cs')
& $csc /nologo /platform:x64 "/out:$(Join-Path $stage 'extractors\SolidWorksDocumentManagerMetadataExporter.exe')" `
  /reference:Microsoft.CSharp.dll `
  (Join-Path $root 'scripts\solidworks-document-manager-metadata-exporter.cs')
& $csc /nologo /platform:x64 "/out:$(Join-Path $stage 'extractors\SolidWorksDocumentManagerPreviewExporter.exe')" `
  /reference:Microsoft.CSharp.dll `
  (Join-Path $root 'scripts\solidworks-document-manager-preview-exporter.cs')
& $csc /nologo /platform:x64 "/out:$(Join-Path $stage 'extractors\SolidWorksDocumentManagerCredentialProbe.exe')" `
  /reference:Microsoft.CSharp.dll `
  (Join-Path $root 'scripts\solidworks-document-manager-credential-probe.cs')

$installerName = "AI-PDM-Windows-Setup-$Version.exe"
$installerPath = Join-Path $downloadDirectory $installerName
& $makensis /INPUTCHARSET UTF8 "/DSTAGE=$stage" "/DOUTPUT=$installerPath" "/DPRODUCT_VERSION=$Version" `
  (Join-Path $root 'windows-service\installer\AI-PDM-Windows-Setup.nsi')
if (-not (Test-Path -LiteralPath $installerPath)) { throw 'DEV125_INSTALLER_BUILD_FAILED' }

$manifest = [ordered]@{
  contractVersion = 'ai-pdm.windows-service-installer.v1'
  sourceRevision = $SourceRevision
  version = $Version
  protocolVersion = 1
  fileName = $installerName
  sha256 = Get-Sha256 $installerPath
  size = (Get-Item -LiteralPath $installerPath).Length
}
Write-Utf8NoBom (Join-Path $downloadDirectory 'manifest.json') ($manifest | ConvertTo-Json -Compress)

$stagePrefix = $stage.TrimEnd('\') + '\'
$fileInventory = Get-ChildItem -LiteralPath $stage -File -Recurse | Sort-Object FullName | ForEach-Object {
  [ordered]@{
    path = $_.FullName.Substring($stagePrefix.Length).Replace('\','/')
    sha256 = Get-Sha256 $_.FullName
    size = $_.Length
  }
}
[ordered]@{
  contractVersion = 'ai-pdm.windows-service-build-evidence.v1'
  sourceRevision = $SourceRevision
  product = $product
  installer = $manifest
  files = @($fileInventory)
} | ConvertTo-Json -Depth 10 | ForEach-Object { Write-Utf8NoBom (Join-Path $output 'build-evidence.json') $_ }

Write-Output (ConvertTo-Json ([ordered]@{
  status = 'PASS'
  installer = $installerPath
  manifest = (Join-Path $downloadDirectory 'manifest.json')
  buildEvidence = (Join-Path $output 'build-evidence.json')
  sha256 = $manifest.sha256
  size = $manifest.size
}) -Compress)
