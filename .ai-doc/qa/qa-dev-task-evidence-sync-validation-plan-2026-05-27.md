# QA Validation Plan - Dev Task Evidence Sync

## User Risk

QA must update `PDM_dev_task.md` quickly after field evidence passes, but cannot accidentally mark external P0/P1 work complete from partial local automation.

## FMEA

| ID | Failure Mode | Impact | Validation |
| --- | --- | --- | --- |
| QASYNC-FMEA-001 | Tool checks external items while evidence is still draft | False production readiness | Blocked fixture and actual dry-run must produce zero changes |
| QASYNC-FMEA-002 | Tool cannot update after evidence is ready | QA still needs manual checkbox edits | Ready fixture must apply all six target changes |
| QASYNC-FMEA-003 | Dry-run mutates files | QA preview becomes unsafe | Dry-run must not write output |
| QASYNC-FMEA-004 | Source task file is changed when output is requested | Fixture or production file can be corrupted | Apply with `--output` must leave source fixture unchanged |
| QASYNC-FMEA-005 | Existing checked tasks without evidence are hidden | Production readiness can be overstated | Tool must report `unsafeCompleted` and fail if detected |

## QC Cases

| Case | Priority | Expected Result |
| --- | --- | --- |
| QASYNC-001 | P0 | Blocked evidence fixture exits 0. |
| QASYNC-002 | P0 | Blocked fixture reports no eligible changes. |
| QASYNC-003 | P0 | Blocked fixture reports six blocked target tasks. |
| QASYNC-004 | P0 | Dry-run does not write output. |
| QASYNC-005 | P0 | Ready evidence fixture exits 0. |
| QASYNC-006 | P0 | Ready fixture applies six changes. |
| QASYNC-007 | P0 | Output file has all six target lines checked. |
| QASYNC-008 | P0 | Source fixture remains unchanged when `--output` is used. |
| QASYNC-009 | P0 | Actual `PDM_dev_task.md` dry-run exits 0. |
| QASYNC-010 | P0 | Actual dry-run reports zero eligible changes while evidence is open. |
| QASYNC-011 | P0 | Actual dry-run keeps all external target tasks blocked. |

## Required Commands

- `npm run qc:dev-task-evidence-sync`
- `npm run qa:dev-task:sync`
- `node_modules\\.bin\\tsc.cmd --noEmit`
- `npm run lint`
- `npm run build`
- `npm run qc:production-readiness:report`

## Exit Criteria

- QC sync gate passes.
- Regression commands pass.
- `PDM_dev_task.md` external target checkboxes remain open while evidence is not ready.
