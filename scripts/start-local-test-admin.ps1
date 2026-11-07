param(
  [switch]$NoBrowser,
  [switch]$RestartProjectProcess,
  [switch]$CleanNext,
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$Port = 1020
$DatabasePort = 58421
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RuntimeDirectoryName = "test-admin-1020-masked-snapshot"
$RuntimeRoot = $null
$cursor = Get-Item -LiteralPath $ProjectRoot
while ($cursor) {
  $candidate = Join-Path $cursor.FullName ".local\AI_PDM\$RuntimeDirectoryName"
  if (Test-Path -LiteralPath (Join-Path $candidate "sandbox\control\ai-pdm-runtime.json") -PathType Leaf) {
    $RuntimeRoot = $candidate
    break
  }
  $cursor = $cursor.Parent
}
if (-not $RuntimeRoot) {
  throw "Could not locate the existing AI-PDM test-admin runtime profile above $ProjectRoot."
}

$SandboxRoot = Join-Path $RuntimeRoot "sandbox"
$ProfilePath = Join-Path $SandboxRoot "control\ai-pdm-runtime.json"
$Profile = Get-Content -LiteralPath $ProfilePath -Raw | ConvertFrom-Json
$ExpectedDataDirectory = Join-Path $SandboxRoot "data"
$ExpectedRepositoryDirectory = Join-Path $SandboxRoot "repository"
if ([IO.Path]::GetFullPath([string]$Profile.sandboxRoot).TrimEnd('\') -ine $SandboxRoot.TrimEnd('\') -or
  $Profile.applicationId -cne "ai-pdm" -or $Profile.profileVersion -cne "ai-pdm.local-runtime.v1" -or
  ([string]$Profile.origin).TrimEnd('/') -cne "http://localhost:$Port" -or
  [IO.Path]::GetFullPath([string]$Profile.dataDirectory) -ine [IO.Path]::GetFullPath($ExpectedDataDirectory) -or
  [IO.Path]::GetFullPath([string]$Profile.repositoryDirectory) -ine [IO.Path]::GetFullPath($ExpectedRepositoryDirectory)) {
  throw "The retained local test-admin profile does not match its fixed PDM 1020 sandbox paths."
}

$PgBin = Join-Path $env:ProgramFiles "PostgreSQL\18\bin"
$PgCtl = Join-Path $PgBin "pg_ctl.exe"
$PostgresExe = Join-Path $PgBin "postgres.exe"
$DatabaseDirectory = Join-Path $RuntimeRoot "postgres\data"
$DatabaseLog = Join-Path $RuntimeRoot "postgres\postgres.log"
if (-not (Test-Path -LiteralPath $PgCtl -PathType Leaf) -or
  -not (Test-Path -LiteralPath $DatabaseDirectory -PathType Container)) {
  throw "The retained isolated PostgreSQL 18 test database is unavailable."
}

function Get-VerifiedDatabaseProcess {
  $pidPath = Join-Path $DatabaseDirectory "postmaster.pid"
  if (-not (Test-Path -LiteralPath $pidPath -PathType Leaf)) { return $null }
  $pidLines = Get-Content -LiteralPath $pidPath -TotalCount 4
  $databasePid = 0
  if ($pidLines.Count -lt 4 -or -not [int]::TryParse([string]$pidLines[0], [ref]$databasePid) -or $pidLines[3] -ne "$DatabasePort") {
    throw "The isolated test database process marker is invalid."
  }
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $databasePid" -ErrorAction SilentlyContinue
  $expectedDirectory = $DatabaseDirectory.Replace('/', '\')
  $actualCommand = ([string]$processInfo.CommandLine).Replace('/', '\')
  if (-not $processInfo -or $processInfo.Name -ne "postgres.exe" -or
    [IO.Path]::GetFullPath([string]$processInfo.ExecutablePath) -ine [IO.Path]::GetFullPath($PostgresExe) -or
    $actualCommand.IndexOf($expectedDirectory, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
    throw "Port $DatabasePort is not backed by the configured isolated test PostgreSQL cluster."
  }
  return $processInfo
}

$databaseStatus = @(& $PgCtl -D $DatabaseDirectory status 2>&1)
$databaseIsRunning = $LASTEXITCODE -eq 0
if ($CheckOnly -and -not $databaseIsRunning) {
  throw "The isolated PostgreSQL database is stopped; run npm run dev:local to start it."
}
if (-not $databaseIsRunning) {
  $existingListeners = @(Get-NetTCPConnection -LocalPort $DatabasePort -State Listen -ErrorAction SilentlyContinue)
  if ($existingListeners.Count -gt 0) {
    throw "Port $DatabasePort is occupied while the configured isolated test database is stopped."
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $DatabaseLog -Parent) | Out-Null
  & $PgCtl -D $DatabaseDirectory -l $DatabaseLog -o "-p $DatabasePort -h 127.0.0.1 -c shared_preload_libraries= -c archive_mode=off -c logging_collector=off" -w start
  if ($LASTEXITCODE -ne 0) { throw "The isolated PostgreSQL test database did not start successfully." }
}

$databaseProcess = Get-VerifiedDatabaseProcess
if (-not $databaseProcess) { throw "The retained isolated PostgreSQL cluster has no active postmaster." }
$listeners = @(Get-NetTCPConnection -LocalPort $DatabasePort -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count -eq 0 -or @($listeners | Where-Object {
  $_.LocalAddress -ne "127.0.0.1" -or [int]$_.OwningProcess -ne [int]$databaseProcess.ProcessId
}).Count -gt 0) {
  throw "The isolated test database listener failed its process and loopback checks."
}

$launcher = Join-Path $ProjectRoot "scripts\start-localhost-3000.ps1"
$launcherParameters = @{ TestAdmin = $true; SandboxRoot = $SandboxRoot; Port = $Port }
if ($NoBrowser -or $CheckOnly) { $launcherParameters.NoBrowser = $true }
if ($CheckOnly) { $launcherParameters.CheckOnly = $true }
if ($RestartProjectProcess) { $launcherParameters.RestartProjectProcess = $true }
if ($CleanNext) { $launcherParameters.CleanNext = $true }
& $launcher @launcherParameters
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
