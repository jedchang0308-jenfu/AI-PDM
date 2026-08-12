$ErrorActionPreference = "Stop"
$runtimeDir = Join-Path (Get-Location) "output/playwright/dev-067-runtime"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$env:PDM_AUTH_MODE = "demo"
$env:PDM_DATA_DIR = Join-Path (Get-Location) ".tmp/dev067-browser-data"
$env:PDM_LOCAL_FULL_FUNCTION_VALIDATION = "true"
$env:PDM_UNIFIED_ENTITY_DETAIL_V1 = "true"
$env:PDM_UNIFIED_DRAWING_WORKBENCH_V1 = "true"
$env:PDM_UNIFIED_PART_RELATION_WORKBENCH_V1 = "true"
$env:PDM_NEXT_DIST_DIR = ".next-dev067-runtime"
$server = Start-Process -FilePath "node.exe" -ArgumentList @("node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3001") -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir "server-fixture-live.out.log") -RedirectStandardError (Join-Path $runtimeDir "server-fixture-live.err.log")
Set-Content -LiteralPath (Join-Path $runtimeDir "server-fixture.pid") -Value ([string]$server.Id) -Encoding ascii
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 45; $attempt++) {
    try { $status = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3001/api/numbering/state-flow/status" -TimeoutSec 2; if ($status.StatusCode -eq 200) { $ready = $true; break } } catch { Start-Sleep -Seconds 1 }
  }
  if (-not $ready) { Get-Content (Join-Path $runtimeDir "server-fixture-live.err.log") -ErrorAction SilentlyContinue | Select-Object -Last 40; throw "DEV-067 fixture server did not become ready." }
  Write-Output $status.Content
  Wait-Process -Id $server.Id
} finally {
  if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath (Join-Path $runtimeDir "server-fixture.pid") -ErrorAction SilentlyContinue
}
