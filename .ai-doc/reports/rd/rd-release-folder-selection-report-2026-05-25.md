# RD Report: Cloud Function Release Folder Selection

Date: 2026-05-25

Scope: P0 Google Cloud Function release with user-selected Pending / Released folders.

## Changes

- Added `qc:release-folders`.
- Added the release folder selection check into `qc:full`.
- Updated `.ai-doc/qa/qa-validation-plan.md`.
- Marked the DEV_TASK item complete.

## Verified Behavior

The new test starts a temporary app and mock Cloud Function, then:

1. Logs in as Admin.
2. Saves `gdrive_pending_folder_id` and `gdrive_released_folder_id` through `/api/settings`.
3. Creates a submission.
4. Approves it through the normal Manager workflow.
5. Verifies the Cloud Function request payload uses the selected folder IDs instead of environment fallback IDs.

## Validation

Run:

```bash
npm.cmd run qc:release-folders
npm.cmd run qc:full
```

Expected:

- `RELFOLDER-001` through `RELFOLDER-010` pass.
- `qc:full` includes `release folder selection`.
