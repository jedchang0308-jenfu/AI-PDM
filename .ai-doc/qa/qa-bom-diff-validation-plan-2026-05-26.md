# QA Plan - BOM Diff

Date: 2026-05-26

## Objective

Validate a lightweight BOM diff capability that helps engineers quickly see child-part impact between revisions without introducing a heavy ECO/PLM workflow.

## Scope

- `GET /api/submissions/[id]/bom/diff`
- Default comparison against the previous submission for the same item.
- Optional comparison against a specified `baseSubmissionId`.
- Dashboard Engineering BOM diff summary.
- Existing BOM schema and BOM auto-draft behavior.

## Acceptance Criteria

- Unauthenticated users cannot read BOM diff data.
- Users must have read permission for both target submission and base submission.
- The API returns a clear non-2xx response when the target BOM is missing.
- The API returns a clear non-2xx response when no previous BOM exists and no base submission is provided.
- For the same parent item, the API can compare the target BOM against the previous BOM by default.
- The API supports explicit `baseSubmissionId` comparison.
- Diff output classifies lines as `added`, `removed`, `changed`, or `unchanged`.
- Quantity and revision differences are treated as `changed`.
- Diff output includes summary counts and per-line before/after quantity and revision.
- Dashboard detail shows BOM diff summary and changed lines when diff data is available.
- Existing submission, review, release package, handoff, notification, auth, AI, file hash, BOM schema, and BOM auto-draft regressions remain green.

## Required QC Evidence

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:api`
- `npm.cmd run qc:ui`
- `npm.cmd run qc:file-hashes`
- API regression must include BOM diff tests for unauthorized access, default previous revision comparison, explicit base comparison, changed count, added count, removed count, unchanged count, and cross-user permission.
