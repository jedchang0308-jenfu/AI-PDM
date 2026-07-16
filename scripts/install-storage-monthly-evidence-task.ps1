param(
  [string]$TaskName = "AI PDM Storage Monthly Evidence",
  [string]$Time = "07:00",
  [switch]$FailOnBlocker,
  [switch]$FailOnWarning
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$arguments = "run storage:monthly-evidence:scheduled"

if ($FailOnBlocker -or $FailOnWarning) {
  $arguments += " --"
  if ($FailOnBlocker) {
    $arguments += " --fail-on-blocker"
  }
  if ($FailOnWarning) {
    $arguments += " --fail-on-warning"
  }
}

$action = New-ScheduledTaskAction `
  -Execute $npm `
  -Argument $arguments `
  -WorkingDirectory $repoRoot

$trigger = New-ScheduledTaskTrigger -Monthly -DaysOfMonth 1 -At $Time
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Creates the monthly AI PDM storage cost and egress evidence package." `
  -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName' monthly at $Time."
