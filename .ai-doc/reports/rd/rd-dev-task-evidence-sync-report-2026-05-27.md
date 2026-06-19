# RD Report - Dev Task Evidence Sync

## Scope

新增 QA 用的 `PDM_dev_task.md` 證據同步工具，避免外部 P0/P1 項目在 SolidWorks、Restore、Document Manager 與 field-test 證據未 ready 前被人工誤勾。

## Changes

- Added `scripts/qa-sync-dev-task-evidence.mjs`.
- Added `npm run qa:dev-task:sync`.
- Added `scripts/qc-dev-task-evidence-sync.mjs`.
- Added `npm run qc:dev-task-evidence-sync`.

## Behavior

- Default mode is dry-run and does not write `PDM_dev_task.md`.
- `--apply` is required before any checkbox is updated.
- The tool only changes six external evidence-controlled target tasks.
- SolidWorks, Restore, and Document Manager targets require their own evidence validator to be ready.
- Formal field-test requires SolidWorks, Restore, and Document Manager evidence to all be ready.
- If a target task is already checked while evidence is not ready, the tool reports `unsafeCompleted` and exits non-zero.

## Current Result

Current project evidence is still open, so `qa:dev-task:sync` reports zero eligible changes and keeps all six external target tasks blocked.
