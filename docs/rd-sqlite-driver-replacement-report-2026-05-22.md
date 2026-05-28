# RD Report: SQLite Driver Replacement

Date: 2026-05-22
Scope: Replace experimental `node:sqlite` with a stable SQLite driver

## Changes

- Added `better-sqlite3` runtime dependency.
- Added `@types/better-sqlite3` development dependency.
- Replaced `node:sqlite` usage in the Next.js database layer.
- Replaced `node:sqlite` usage in database, QC, backup, restore, and migration scripts.
- Removed the local `src/types/node-sqlite.d.ts` shim.
- Updated `PDM_dev_task.md` to mark the P2 SQLite driver replacement items complete.

## Reason

Node's built-in `node:sqlite` API is still experimental in the current runtime, which generated repeated warnings during builds and QC runs. `better-sqlite3` provides the same synchronous query style already used by the project, so the replacement keeps the implementation small while removing the experimental dependency.

## Validation

- `node --check scripts/init-db.mjs`
- `node --check scripts/qc-api-test.mjs`
- `node --check scripts/qc-gdrive-integration-test.mjs`
- `node --check scripts/qc-release-failure-test.mjs`
- `npm.cmd run lint`
- `npm.cmd audit --audit-level=moderate`
- `npm.cmd run build`
- `npm.cmd run qc:full`
- `npm.cmd run backup:drill`
- `npm.cmd run backup:retention-drill`

Result: all passed. `qc:full` completed with 9 passed / 0 failed, backup restore/retention drills passed, and the previous `node:sqlite ExperimentalWarning` no longer appears.
