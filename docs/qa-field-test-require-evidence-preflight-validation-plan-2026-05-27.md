# QA Validation Plan - Field Test Require Evidence Preflight

## Risk Focus

- Field-test preflight is mistaken for final evidence approval.
- Final QC checklist does not prove all external reports are ready.
- Strict evidence mode breaks the lightweight environment preflight.

## Validation Cases

| Case ID | Priority | Validation |
| --- | --- | --- |
| FTEVID-001 | P0 | `field-test:preflight -- --profile all` exits 0 for environment/tool readiness. |
| FTEVID-002 | P0 | `field-test:preflight -- --profile all --require-evidence` exits 1 while reports are draft. |
| FTEVID-003 | P0 | Strict mode reports `CAD-EVIDENCE-001` failure. |
| FTEVID-004 | P0 | Strict mode reports `RESTORE-EVIDENCE-001` failure. |
| FTEVID-005 | P0 | Strict mode reports `DM-EVIDENCE-001` failure. |
| FTEVID-006 | P0 | `field-test:handoff` final QC includes strict evidence preflight. |
| REG-001 | P0 | TypeScript, lint, and production build pass. |
| TASK-001 | P0 | Remaining external items stay unchecked until real evidence exists. |

## Acceptance Criteria

- Environment preflight remains fast and usable.
- Final evidence preflight blocks incomplete reports.
- Field-test handoff runs the strict mode before production readiness reporting.
