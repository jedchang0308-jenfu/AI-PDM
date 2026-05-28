# RD Report: Released filename guard

Date: 2026-05-22
Role: RD
Scope: Release safety / duplicate Released filename blocking

## Completed

- Added a release-time duplicate filename guard.
- Added DB lookup for existing `Released` submission files by `file_role` and case-insensitive `original_filename`.
- Applied the guard before local-dev stub, local-gdrive release, and future Cloud Function release calls.
- Added local-gdrive idempotency behavior for files already marked `moved`.
- Added QC regression cases `REL-001` through `REL-005`.

## Behavior

When approving a pending submission, release now checks whether any file would duplicate a file already present in a different `Released` submission.

If a conflict exists:

- the release call throws `DUPLICATE_RELEASE_FILENAME`
- the submission transitions to `ReleaseFailed`
- the approve API returns `500`
- audit log records `ReleaseFailed`

This prevents a second released record from claiming the same released filename.

## Validation

Executed:

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run smoke`
- `npm.cmd run qc:api`
- `npm.cmd audit --audit-level=moderate`

Result:

- `qc:api`: 71 passed / 0 failed
- Duplicate Released filename is blocked by regression test

## Remaining work

Cloud Function idempotency still needs to be implemented when the external release function exists. The local code now prevents duplicate filename release before calling it, but external Drive-side retry semantics are still a separate integration item.
