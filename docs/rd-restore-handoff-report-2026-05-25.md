# RD Report: Restore Handoff Package

Date: 2026-05-25  
Scope: P1 independent test-machine restore preparation

## Summary

Added a restore handoff generator for the offline backup workflow. This does not complete the P0 independent-machine restore drill by itself, but it makes the external drill executable and repeatable.

## Changes

- Added `scripts/prepare-restore-handoff.mjs`.
- Added `npm.cmd run backup:handoff`.
- Updated `docs/restore-drill-sop.md`.
- Updated README backup/restore commands.
- Updated `PDM_dev_task.md`.

## Output

`npm.cmd run backup:handoff` verifies the selected snapshot and writes:

- `data/restore-handoffs/<snapshotId>/restore-handoff.json`
- `data/restore-handoffs/<snapshotId>/restore-on-test-machine.ps1`
- `data/restore-handoffs/<snapshotId>/README.md`

## Test Machine Flow

The generated PowerShell script performs:

1. Backup manifest verification.
2. Restore into `data/restore-targets/manual-restore`.
3. `build`.
4. `smoke`.
5. `qc:api`.
6. `qc:file-hashes` against restored paths.
7. `qc:production-readiness:report`.

## Remaining P0

The P0 restore blocker remains partial until the handoff is executed on an independent Windows test machine and the QC result is recorded.
