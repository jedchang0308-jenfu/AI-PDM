# QC Validation Report - Duplicate Geometry Search

Date: 2026-05-27

## Scope

Validated the `P2 Duplicate geometry search` implementation against `.ai-doc/qa/qa-duplicate-geometry-search-validation-plan-2026-05-27.md`.

## Result

PASS.

## Evidence

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npm.cmd run lint` | PASS |
| Build | `npm.cmd run build` | PASS; build includes `/api/submissions/[id]/duplicate-geometry` |
| API QC | `PDM_BASE_URL=http://127.0.0.1:3001 npm.cmd run qc:api` | PASS; 284 passed, 0 failed |
| UI QC | `PDM_BASE_URL=http://127.0.0.1:3001 npm.cmd run qc:ui` | PASS; 26 passed, 0 failed |
| File hash verification | `npm.cmd run qc:file-hashes` | PASS; 1511 ok, 0 issues |

## Covered Cases

- `GEODUP-001` unauthenticated duplicate geometry search returns 401.
- `GEODUP-002` Engineer can list own duplicate geometry candidates.
- `GEODUP-003` exact native hash candidate is included.
- `GEODUP-004` exact native hash candidate has high confidence.
- `GEODUP-005` candidate exposes fingerprint signals and matched files.
- `GEODUP-006` Engineer scoped search excludes other Engineer candidate.
- `GEODUP-007` Manager can list duplicate geometry candidates.
- `GEODUP-008` Manager sees cross-owner duplicate candidate.
- `GEODUP-009` Engineer cannot search another Engineer submission.
- `GEODUP-010` metadata-only lookalike ranks below exact hash duplicate.

## Runtime Notes

- Port `3000` was occupied by an external node process and returned login `500`, so QC ran against `http://127.0.0.1:3001`.
- The `3001` QC dev server was stopped after validation. No `LISTENING` process remains on port `3001`.
- Remaining `TIME_WAIT` entries on port `3001` are closed TCP connection records, not active listeners.

## Findings

No QC failures found.
