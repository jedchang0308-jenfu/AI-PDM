param(
  [int]$Port = 3000,
  [int]$MaxUploadBytes = 1024,
  [int]$TimeoutSeconds = 90,
  [switch]$CleanupOnly
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$qcRoot = Join-Path $tempRoot ("ai-pdm-system-health-http-" + [guid]::NewGuid().ToString("N"))
$workspaceDir = Join-Path $qcRoot "workspace"
$dataDir = Join-Path $qcRoot "data"
$repositoryDir = Join-Path $qcRoot "repository"
$stdoutLog = Join-Path $qcRoot "server.out.log"
$stderrLog = Join-Path $qcRoot "server.err.log"
$launcher = $null
$serverProcessId = $null

function Get-PortOwner {
  return Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Get-CommandLine([int]$ProcessId) {
  return (Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue).CommandLine
}

function Get-DescendantProcessIds([int]$RootProcessId) {
  $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $pending = [System.Collections.Generic.Queue[int]]::new()
  $pending.Enqueue($RootProcessId)
  $descendants = [System.Collections.Generic.List[int]]::new()
  while ($pending.Count -gt 0) {
    $parentId = $pending.Dequeue()
    foreach ($process in $processes | Where-Object { $_.ParentProcessId -eq $parentId }) {
      $childId = [int]$process.ProcessId
      $descendants.Add($childId)
      $pending.Enqueue($childId)
    }
  }
  return @($descendants)
}

function Remove-QcRoot([string]$TargetRoot) {
  $resolvedTarget = [System.IO.Path]::GetFullPath($TargetRoot)
  if (-not $resolvedTarget.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
      $resolvedTarget -eq $tempRoot -or
      -not (Split-Path -Leaf $resolvedTarget).StartsWith("ai-pdm-system-health-http-")) {
    throw "Unsafe QC cleanup target: $resolvedTarget"
  }
  $nodeModulesJunction = Join-Path $resolvedTarget "workspace\node_modules"
  if (Test-Path -LiteralPath $nodeModulesJunction) {
    [System.IO.Directory]::Delete($nodeModulesJunction)
  }
  Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
}

if ($CleanupOnly) {
  $targets = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter "ai-pdm-system-health-http-*" -ErrorAction SilentlyContinue)
  foreach ($target in $targets) {
    Remove-QcRoot -TargetRoot $target.FullName
  }
  Write-Host "Removed $($targets.Count) stale System Health HTTP QC temp directories."
  exit 0
}

try {
  $existingOwner = Get-PortOwner
  if ($existingOwner) {
    $existingCommand = Get-CommandLine -ProcessId $existingOwner.OwningProcess
    throw "Port $Port is already owned by PID $($existingOwner.OwningProcess): $existingCommand"
  }

  New-Item -ItemType Directory -Path $workspaceDir, $dataDir, $repositoryDir -Force | Out-Null
  foreach ($directoryName in @("src", "db", "scripts", "public")) {
    $sourceDirectory = Join-Path $projectRoot $directoryName
    if (Test-Path -LiteralPath $sourceDirectory) {
      Copy-Item -LiteralPath $sourceDirectory -Destination $workspaceDir -Recurse -Force
    }
  }
  foreach ($filename in @("package.json", "package-lock.json", "next.config.mjs", "next-env.d.ts", "tsconfig.json")) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $filename) -Destination (Join-Path $workspaceDir $filename) -Force
  }
  New-Item -ItemType Junction -Path (Join-Path $workspaceDir "node_modules") -Target (Join-Path $projectRoot "node_modules") | Out-Null
  $env:PDM_DB_PROVIDER = "sqlite"
  $env:PDM_DATA_DIR = $dataDir
  $env:PDM_REPOSITORY_DIR = $repositoryDir
  $env:PDM_MAX_UPLOAD_FILE_BYTES = [string]$MaxUploadBytes
  $env:PDM_LOCAL_FULL_FUNCTION_VALIDATION = "true"
  $env:PDM_QC_DATA_DIR = $dataDir
  $env:PDM_QC_REPOSITORY_DIR = $repositoryDir
  $env:PDM_QC_MAX_UPLOAD_BYTES = [string]$MaxUploadBytes
  $env:PDM_BASE_URL = "http://127.0.0.1:$Port"
  $env:NEXT_TELEMETRY_DISABLED = "1"

  Push-Location $workspaceDir
  try {
    & node (Join-Path $workspaceDir "scripts\init-db.mjs") | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "QC database initialization failed with exit code $LASTEXITCODE" }
    & node (Join-Path $workspaceDir "scripts\seed.mjs") | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "QC database seed failed with exit code $LASTEXITCODE" }
  }
  finally {
    Pop-Location
  }

  $launcher = Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList @("run", "dev:server", "--", "--webpack") `
    -WorkingDirectory $workspaceDir `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $ready = $false
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 500
    try {
      $response = Invoke-WebRequest -Uri "$($env:PDM_BASE_URL)/login" -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -eq 200) {
        $ready = $true
        break
      }
    }
    catch {}
    if ($launcher.HasExited) { break }
  }

  if (-not $ready) {
    $stdoutTail = (Get-Content -LiteralPath $stdoutLog -Tail 80 -ErrorAction SilentlyContinue) -join "`n"
    $stderrTail = (Get-Content -LiteralPath $stderrLog -Tail 40 -ErrorAction SilentlyContinue) -join "`n"
    throw "QC server failed to start within $TimeoutSeconds seconds. stdout: $stdoutTail stderr: $stderrTail"
  }

  $owner = Get-PortOwner
  if ($owner) {
    $serverProcessId = [int]$owner.OwningProcess
  }
  else {
    $serverProcessId = @(Get-DescendantProcessIds -RootProcessId $launcher.Id | Select-Object -Last 1)[0]
  }
  $serverCommand = if ($serverProcessId) { Get-CommandLine -ProcessId $serverProcessId } else { $null }
  if (-not $serverProcessId -or -not $serverCommand) {
    throw "QC server responded but its child process could not be identified"
  }

  & node (Join-Path $workspaceDir "scripts\qc-system-health-phase6-8-http.mjs")
  if ($LASTEXITCODE -ne 0) {
    $stderrTail = (Get-Content -LiteralPath $stderrLog -Tail 80 -ErrorAction SilentlyContinue) -join "`n"
    throw "QC HTTP runner failed with exit code $LASTEXITCODE. Server stderr: $stderrTail"
  }
}
finally {
  if ($launcher) {
    $descendants = @(Get-DescendantProcessIds -RootProcessId $launcher.Id)
    [array]::Reverse($descendants)
    foreach ($descendantId in $descendants) {
      Stop-Process -Id $descendantId -Force -ErrorAction SilentlyContinue
    }
  }
  if ($launcher -and -not $launcher.HasExited) {
    Stop-Process -Id $launcher.Id -Force -ErrorAction SilentlyContinue
  }

  $resolvedQcRoot = [System.IO.Path]::GetFullPath($qcRoot)
  if ($resolvedQcRoot.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
      $resolvedQcRoot -ne $tempRoot -and
      (Split-Path -Leaf $resolvedQcRoot).StartsWith("ai-pdm-system-health-http-")) {
    for ($cleanupAttempt = 0; $cleanupAttempt -lt 10 -and (Test-Path -LiteralPath $resolvedQcRoot); $cleanupAttempt += 1) {
      try {
        Remove-QcRoot -TargetRoot $resolvedQcRoot
      }
      catch {
        if ($cleanupAttempt -eq 9) { Write-Warning "QC temp cleanup failed: $resolvedQcRoot ($($_.Exception.Message))" }
        else { Start-Sleep -Milliseconds 200 }
      }
    }
  }
}
