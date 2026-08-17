param(
    [string]$DllPath = (Join-Path (Resolve-Path "$PSScriptRoot\..") "sw-addin\bin\Release\AiPdmAddin.dll")
)

& "$PSScriptRoot\register-sw-addin.ps1" -DllPath $DllPath -Unregister
