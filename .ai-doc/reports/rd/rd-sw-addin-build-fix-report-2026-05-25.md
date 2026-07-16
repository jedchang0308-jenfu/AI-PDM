# RD Report: SolidWorks Add-in Build Fix

Date: 2026-05-25

## Summary

Executed the SolidWorks Add-in readiness item up to the limit available from this shell. The add-in source QC now passes and the Release x64 DLL builds successfully on this CAD-capable machine.

## Changes

- Replaced the Add-in Newtonsoft.Json dependency with .NET Framework built-in DataContractJsonSerializer helper.
- Converted Add-in source from C# 6/7 syntax to C# 5-compatible syntax for the installed .NET Framework MSBuild compiler.
- Fixed malformed UI and error message string literals that prevented compilation.
- Updated SolidWorks interop calls to match the installed API signatures:
  - `ICustomPropertyManager.Get6(..., out linkToProperty)`
  - `IModelDocExtension.SaveAs3(...)`
- Set the Add-in project output to x64 to match modern SolidWorks process architecture.
- Added a SolidWorks interop DLL fallback path for common local SolidWorks installations, while keeping `..\lib` as the final fallback.
- Updated source QC checks to validate current English validation messages instead of legacy mojibake text.

## Verification

- `npm.cmd run qc:sw-addin-source`: 58 passed / 0 failed.
- Release x64 build:
  - Command used `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\MSBuild.exe`
  - Output: `sw-addin/bin/Release/AiPdmAddin.dll`
  - Result: build succeeded, 0 errors.
  - Verified without a command-line `ReferencePath`; the project resolved local SolidWorks interop DLLs directly.

## Remaining Blocker

This shell is not running as Administrator, so COM registration was not executed. Formal readiness still requires an administrator session to run RegAsm and then complete the SolidWorks UI test cases in `data/sw-addin-test-reports/20260525-131542/report.json`.

The build emitted one environment warning because this machine has the .NET Framework 4.8 runtime but not the .NET Framework 4.8 Developer Pack / targeting pack. The DLL still builds, but installing the Developer Pack is recommended on the CAD build machine.
