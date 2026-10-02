# Local development only. Never load or reuse a Production workload bundle.
function Get-PdmLocalWorkloadProfiles {
  @(
    @{ id = 'windows-shell-thumbnail-worker'; purposes = @('preview_jobs', 'preview_heartbeat'); capabilities = @('solidworks_3d_preview_png') },
    @{ id = 'local-drawing-recognition-worker'; purposes = @('recognition_jobs', 'recognition_heartbeat', 'settings_secret_probe', 'solidworks_credential'); capabilities = @('solidworks_document_manager') },
    @{ id = 'solidworks-document-manager-preview-worker'; purposes = @('preview_jobs', 'preview_heartbeat', 'solidworks_credential'); capabilities = @('solidworks_2d_preview_png', 'solidworks_document_manager') }
  )
}

function Initialize-PdmLocalWorkloadAuth {
  param([Parameter(Mandatory = $true)][string]$CredentialFile)
  if ($env:NODE_ENV -eq 'production') { throw 'Local workload credentials cannot be used for Production.' }
  if ($PSVersionTable.PSEdition -eq 'Desktop') { [Reflection.Assembly]::Load('System.Security, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a') | Out-Null }
  $profiles = @(Get-PdmLocalWorkloadProfiles)
  if (Test-Path -LiteralPath $CredentialFile) {
    try {
      $protected = [Convert]::FromBase64String([IO.File]::ReadAllText($CredentialFile).Trim())
      $plaintext = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
      try { $bundle = [Text.Encoding]::UTF8.GetString($plaintext) | ConvertFrom-Json }
      finally { [Array]::Clear($plaintext, 0, $plaintext.Length) }
    }
    catch { throw 'Local workload credential file is unreadable; preserve it and inspect the local runtime before replacing it.' }
  }
  else {
    $workloads = foreach ($profile in $profiles) {
      $bytes = New-Object byte[] 32
      $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
      try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
      $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
      @{ id = $profile.id; token = $token; purposes = $profile.purposes; capabilities = $profile.capabilities }
    }
    $bundle = @{ schemaVersion = 'ai-pdm.workload-credentials.v1'; workloads = @($workloads) }
    $plaintext = [Text.Encoding]::UTF8.GetBytes(($bundle | ConvertTo-Json -Depth 6 -Compress))
    try { $encrypted = [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($plaintext, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)) }
    finally { [Array]::Clear($plaintext, 0, $plaintext.Length) }
    # Windows DPAPI CurrentUser protection; do not persist plaintext, reuse old token files, or overwrite a concurrent bootstrap.
    $stream = [IO.File]::Open($CredentialFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $bytes = [Text.Encoding]::ASCII.GetBytes($encrypted); $stream.Write($bytes, 0, $bytes.Length) }
    finally { $stream.Dispose() }
  }
  $tokens = @{}
  if ((($bundle.PSObject.Properties.Name | Sort-Object) -join ',') -cne 'schemaVersion,workloads' -and $bundle -isnot [Collections.IDictionary]) {
    throw 'Invalid local workload bundle.'
  }
  if ($bundle.schemaVersion -cne 'ai-pdm.workload-credentials.v1' -or @($bundle.workloads).Count -ne $profiles.Count) { throw 'Invalid local workload bundle.' }
  foreach ($profile in $profiles) {
    $rows = @($bundle.workloads | Where-Object { $_.id -ceq $profile.id })
    if ($rows.Count -ne 1) { throw 'Invalid local workload identity.' }
    $row = $rows[0]
    $keys = if ($row -is [Collections.IDictionary]) { $row.Keys } else { $row.PSObject.Properties.Name }
    if ((($keys | Sort-Object) -join ',') -cne 'capabilities,id,purposes,token' -or
      $row.token -isnot [string] -or $row.token -cnotmatch '^[A-Za-z0-9_-]{43}$' -or $tokens.ContainsKey($row.token) -or
      (@($row.purposes | Sort-Object) -join ',') -cne (@($profile.purposes | Sort-Object) -join ',') -or
      (@($row.capabilities | Sort-Object) -join ',') -cne (@($profile.capabilities | Sort-Object) -join ',')) { throw 'Invalid local workload scope.' }
    $tokens[$row.token] = $true
  }
  $env:PDM_WORKLOAD_AUTH_CREDENTIALS = $bundle | ConvertTo-Json -Depth 6 -Compress
  foreach ($name in @('PDM_PREVIEW_WORKER_TOKEN', 'PDM_DRAWING_RECOGNITION_WORKER_TOKEN', 'PDM_RECOGNITION_WORKER_TOKEN')) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
  return $bundle
}

function Start-PdmLocalWorkloadProcess {
  param(
    [Parameter(Mandatory = $true)]$Bundle,
    [Parameter(Mandatory = $true)][string]$WorkloadId,
    [Parameter(Mandatory = $true)][hashtable]$ProcessArguments
  )
  $rows = @($Bundle.workloads | Where-Object { $_.id -ceq $WorkloadId })
  if ($rows.Count -ne 1) { throw 'Local workload identity is not registered.' }
  $names = @('PDM_WORKLOAD_AUTH_CREDENTIALS', 'PDM_WORKLOAD_CREDENTIAL', 'PDM_WORKLOAD_ID', 'PDM_PREVIEW_WORKER_TOKEN', 'PDM_DRAWING_RECOGNITION_WORKER_TOKEN', 'PDM_RECOGNITION_WORKER_TOKEN')
  $saved = @{}
  foreach ($name in $names) {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
  try {
    $env:PDM_WORKLOAD_ID = $rows[0].id
    $env:PDM_WORKLOAD_CREDENTIAL = $rows[0].token
    # Child receives only its own credential, never the server bundle or sibling credentials.
    $arguments = $ProcessArguments.Clone()
    $arguments.WindowStyle = 'Hidden'
    $arguments.PassThru = $true
    return Start-Process @arguments
  }
  finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
  }
}
