# QA Validation Plan - CAD Reference Native Adapter

## User-Focused Risks

- Web/Windows upload can read native metadata but still cannot read assembly/drawing references.
- Reference adapter output is ignored by `/api/file-metadata/detect`.
- Adapter returns references but still shows the old "not configured" warning.
- Reference quantity or child part identity is lost, breaking BOM draft creation.
- Team falsely marks the licensed Document Manager P0 complete without deployed component evidence.

## RD FMEA

| ID | Failure mode | Effect | Control |
| --- | --- | --- | --- |
| CADREF-FMEA-001 | Native reference output is not parsed | No CAD reference data reaches upload | `CADREF-001` |
| CADREF-FMEA-002 | Child part identity is dropped | BOM and where-used are wrong | `CADREF-002` |
| CADREF-FMEA-003 | Quantity is not preserved | BOM quantity error | `CADREF-003` |
| CADREF-FMEA-004 | Adapter works but stale warning remains | User distrust and false blocker | `CADREF-004` |
| CADREF-FMEA-005 | External P0 is checked prematurely | False completion | Confirm Document Manager P0 remains open |

## QC Cases

- Run TypeScript check.
- Run lint.
- Run production build.
- Run API QC suite and verify:
  - `CADREF-001` native CAD reference adapter returns one reference.
  - `CADREF-002` native CAD reference adapter keeps child part number.
  - `CADREF-003` native CAD reference adapter keeps quantity.
  - `CADREF-004` native CAD reference adapter avoids not-configured warning.
- Run UI smoke suite.
- Run file hash integrity check.
- Confirm remaining external Document Manager P0 items are not checked.

## Pass Criteria

- All automated checks pass.
- Native CAD reference adapter output reaches `/api/file-metadata/detect`.
- Existing metadata, upload, branch/merge, release, supplier, procurement, and handoff regressions remain passing.
- Licensed Document Manager / equivalent deployment tasks stay open until real evidence exists.
