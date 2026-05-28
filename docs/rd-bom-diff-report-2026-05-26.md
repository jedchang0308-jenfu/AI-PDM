# RD Report - BOM Diff

Date: 2026-05-26

## Scope

Implemented lightweight Engineering BOM diff for fast engineering review before approval.

## Completed Work

- Added BOM diff types in `src/lib/types.ts`.
- Added BOM diff helpers in `src/lib/db.ts`:
  - Find previous BOM submission for the same item.
  - Compare two BOMs by child part number.
  - Classify lines as `added`, `removed`, `changed`, or `unchanged`.
  - Count added, removed, changed, and unchanged lines.
- Added `GET /api/submissions/[id]/bom/diff`.
- Added Dashboard BOM diff summary below Engineering BOM.
- Added API regression coverage `BOMDIFF-001` through `BOMDIFF-013`.

## Behavior

- Default diff compares the target BOM with the previous BOM for the same item.
- `baseSubmissionId` can be passed to compare against a specific base submission.
- Engineer users can only diff submissions they can read.
- Manager/Admin users can diff readable team submissions.
- Missing target BOM returns a non-2xx response.
- Missing previous BOM returns a non-2xx response.

## RD Self-Check

- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.
- Build route list includes `/api/submissions/[id]/bom/diff`.
