# RD Report: SolidWorks Add-in Manual Test Checklist

Date: 2026-05-22
Scope: P1 SolidWorks Add-in manual test checklist

## Summary

Created a real-machine manual QC checklist for the SolidWorks C# Add-in.

## Changes

- Added `.ai-doc/runbooks/solidworks-addin-manual-test-checklist.md`.
- Covered Add-in installation, registration, login, token storage, metadata extraction, drawing PDF/DWG export, submission workflow, failure recovery, logs, and security checks.
- Updated `PDM_dev_task.md` to mark `P1 建立 SolidWorks Add-in manual test checklist` complete.

## Verification

Manual checklist only. No application code was changed.

Recommended next validation:

```powershell
npm.cmd run qc:full
```
