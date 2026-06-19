# RD Report: SolidWorks Add-in Field Tooling

Date: 2026-05-25

## Summary

Added executable field tooling for the SolidWorks Add-in blocker. The source QC already checked structure, but field testing still needed repeatable build and registration commands. The CAD workstation workflow now has a build gate and Administrator registration scripts.

## Changes

- Added `scripts/qc-sw-addin-build-test.mjs`.
- Added npm scripts:
  - `npm.cmd run sw-addin:build`
  - `npm.cmd run qc:sw-addin-build`
- Added PowerShell scripts:
  - `scripts/register-sw-addin.ps1`
  - `scripts/unregister-sw-addin.ps1`
- Updated SolidWorks manual checklist with build, registration, and unregister commands.
- Updated field-test handoff generation so new handoff packages include SolidWorks build/register/unregister command wrappers.
- Updated README and `PDM_dev_task.md`.

## Build Gate Behavior

`qc-sw-addin-build-test.mjs` validates:

- Windows host.
- MSBuild availability.
- SolidWorks interop DLL availability.
- .NET Framework runtime availability.
- Release build output exists at `sw-addin/bin/Release/AiPdmAddin.dll`.

It uses `/p:RegisterForComInterop=false` so build QC does not mutate Windows registry. Registration remains an explicit Administrator action.

## Remaining External Step

Formal production readiness still requires running the registration script from elevated PowerShell and completing the SolidWorks UI/manual cases in `data/sw-addin-test-reports/<reportId>/report.json`.
