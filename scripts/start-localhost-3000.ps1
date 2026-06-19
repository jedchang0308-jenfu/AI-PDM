param(
  [switch]$NoBrowser,
  [switch]$StopForeignProcess
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$HostName = "127.0.0.1"
$Port = 3000
$Url = "http://${HostName}:$Port/"
$ProjectRootLower = $ProjectRoot.ToLowerInvariant()

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

function Test-LocalPortOpen {
  $client = [System.Net.Sockets.TcpClient]::new()

  try {
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(500)) {
      return $false
    }

    $client.EndConnect($async)
    return $true
  }
  catch {
    return $false
  }
  finally {
    $client.Close()
  }
}

function Open-LocalPage {
  if (-not $NoBrowser) {
    Start-Process $Url
  }
}

$listeners = @(Get-PortListeners)
if ($listeners.Count -gt 0) {
  $ownerProcessId = ($listeners | Select-Object -First 1).OwningProcess
  $processInfo = Get-OwnerProcessInfo -OwnerProcessId $ownerProcessId

  if (Test-IsProjectProcess -ProcessInfo $processInfo) {
    Write-Host "AI_PDM is already running at $Url"
    Open-LocalPage
    exit 0
  }

  $processName = if ($processInfo) { $processInfo.Name } else { "unknown" }
  $commandLine = if ($processInfo -and $processInfo.CommandLine) { $processInfo.CommandLine } else { "(command line unavailable)" }

  if ($StopForeignProcess) {
    Write-Host "Port $Port is occupied by PID $ownerProcessId ($processName). Stopping it because -StopForeignProcess was provided."
    Stop-Process -Id $ownerProcessId -Force
    Start-Sleep -Seconds 1
  }
  else {
    Write-Error "Port $Port is already occupied by PID $ownerProcessId ($processName). Command: $commandLine"
    Write-Host "Close that process first, or run this script with -StopForeignProcess if you intentionally want to stop it."
    exit 1
  }
}

$serverCommand = "Set-Location -LiteralPath '$($ProjectRoot.Replace("'", "''"))'; npm run dev:local"
$encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($serverCommand))

Write-Host "Starting AI_PDM at $Url"
Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList @("-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encodedCommand) `
  -WindowStyle Minimized

$deadline = [DateTime]::UtcNow.AddSeconds(30)
do {
  if (Test-LocalPortOpen) {
    Write-Host "AI_PDM is ready at $Url"
    Open-LocalPage
    exit 0
  }

  Start-Sleep -Milliseconds 500
} while ([DateTime]::UtcNow -lt $deadline)

Write-Error "AI_PDM did not become ready at $Url within 30 seconds."
exit 1
