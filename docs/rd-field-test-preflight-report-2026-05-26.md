# RD Report: Field Test Preflight

Date: 2026-05-26

## Scope

Added a preflight gate for the remaining external field validation work. This does not mark the SolidWorks or restore P0 blockers complete; it checks whether the test machine is prepared before QC spends time on the real-machine cases.

## Changes

- Added `scripts/field-test-preflight.mjs`.
- Added package scripts:
  - `npm.cmd run field-test:preflight`
  - `npm.cmd run qc:field-test-preflight`
- Updated `scripts/prepare-field-test-handoff.mjs` so new handoff packages include:
  - `commands/restore-preflight.ps1`
  - `commands/sw-addin-preflight.ps1`
  - preflight execution before SolidWorks build/register.
- Updated README and `PDM_dev_task.md`.

## Profiles

- `--profile cad`: validates Windows, Node/npm, .NET Framework 4.8 targeting pack, MSBuild, SolidWorks interop DLLs, Add-in solution, registration scripts, and latest SolidWorks report.
- `--profile restore`: validates Windows, Node/npm, restore scripts, latest restore handoff, and latest restore drill report.
- `--profile all`: runs both profiles.

## Verification

- `npm.cmd run field-test:preflight -- --profile all` passes with one warning when not running as Administrator.
- `npm.cmd run field-test:handoff` produces a handoff package with both preflight command wrappers.
- `npm.cmd run qc:sw-addin-build` passes with 0 warnings and 0 errors.
- `npm.cmd run lint` passes.

## Remaining P0

Production readiness still requires real evidence from:

- Administrator COM registration and SolidWorks UI/manual testing on a CAD workstation.
- Independent-machine restore drill and sign-off.
