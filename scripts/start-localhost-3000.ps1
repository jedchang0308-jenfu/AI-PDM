param(
  [int]$Port = 1020,
  [switch]$NoBrowser,
  [switch]$RestartProjectProcess,
  [switch]$StopForeignProcess,
  [switch]$CleanNext,
  [switch]$CheckOnly,
  [switch]$TestAdmin,
  [string]$SandboxRoot = $env:JENFU_LOCAL_SANDBOX_ROOT,
  [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ProjectRootLower = $ProjectRoot.ToLowerInvariant()
$SandboxProfile = $null
if ($TestAdmin) {
  if ($env:NODE_ENV -eq "production" -or $env:K_SERVICE -or $env:K_REVISION -or
    $env:FUNCTION_TARGET -or $env:FUNCTION_NAME -or $env:FIREBASE_CONFIG) {
    throw "-TestAdmin is forbidden in production or a cloud runtime environment."
  }
  if ([string]::IsNullOrWhiteSpace($SandboxRoot)) {
    throw "-TestAdmin requires an existing sandbox profile. Provide -SandboxRoot <path>."
  }
  if (-not [IO.Path]::IsPathRooted($SandboxRoot) -or -not (Test-Path -LiteralPath $SandboxRoot -PathType Container)) {
    throw "-TestAdmin requires an existing sandbox root. Provide -SandboxRoot <absolute path>."
  }
  $sandboxRootItem = Get-Item -LiteralPath $SandboxRoot -Force
  if (($sandboxRootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "-TestAdmin sandbox root must not be a symbolic link or junction."
  }
  $SandboxRoot = $sandboxRootItem.FullName
  if ([IO.Path]::GetFullPath($SandboxRoot).TrimEnd('\') -ieq $ProjectRoot.TrimEnd('\')) {
    throw "-TestAdmin SandboxRoot cannot be the AI_PDM project directory."
  }
  $controlDirectory = Join-Path $SandboxRoot "control"
  if (-not (Test-Path -LiteralPath $controlDirectory -PathType Container) -or
    ((Get-Item -LiteralPath $controlDirectory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "-TestAdmin requires a regular control directory under SandboxRoot."
  }
  $profilePath = Join-Path $SandboxRoot "control\ai-pdm-runtime.json"
  if (-not (Test-Path -LiteralPath $profilePath -PathType Leaf)) {
    throw "-TestAdmin requires control\ai-pdm-runtime.json under SandboxRoot. Provide -SandboxRoot <path>."
  }
  $profileItem = Get-Item -LiteralPath $profilePath -Force
  if (($profileItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $profileItem.Length -lt 2 -or $profileItem.Length -gt 65536) {
    throw "-TestAdmin sandbox profile is invalid."
  }
  try { $SandboxProfile = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json }
  catch { throw "-TestAdmin sandbox profile is invalid JSON." }
  $profileRoot = [IO.Path]::GetFullPath([string]$SandboxProfile.sandboxRoot).TrimEnd('\')
  if ($profileRoot -ine $SandboxRoot.TrimEnd('\') -or $SandboxProfile.applicationId -cne "ai-pdm" -or
    $SandboxProfile.profileVersion -cne "ai-pdm.local-runtime.v1") {
    throw "-TestAdmin sandbox profile does not match the supplied SandboxRoot."
  }
  try { $profileOrigin = [Uri]::new([string]$SandboxProfile.origin) }
  catch { throw "-TestAdmin sandbox origin is invalid." }
  if (-not $profileOrigin.IsLoopback -or $profileOrigin.Scheme -cne "http" -or $profileOrigin.Port -ne $Port -or
    $profileOrigin.AbsolutePath -cne "/" -or $profileOrigin.Query -or $profileOrigin.Fragment -or
    $profileOrigin.UserInfo) {
    throw "-TestAdmin sandbox origin must be a local HTTP origin matching port $Port (1020 or 12020)."
  }
  foreach ($directoryValue in @([string]$SandboxProfile.dataDirectory, [string]$SandboxProfile.repositoryDirectory)) {
    if ([string]::IsNullOrWhiteSpace($directoryValue) -or -not [IO.Path]::IsPathRooted($directoryValue) -or
      $directoryValue.Replace('/', '\').Split('\') -contains '..') {
      throw "-TestAdmin sandbox data and repository directories must be absolute controlled paths."
    }
    $directoryFullPath = [IO.Path]::GetFullPath($directoryValue).TrimEnd('\')
    if (-not $directoryFullPath.StartsWith($SandboxRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
      throw "-TestAdmin sandbox data and repository directories must remain under SandboxRoot."
    }
  }
  $DataDir = [IO.Path]::GetFullPath([string]$SandboxProfile.dataDirectory)
  $RepositoryDir = [IO.Path]::GetFullPath([string]$SandboxProfile.repositoryDirectory)
}
$BindHost = "127.0.0.1"
$PublicHost = "localhost"
$Url = "http://${PublicHost}:$Port/"
if ($TestAdmin) { $Url = ([string]$SandboxProfile.origin).TrimEnd('/') + '/' }
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

function Get-NativeProcessStartToken {
  param([int]$OwnerProcessId)
  try { return (Get-Process -Id $OwnerProcessId -ErrorAction Stop).StartTime.ToUniversalTime().ToFileTimeUtc().ToString() }
  catch { return "" }
}

function Test-ProcessCommandOwnsProject {
  param($ProcessInfo)
  if (-not $ProcessInfo -or $ProcessInfo.Name -ne 'node.exe' -or -not $ProcessInfo.CommandLine -or -not $ProcessInfo.ExecutablePath) { return $false }
  if ([IO.Path]::GetFullPath($ProcessInfo.ExecutablePath) -ne $NodeExe) { return $false }
  # Match the complete invocation emitted below. An incidental root argument,
  # path traversal, or a different --prefix must never prove ownership.
  $expected = @(( '"' + $NodeExe + '" ' + $npmArguments ), ( $NodeExe + ' ' + $npmArguments ))
  return $expected -contains ([string]$ProcessInfo.CommandLine).Trim()
}

function Read-RecordedLauncherProof {
  try {
    if (-not (Test-Path -LiteralPath $StatusFile -PathType Leaf)) { return $null }
    $record = Get-Content -LiteralPath $StatusFile -Raw | ConvertFrom-Json
    if ($record.app -ne 'AI_PDM' -or [int]$record.port -ne $Port -or [int]$record.launcherProcessId -le 0 -or -not $record.launcherStartToken -or -not $record.launcherExecutablePath) { return $null }
    if ([IO.Path]::GetFullPath([string]$record.launcherExecutablePath) -ne $NodeExe) { return $null }
    if ([IO.Path]::GetFullPath([string]$record.worktree).TrimEnd('\') -ne $ProjectRoot.TrimEnd('\')) { return $null }
    if ((Get-NativeProcessStartToken -OwnerProcessId $record.launcherProcessId) -ne [string]$record.launcherStartToken) { return $null }
    return $record
  } catch { return $null }
}

function Test-IsProjectProcess {
  param($ProcessInfo)
  $proof = Read-RecordedLauncherProof
  if (-not $proof) { return $false }
  $seen = @{}
  $current = $ProcessInfo
  for ($depth = 0; $depth -lt 8 -and $current; $depth++) {
    $currentId = [int]$current.ProcessId
    if ($currentId -le 0 -or $seen.ContainsKey($currentId)) { return $false }
    $seen[$currentId] = $true
    if ($currentId -eq [int]$proof.launcherProcessId) { return (Test-ProcessCommandOwnsProject -ProcessInfo $current) }
    $parent = Get-OwnerProcessInfo -OwnerProcessId ([int]$current.ParentProcessId)
    if (-not $parent -or -not $current.CreationDate -or -not $parent.CreationDate -or $parent.CreationDate -ge $current.CreationDate) { return $false }
    $current = $parent
  }
  return $false
}

function Get-CurrentPortOwner {
  $ownerPids = @(Get-PortListeners | ForEach-Object { [int]$_.OwningProcess } | Sort-Object -Unique)
  foreach ($ownerPid in $ownerPids) {
    $processInfo = Get-OwnerProcessInfo -OwnerProcessId $ownerPid
    [pscustomobject]@{
      ProcessId = $ownerPid
      ProcessInfo = $processInfo
      IsProject = [bool](Test-IsProjectProcess -ProcessInfo $processInfo)
    }
  }
}

function Get-UnverifiedPortOwners {
  param([object[]]$Owners)
  @($Owners | Where-Object { -not $_.IsProject })
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

function Test-LocalTestAdminMode {
  if (-not $TestAdmin) { return $true }
  try {
    $mode = Invoke-RestMethod -Uri "http://${BindHost}:$Port/api/auth/mode" -TimeoutSec 4
    return [bool]($mode.localTestAdmin -eq $true)
  } catch { return $false }
}

function Write-RuntimeStatus {
  param([string]$State, [int]$LauncherProcessId = 0, [int]$PortOwnerProcessId = 0, $PortOwnerProcessInfo = $null, $Health = $null, [string]$Message = "")
  [ordered]@{
    app = "AI_PDM"
    worktree = $ProjectRoot
    purpose = "local web development"
    port = $Port
    url = $Url
    state = $State
    launcherProcessId = $LauncherProcessId
    launcherStartToken = if ($LauncherProcessId -gt 0) { Get-NativeProcessStartToken -OwnerProcessId $LauncherProcessId } else { "" }
    launcherExecutablePath = if ($LauncherProcessId -gt 0) { $NodeExe } else { "" }
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
  if (-not $NoBrowser) {
    $owners = @(Get-CurrentPortOwner)
    $unverifiedOwners = @(Get-UnverifiedPortOwners -Owners $owners)
    if ($unverifiedOwners.Count -gt 0) {
      $owner = $unverifiedOwners[0]
      Write-RuntimeStatus -State "blocked_foreign_process" -PortOwnerProcessId $owner.ProcessId -PortOwnerProcessInfo $owner.ProcessInfo -Message "At least one listener on this port is not owned by this worktree."
      throw "Port $Port has a listener outside this worktree; refusing to open localhost."
    }
    if ($owners.Count -eq 0) {
      Write-RuntimeStatus -State "unhealthy_existing" -Message "No port listener remained before opening localhost."
      throw "Port $Port has no listener before opening localhost."
    }
    Start-Process $Url
  }
}

function Stop-VerifiedProjectOwner {
  param([int]$OwnerProcessId)
  Stop-Process -Id $OwnerProcessId -Force
  if (-not (Wait-PortReleased)) { throw "Port $Port did not release after stopping verified PID $OwnerProcessId." }
}

# Resolve one exact invocation for both startup and subsequent ownership checks.
$NodeExe = [IO.Path]::GetFullPath((Get-Command node.exe -ErrorAction Stop).Source)
$NpmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$NpmCli = Join-Path (Split-Path $NpmCommand -Parent) "node_modules\npm\bin\npm-cli.js"
if (-not (Test-Path -LiteralPath $NpmCli -PathType Leaf)) {
  throw "Could not resolve npm's JavaScript CLI next to npm.cmd."
}
$quotedNpmCli = '"' + $NpmCli.Replace('"', '\"') + '"'
$quotedProjectRoot = '"' + $ProjectRoot.Replace('"', '\"') + '"'
$npmArguments = "$quotedNpmCli --prefix $quotedProjectRoot run dev:server"
if ($Port -ne 1020) { $npmArguments += " -- --port $Port" }
# Turbopack cannot follow an externally reused node_modules junction outside its root.
if ((Get-Item -LiteralPath (Join-Path $ProjectRoot "node_modules") -ErrorAction Stop).LinkType) {
  if ($Port -eq 1020) { $npmArguments += " --" }
  $npmArguments += " --webpack"
}

Ensure-TaskDirectories
$owners = @(Get-CurrentPortOwner)
if ($owners.Count -gt 0) {
  $unverifiedOwners = @(Get-UnverifiedPortOwners -Owners $owners)
  $owner = if ($unverifiedOwners.Count -gt 0) { $unverifiedOwners[0] } else { $owners[0] }
  $isProject = [bool]$owner.IsProject
  $ownerName = if ($owner.ProcessInfo) { $owner.ProcessInfo.Name } else { "unknown" }
  Write-Host "Port $Port owner: PID $($owner.ProcessId) ($ownerName)"
  if (-not $isProject) {
    Write-RuntimeStatus -State "blocked_foreign_process" -PortOwnerProcessId $owner.ProcessId -PortOwnerProcessInfo $owner.ProcessInfo -Message "At least one listener on this port is not owned by this worktree."
    throw "Port $Port has a listener outside this worktree; foreign process termination is prohibited."
  }
  else {
    $health = Test-LocalHttpHealth
    if ($TestAdmin -and -not (Test-LocalTestAdminMode)) {
      throw "Port $Port is owned by this project but is not running in local TestAdmin mode; refusing reuse or termination."
    }
    $ownersAfterHealth = @(Get-CurrentPortOwner)
    $unverifiedOwners = @(Get-UnverifiedPortOwners -Owners $ownersAfterHealth)
    if ($unverifiedOwners.Count -gt 0) {
      $owner = $unverifiedOwners[0]
      Write-RuntimeStatus -State "blocked_foreign_process" -PortOwnerProcessId $owner.ProcessId -PortOwnerProcessInfo $owner.ProcessInfo -Health $health -Message "At least one listener on this port is not owned by this worktree."
      throw "Port $Port has a listener outside this worktree; foreign process termination is prohibited."
    }
    $owner = $ownersAfterHealth | Select-Object -First 1
    if (-not $owner) {
      Write-RuntimeStatus -State "unhealthy_existing" -Health $health -Message "No port listener remained after the health check."
      throw "Port $Port has no listener after the health check."
    }
    if ($health.Healthy -and -not $RestartProjectProcess) {
      $proof = Read-RecordedLauncherProof
      $existingLauncherId = if ($proof) { [int]$proof.launcherProcessId } else { 0 }
      Write-RuntimeStatus -State "healthy_existing" -LauncherProcessId $existingLauncherId -PortOwnerProcessId $owner.ProcessId -PortOwnerProcessInfo $owner.ProcessInfo -Health $health -Message "Existing AI_PDM web server is healthy."
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

if (-not $TestAdmin) {
  $env:PDM_DATA_DIR = $DataDir
  $env:PDM_REPOSITORY_DIR = $RepositoryDir
}
$env:PDM_UNIFIED_PART_RELATION_WORKBENCH_V1 = "true"
$env:PDM_PART_PREVIEW_V1 = "true"
$env:PDM_WORKBENCH_PRODUCTION_RD_LANES_V1 = "true"
$env:PDM_LOCAL_FULL_FUNCTION_VALIDATION = "true"
Remove-Item -LiteralPath $StdoutLog, $StderrLog, $PidFile, $StatusFile -ErrorAction SilentlyContinue

Write-Host "Starting AI_PDM local web server."
Write-Host "DEV-125 Windows service is installed and managed separately; dev:local does not start or stop a fallback worker."
if ($TestAdmin) {
  $childEnvironmentKeys = @(
    "JENFU_LOCAL_SANDBOX_ROOT", "JENFU_LOCAL_SANDBOX_ENABLED", "JENFU_LOCAL_SANDBOX_ID",
    "JENFU_LOCAL_SANDBOX_ORIGIN", "JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN", "JENFU_LOCAL_SANDBOX_BIND_HOST",
    "JENFU_LOCAL_SANDBOX_DATABASE_URL", "JENFU_LOCAL_SANDBOX_RUNTIME_ROLE", "PDM_DB_PROVIDER",
    "PDM_POSTGRES_URL", "PDM_POSTGRES_POOLER_MODE", "PDM_AUTH_MODE", "PDM_LOCAL_TEST_ADMIN",
    "PDM_LOCAL_PRINCIPAL_SANDBOX", "PDM_JENFU_PLATFORM_AUTH_MODE", "PDM_JENFU_ENTITLEMENT_MODE",
    "PDM_DATA_DIR", "PDM_REPOSITORY_DIR", "NODE_ENV", "JENFU_FIREBASE_PROJECT_ID",
    "JENFU_IDENTITY_ISSUER", "JENFU_IDENTITY_AUDIENCE", "PDM_FIREBASE_PROJECT_ID",
    "PDM_FIREBASE_API_KEY", "PDM_FIREBASE_AUTH_DOMAIN", "PDM_FIREBASE_APP_ID",
    "PDM_JENFU_SSO_BROKER_ORIGIN", "PDM_JENFU_SSO_HANDOFF_MODE"
  )
  $savedChildEnvironment = @{}
  foreach ($key in $childEnvironmentKeys) { $savedChildEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, "Process") }
  try {
    $env:JENFU_LOCAL_SANDBOX_ROOT = $SandboxRoot
    $env:JENFU_LOCAL_SANDBOX_ENABLED = "1"
    $env:JENFU_LOCAL_SANDBOX_ID = [string]$SandboxProfile.sandboxId
    $env:JENFU_LOCAL_SANDBOX_ORIGIN = [string]$SandboxProfile.origin
    $env:JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN = [string]$SandboxProfile.platformOrigin
    $env:JENFU_LOCAL_SANDBOX_BIND_HOST = [string]$SandboxProfile.bindHost
    $env:JENFU_LOCAL_SANDBOX_DATABASE_URL = [string]$SandboxProfile.databaseUrl
    $env:JENFU_LOCAL_SANDBOX_RUNTIME_ROLE = [string]$SandboxProfile.runtimeRole
    $env:PDM_DB_PROVIDER = "postgres"
    $env:PDM_POSTGRES_URL = [string]$SandboxProfile.databaseUrl
    $env:PDM_POSTGRES_POOLER_MODE = "off"
    $env:PDM_AUTH_MODE = "firebase_bff"
    $env:PDM_LOCAL_TEST_ADMIN = "1"
    $env:PDM_LOCAL_PRINCIPAL_SANDBOX = "1"
    $env:PDM_JENFU_PLATFORM_AUTH_MODE = "on"
    $env:PDM_JENFU_ENTITLEMENT_MODE = "enforce"
    $env:PDM_DATA_DIR = $DataDir
    $env:PDM_REPOSITORY_DIR = $RepositoryDir
    $env:NODE_ENV = "development"
    $env:PDM_JENFU_SSO_HANDOFF_MODE = "off"
    foreach ($key in @("JENFU_FIREBASE_PROJECT_ID", "JENFU_IDENTITY_ISSUER", "JENFU_IDENTITY_AUDIENCE",
      "PDM_FIREBASE_PROJECT_ID", "PDM_FIREBASE_API_KEY", "PDM_FIREBASE_AUTH_DOMAIN", "PDM_FIREBASE_APP_ID",
      "PDM_JENFU_SSO_BROKER_ORIGIN")) {
      Remove-Item -Path "Env:$key" -ErrorAction SilentlyContinue
    }
    $process = Start-Process -FilePath $NodeExe -ArgumentList $npmArguments -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog
  }
  finally {
    foreach ($key in $childEnvironmentKeys) {
      $value = $savedChildEnvironment[$key]
      if ($null -eq $value) { Remove-Item -Path "Env:$key" -ErrorAction SilentlyContinue }
      else { [Environment]::SetEnvironmentVariable($key, $value, "Process") }
    }
  }
}
else {
  $process = Start-Process -FilePath $NodeExe -ArgumentList $npmArguments -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog
}
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
    $currentOwners = @(Get-CurrentPortOwner)
    $unverifiedOwners = @(Get-UnverifiedPortOwners -Owners $currentOwners)
    if ($unverifiedOwners.Count -gt 0) {
      $current = $unverifiedOwners[0]
      Write-RuntimeStatus -State "blocked_foreign_process" -LauncherProcessId $process.Id -PortOwnerProcessId $current.ProcessId -PortOwnerProcessInfo $current.ProcessInfo -Health $health -Message "At least one listener on this port is not owned by this worktree."
      throw "Port $Port has a listener outside this worktree; refusing to open localhost."
    }
    $current = $currentOwners | Select-Object -First 1
    if (-not $current) {
      Write-RuntimeStatus -State "unhealthy_existing" -LauncherProcessId $process.Id -Health $health -Message "No port listener remained after the health check."
      throw "Port $Port has no listener after the health check."
    }
    Write-RuntimeStatus -State "healthy_started" -LauncherProcessId $process.Id -PortOwnerProcessId $current.ProcessId -PortOwnerProcessInfo $current.ProcessInfo -Health $health -Message "AI_PDM web server is healthy."
    Write-Host "AI_PDM is healthy."
    Write-Host "Local URL: $Url"
    Open-LocalPage
    exit 0
  }
  Start-Sleep -Milliseconds 500
} while ([DateTime]::UtcNow -lt $deadline)

$currentOwners = @(Get-CurrentPortOwner)
$current = $currentOwners | Select-Object -First 1
Write-RuntimeStatus -State "startup_timeout" -LauncherProcessId $process.Id -PortOwnerProcessId $current.ProcessId -PortOwnerProcessInfo $current.ProcessInfo -Health $health -Message "AI_PDM did not become healthy within the timeout."
Get-Content -LiteralPath $StdoutLog -ErrorAction SilentlyContinue | Select-Object -Last 80
Get-Content -LiteralPath $StderrLog -ErrorAction SilentlyContinue | Select-Object -Last 80
throw "AI_PDM did not become healthy within $TimeoutSeconds seconds."
