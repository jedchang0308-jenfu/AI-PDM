param(
  [switch]$NoBrowser,
  [switch]$RestartProjectProcess,
  [switch]$StopForeignProcess,
  [switch]$CleanNext,
  [switch]$CheckOnly,
  [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BindHost = "127.0.0.1"
$PublicHost = "localhost"
$Port = 3000
$Url = "http://${PublicHost}:$Port/"
$ProjectRootLower = $ProjectRoot.ToLowerInvariant()
$RuntimeDir = Join-Path $ProjectRoot "tmp\local-dev"
$PidFile = Join-Path $RuntimeDir "ai-pdm-3000.pid"
$PortOwnerPidFile = Join-Path $RuntimeDir "ai-pdm-3000.port-owner.pid"
$StatusFile = Join-Path $RuntimeDir "ai-pdm-3000.status.json"
$StdoutLog = Join-Path $RuntimeDir "ai-pdm-3000.out.log"
$StderrLog = Join-Path $RuntimeDir "ai-pdm-3000.err.log"
$PreviewWorkerPidFile = Join-Path $RuntimeDir "ai-pdm-preview-worker.pid"
$PreviewWorkerTokenFile = Join-Path $RuntimeDir "ai-pdm-preview-worker.token"
$PreviewWorkerStdoutLog = Join-Path $RuntimeDir "ai-pdm-preview-worker.out.log"
$PreviewWorkerStderrLog = Join-Path $RuntimeDir "ai-pdm-preview-worker.err.log"
$PreviewWorkerScript = Join-Path $ProjectRoot "scripts\run-windows-shell-preview-worker.mjs"
$RecognitionWorkerPidFile = Join-Path $RuntimeDir "ai-pdm-recognition-worker.pid"
$RecognitionWorkerTokenFile = Join-Path $RuntimeDir "ai-pdm-recognition-worker.token"
$RecognitionWorkerStdoutLog = Join-Path $RuntimeDir "ai-pdm-recognition-worker.out.log"
$RecognitionWorkerStderrLog = Join-Path $RuntimeDir "ai-pdm-recognition-worker.err.log"
$RecognitionWorkerScript = Join-Path $ProjectRoot "scripts\run-drawing-recognition-worker.mjs"
$DocumentManagerPreviewWorkerPidFile = Join-Path $RuntimeDir "ai-pdm-document-manager-preview-worker.pid"
$DocumentManagerPreviewWorkerStdoutLog = Join-Path $RuntimeDir "ai-pdm-document-manager-preview-worker.out.log"
$DocumentManagerPreviewWorkerStderrLog = Join-Path $RuntimeDir "ai-pdm-document-manager-preview-worker.err.log"
$DocumentManagerPreviewWorkerScript = Join-Path $ProjectRoot "scripts\run-solidworks-document-manager-preview-worker.mjs"
$env:PDM_UNIFIED_PART_RELATION_WORKBENCH_V1 = "true"
$env:PDM_WORKBENCH_PRODUCTION_RD_LANES_V1 = "true"
$HealthChecks = @(
  @{ Path = "/"; Expected = @(200, 301, 302, 307, 308) },
  @{ Path = "/login"; Expected = @(200, 301, 302, 307, 308) },
  @{ Path = "/api/auth/me"; Expected = @(200, 401) },
  @{ Path = "/api/numbering/state-flow/status"; Expected = @(200); RequireUnifiedPartRelationWorkbench = $true }
)

function Ensure-RuntimeDir {
  New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
}

function Ensure-PreviewWorkerToken {
  if ($env:PDM_PREVIEW_WORKER_TOKEN -and $env:PDM_PREVIEW_WORKER_TOKEN.Trim().Length -ge 32) {
    return
  }

  if (Test-Path -LiteralPath $PreviewWorkerTokenFile) {
    $storedToken = (Get-Content -LiteralPath $PreviewWorkerTokenFile -Raw).Trim()
    if ($storedToken.Length -ge 32) {
      $env:PDM_PREVIEW_WORKER_TOKEN = $storedToken
      return
    }
  }

  $bytes = New-Object byte[] 32
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  }
  finally {
    $generator.Dispose()
  }
  $token = -join ($bytes | ForEach-Object { $_.ToString("x2") })
  Set-Content -LiteralPath $PreviewWorkerTokenFile -Value $token -Encoding ascii
  $env:PDM_PREVIEW_WORKER_TOKEN = $token
}

function Ensure-RecognitionWorkerToken {
  if ($env:PDM_DRAWING_RECOGNITION_WORKER_TOKEN -and $env:PDM_DRAWING_RECOGNITION_WORKER_TOKEN.Trim().Length -ge 32) {
    return
  }

  $localEnvFile = Join-Path $ProjectRoot ".env.local"
  if (Test-Path -LiteralPath $localEnvFile) {
    $line = Get-Content -LiteralPath $localEnvFile -ErrorAction SilentlyContinue | Where-Object { $_ -match '^PDM_DRAWING_RECOGNITION_WORKER_TOKEN=(.+)$' } | Select-Object -First 1
    if ($line -and $line -match '^PDM_DRAWING_RECOGNITION_WORKER_TOKEN=(.+)$') {
      $localToken = $Matches[1].Trim()
      if ($localToken.Length -ge 32) {
        $env:PDM_DRAWING_RECOGNITION_WORKER_TOKEN = $localToken
        return
      }
    }
  }

  if (Test-Path -LiteralPath $RecognitionWorkerTokenFile) {
    $storedToken = (Get-Content -LiteralPath $RecognitionWorkerTokenFile -Raw).Trim()
    if ($storedToken.Length -ge 32) {
      $env:PDM_DRAWING_RECOGNITION_WORKER_TOKEN = $storedToken
      return
    }
  }

  $bytes = New-Object byte[] 32
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  }
  finally {
    $generator.Dispose()
  }
  $token = -join ($bytes | ForEach-Object { $_.ToString("x2") })
  Set-Content -LiteralPath $RecognitionWorkerTokenFile -Value $token -Encoding ascii
  $env:PDM_DRAWING_RECOGNITION_WORKER_TOKEN = $token
}

function Test-DocumentManagerPreviewKeyConfigured {
  $keyCandidates = @(
    $env:PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY,
    $env:PDM_SW_DOCUMENT_MANAGER_LICENSE_KEY,
    $env:SOLIDWORKS_DOCUMENT_MANAGER_KEY
  )
  foreach ($candidate in $keyCandidates) {
    if ($candidate -and $candidate.Trim().Length -gt 0) {
      return $true
    }
  }
  return ($env:PDM_SETTINGS_SECRET_PROVIDER -eq "google_secret_manager" -and
    $env:PDM_GCP_PROJECT_ID -and
    $env:PDM_SOLIDWORKS_DOCUMENT_MANAGER_SECRET_ID -and
    $env:PDM_ENABLE_GCP_SECRET_READS -eq "true")
}

function Test-DocumentManagerInteropConfigured {
  $interopDir = if ($env:PDM_SOLIDWORKS_INTEROP_DIR) { $env:PDM_SOLIDWORKS_INTEROP_DIR } else { "C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\api\redist" }
  return (Test-Path -LiteralPath (Join-Path $interopDir "SolidWorks.Interop.swdocumentmgr.dll")) -and
    (Test-Path -LiteralPath (Join-Path $interopDir "SolidWorks.Interop.swconst.dll"))
}

function Get-PreviewWorkerProcessInfo {
  if (-not (Test-Path -LiteralPath $PreviewWorkerPidFile)) {
    return $null
  }

  try {
    $workerProcessId = [int](Get-Content -LiteralPath $PreviewWorkerPidFile -Raw).Trim()
  }
  catch {
    Remove-Item -LiteralPath $PreviewWorkerPidFile -ErrorAction SilentlyContinue
    return $null
  }

  $processInfo = Get-OwnerProcessInfo -OwnerProcessId $workerProcessId
  if (-not $processInfo -or -not $processInfo.CommandLine) {
    Remove-Item -LiteralPath $PreviewWorkerPidFile -ErrorAction SilentlyContinue
    return $null
  }

  $commandLine = $processInfo.CommandLine.ToLowerInvariant()
  if (-not $commandLine.Contains($ProjectRootLower) -or -not $commandLine.Contains("run-windows-shell-preview-worker.mjs")) {
    Remove-Item -LiteralPath $PreviewWorkerPidFile -ErrorAction SilentlyContinue
    return $null
  }

  return $processInfo
}

function Stop-PreviewWorker {
  $processInfo = Get-PreviewWorkerProcessInfo
  if ($processInfo) {
    Write-Host "Stopping AI_PDM preview worker PID $($processInfo.ProcessId)."
    Stop-Process -Id $processInfo.ProcessId -Force
  }
  Remove-Item -LiteralPath $PreviewWorkerPidFile -ErrorAction SilentlyContinue
  Stop-DocumentManagerPreviewWorker
  Stop-RecognitionWorker
}

function Get-RecognitionWorkerProcessInfo {
  if (-not (Test-Path -LiteralPath $RecognitionWorkerPidFile)) {
    return $null
  }

  try {
    $workerProcessId = [int](Get-Content -LiteralPath $RecognitionWorkerPidFile -Raw).Trim()
  }
  catch {
    Remove-Item -LiteralPath $RecognitionWorkerPidFile -ErrorAction SilentlyContinue
    return $null
  }

  $processInfo = Get-OwnerProcessInfo -OwnerProcessId $workerProcessId
  if (-not $processInfo -or -not $processInfo.CommandLine) {
    Remove-Item -LiteralPath $RecognitionWorkerPidFile -ErrorAction SilentlyContinue
    return $null
  }

  $commandLine = $processInfo.CommandLine.ToLowerInvariant()
  if (-not $commandLine.Contains($ProjectRootLower) -or -not $commandLine.Contains("run-drawing-recognition-worker.mjs")) {
    Remove-Item -LiteralPath $RecognitionWorkerPidFile -ErrorAction SilentlyContinue
    return $null
  }

  return $processInfo
}

function Stop-RecognitionWorker {
  $processInfo = Get-RecognitionWorkerProcessInfo
  if ($processInfo) {
    Write-Host "Stopping AI_PDM recognition worker PID $($processInfo.ProcessId)."
    Stop-Process -Id $processInfo.ProcessId -Force
  }
  Remove-Item -LiteralPath $RecognitionWorkerPidFile -ErrorAction SilentlyContinue
}

function Start-RecognitionWorker {
  $existing = Get-RecognitionWorkerProcessInfo
  if ($existing) {
    return $existing
  }

  Ensure-RecognitionWorkerToken
  Ensure-PreviewWorkerToken
  if ((Test-DocumentManagerInteropConfigured) -and (-not $env:PDM_DRAWING_RECOGNITION_METADATA_CMD)) {
    $env:PDM_DRAWING_RECOGNITION_METADATA_CMD = "node.exe"
    $env:PDM_DRAWING_RECOGNITION_METADATA_ARGS = '["--experimental-transform-types","scripts/run-solidworks-document-manager-metadata-extractor.mjs"]'
  }
  if ((Test-DocumentManagerInteropConfigured) -and (-not $env:PDM_SOLIDWORKS_DOCUMENT_MANAGER_PROBE_CMD)) {
    $env:PDM_SOLIDWORKS_DOCUMENT_MANAGER_PROBE_CMD = "node.exe"
    $env:PDM_SOLIDWORKS_DOCUMENT_MANAGER_PROBE_ARGS = '["scripts/run-solidworks-document-manager-credential-probe.mjs"]'
  }
  $env:PDM_DRAWING_RECOGNITION_WORKER_BASE_URL = $Url
  Remove-Item -LiteralPath $RecognitionWorkerStdoutLog, $RecognitionWorkerStderrLog, $RecognitionWorkerPidFile -ErrorAction SilentlyContinue
  $worker = Start-Process `
    -FilePath "node.exe" `
    -ArgumentList @("--experimental-transform-types", "`"$RecognitionWorkerScript`"", "--worker-id", "local-drawing-recognition-worker") `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput $RecognitionWorkerStdoutLog `
    -RedirectStandardError $RecognitionWorkerStderrLog

  Set-Content -LiteralPath $RecognitionWorkerPidFile -Value ([string]$worker.Id) -Encoding ascii
  Start-Sleep -Milliseconds 1500
  if ($worker.HasExited) {
    Write-Host "Recognition worker exited during startup."
    Get-Content -LiteralPath $RecognitionWorkerStderrLog -ErrorAction SilentlyContinue | Select-Object -Last 20
    Remove-Item -LiteralPath $RecognitionWorkerPidFile -ErrorAction SilentlyContinue
    throw "AI_PDM recognition worker did not start. Check the worker token and recognition worker logs."
  }

  Write-Host "Recognition worker is running (PID $($worker.Id))."
  return Get-RecognitionWorkerProcessInfo
}

function Start-PreviewWorker {
  $existing = Get-PreviewWorkerProcessInfo
  if ($existing) {
    return $existing
  }

  Ensure-PreviewWorkerToken
  Remove-Item -LiteralPath $PreviewWorkerStdoutLog, $PreviewWorkerStderrLog, $PreviewWorkerPidFile -ErrorAction SilentlyContinue
  $worker = Start-Process `
    -FilePath "node.exe" `
    -ArgumentList @("`"$PreviewWorkerScript`"", "--watch", "--models-only", "--worker-id", "windows-shell-thumbnail-worker") `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput $PreviewWorkerStdoutLog `
    -RedirectStandardError $PreviewWorkerStderrLog

  Set-Content -LiteralPath $PreviewWorkerPidFile -Value ([string]$worker.Id) -Encoding ascii
  Start-Sleep -Milliseconds 1500
  if ($worker.HasExited) {
    Write-Host "Preview worker exited during startup."
    Get-Content -LiteralPath $PreviewWorkerStderrLog -ErrorAction SilentlyContinue | Select-Object -Last 20
    Remove-Item -LiteralPath $PreviewWorkerPidFile -ErrorAction SilentlyContinue
    throw "AI_PDM preview worker did not start. Restart the local server so the server and worker share the local service token."
  }

  Write-Host "Preview worker is running (PID $($worker.Id))."
  return Get-PreviewWorkerProcessInfo
}

function Get-DocumentManagerPreviewWorkerProcessInfo {
  if (-not (Test-Path -LiteralPath $DocumentManagerPreviewWorkerPidFile)) {
    return $null
  }

  try {
    $workerProcessId = [int](Get-Content -LiteralPath $DocumentManagerPreviewWorkerPidFile -Raw).Trim()
  }
  catch {
    Remove-Item -LiteralPath $DocumentManagerPreviewWorkerPidFile -ErrorAction SilentlyContinue
    return $null
  }

  $processInfo = Get-OwnerProcessInfo -OwnerProcessId $workerProcessId
  if (-not $processInfo -or -not $processInfo.CommandLine) {
    Remove-Item -LiteralPath $DocumentManagerPreviewWorkerPidFile -ErrorAction SilentlyContinue
    return $null
  }

  $commandLine = $processInfo.CommandLine.ToLowerInvariant()
  if (-not $commandLine.Contains($ProjectRootLower) -or -not $commandLine.Contains("run-solidworks-document-manager-preview-worker.mjs")) {
    Remove-Item -LiteralPath $DocumentManagerPreviewWorkerPidFile -ErrorAction SilentlyContinue
    return $null
  }

  return $processInfo
}

function Stop-DocumentManagerPreviewWorker {
  $processInfo = Get-DocumentManagerPreviewWorkerProcessInfo
  if ($processInfo) {
    Write-Host "Stopping AI_PDM 2D preview worker PID $($processInfo.ProcessId)."
    Stop-Process -Id $processInfo.ProcessId -Force
  }
  Remove-Item -LiteralPath $DocumentManagerPreviewWorkerPidFile -ErrorAction SilentlyContinue
}

function Start-DocumentManagerPreviewWorker {
  $existing = Get-DocumentManagerPreviewWorkerProcessInfo
  if ($existing) {
    return $existing
  }

  Remove-Item -LiteralPath $DocumentManagerPreviewWorkerPidFile -ErrorAction SilentlyContinue
  if (-not (Test-DocumentManagerInteropConfigured)) {
    Write-Host "2D preview worker is not configured: SolidWorks Document Manager interop DLLs are unavailable."
    return $null
  }

  Ensure-PreviewWorkerToken
  Remove-Item -LiteralPath $DocumentManagerPreviewWorkerStdoutLog, $DocumentManagerPreviewWorkerStderrLog -ErrorAction SilentlyContinue
  $worker = Start-Process `
    -FilePath "node.exe" `
    -ArgumentList @("`"$DocumentManagerPreviewWorkerScript`"", "--watch", "--poll-ms", "2000", "--worker-id", "solidworks-document-manager-preview-worker") `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput $DocumentManagerPreviewWorkerStdoutLog `
    -RedirectStandardError $DocumentManagerPreviewWorkerStderrLog

  Set-Content -LiteralPath $DocumentManagerPreviewWorkerPidFile -Value ([string]$worker.Id) -Encoding ascii
  Start-Sleep -Milliseconds 1500
  if ($worker.HasExited) {
    Write-Host "2D preview worker exited during startup."
    Get-Content -LiteralPath $DocumentManagerPreviewWorkerStderrLog -ErrorAction SilentlyContinue | Select-Object -Last 20
    Remove-Item -LiteralPath $DocumentManagerPreviewWorkerPidFile -ErrorAction SilentlyContinue
    return $null
  }

  Write-Host "2D preview worker is running (PID $($worker.Id))."
  return Get-DocumentManagerPreviewWorkerProcessInfo
}

function Get-DocumentManagerPreviewWorkerState {
  if (Get-DocumentManagerPreviewWorkerProcessInfo) {
    return "running"
  }
  if (Test-DocumentManagerInteropConfigured) {
    return "not_running"
  }
  return "not_configured"
}

function Get-PortListeners {
  @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Get-OwnerProcessInfo {
  param([int]$OwnerProcessId)

  Get-CimInstance Win32_Process -Filter "ProcessId = $OwnerProcessId" -ErrorAction SilentlyContinue
}

function Test-IsProjectProcess {
  param($ProcessInfo)

  if (-not $ProcessInfo -or -not $ProcessInfo.CommandLine) {
    return $false
  }

  $commandLine = $ProcessInfo.CommandLine.ToLowerInvariant()
  return $commandLine.Contains($ProjectRootLower) -and ($commandLine.Contains("next") -or $commandLine.Contains("npm"))
}

function Test-LocalHttpHealth {
  $routeResults = @()
  $healthy = $true

  foreach ($check in $HealthChecks) {
    $routeUrl = "http://${BindHost}:$Port$($check.Path)"
    $statusCode = 0
    $errorText = ""
    $responseContent = ""

    try {
      $response = Invoke-WebRequest -Uri $routeUrl -UseBasicParsing -TimeoutSec 4
      $statusCode = [int]$response.StatusCode
      $responseContent = [string]$response.Content
    }
    catch {
      if ($_.Exception.Response) {
        try {
          $statusCode = [int]$_.Exception.Response.StatusCode
        }
        catch {
          $statusCode = 0
        }
      }
      $errorText = $_.Exception.Message
    }

    $expected = @($check.Expected)
    $routeHealthy = $expected -contains $statusCode
    if ($routeHealthy -and $check.RequireUnifiedPartRelationWorkbench) {
      try {
        $featureStatus = $responseContent | ConvertFrom-Json
        $routeHealthy = $featureStatus.partRelationWorkbench.enabled -eq $true
        if (-not $routeHealthy) {
          $errorText = "DEV-062 unified Part/Relation workbench is not enabled on the fixed local runtime."
        }
      }
      catch {
        $routeHealthy = $false
        $errorText = "DEV-062 feature status response is not valid JSON. $($_.Exception.Message)"
      }
    }
    if ($routeHealthy) {
      $errorText = ""
    }
    if (-not $routeHealthy) {
      $healthy = $false
    }

    $routeResults += [ordered]@{
      path = $check.Path
      statusCode = $statusCode
      expected = $expected
      healthy = $routeHealthy
      error = $errorText
    }
  }

  $firstFailure = $routeResults | Where-Object { -not $_.healthy } | Select-Object -First 1
  return @{
    Healthy = $healthy
    StatusCode = if ($firstFailure) { $firstFailure.statusCode } else { 200 }
    Error = if ($firstFailure) { "$($firstFailure.path) returned $($firstFailure.statusCode). $($firstFailure.error)" } else { "" }
    Routes = $routeResults
  }
}

function Write-RuntimeStatus {
  param(
    [string]$State,
    [int]$LauncherProcessId = 0,
    [int]$PortOwnerProcessId = 0,
    [int]$PreviewWorkerProcessId = 0,
    [int]$RecognitionWorkerProcessId = 0,
    $PortOwnerProcessInfo = $null,
    $Health = $null,
    [string]$Message = ""
  )

  $commandLine = if ($PortOwnerProcessInfo -and $PortOwnerProcessInfo.CommandLine) { $PortOwnerProcessInfo.CommandLine } else { "" }
  $processName = if ($PortOwnerProcessInfo -and $PortOwnerProcessInfo.Name) { $PortOwnerProcessInfo.Name } else { "" }
  $documentManagerPreviewWorker = Get-DocumentManagerPreviewWorkerProcessInfo
  $status = [ordered]@{
    app = "AI_PDM"
    port = $Port
    url = $Url
    state = $State
    launcherProcessId = $LauncherProcessId
    portOwnerProcessId = $PortOwnerProcessId
    portOwnerProcessName = $processName
    portOwnerCommandLine = $commandLine
    previewWorkerProcessId = $PreviewWorkerProcessId
    previewWorkerState = if ($PreviewWorkerProcessId -gt 0) { "running" } else { "not_running" }
    recognitionWorkerProcessId = $RecognitionWorkerProcessId
    recognitionWorkerState = if ($RecognitionWorkerProcessId -gt 0) { "running" } else { "not_running" }
    documentManagerPreviewWorkerProcessId = if ($documentManagerPreviewWorker) { [int]$documentManagerPreviewWorker.ProcessId } else { 0 }
    documentManagerPreviewWorkerState = Get-DocumentManagerPreviewWorkerState
    health = $Health
    message = $Message
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  }

  $status | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $StatusFile -Encoding utf8

  if ($PortOwnerProcessId -gt 0) {
    Set-Content -LiteralPath $PortOwnerPidFile -Value ([string]$PortOwnerProcessId) -Encoding utf8
  }
}

function Get-CurrentPortOwner {
  $listener = Get-PortListeners | Select-Object -First 1
  if (-not $listener) {
    return @{
      ProcessId = 0
      ProcessInfo = $null
    }
  }

  $processId = [int]$listener.OwningProcess
  return @{
    ProcessId = $processId
    ProcessInfo = Get-OwnerProcessInfo -OwnerProcessId $processId
  }
}

function Wait-PortReleased {
  $deadline = [DateTime]::UtcNow.AddSeconds(10)
  do {
    if ((Get-PortListeners).Count -eq 0) {
      return $true
    }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)

  return $false
}

function Open-LocalPage {
  if (-not $NoBrowser) {
    Start-Process $Url
  }
}

function Write-OwnerSummary {
  param(
    [int]$OwnerProcessId,
    $ProcessInfo
  )

  $processName = if ($ProcessInfo) { $ProcessInfo.Name } else { "unknown" }
  $commandLine = if ($ProcessInfo -and $ProcessInfo.CommandLine) { $ProcessInfo.CommandLine } else { "(command line unavailable)" }
  Write-Host "Port $Port owner: PID $OwnerProcessId ($processName)"
  Write-Host "Command: $commandLine"
}

function Invoke-CleanNext {
  if (-not $CleanNext) {
    return
  }

  Write-Host "Cleaning .next before local restart..."
  Push-Location $ProjectRoot
  try {
    & npm.cmd run clean:next
    if ($LASTEXITCODE -ne 0) {
      throw "npm run clean:next failed with exit code $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }
}

Ensure-RuntimeDir

$listeners = @(Get-PortListeners)
if ($listeners.Count -gt 0) {
  $ownerProcessId = ($listeners | Select-Object -First 1).OwningProcess
  $processInfo = Get-OwnerProcessInfo -OwnerProcessId $ownerProcessId
  $isProjectProcess = Test-IsProjectProcess -ProcessInfo $processInfo
  Write-OwnerSummary -OwnerProcessId $ownerProcessId -ProcessInfo $processInfo

  if ($isProjectProcess) {
    $health = Test-LocalHttpHealth
    if ($health.Healthy) {
      if ($CheckOnly) {
        $previewWorker = Get-PreviewWorkerProcessInfo
        if (-not $previewWorker) {
          Write-RuntimeStatus -State "degraded_existing" -PortOwnerProcessId $ownerProcessId -PortOwnerProcessInfo $processInfo -Health $health -Message "Website is healthy but the 3D preview worker is not running."
          Write-Error "AI_PDM website is healthy, but the 3D preview worker is not running. Run npm run dev:local:restart."
          exit 1
        }
        $recognitionWorker = Get-RecognitionWorkerProcessInfo
        if (-not $recognitionWorker) {
          Write-RuntimeStatus -State "degraded_existing" -PortOwnerProcessId $ownerProcessId -PreviewWorkerProcessId $previewWorker.ProcessId -PortOwnerProcessInfo $processInfo -Health $health -Message "Website and 3D worker are healthy, but the recognition worker is not running."
          Write-Error "AI_PDM website is healthy, but the recognition worker is not running. Run npm run dev:local."
          exit 1
        }
        $documentManagerPreviewWorker = Get-DocumentManagerPreviewWorkerProcessInfo
        if ((Test-DocumentManagerInteropConfigured) -and -not $documentManagerPreviewWorker) {
          Write-RuntimeStatus -State "degraded_existing" -PortOwnerProcessId $ownerProcessId -PreviewWorkerProcessId $previewWorker.ProcessId -RecognitionWorkerProcessId $recognitionWorker.ProcessId -PortOwnerProcessInfo $processInfo -Health $health -Message "Website, 3D worker, and recognition worker are healthy, but the configured 2D preview worker is not running."
          Write-Error "AI_PDM website is healthy, but the configured 2D preview worker is not running. Run npm run dev:local:restart."
          exit 1
        }
        Write-RuntimeStatus -State "healthy_existing" -PortOwnerProcessId $ownerProcessId -PreviewWorkerProcessId $previewWorker.ProcessId -RecognitionWorkerProcessId $recognitionWorker.ProcessId -PortOwnerProcessInfo $processInfo -Health $health -Message "Existing AI_PDM project server, preview workers, and recognition worker are healthy; 2D worker state is $(Get-DocumentManagerPreviewWorkerState)."
        Write-Host "AI_PDM is healthy."
        Write-Host "3D preview worker is running."
        Write-Host "Recognition worker is running."
        Write-Host "2D preview worker: $(Get-DocumentManagerPreviewWorkerState)."
        Write-Host "Local URL: $Url"
        exit 0
      }
      if (-not $RestartProjectProcess) {
        try {
          $previewWorker = Start-PreviewWorker
          $recognitionWorker = Start-RecognitionWorker
          $documentManagerPreviewWorker = Start-DocumentManagerPreviewWorker
        }
        catch {
          Write-RuntimeStatus -State "degraded_existing" -PortOwnerProcessId $ownerProcessId -PortOwnerProcessInfo $processInfo -Health $health -Message $_.Exception.Message
          Write-Error $_.Exception.Message
          exit 1
        }
        Write-RuntimeStatus -State "healthy_existing" -PortOwnerProcessId $ownerProcessId -PreviewWorkerProcessId $previewWorker.ProcessId -RecognitionWorkerProcessId $recognitionWorker.ProcessId -PortOwnerProcessInfo $processInfo -Health $health -Message "Existing AI_PDM project server and preview workers are healthy; recognition worker is running; 2D worker state is $(Get-DocumentManagerPreviewWorkerState)."
        Write-Host "AI_PDM is healthy."
        Write-Host "3D preview worker is running."
        Write-Host "Recognition worker is running."
        Write-Host "2D preview worker: $(Get-DocumentManagerPreviewWorkerState)."
        Write-Host "Local URL: $Url"
        Open-LocalPage
        exit 0
      }

      Stop-PreviewWorker
      Write-Host "Stopping healthy AI_PDM project process PID $ownerProcessId because -RestartProjectProcess was provided."
      Stop-Process -Id $ownerProcessId -Force
      if (-not (Wait-PortReleased)) {
        Write-Error "Port $Port did not release after stopping PID $ownerProcessId."
        exit 1
      }
    }
    else {
      Write-Host "AI_PDM is listening but unhealthy. Health status: $($health.StatusCode). $($health.Error)"
      Write-RuntimeStatus -State "unhealthy_existing" -PortOwnerProcessId $ownerProcessId -PortOwnerProcessInfo $processInfo -Health $health -Message "Existing AI_PDM project server is unhealthy."
      if (-not $RestartProjectProcess) {
        Write-Error "Run npm run dev:local:restart to stop the stale project process, clean .next, and start a healthy local server."
        exit 1
      }

      if ($CheckOnly) {
        Write-Error "CheckOnly detected unhealthy project server on $Url."
        exit 1
      }

      Stop-PreviewWorker
      Write-Host "Stopping stale AI_PDM project process PID $ownerProcessId because -RestartProjectProcess was provided."
      Stop-Process -Id $ownerProcessId -Force
      if (-not (Wait-PortReleased)) {
        Write-Error "Port $Port did not release after stopping PID $ownerProcessId."
        exit 1
      }
    }
  }
  else {
    if ($CheckOnly) {
      Write-Error "Port $Port is occupied by a non-project process."
      exit 1
    }

    if ($StopForeignProcess) {
      Write-Host "Stopping foreign process PID $ownerProcessId because -StopForeignProcess was provided."
      Stop-Process -Id $ownerProcessId -Force
      if (-not (Wait-PortReleased)) {
        Write-Error "Port $Port did not release after stopping PID $ownerProcessId."
        exit 1
      }
    }
    else {
      Write-RuntimeStatus -State "blocked_foreign_process" -PortOwnerProcessId $ownerProcessId -PortOwnerProcessInfo $processInfo -Message "Port $Port is occupied by a non-project process."
      Write-Error "Port $Port is occupied by a non-project process. Do not stop it without explicit approval."
      exit 1
    }
  }
}
elseif ($CheckOnly) {
  Write-Error "No local server is listening on $Url."
  exit 1
}

Invoke-CleanNext

Remove-Item -LiteralPath $StdoutLog, $StderrLog, $PidFile -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $PortOwnerPidFile, $StatusFile -ErrorAction SilentlyContinue

$env:PDM_LOCAL_FULL_FUNCTION_VALIDATION = "true"
Ensure-PreviewWorkerToken
Ensure-RecognitionWorkerToken
Write-Host "Starting AI_PDM local server..."
Write-Host "Local full-function validation is enabled; production slice settings remain production-only."
$process = Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList @("run", "dev:server") `
  -WorkingDirectory $ProjectRoot `
  -WindowStyle Hidden `
  -PassThru `
  -RedirectStandardOutput $StdoutLog `
  -RedirectStandardError $StderrLog

Set-Content -LiteralPath $PidFile -Value ([string]$process.Id) -Encoding utf8
Write-RuntimeStatus -State "starting" -LauncherProcessId $process.Id -Message "Launcher process started; waiting for health checks."
Write-Host "Started launcher PID $($process.Id). Logs:"
Write-Host "  stdout: $StdoutLog"
Write-Host "  stderr: $StderrLog"

$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
do {
  if ($process.HasExited) {
    Write-Host "Local dev process exited before becoming healthy."
    Write-Host "--- stdout ---"
    Get-Content -LiteralPath $StdoutLog -ErrorAction SilentlyContinue | Select-Object -Last 80
    Write-Host "--- stderr ---"
    Get-Content -LiteralPath $StderrLog -ErrorAction SilentlyContinue | Select-Object -Last 80
    exit 1
  }

  $health = Test-LocalHttpHealth
  if ($health.Healthy) {
    $owner = Get-CurrentPortOwner
    try {
      $previewWorker = Start-PreviewWorker
      $recognitionWorker = Start-RecognitionWorker
      $documentManagerPreviewWorker = Start-DocumentManagerPreviewWorker
    }
    catch {
      Write-RuntimeStatus -State "degraded_started" -LauncherProcessId $process.Id -PortOwnerProcessId $owner.ProcessId -PortOwnerProcessInfo $owner.ProcessInfo -Health $health -Message $_.Exception.Message
      Write-Error $_.Exception.Message
      exit 1
    }
    Write-RuntimeStatus -State "healthy_started" -LauncherProcessId $process.Id -PortOwnerProcessId $owner.ProcessId -PreviewWorkerProcessId $previewWorker.ProcessId -RecognitionWorkerProcessId $recognitionWorker.ProcessId -PortOwnerProcessInfo $owner.ProcessInfo -Health $health -Message "AI_PDM local server and preview workers started; recognition worker is running; 2D worker state is $(Get-DocumentManagerPreviewWorkerState). All health checks passed."
    Write-Host "AI_PDM is healthy."
    Write-Host "3D preview worker is running."
    Write-Host "Recognition worker is running."
    Write-Host "2D preview worker: $(Get-DocumentManagerPreviewWorkerState)."
    Write-Host "Local URL: $Url"
    Open-LocalPage
    exit 0
  }

  Start-Sleep -Milliseconds 500
} while ([DateTime]::UtcNow -lt $deadline)

Write-Host "AI_PDM did not become healthy within $TimeoutSeconds seconds."
Write-Host "Last health status: $($health.StatusCode). $($health.Error)"
$owner = Get-CurrentPortOwner
Write-RuntimeStatus -State "startup_timeout" -LauncherProcessId $process.Id -PortOwnerProcessId $owner.ProcessId -PortOwnerProcessInfo $owner.ProcessInfo -Health $health -Message "AI_PDM did not become healthy within $TimeoutSeconds seconds."
Write-Host "--- stdout ---"
Get-Content -LiteralPath $StdoutLog -ErrorAction SilentlyContinue | Select-Object -Last 80
Write-Host "--- stderr ---"
Get-Content -LiteralPath $StderrLog -ErrorAction SilentlyContinue | Select-Object -Last 80
exit 1
