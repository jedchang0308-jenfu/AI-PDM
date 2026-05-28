# RD Report: UI e2e regression suite

Date: 2026-05-22
Scope: P1 UI e2e test suite

## Summary

Implemented a repeatable browser-based UI e2e regression script for the Web PDM MVP.

## Changes

- Added `scripts/ui-e2e-test.mjs`.
- Added `npm run qc:ui`.
- Added Playwright as a dev dependency.
- Updated `PDM_dev_task.md` to mark `P1 建立 UI e2e test suite` as complete.

## Coverage

The UI e2e script currently verifies:

- Login page can load.
- Manager authenticated browser session can load the dashboard.
- Manager can open a seeded submission detail.
- Revision history is visible.
- Manager can see approve and reject controls.
- File preview and download links are visible.
- Manager is blocked from Admin settings.
- Engineer can see own submission.
- Engineer cannot see approve or reject controls.
- Admin can open system settings.

## Notes

The script seeds its own Pending submission through the public API before opening the browser. It uses API-issued session cookies for browser contexts so the test remains stable against local dev-server origin restrictions while still validating the real dashboard, detail, settings, and role-gated UI.

Run command:

```powershell
npm.cmd run qc:ui
```
