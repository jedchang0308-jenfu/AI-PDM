param(
  [string]$OutputDirectory = '.tmp\dev129-native',
  [switch]$Test
)
$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path $PSScriptRoot -Parent
$taskCompiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $taskCompiler)) { throw 'DEV129_DOTNET_FRAMEWORK_CSC_UNAVAILABLE' }
$taskOutput = if ([IO.Path]::IsPathRooted($OutputDirectory)) { $OutputDirectory } else { Join-Path $taskProjectRoot $OutputDirectory }
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
$taskSources = @(
  (Join-Path $taskProjectRoot 'windows-service\tools\SolidWorksDocumentManagerRuntime.cs'),
  (Join-Path $taskProjectRoot 'windows-service\tools\AipdmAssemblyAnalyzer.cs')
)
$taskReferences = @('/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Security.dll', '/reference:System.Web.Extensions.dll')
& $taskCompiler /nologo /platform:x64 /target:exe ("/out:" + (Join-Path $taskOutput 'AipdmAssemblyAnalyzer.exe')) @taskReferences @taskSources
if ($LASTEXITCODE -ne 0) { throw 'DEV129_ASSEMBLY_ANALYZER_COMPILE_FAILED' }
if ($Test) {
  $taskTestOutput = Join-Path $taskOutput 'AipdmAssemblyAnalyzerTests.exe'
  & $taskCompiler /nologo /platform:x64 /target:exe /main:AipdmAssemblyAnalyzerTests ("/out:" + $taskTestOutput) @taskReferences @taskSources (Join-Path $taskProjectRoot 'windows-service\tests\AipdmAssemblyAnalyzerTests.cs') (Join-Path $taskProjectRoot 'windows-service\tests\AssemblyNativeDoubles.cs')
  if ($LASTEXITCODE -ne 0) { throw 'DEV129_ASSEMBLY_ANALYZER_TEST_COMPILE_FAILED' }
  & $taskTestOutput
  if ($LASTEXITCODE -ne 0) { throw 'DEV129_ASSEMBLY_ANALYZER_TEST_FAILED' }
}
