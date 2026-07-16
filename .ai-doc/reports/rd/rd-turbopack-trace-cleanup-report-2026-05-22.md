# RD Report: Turbopack trace warning cleanup

Date: 2026-05-22
Scope: P2 Turbopack dynamic filesystem trace warning

## Summary

Removed the Turbopack dynamic filesystem trace warning from `next build`.

## Changes

- Removed API-route imports of the broad `config` object when the route only needed scalar environment values.
- Kept repository and data path resolution local to the modules that need filesystem access.
- Added `/*turbopackIgnore: true*/` at the path operations that intentionally use runtime filesystem paths.

## Updated Files

- `src/app/api/settings/route.ts`
- `src/app/api/submissions/route.ts`
- `src/app/api/submissions/[id]/retry-upload/route.ts`
- `src/lib/chat.ts`
- `src/lib/db.ts`
- `src/lib/file-response.ts`
- `src/lib/file-store.ts`
- `src/lib/gdrive.ts`
- `src/lib/release.ts`
- `PDM_dev_task.md`
- `.ai-doc/qa/qa-validation-plan.md`

## Verification

`npm.cmd run build` now passes without Turbopack trace warnings. The remaining build-time warning is only Node's experimental `node:sqlite` warning.
