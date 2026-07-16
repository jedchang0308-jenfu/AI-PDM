# QC Report - Submission/File Discussion Thread Validation

Date: 2026-05-26

## Scope

QC validation for submission/file discussion thread based on `.ai-doc/qa/qa-discussion-thread-validation-plan-2026-05-26.md`.

## Result

Passed after RD fix.

## Initial QC Finding

The first API QC run failed `DISCUSS-012`.

Observed cause:

- Discussion comments created in the same timestamp window could be returned in unstable UUID order.
- The test expected the resolved comment metadata to be on the first comment.

RD fix:

- Discussion comment listing now uses SQLite insertion order as a stable tiebreaker.

## Final Evidence

Commands executed after the fix:

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run qc:api
npm.cmd run qc:ui
npm.cmd run qc:file-hashes
```

Observed final results:

- Lint: passed.
- Build: passed.
- API regression: 176 passed, 0 failed.
- UI E2E: 26 passed, 0 failed.
- File hash verification: 1254 checked, 1254 ok, 0 missing, 0 unreadable, 0 size mismatch, 0 hash mismatch.

## Discussion Coverage

API regression included and passed:

- `DISCUSS-001` unauthenticated discussion list returns 401.
- `DISCUSS-002` unauthenticated discussion create returns 401.
- `DISCUSS-003` Engineer creates submission comment.
- `DISCUSS-004` submission comment is open.
- `DISCUSS-005` Engineer creates file comment.
- `DISCUSS-006` file comment exposes file name.
- `DISCUSS-007` Engineer lists own discussion comments.
- `DISCUSS-008` discussion list has two comments.
- `DISCUSS-009` Manager resolves discussion comment.
- `DISCUSS-010` resolved discussion status.
- `DISCUSS-011` Manager lists team discussion comments.
- `DISCUSS-012` Manager sees resolved metadata.
- `DISCUSS-013` cross-submission file comment returns 400.
- `DISCUSS-014` Engineer cannot list other Engineer discussions.

## QC Notes

- Local Next.js dev server was started for API/UI validation and stopped after the run.
- Final regression also revalidated auth, submission, file, checkout, history, BOM, BOM diff, Where-used, AI, review, release package, handoff, notification, and Bearer token flows.
