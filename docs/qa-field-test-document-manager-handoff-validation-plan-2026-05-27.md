# QA Validation Plan - Field Test Document Manager Handoff Integration

## Risk Focus

- Field tester receives restore and SolidWorks reports but not Document Manager evidence.
- Final QC checklist omits the Document Manager strict gate.
- Preflight passes without checking that a Document Manager evidence template exists.
- Handoff generation breaks existing restore / SolidWorks report packaging.

## Validation Cases

| Case ID | Priority | Validation |
| --- | --- | --- |
| FTDOC-001 | P0 | `field-test:preflight -- --profile document-manager` exits 0 and checks report, upgrade script, and QC script. |
| FTDOC-002 | P0 | `field-test:preflight -- --profile all` exits 0 and includes Document Manager checks. |
| FTDOC-003 | P0 | `field-test:handoff` exits 0 and generates a new handoff package. |
| FTDOC-004 | P0 | Generated package includes `reports/document-manager-report.json` and `.md`. |
| FTDOC-005 | P0 | Generated package includes `document-manager-preflight.ps1` and `document-manager-fill-template.ps1`. |
| FTDOC-006 | P0 | Generated `qc-checklist.ps1` includes `npm.cmd run qc:document-manager-report`. |
| FTDOC-007 | P0 | TypeScript, lint, and production build pass. |
| FTDOC-008 | P0 | `PDM_dev_task.md` formal field-test checkbox remains open until real signed evidence exists. |

## Acceptance Criteria

- Field-test handoff carries all three evidence tracks: restore, SolidWorks Add-in, and Document Manager/equivalent extractor.
- Local tool validation passes.
- Formal field-test item remains unchecked until reports are executed and signed on real target machines.
