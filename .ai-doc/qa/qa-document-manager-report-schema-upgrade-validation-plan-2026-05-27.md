# QA Validation Plan - Document Manager Report Schema Upgrade

## Risk Focus

- Old report templates miss newly required deployment cases.
- Markdown and JSON reports drift apart.
- Upgrade tooling accidentally marks external Document Manager tasks complete.

## Validation Cases

| Case ID | Priority | Validation |
| --- | --- | --- |
| DMSCHEMA-001 | P0 | `document-manager:report:upgrade` exits 0 on the latest existing draft report. |
| DMSCHEMA-002 | P0 | Upgraded JSON contains the current schema version. |
| DMSCHEMA-003 | P0 | Upgraded JSON and Markdown both contain `DM-DEP-004`. |
| DMSCHEMA-004 | P0 | `qc:document-manager-report:report` exits 0 in allow-open mode and has no `missing_case` issue. |
| DMSCHEMA-005 | P0 | Strict `qc:document-manager-report` exits 1 because real external evidence is still missing. |
| DMSCHEMA-006 | P0 | `PDM_dev_task.md` external Document Manager boxes remain unchecked. |
| REG-001 | P0 | `tsc --noEmit`, lint, and production build pass. |

## Acceptance Criteria

- Schema upgrade is repeatable.
- Required cases are complete in the template.
- The gate still blocks completion until licensed/equivalent component evidence and signoff exist.
