# QA Validation Plan - Production Readiness Document Manager Gate

## Risk Focus

- Production readiness omits Document Manager evidence and under-reports release blockers.
- Formal field-test blocker does not aggregate all required external evidence.
- Strict readiness accidentally passes while Document Manager report is still draft.

## Validation Cases

| Case ID | Priority | Validation |
| --- | --- | --- |
| PRDM-001 | P0 | `qc:production-readiness:report` exits 0 in allow-open mode and reports `ready: false`. |
| PRDM-002 | P0 | Summary includes `documentManagerEvidenceReady: false`. |
| PRDM-003 | P0 | Summary includes `fieldTestEvidenceReady: false`. |
| PRDM-004 | P0 | Blocker categories include `external_document_manager`. |
| PRDM-005 | P0 | Blocker categories include `external_field_test`. |
| PRDM-006 | P0 | Strict `qc:production-readiness` exits 1 while external evidence is missing. |
| REG-001 | P0 | TypeScript, lint, and production build pass. |
| TASK-001 | P0 | Remaining external tasks stay unchecked / partial until evidence is signed. |

## Acceptance Criteria

- Production readiness cannot appear green until Document Manager, SolidWorks, restore, and field-test evidence are all ready.
- Existing draft reports produce explicit blocker details.
