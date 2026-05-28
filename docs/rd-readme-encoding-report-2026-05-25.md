# RD Report: README Encoding Cleanup

Date: 2026-05-25
Scope: P2 README Chinese display and UTF-8 with BOM

## Summary

Rewrote `README.md` with readable Traditional Chinese content and converted the file to UTF-8 with BOM.

## Changes

- Replaced garbled README text with a current project overview.
- Added sections for setup, demo accounts, commands, environment variables, release modes, LLM modes, SolidWorks Add-in, backup/restore, CI, and remaining production-readiness confirmations.
- Updated `PDM_dev_task.md` to mark both README-related P2 items complete.

## Verification

Local validation:

```powershell
node --check scripts/qc-full-test.mjs
npm.cmd run qc:file-hashes
```

Encoding validation should confirm the first three bytes of `README.md` are `EF BB BF`.
