# QC Validation Report - Design Reuse Candidates

Date: 2026-05-27

## Result

Pass.

## Evidence

| Command | Result |
| --- | --- |
| `npm.cmd run lint` | Pass |
| `npm.cmd run build` | Pass; Next routes include `/api/submissions/[id]/reuse-candidates` |
| `npm.cmd run qc:api` | Pass; `226 passed / 0 failed` |
| `npm.cmd run qc:ui` | Pass; `26 passed / 0 failed` |
| `npm.cmd run qc:file-hashes` | Pass; `1355 checked / 1355 ok` |
| `netstat -ano \| findstr :3000` after shutdown | No `LISTENING`; only `TIME_WAIT` entries remained |

## Reuse Candidate Tests

- `REUSE-001` unauthenticated reuse candidates return 401.
- `REUSE-002` Engineer can list own reuse candidates.
- `REUSE-003` reuse candidates include similar source.
- `REUSE-004` reuse candidates exclude current submission.
- `REUSE-005` reuse candidate has score.
- `REUSE-006` reuse candidate has match reasons.
- `REUSE-007` Engineer scoped reuse excludes other Engineer.
- `REUSE-008` Manager can list reuse candidates.
- `REUSE-009` Manager sees cross-owner reuse candidate.
- `REUSE-010` Engineer cannot list other Engineer reuse candidates.

## QC Finding

No defects found in the executed validation scope.
