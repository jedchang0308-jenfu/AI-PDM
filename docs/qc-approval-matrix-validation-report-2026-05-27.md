# QC Validation Report - Approval Matrix

## Result

- Status: PASS
- Date: 2026-05-27

## Validated Scope

- Optional submission approval matrix.
- Role-based requirements for `R&D Manager` and `Admin`.
- Release blocking until all matrix requirements are satisfied or waived.
- Existing phase-gate, sandbox, two-reviewer, release package, share, handoff, and procurement API behavior.

## Evidence

| Check | Result |
| --- | --- |
| `tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `PDM_BASE_URL=http://localhost:3001 npm run qc:api` with `PDM_RELEASE_MODE=local_stub` server | PASS, 348 passed / 0 failed |
| `PDM_BASE_URL=http://localhost:3001 npm run qc:ui` | PASS, 26 passed / 0 failed |
| `npm run qc:file-hashes` | PASS, 1648 ok / 0 missing / 0 mismatch |

## Matrix Cases

- `MATRIX-001`: unauthenticated list blocked.
- `MATRIX-002`: Engineer cannot initialize matrix.
- `MATRIX-003` to `MATRIX-005`: Manager initializes default two-role matrix.
- `MATRIX-006` to `MATRIX-009`: Manager approval satisfies Manager role and keeps Admin role open.
- `MATRIX-010` to `MATRIX-011`: Admin approval releases after all roles are satisfied.
- `MATRIX-012` to `MATRIX-015`: waived Admin requirement allows release.

## Notes

- An initial API run incorrectly targeted the stale `3000` service because `qc:api` reads `PDM_BASE_URL` from the environment and ignores `--base-url`. It was rerun against `3001` with the environment variable set.
- Production `next start` needs `PDM_RELEASE_MODE=local_stub` for local QC release-path tests when no external release integration is configured.
