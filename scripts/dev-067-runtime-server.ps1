$ErrorActionPreference = "Stop"
$port = 3001
$env:PDM_AUTH_MODE = "demo"
$env:PDM_UNIFIED_ENTITY_DETAIL_V1 = "true"
$env:PDM_UNIFIED_DRAWING_WORKBENCH_V1 = "true"
$env:PDM_UNIFIED_PART_RELATION_WORKBENCH_V1 = "true"
$env:PDM_NEXT_DIST_DIR = ".next-dev067"
$runtimeDir = Join-Path (Get-Location) "output/playwright/dev-067-runtime"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$server = Start-Process -FilePath "node.exe" -ArgumentList @("node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", [string]$port) -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir "server-live.out.log") -RedirectStandardError (Join-Path $runtimeDir "server-live.err.log")
Set-Content -LiteralPath (Join-Path $runtimeDir "server-live.pid") -Value ([string]$server.Id) -Encoding ascii
try { Wait-Process -Id $server.Id }
finally { Remove-Item -LiteralPath (Join-Path $runtimeDir "server-live.pid") -ErrorAction SilentlyContinue }
