param(
  [int]$Port = 55439,
  [switch]$Dev095Retirement,
  [switch]$CleanupOnly
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$postgresBin = "C:\Program Files\PostgreSQL\18\bin"
$initDb = Join-Path $postgresBin "initdb.exe"
$pgCtl = Join-Path $postgresBin "pg_ctl.exe"
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$qcRoot = Join-Path $tempRoot ("ai-pdm-postgres-fmea-" + [guid]::NewGuid().ToString("N"))
$clusterDir = Join-Path $qcRoot "cluster"
$repositoryDir = Join-Path $qcRoot "repository"
$serverLog = Join-Path $qcRoot "postgres.log"
$started = $false
$pgCtlLauncher = $null

function Remove-QcRoot([string]$TargetRoot) {
  $resolvedTarget = [System.IO.Path]::GetFullPath($TargetRoot)
  if (-not $resolvedTarget.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
      $resolvedTarget -eq $tempRoot -or
      -not (Split-Path -Leaf $resolvedTarget).StartsWith("ai-pdm-postgres-fmea-")) {
    throw "Unsafe Postgres QC cleanup target: $resolvedTarget"
  }
  Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
}

if ($CleanupOnly) {
  $targets = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter "ai-pdm-postgres-fmea-*" -ErrorAction SilentlyContinue)
  foreach ($target in $targets) {
    $postmasterPidPath = Join-Path $target.FullName "cluster\postmaster.pid"
    if (Test-Path -LiteralPath $postmasterPidPath) {
      $postmasterProcessId = [int](Get-Content -LiteralPath $postmasterPidPath -First 1)
      if (Get-Process -Id $postmasterProcessId -ErrorAction SilentlyContinue) {
        throw "Refusing to clean running Postgres QC cluster PID $postmasterProcessId at $($target.FullName)"
      }
    }
    Remove-QcRoot -TargetRoot $target.FullName
  }
  Write-Host "Removed $($targets.Count) stale Postgres QC temp directories."
  exit 0
}

try {
  if (-not (Test-Path -LiteralPath $initDb) -or -not (Test-Path -LiteralPath $pgCtl)) {
    throw "PostgreSQL 18 initdb/pg_ctl tools are unavailable"
  }
  $owner = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($owner) { throw "Port $Port is already owned by PID $($owner.OwningProcess)" }

  New-Item -ItemType Directory -Path $qcRoot, $repositoryDir -Force | Out-Null
  Write-Host "Postgres QC: initializing isolated cluster"
  & $initDb -D $clusterDir --auth-local=trust --auth-host=trust --username=postgres --encoding=UTF8 --no-locale | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "initdb failed with exit code $LASTEXITCODE" }
  $pgCtlLauncher = Start-Process `
    -FilePath $pgCtl `
    -ArgumentList @("-D", "`"$clusterDir`"", "-l", "`"$serverLog`"", "-o", "`"-p $Port -h 127.0.0.1`"", "-w", "start") `
    -WindowStyle Hidden `
    -PassThru
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    Start-Sleep -Milliseconds 500
    & (Join-Path $postgresBin "psql.exe") -w -h 127.0.0.1 -p $Port -U postgres -d postgres -Atqc "SELECT 1" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    if ($pgCtlLauncher.HasExited -and $pgCtlLauncher.ExitCode -ne 0) { break }
  }
  if (-not $ready) {
    $serverLogTail = (Get-Content -LiteralPath $serverLog -Tail 60 -ErrorAction SilentlyContinue) -join "`n"
    throw "pg_ctl start did not produce a ready isolated server. $serverLogTail"
  }
  $started = $true
  Write-Host "Postgres QC: isolated cluster ready"

  $env:PDM_POSTGRES_URL = "postgresql://postgres@127.0.0.1:$Port/postgres"
  $env:PDM_QC_REPOSITORY_DIR = $repositoryDir
  $env:PDM_REPOSITORY_DIR = $repositoryDir
  $env:PDM_MAX_UPLOAD_FILE_BYTES = [string](10 * 1024 * 1024)

  Write-Host "Postgres QC: running live provider probe"
  & node (Join-Path $projectRoot "scripts\qc-db-provider-postgres.mjs")
  if ($LASTEXITCODE -ne 0) { throw "Postgres provider live probe failed with exit code $LASTEXITCODE" }

  if ($Dev095Retirement) {
    Write-Host "Postgres QC: running DEV-095 full migration retirement rehearsal"
    & node (Join-Path $projectRoot "scripts\qc-dev-095-postgres-retirement.mjs")
    if ($LASTEXITCODE -ne 0) { throw "DEV-095 Postgres retirement rehearsal failed with exit code $LASTEXITCODE" }
  }
}
finally {
  if ($started) {
    Write-Host "Postgres QC: stopping isolated cluster"
    & $pgCtl -D $clusterDir -m fast -w stop | Out-Null
  }
  if ($pgCtlLauncher -and -not $pgCtlLauncher.HasExited) {
    Stop-Process -Id $pgCtlLauncher.Id -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $qcRoot) {
    for ($attempt = 0; $attempt -lt 10 -and (Test-Path -LiteralPath $qcRoot); $attempt += 1) {
      try {
        Remove-QcRoot -TargetRoot $qcRoot
      }
      catch {
        if ($attempt -eq 9) { Write-Warning "Postgres QC temp cleanup failed: $qcRoot ($($_.Exception.Message))" }
        else { Start-Sleep -Milliseconds 200 }
      }
    }
  }
}
