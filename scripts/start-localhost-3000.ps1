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
$HostName = "127.0.0.1"
$Port = 3000
$Url = "http://${HostName}:$Port/"
$ProjectRootLower = $ProjectRoot.ToLowerInvariant()
$RuntimeDir = Join-Path $ProjectRoot "tmp\local-dev"
$PidFile = Join-Path $RuntimeDir "ai-pdm-3000.pid"
$PortOwnerPidFile = Join-Path $RuntimeDir "ai-pdm-3000.port-owner.pid"
$StatusFile = Join-Path $RuntimeDir "ai-pdm-3000.status.json"
$StdoutLog = Join-Path $RuntimeDir "ai-pdm-3000.out.log"
$StderrLog = Join-Path $RuntimeDir "ai-pdm-3000.err.log"
$HealthChecks = @(
  @{ Path = "/"; Expected = @(200, 301, 302, 307, 308) },
  @{ Path = "/login"; Expected = @(200, 301, 302, 307, 308) },
  @{ Path = "/api/auth/me"; Expected = @(200, 401) }
)

function Ensure-RuntimeDir {
  New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
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
    $routeUrl = "http://${HostName}:$Port$($check.Path)"
    $statusCode = 0
    $errorText = ""

    try {
      $response = Invoke-WebRequest -Uri $routeUrl -UseBasicParsing -TimeoutSec 4
      $statusCode = [int]$response.StatusCode
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
    $PortOwnerProcessInfo = $null,
    $Health = $null,
    [string]$Message = ""
  )

  $commandLine = if ($PortOwnerProcessInfo -and $PortOwnerProcessInfo.CommandLine) { $PortOwnerProcessInfo.CommandLine } else { "" }
  $processName = if ($PortOwnerProcessInfo -and $PortOwnerProcessInfo.Name) { $PortOwnerProcessInfo.Name } else { "" }
  $status = [ordered]@{
    app = "AI_PDM"
    port = $Port
    url = $Url
    state = $State
    launcherProcessId = $LauncherProcessId
    portOwnerProcessId = $PortOwnerProcessId
    portOwnerProcessName = $processName
    portOwnerCommandLine = $commandLine
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
      Write-RuntimeStatus -State "healthy_existing" -PortOwnerProcessId $ownerProcessId -PortOwnerProcessInfo $processInfo -Health $health -Message "Existing AI_PDM project server is healthy."
      Write-Host "AI_PDM is healthy."
      Write-Host "Local URL: $Url"
      if ($CheckOnly) {
        exit 0
      }
      Open-LocalPage
      exit 0
    }

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

    Write-Host "Stopping stale AI_PDM project process PID $ownerProcessId because -RestartProjectProcess was provided."
    Stop-Process -Id $ownerProcessId -Force
    if (-not (Wait-PortReleased)) {
      Write-Error "Port $Port did not release after stopping PID $ownerProcessId."
      exit 1
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

Write-Host "Starting AI_PDM local server..."
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
    Write-RuntimeStatus -State "healthy_started" -LauncherProcessId $process.Id -PortOwnerProcessId $owner.ProcessId -PortOwnerProcessInfo $owner.ProcessInfo -Health $health -Message "AI_PDM local server started and all health checks passed."
    Write-Host "AI_PDM is healthy."
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
