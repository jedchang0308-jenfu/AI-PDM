# QC Validation Report - Review Issue List

Date: 2026-05-26

## Result

Pass.

## Evidence

| Command | Result |
| --- | --- |
| `npm.cmd run lint` | Pass |
| `npm.cmd run build` | Pass; Next routes include `/api/submissions/[id]/issues` and `/api/submissions/[id]/issues/[issueId]` |
| `npm.cmd run qc:api` | Pass; `189 passed / 0 failed` |
| `npm.cmd run qc:ui` | Pass; `26 passed / 0 failed` |
| `npm.cmd run qc:file-hashes` | Pass; `1286 checked / 1286 ok` |

## Issue Tests

- `ISSUE-001` unauthenticated list returns 401.
- `ISSUE-002` unauthenticated create returns 401.
- `ISSUE-003` empty title returns 400.
- `ISSUE-004` Engineer creates file review issue.
- `ISSUE-005` created issue is open.
- `ISSUE-006` issue exposes file name.
- `ISSUE-007` issue defaults owner to submitter.
- `ISSUE-008` Engineer lists own review issues.
- `ISSUE-009` issue list contains created issue.
- `ISSUE-010` Manager resolves review issue.
- `ISSUE-011` resolved issue keeps metadata.
- `ISSUE-012` cross-submission file issue returns 400.
- `ISSUE-013` Engineer cannot list another Engineer's issues.

## QC Finding

No failed validation items.
