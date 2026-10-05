# Prepare-only launcher. Startup registration is deliberately not performed.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ConfigurationPath)
$ErrorActionPreference='Stop'
$configFile=Get-Item -LiteralPath $ConfigurationPath
if ($configFile.Attributes -band [IO.FileAttributes]::ReparsePoint) {throw 'Configuration must be a protected regular file'}
$ownerSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$acl=Get-Acl -LiteralPath $configFile.FullName
foreach ($rule in $acl.Access) {
  $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
  if ($rule.AccessControlType -eq 'Allow' -and $sid -notin @($ownerSid,'S-1-5-18','S-1-5-32-544')) {throw 'Configuration ACL must be private to owner/system/admin'}
}
$configuration=Get-Content -LiteralPath $configFile.FullName -Raw | ConvertFrom-Json
if ($configuration.workerId -notmatch '^[A-Za-z0-9._:-]{1,120}$' -or !$configuration.protectedWorkloadCredential) {throw 'Protected workload configuration required'}
$origin=[Uri]$configuration.baseUrl
if ($origin.Scheme -ne 'https' -and !($origin.Scheme -eq 'http' -and $origin.IsLoopback)) {throw 'HTTPS or loopback origin required'}
$credential=ConvertTo-SecureString -String $configuration.protectedWorkloadCredential
$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential)
$savedEnvironment=@{}
foreach ($name in @('PDM_WORKLOAD_ID','PDM_DRAWING_RECOGNITION_WORKER_BASE_URL','PDM_ALLOW_WORKER_ENV_SECRET_FALLBACK')) {$savedEnvironment[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$previousToken=[Environment]::GetEnvironmentVariable('PDM_WORKLOAD_CREDENTIAL','Process')
try {
  $env:PDM_WORKLOAD_CREDENTIAL=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $env:PDM_WORKLOAD_ID=$configuration.workerId
  $env:PDM_DRAWING_RECOGNITION_WORKER_BASE_URL=$origin.AbsoluteUri.TrimEnd('/')
  $env:PDM_ALLOW_WORKER_ENV_SECRET_FALLBACK='false'
  $projectRoot=Split-Path -Parent $PSScriptRoot
  Push-Location -LiteralPath $projectRoot
  try { & node --experimental-transform-types --loader ./scripts/qc-ts-path-loader.mjs ./scripts/run-drawing-recognition-worker.mjs }
  finally {Pop-Location}
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  [Environment]::SetEnvironmentVariable('PDM_WORKLOAD_CREDENTIAL',$previousToken,'Process')
  foreach ($name in $savedEnvironment.Keys) {[Environment]::SetEnvironmentVariable($name,$savedEnvironment[$name],'Process')}
  $credential.Dispose()
}
