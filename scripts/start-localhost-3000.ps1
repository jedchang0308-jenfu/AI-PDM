param(
  [int]$Port = 1020,
  [switch]$NoBrowser,
  [switch]$RestartProjectProcess,
  [switch]$StopForeignProcess,
  [switch]$CleanNext,
  [switch]$CheckOnly,
  [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ProjectRootLower = $ProjectRoot.ToLowerInvariant()
$BindHost = "127.0.0.1"
$PublicHost = "localhost"
$Url = "http://${PublicHost}:$Port/"
$RuntimeRoot = Join-Path $ProjectRoot "tmp\local-dev"
$RuntimeDir = Join-Path $RuntimeRoot ([string]$Port)
$PidFile = Join-Path $RuntimeDir "ai-pdm-$Port.pid"
$StatusFile = Join-Path $RuntimeDir "ai-pdm-$Port.status.json"
$StdoutLog = Join-Path $RuntimeDir "ai-pdm-$Port.out.log"
$StderrLog = Join-Path $RuntimeDir "ai-pdm-$Port.err.log"
$DataDir = Join-Path $RuntimeDir "data"
$RepositoryDir = Join-Path $RuntimeDir "repository"
$HealthChecks = @(
  @{ Path = "/"; Expected = @(200, 301, 302, 307, 308) },
  @{ Path = "/login"; Expected = @(200, 301, 302, 307, 308) },
  @{ Path = "/api/auth/me"; Expected = @(200, 401) }
)

if ($Port -notin @(1020, 12020)) {
  throw "DEV-126 local port must be 1020 or 12020."
}
if ($StopForeignProcess) {
  throw "-StopForeignProcess is prohibited. The launcher never terminates an unknown port owner."
}

function Ensure-TaskDirectories {
  foreach ($path in @($RuntimeDir, $DataDir, $RepositoryDir)) {
    New-Item -ItemType Directory -Force -Path $path | Out-Null
  }
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
  if (-not $ProcessInfo -or -not $ProcessInfo.CommandLine) { return $false }
  $commandLine = $ProcessInfo.CommandLine.ToLowerInvariant()
  return $commandLine.Contains($ProjectRootLower) -and ($commandLine.Contains("next") -or $commandLine.Contains("npm"))
}

function Get-CurrentPortOwner {
  $listener = Get-PortListeners | Select-Object -First 1
  if (-not $listener) { return @{ ProcessId = 0; ProcessInfo = $null } }
  $ownerPid = [int]$listener.OwningProcess
  return @{ ProcessId = $ownerPid; ProcessInfo = Get-OwnerProcessInfo -OwnerProcessId $ownerPid }
}

function Wait-PortReleased {
  $deadline = [DateTime]::UtcNow.AddSeconds(10)
  do {
    if ((Get-PortListeners).Count -eq 0) { return $true }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  return $false
}

function Test-LocalHttpHealth {
  $results = @()
  foreach ($check in $HealthChecks) {
    $statusCode = 0
    $errorText = ""
    try {
      $response = Invoke-WebRequest -Uri "http://${BindHost}:$Port$($check.Path)" -UseBasicParsing -TimeoutSec 4
      $statusCode = [int]$response.StatusCode
    }
    catch {
      if ($_.Exception.Response) {
        try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { $statusCode = 0 }
      }
      $errorText = $_.Exception.Message
    }
    $healthy = @($check.Expected) -contains $statusCode
    $results += [ordered]@{ path = $check.Path; statusCode = $statusCode; expected = @($check.Expected); healthy = $healthy; error = if ($healthy) { "" } else { $errorText } }
  }
  $failure = $results | Where-Object { -not $_.healthy } | Select-Object -First 1
  return @{ Healthy = -not $failure; StatusCode = if ($failure) { $failure.statusCode } else { 200 }; Routes = $results }
}

function Write-RuntimeStatus {
  param([string]$State, [int]$LauncherProcessId = 0, [int]$PortOwnerProcessId = 0, $PortOwnerProcessInfo = $null, $Health = $null, [string]$Message = "")
  [ordered]@{
    app = "AI_PDM"
    purpose = "local web development"
    port = $Port
    url = $Url
    state = $State
    launcherProcessId = $LauncherProcessId
    portOwnerProcessId = $PortOwnerProcessId
    portOwnerProcessName = if ($PortOwnerProcessInfo) { $PortOwnerProcessInfo.Name } else { "" }
    dataDir = $DataDir
    repositoryDir = $RepositoryDir
    mutationScope = "task-owned local runtime directories"
    windowsService = "external installed DEV-125 service; not launched or stopped by dev:local"
    health = $Health
    message = $Message
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $StatusFile -Encoding utf8
}

function Open-LocalPage {
  if (-not $NoBrowser) { Start-Process $Url }
}

function Stop-VerifiedProjectOwner {
  param([int]$OwnerProcessId)
  Stop-Process -Id $OwnerProcessId -Force
  if (-not (Wait-PortReleased)) { throw "Port $Port did not release after stopping verified PID $OwnerProcessId." }
}

Ensure-TaskDirectories
$owner = Get-CurrentPortOwner
if ($owner.ProcessId -gt 0) {
  $isProject = Test-IsProjectProcess -ProcessInfo $owner.ProcessInfo
  $ownerName = if ($owner.ProcessInfo) { $owner.ProcessInfo.Name } else { "unknown" }
  Write-Host "Port $Port owner: PID $($owner.ProcessId) ($ownerName)"
  if (-not $isProject) {
    Write-RuntimeStatus -State "blocked_foreign_process" -PortOwnerProcessId $owner.ProcessId -PortOwnerProcessInfo $owner.ProcessInfo -Message "Port is owned by another process."
    throw "Port $Port is occupied by a process outside this worktree; foreign process termination is prohibited."
  }
  else {
    $health = Test-LocalHttpHealth
    if ($health.Healthy -and -not $RestartProjectProcess) {
      Write-RuntimeStatus -State "healthy_existing" -PortOwnerProcessId $owner.ProcessId -PortOwnerProcessInfo $owner.ProcessInfo -Health $health -Message "Existing AI_PDM web server is healthy."
      Write-Host "AI_PDM is healthy."
      Write-Host "Local URL: $Url"
      if (-not $CheckOnly) { Open-LocalPage }
      exit 0
    }
    if ($CheckOnly) {
      Write-RuntimeStatus -State "unhealthy_existing" -PortOwnerProcessId $owner.ProcessId -PortOwnerProcessInfo $owner.ProcessInfo -Health $health -Message "Existing AI_PDM web server is unhealthy."
      throw "AI_PDM is listening but unhealthy."
    }
    if (-not $RestartProjectProcess) { throw "Run npm run dev:local:restart to restart the verified AI_PDM process." }
    Stop-VerifiedProjectOwner -OwnerProcessId $owner.ProcessId
  }
}
elseif ($CheckOnly) {
  Write-RuntimeStatus -State "not_running" -Message "No process is listening on port $Port."
  throw "No local server is listening on $Url."
}

if ($CleanNext) {
  Push-Location $ProjectRoot
  try {
    & npm.cmd run clean:next
    if ($LASTEXITCODE -ne 0) { throw "npm run clean:next failed with exit code $LASTEXITCODE" }
  }
  finally { Pop-Location }
}

$env:PDM_DATA_DIR = $DataDir
$env:PDM_REPOSITORY_DIR = $RepositoryDir
$env:PDM_UNIFIED_PART_RELATION_WORKBENCH_V1 = "true"
$env:PDM_PART_PREVIEW_V1 = "true"
$env:PDM_WORKBENCH_PRODUCTION_RD_LANES_V1 = "true"
$env:PDM_LOCAL_FULL_FUNCTION_VALIDATION = "true"
Remove-Item -LiteralPath $StdoutLog, $StderrLog, $PidFile, $StatusFile -ErrorAction SilentlyContinue

Write-Host "Starting AI_PDM local web server."
Write-Host "DEV-125 Windows service is installed and managed separately; dev:local does not start or stop a fallback worker."
$NodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$NpmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$NpmCli = Join-Path (Split-Path $NpmCommand -Parent) "node_modules\npm\bin\npm-cli.js"
if (-not (Test-Path -LiteralPath $NpmCli -PathType Leaf)) {
  throw "Could not resolve npm's JavaScript CLI next to npm.cmd."
}
$quotedNpmCli = '"' + $NpmCli.Replace('"', '\"') + '"'
$npmArguments = "$quotedNpmCli run dev:server"
if ($Port -ne 1020) {
  $npmArguments += " -- --port $Port"
}
# Turbopack cannot follow an externally reused node_modules junction outside its root.
if ((Get-Item -LiteralPath (Join-Path $ProjectRoot "node_modules") -ErrorAction Stop).LinkType) {
  if ($Port -eq 1020) { $npmArguments += " --" }
  $npmArguments += " --webpack"
}
$process = Start-Process -FilePath $NodeExe -ArgumentList $npmArguments -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog
Set-Content -LiteralPath $PidFile -Value ([string]$process.Id) -Encoding ascii
Write-RuntimeStatus -State "starting" -LauncherProcessId $process.Id -Message "Waiting for local HTTP health."

$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
do {
  if ($process.HasExited) {
    Get-Content -LiteralPath $StdoutLog -ErrorAction SilentlyContinue | Select-Object -Last 80
    Get-Content -LiteralPath $StderrLog -ErrorAction SilentlyContinue | Select-Object -Last 80
    throw "Local dev process exited before becoming healthy."
  }
  $health = Test-LocalHttpHealth
  if ($health.Healthy) {
    $current = Get-CurrentPortOwner
    Write-RuntimeStatus -State "healthy_started" -LauncherProcessId $process.Id -PortOwnerProcessId $current.ProcessId -PortOwnerProcessInfo $current.ProcessInfo -Health $health -Message "AI_PDM web server is healthy."
    Write-Host "AI_PDM is healthy."
    Write-Host "Local URL: $Url"
    Open-LocalPage
    exit 0
  }
  Start-Sleep -Milliseconds 500
} while ([DateTime]::UtcNow -lt $deadline)

$current = Get-CurrentPortOwner
Write-RuntimeStatus -State "startup_timeout" -LauncherProcessId $process.Id -PortOwnerProcessId $current.ProcessId -PortOwnerProcessInfo $current.ProcessInfo -Health $health -Message "AI_PDM did not become healthy within the timeout."
Get-Content -LiteralPath $StdoutLog -ErrorAction SilentlyContinue | Select-Object -Last 80
Get-Content -LiteralPath $StderrLog -ErrorAction SilentlyContinue | Select-Object -Last 80
throw "AI_PDM did not become healthy within $TimeoutSeconds seconds."
