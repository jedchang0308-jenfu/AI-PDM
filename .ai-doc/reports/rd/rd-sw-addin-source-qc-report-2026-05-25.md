# RD Report: SolidWorks Add-in Source QC

Date: 2026-05-25  
Scope: SolidWorks C# Add-in source-level automated validation

## Summary

Added an automated source-level QC gate for the SolidWorks Add-in. This does not replace compile, COM registration, or real SolidWorks validation, but it catches project-structure and safety drift before the work reaches a CAD workstation.

## Changes

- Added `scripts/qc-sw-addin-source-test.mjs`.
- Added `npm.cmd run qc:sw-addin-source`.
- Added the new Add-in source check to `npm.cmd run qc:full`.
- Updated QA validation plan, README, and task tracking.

## Coverage

The new check verifies:

- Required Add-in source, WPF, project, and solution files exist.
- Project targets .NET Framework 4.8 and registers COM interop.
- SolidWorks interop references are declared.
- `SwAddin` implements `ISwAddin`, COM attributes, `ConnectToSW`, `DisconnectFromSW`, CommandManager buttons, and registry registration helpers.
- Required custom properties are checked.
- PDF/DWG export uses `SaveAs3` with silent options.
- DPAPI token persistence uses `DataProtectionScope.CurrentUser`.
- API upload uses Bearer auth and multipart form-data.
- Temporary files are cleaned on success and failure.
- Source does not embed high-privilege cloud credential names.

## Remaining External Gate

The P0 SolidWorks blocker remains partial until a real CAD workstation completes:

- Build with Visual Studio Build Tools / MSBuild and SolidWorks interop assemblies.
- COM registration.
- SolidWorks Add-ins list load/unload validation.
- End-to-end submission from actual part, assembly, and drawing files.
