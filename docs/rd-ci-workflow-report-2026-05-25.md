# RD Report: CI Workflow

Date: 2026-05-25
Scope: P2 CI workflow

## Summary

Added a GitHub Actions workflow to run the existing full QC suite automatically.

## Changes

- Added `.github/workflows/ci.yml`.
- CI runs on `windows-latest` to match the current Windows-first project and validation assumptions.
- CI installs dependencies with `npm ci`.
- CI installs the Playwright Chromium browser required by the UI E2E suite.
- CI executes `npm run qc:full`, which includes lint, audit, build, Google Drive integration, release failure tests, local Google Drive compensation, smoke, API regression, UI E2E, and file hash verification.
- Updated `PDM_dev_task.md` to mark `P2 建立 CI workflow` complete.

## Verification

Local validation:

```powershell
node --check scripts/qc-full-test.mjs
npm.cmd run qc:file-hashes
```

GitHub Actions execution requires pushing the branch to GitHub or manually running `workflow_dispatch`.
