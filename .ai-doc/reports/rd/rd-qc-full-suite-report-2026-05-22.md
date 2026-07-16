# RD Report: Fixed QC Full Suite

Date: 2026-05-22
Scope: P1 API integration tests in a fixed validation flow

## Changes

- Added `scripts/qc-full-test.mjs`.
- Adjusted Windows command spawning in `scripts/qc-full-test.mjs` to avoid Node's shell-with-args deprecation warning.
- Added npm script `qc:full`.
- Updated `PDM_dev_task.md`:
  - `P1 補 API integration tests 到固定驗證流程`
  - `P1 建立正式 API integration test suite`

## Flow

`npm.cmd run qc:full` runs the validation sequence in a safe order:

1. `lint`
2. `audit`
3. `build`
4. `qc:gdrive`
5. `qc:release-failure`
6. start a dedicated Next.js dev server on a free local port
7. `smoke`
8. `qc:api`
9. `qc:ui`

## Reason

Some tests start their own isolated Next.js dev server, while others require a shared running app. Running them in parallel can trigger Next.js project locks or SQLite contention. The full suite makes this deterministic by sequencing the tests and injecting `PDM_BASE_URL` into app-dependent checks.

## Notes

- Do not run another `next dev` in the same repository while `qc:full` is running.
- The earlier Node spawn deprecation warning is removed from `qc:full`.
- The suite does not remove the existing `node:sqlite` experimental warning; that remains a separate P2 driver replacement task.
