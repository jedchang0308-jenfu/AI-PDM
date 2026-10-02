param([Parameter(Mandatory = $true)][string]$TestDirectory)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-workload-auth.ps1')
$checks = New-Object Collections.Generic.List[string]
function Assert-Check { param([string]$Name, [bool]$Passed); if (-not $Passed) { throw "Local workload contract failed: $Name" }; $checks.Add($Name) }
function Get-TokenDigest { param([string]$Value); $algorithm = [Security.Cryptography.SHA256]::Create(); try { [Convert]::ToBase64String($algorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value))) } finally { $algorithm.Dispose() } }
$file = Join-Path $TestDirectory 'workloads.dpapi'
$env:NODE_ENV = 'test'
$env:PDM_PREVIEW_WORKER_TOKEN = 'OLD_PREVIEW_TOKEN_MUST_NOT_BE_REUSED'
$env:PDM_DRAWING_RECOGNITION_WORKER_TOKEN = 'OLD_RECOGNITION_TOKEN_MUST_NOT_BE_REUSED'
$env:PDM_WORKLOAD_AUTH_CREDENTIALS = '{"schemaVersion":"untrusted-external-config"}'
$bundle = Initialize-PdmLocalWorkloadAuth -CredentialFile $file
$json = $env:PDM_WORKLOAD_AUTH_CREDENTIALS
$stored = [IO.File]::ReadAllText($file)
Assert-Check 'DPAPI file contains no plaintext token or JSON' (-not $stored.Contains('workloads') -and @($bundle.workloads | Where-Object { $stored.Contains($_.token) }).Count -eq 0)
Assert-Check 'distinct registered 32-byte credentials' (@($bundle.workloads).Count -eq 3 -and @($bundle.workloads.token | Sort-Object -Unique).Count -eq 3 -and @($bundle.workloads | Where-Object { $_.token -cnotmatch '^[A-Za-z0-9_-]{43}$' }).Count -eq 0)
Assert-Check 'legacy environment is not a credential source' (-not $env:PDM_PREVIEW_WORKER_TOKEN -and -not $env:PDM_DRAWING_RECOGNITION_WORKER_TOKEN -and -not $json.Contains('OLD_'))
$reload = Initialize-PdmLocalWorkloadAuth -CredentialFile $file
Assert-Check 'existing bootstrap remains stable for server and workers' (@($reload.workloads | Where-Object { $id = $_.id; $token = $_.token; @($bundle.workloads | Where-Object { $_.id -ceq $id -and $_.token -ceq $token }).Count -ne 1 }).Count -eq 0)
$stub = Join-Path $TestDirectory 'child.mjs'
@'
import crypto from 'node:crypto';
const value = process.env.PDM_WORKLOAD_CREDENTIAL || '';
process.stdout.write(JSON.stringify({id:process.env.PDM_WORKLOAD_ID, tokenDigest:crypto.createHash('sha256').update(value).digest('base64'), serverBundleAbsent:!process.env.PDM_WORKLOAD_AUTH_CREDENTIALS, legacyAbsent:!process.env.PDM_PREVIEW_WORKER_TOKEN && !process.env.PDM_DRAWING_RECOGNITION_WORKER_TOKEN && !process.env.PDM_RECOGNITION_WORKER_TOKEN}));
'@ | Set-Content -LiteralPath $stub -Encoding UTF8
$env:PDM_WORKLOAD_CREDENTIAL = 'parent-sentinel'
$env:PDM_WORKLOAD_ID = 'parent-id'
$env:PDM_PREVIEW_WORKER_TOKEN = 'parent-old-token'
foreach ($row in $bundle.workloads) {
  $out = Join-Path $TestDirectory ($row.id + '.out.json')
  $err = Join-Path $TestDirectory ($row.id + '.err.log')
  $child = Start-PdmLocalWorkloadProcess -Bundle $bundle -WorkloadId $row.id -ProcessArguments @{ FilePath = (Get-Command node.exe).Source; ArgumentList = @('"' + $stub + '"'); WorkingDirectory = $TestDirectory; RedirectStandardOutput = $out; RedirectStandardError = $err }
  if (-not $child.WaitForExit(10000)) { Stop-Process -Id $child.Id -Force; throw 'Task-owned child timeout.' }
  $childExitCode = $child.ExitCode
  Assert-Check ($row.id + ' child exit') ($childExitCode -eq 0 -or ($null -eq $childExitCode -and (Test-Path -LiteralPath $out) -and [IO.File]::ReadAllText($err).Length -eq 0))
  $observed = Get-Content -LiteralPath $out -Raw | ConvertFrom-Json
  Assert-Check ($row.id + ' child owns exactly its registered credential') ($observed.id -ceq $row.id -and $observed.tokenDigest -ceq (Get-TokenDigest $row.token) -and $observed.serverBundleAbsent -and $observed.legacyAbsent)
  Assert-Check ($row.id + ' restores parent environment') ($env:PDM_WORKLOAD_AUTH_CREDENTIALS -ceq $json -and $env:PDM_WORKLOAD_ID -ceq 'parent-id' -and $env:PDM_WORKLOAD_CREDENTIAL -ceq 'parent-sentinel' -and $env:PDM_PREVIEW_WORKER_TOKEN -ceq 'parent-old-token')
}
$failed = $false
try { Start-PdmLocalWorkloadProcess -Bundle $bundle -WorkloadId 'unknown' -ProcessArguments @{ FilePath = (Get-Command node.exe).Source } | Out-Null } catch { $failed = $true }
Assert-Check 'unknown actor rejected before process creation' $failed
$failed = $false
try { Start-PdmLocalWorkloadProcess -Bundle $bundle -WorkloadId $bundle.workloads[0].id -ProcessArguments @{ FilePath = (Join-Path $TestDirectory 'does-not-exist.exe') } | Out-Null } catch { $failed = $true }
Assert-Check 'failed spawn restores parent environment' ($failed -and $env:PDM_WORKLOAD_AUTH_CREDENTIALS -ceq $json -and $env:PDM_WORKLOAD_ID -ceq 'parent-id' -and $env:PDM_WORKLOAD_CREDENTIAL -ceq 'parent-sentinel' -and $env:PDM_PREVIEW_WORKER_TOKEN -ceq 'parent-old-token')
function Write-TestBundle { param($Value); $plaintext = [Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 6 -Compress)); try { [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($plaintext, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)) | Set-Content -LiteralPath $file -Encoding ascii } finally { [Array]::Clear($plaintext, 0, $plaintext.Length) } }
$invalid = $json | ConvertFrom-Json
$invalid.workloads[1].token = $invalid.workloads[0].token
Write-TestBundle $invalid
$failed = $false
try { Initialize-PdmLocalWorkloadAuth -CredentialFile $file | Out-Null } catch { $failed = $true }
Assert-Check 'duplicate credentials fail closed' $failed
$invalid = $json | ConvertFrom-Json
$invalid.workloads[0].purposes = @('preview_jobs', 'preview_heartbeat', 'solidworks_credential')
Write-TestBundle $invalid
$failed = $false
try { Initialize-PdmLocalWorkloadAuth -CredentialFile $file | Out-Null } catch { $failed = $true }
Assert-Check 'scope widening fails closed' $failed
$invalid = $json | ConvertFrom-Json
$invalid | Add-Member -NotePropertyName extra -NotePropertyValue 'forbidden'
Write-TestBundle $invalid
$failed = $false
try { Initialize-PdmLocalWorkloadAuth -CredentialFile $file | Out-Null } catch { $failed = $true }
Assert-Check 'unknown bundle fields fail closed' $failed
$env:NODE_ENV = 'production'
$failed = $false
try { Initialize-PdmLocalWorkloadAuth -CredentialFile $file | Out-Null } catch { $failed = $true }
Assert-Check 'local bootstrap cannot run in Production' $failed
[pscustomobject]@{ checks = @($checks); passed = $true; secretMaterialPrinted = $false; primaryRuntimeStarted = $false; databaseTouched = $false } | ConvertTo-Json -Depth 4 -Compress
