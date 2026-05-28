# RD Report: Local Google Drive Release Compensation

Date: 2026-05-22
Scope: P0 formal transaction strategy for DB writes and file movement compensation

## Changes

- Changed local Google Drive release so any move or metadata failure fails the release instead of silently continuing.
- Added Drive parent restoration for files that were moved before a later release step failed.
- Restored compensated DB file status back to `uploaded`.
- Added `moveFileToParents` support in the Google Drive service.
- Added `scripts/qc-local-gdrive-compensation-test.mjs`.
- Added npm script `qc:local-gdrive-compensation`.
- Added the compensation test to `qc:full`.
- Updated `PDM_dev_task.md` to mark the P0 transaction/compensation item complete.

## Behavior

If local Google Drive release fails after a file has been moved to the Released folder, the backend now tries to move the file back to its previous Drive parent folder and marks the DB file status back to `uploaded`. The approval API then returns `500`, stores `ReleaseFailed`, and writes a `ReleaseFailed` audit log.

This keeps the release workflow from reporting `Released` when Drive has only partially completed the operation.

## Validation

- `node --check scripts/qc-local-gdrive-compensation-test.mjs`
- `node --check scripts/qc-full-test.mjs`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:local-gdrive-compensation`
- `npm.cmd run qc:full`

Result: all passed. `qc:local-gdrive-compensation` completed with 9 passed / 0 failed. `qc:full` now runs 10 steps and completed with 10 passed / 0 failed.
