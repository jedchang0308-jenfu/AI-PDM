param(
  [string]$TaskName = "AI PDM Offline Backup",
  [string]$Time = "02:00"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source

$action = New-ScheduledTaskAction `
  -Execute $npm `
  -Argument "run backup" `
  -WorkingDirectory $repoRoot

$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Creates an offline AI PDM snapshot with SQLite DB, repository, config files, logs, and checksum manifest." `
  -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName' at $Time."
