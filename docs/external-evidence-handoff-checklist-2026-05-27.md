# External Evidence Handoff Checklist

Date: 2026-05-27
Purpose: Checklist for completing the remaining `PDM_dev_task.md` blockers that cannot be closed by local RD code changes.

## Required Evidence Packages

| Gate | Current Status | Evidence Location | Required Next Action |
|---|---|---|---|
| SolidWorks Add-in real-machine validation | `draft/not_ready`, 42 cases / 0 pass | `data/sw-addin-test-reports/20260525-131542/report.json` | Execute on real CAD machine, fill environment, pass required cases, sign off |
| Independent restore drill | `draft/not_ready`, 12 cases / 0 pass | `data/restore-drill-reports/20260525-144844/report.json` | Execute restore on independent test machine, fill environment, pass required cases, sign off |
| Document Manager/equivalent component | `draft/not_ready`, 15 cases / 0 pass | `data/document-manager-reports/20260527-145712/report.json` | Deploy licensed extractor, fill command/probe/sample evidence, pass required cases, sign off |
| Formal field-test preflight | `ready=false`, 19 pass / 3 fail / 1 warning | command output from `field-test:preflight -- --profile all --require-evidence` | Re-run after the three evidence reports above are ready |

## Commands To Re-run After Evidence Is Filled

```powershell
npm.cmd run qc:sw-addin-real-machine-report
npm.cmd run qc:restore-drill-report
npm.cmd run qc:document-manager-report
npm.cmd run qc:document-manager-probe-path-gate
npm.cmd run qc:field-test-preflight -- --profile all --require-evidence
npm.cmd run qc:production-readiness
npm.cmd run qa:dev-task:sync
```

## Completion Rule

Only after all commands above pass without `--allow-open`, QA may update the remaining partial/unchecked target tasks in `PDM_dev_task.md`.
