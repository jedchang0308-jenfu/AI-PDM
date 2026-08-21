param(
  [Parameter(Mandatory = $true)][ValidateSet("protect")][string]$Operation
)

# DEV-035 operator helper contract: the application normally invokes the same
# CurrentUser DPAPI boundary internally; this script is only a diagnostics aid.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security
$value = [Console]::In.ReadToEnd().Trim()
if ([string]::IsNullOrWhiteSpace($value)) { throw "EMPTY_SECRET_INPUT" }
$bytes = [Text.Encoding]::UTF8.GetBytes($value)
$protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[Convert]::ToBase64String($protected)
