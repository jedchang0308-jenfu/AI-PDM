# QC Validation Report - ECR / ECO / ECN

Date: 2026-05-27

## Scope

Validated `P2 完整 ECR/ECO/ECN` against `.ai-doc/qa/qa-change-request-validation-plan-2026-05-27.md`.

## Result

PASS.

## Evidence

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npm.cmd run lint` | PASS |
| Build | `npm.cmd run build` | PASS; build includes `/api/submissions/[id]/changes` and `/api/submissions/[id]/changes/[changeId]` |
| API QC | `PDM_BASE_URL=http://127.0.0.1:3001 npm.cmd run qc:api` | PASS; 315 passed, 0 failed |
| UI QC | `PDM_BASE_URL=http://127.0.0.1:3001 npm.cmd run qc:ui` | PASS; 26 passed, 0 failed |
| File hash verification | `npm.cmd run qc:file-hashes` | PASS; 1563 ok, 0 issues |

## Covered Cases

- `CHANGE-001` unauthenticated change list returns 401.
- `CHANGE-002` empty change title returns 400.
- `CHANGE-003` Engineer creates ECR.
- `CHANGE-004` Created ECR is open.
- `CHANGE-005` Created ECR keeps kind.
- `CHANGE-006` Manager creates ECO.
- `CHANGE-007` Created ECO keeps kind.
- `CHANGE-008` Engineer creates ECN.
- `CHANGE-009` Created ECN keeps kind.
- `CHANGE-010` Engineer lists own changes.
- `CHANGE-011` List includes ECR, ECO, and ECN.
- `CHANGE-012` Engineer cannot approve change request.
- `CHANGE-013` Manager approves ECR.
- `CHANGE-014` Approved ECR status is approved.
- `CHANGE-015` Approved ECR has decision metadata.
- `CHANGE-016` Decided change cannot be decided again.
- `CHANGE-017` Engineer cannot list other Engineer changes.

## Runtime Notes

- Port `3000` remained occupied by an external node process, so QC ran against `http://127.0.0.1:3001`.
- The `3001` QC dev server was stopped after validation. No `LISTENING` process remains on port `3001`.

## Findings

No QC failures found.
