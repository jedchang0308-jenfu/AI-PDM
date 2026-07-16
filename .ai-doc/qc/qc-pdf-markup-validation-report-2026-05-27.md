# QC Validation Report - PDF Markup

Date: 2026-05-27

## Result

Pass.

## Evidence

| Command | Result |
| --- | --- |
| `npm.cmd run lint` | Pass |
| `npm.cmd run build` | Pass; Next routes include `/api/submissions/[id]/pdf-markups` and `/api/submissions/[id]/pdf-markups/[markupId]` |
| `npm.cmd run qc:api` | Pass; `248 passed / 0 failed` |
| `npm.cmd run qc:ui` | Pass; `26 passed / 0 failed` |
| `npm.cmd run qc:file-hashes` | Pass; `1424 checked / 1424 ok` |
| `netstat -ano \| findstr :3000` after shutdown | No `LISTENING`; only `TIME_WAIT` entries remained |

## PDF Markup Tests

- `MARKUP-001` unauthenticated PDF markup list returns 401.
- `MARKUP-002` unauthenticated PDF markup create returns 401.
- `MARKUP-003` non-PDF markup create returns 400.
- `MARKUP-004` invalid PDF markup coordinate returns 400.
- `MARKUP-005` Engineer creates PDF markup.
- `MARKUP-006` created PDF markup keeps page coordinate metadata.
- `MARKUP-007` Engineer lists own PDF markups.
- `MARKUP-008` PDF markup list includes created markup.
- `MARKUP-009` Manager resolves PDF markup.
- `MARKUP-010` resolved PDF markup keeps resolver metadata.
- `MARKUP-011` cross-submission PDF markup file returns 400.
- `MARKUP-012` Engineer cannot list other Engineer PDF markups.

## QC Finding

No defects found in the final executed validation scope. File hash verification confirms PDF markup records did not alter repository file bytes.
