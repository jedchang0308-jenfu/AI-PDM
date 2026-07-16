# QC Validation Report: Remaining External Blockers

Date: 2026-05-27
Validation plan: `.ai-doc/qa/qa-remaining-external-blockers-validation-plan-2026-05-27.md`
Scope: Unchecked and partial `PDM_dev_task.md` items after local RD/QA/QC completion.

## Result

BLOCKED BY EXTERNAL EVIDENCE

## Evidence

- `rg -n "^- \\[ \\]" PDM_dev_task.md`: 4 unchecked items remain.
- `qc:production-readiness:report`: NOT READY, 85 tracked tasks, 6 blockers, 5 P0 / 1 P1.
- `qc:dev-task-evidence-sync`: PASS, actual dev_task dry-run reports no eligible changes and keeps 6 external target tasks blocked.
- `npm.cmd run qc:document-manager-probe-path-gate`: PASS, 4/4.
- `npm.cmd run qc:document-manager-extractor-probe`: PASS, 6/6 using mock extractor contract fixture.
- `npm.cmd run qc:document-manager-report:report`: NOT READY, report `20260527-145712`, status `draft`, 15 total cases, 0 passed cases, 27 issues.
- `npm.cmd run qc:field-test-preflight -- --profile all --require-evidence`: NOT READY, 19 passed, 3 failed, 1 warning.

## Scenario Results

| Case | Result |
|---|---|
| `EXTBLK-001` Only external machine/evidence tasks remain unchecked or partial | PASS |
| `EXTBLK-002` Probe path gate passes and rejects missing/not-ready paths | PASS |
| `EXTBLK-003` Document Manager report is not ready | BLOCKED |
| `EXTBLK-004` Field-test preflight with evidence is not ready | BLOCKED |
| `EXTBLK-005` Production readiness reports the same external blocker categories | BLOCKED |
| `EXTBLK-006` Dev-task evidence sync refuses to auto-check target tasks while evidence is open | PASS |

## Facts

- Remaining unchecked items are:
  - `P0` SolidWorks Document Manager API or equivalent licensed component.
  - `P1` Formal field test.
  - `P0` Integrate SolidWorks Document Manager API or equivalent reader.
  - `P0` Confirm SolidWorks Document Manager licensing and deployability.
- Remaining partial external items are:
  - `P0` SolidWorks Add-in real-machine validation.
  - `P0` Offline one-way backup and restore on an independent test machine.
- The path gate logic is implemented and validated; it blocks missing and not-ready extractor probes.
- The mock extractor contract probe is implemented and validated; this proves the adapter contract/gate, not the licensed production extractor.
- Current Document Manager report is still draft/not-ready. Missing evidence includes tester, test date, component name/version, license owner, deployment host, extractor command, extractor probe path, backend URL, sample files path, final result, signoff, and required test case pass results.
- Current field-test preflight with required evidence fails because CAD evidence, restore evidence, and Document Manager evidence are not ready.
- Production readiness also reports `solidWorksEvidenceReady=false`, `restoreDrillEvidenceReady=false`, `documentManagerEvidenceReady=false`, and `fieldTestEvidenceReady=false`.
- These are external-state blockers. They require licensed component deployment, real machine execution, and signed evidence reports.

## Open Items

- Complete and sign the SolidWorks Add-in real-machine report.
- Complete and sign the independent restore drill report.
- Obtain and deploy SolidWorks Document Manager API or equivalent extractor.
- Fill and sign the Document Manager evidence report.
- Execute formal field test on target machine/profile and attach evidence.
- Re-run `field-test:preflight -- --profile all --require-evidence` after evidence is complete.
