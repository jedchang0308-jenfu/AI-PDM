# QC Validation Report - AI Risk Hints

Date: 2026-05-27

## Result

Pass.

## Evidence

| Command | Result |
| --- | --- |
| `npm.cmd run lint` | Pass |
| `npm.cmd run build` | Pass; Next routes include `/api/submissions/[id]/ai-risks` |
| `npm.cmd run qc:api` | Pass; `213 passed / 0 failed` |
| `npm.cmd run qc:ui` | Pass; `26 passed / 0 failed` |
| `npm.cmd run qc:file-hashes` | Pass; `1335 checked / 1335 ok` |

## Risk Tests

- `RISK-001` unauthenticated AI risks return 401.
- `RISK-002` Engineer can read own AI risks.
- `RISK-003` AI risks detect missing handoff file.
- `RISK-004` AI risks detect multi-parent Where-used.
- `RISK-005` Where-used risk has traceable sources.
- `RISK-006` older submission detects newer revision.
- `RISK-007` Manager can read AI risks.
- `RISK-008` Engineer cannot read another Engineer's AI risks.
- `RISK-009` pending duplicate Released filename risks return 200.
- `RISK-010` AI risks detect Released filename conflict.
- `RISK-011` AI risks keep submission Pending.

## QC Finding

Initial API run had one expected-value failure because the new multi-parent fixture changed the existing AI chat Where-used count from 1 to 2. RD updated the regression expectation to match the seeded fixture. Final rerun passed with zero failures.
