# RD Report: File Hash Verification Tool

Date: 2026-05-22
Scope: P2 file hash recalculation check tool

## Changes

- Added `scripts/verify-file-hashes.mjs`.
- Added npm scripts:
  - `files:verify-hashes`
  - `qc:file-hashes`
- Added file hash verification to `qc:full`.
- Updated `PDM_dev_task.md` to mark the P2 file hash check tool complete.

## Behavior

The tool reads `submission_files` from SQLite and verifies each stored file:

- physical file exists
- path points to a file
- file size matches `file_size`
- recalculated SHA256 matches `sha256`

It prints a JSON summary and exits with non-zero status if any missing, unreadable, size-mismatched, or hash-mismatched files are found.

## Validation

- `node --check scripts/verify-file-hashes.mjs`
- `node --check scripts/qc-full-test.mjs`
- `npm.cmd run lint`
- `npm.cmd run qc:file-hashes`
- `npm.cmd run build`
- `npm.cmd run qc:full`

Result: all passed. Standalone hash verification checked 488 files with 0 issues. Full QC checked 502 files after regression-generated submissions with 0 issues. `qc:full` now runs 11 steps and completed with 11 passed / 0 failed.
