# External Evidence Handoff Checklist

Date: 2026-07-06
Purpose: Checklist for completing the remaining `.ai-doc/dev_task.md` blockers that cannot be closed by local RD code changes.

Authoritative task file: `.ai-doc/dev_task.md`

## Required Evidence Packages

| Gate | Current Status | Evidence Location | Required Next Action |
|---|---|---|---|
| SolidWorks Add-in real-machine validation | `draft/not_ready`, 42 cases / 0 pass | `data/sw-addin-test-reports/20260706-123421/report.json` | Execute on real CAD machine, fill environment, pass required cases, sign off |
| Independent restore drill | `draft/not_ready`, 12 cases / 0 pass | `data/restore-drill-reports/20260706-123421/report.json` | Execute restore on independent test machine, fill environment, pass required cases, sign off |
| Document Manager/equivalent component | `draft/not_ready`, 15 cases / 0 pass | `data/document-manager-reports/20260706-123421/report.json` | Deploy licensed extractor, fill command/probe/sample evidence, pass required cases, sign off |
| Formal field-test preflight | local handoff package ready; strict evidence gate `ready=false`, 19 pass / 3 fail / 1 warning | `data/field-test-handoffs/20260706-123433`; command output from `field-test:preflight -- --profile all --require-evidence` | Re-run strict evidence gate after the three evidence reports above are ready |
| Supabase/Postgres live shadow target | handoff package ready; still `blocked`, no disposable target | `data/postgres-shadow-handoffs/20260706-123443`; `.ai-doc/dev_task.md` `DEV-IND-007`; `.ai-doc/qc/qc-active-goal-remaining-blockers-report-2026-06-02.md` | User must approve or provide a disposable AI_PDM Supabase/Postgres target, then run the package commands and advisor checklist |

## Current Local Gate Status

| Gate | Latest QC Result |
|---|---|
| Completion audit | `qc:dev-task-completion-audit` passes 8/8 and reports only 5 external blockers |
| Production readiness | `qc:production-readiness:report` parses `.ai-doc/dev_task.md`, reports `ready=false`, 5 external blockers |
| Evidence sync | `qa:dev-task:sync` exits 0, has 0 changes, and blocks task updates while evidence remains not ready |
| DEV-CAD local adapter contract | `qc:native-cad-extractor-contract` 14/14, `qc:document-manager-extractor-probe` 6/6, `qc:document-manager-probe-redaction` 9/9, `qc:document-manager-probe-path-gate` 4/4 |
| Field-test local handoff package | `field-test:preflight -- --profile all` ready=true; latest package `data/field-test-handoffs/20260706-123433`; `qc:field-test-handoff-package` 53/53; `qc:field-test-issue-intake` 11/11 |
| Postgres shadow handoff package | `postgres-shadow:handoff` generated `data/postgres-shadow-handoffs/20260706-123443`; `qc:postgres-shadow-handoff-package` validates package structure, SQL hashes, no hardcoded Postgres URL, and latest doc references |
| Field evidence | `field-test:preflight -- --profile all --require-evidence` remains `ready=false`, 19 pass / 3 fail / 1 warning |

## Commands To Re-run After Evidence Is Filled

```powershell
npm.cmd run qc:sw-addin-real-machine-report
npm.cmd run qc:restore-drill-report
npm.cmd run qc:native-cad-extractor-contract
npm.cmd run qc:document-manager-extractor-probe
npm.cmd run qc:document-manager-probe-redaction
npm.cmd run qc:document-manager-probe-path-gate
npm.cmd run qc:document-manager-report
npm.cmd run qc:field-test-handoff-package
npm.cmd run qc:postgres-shadow-handoff-package
npm.cmd run qc:field-test-preflight -- --profile all --require-evidence
npm.cmd run qc:dev-task-completion-audit
npm.cmd run qc:production-readiness
npm.cmd run qa:dev-task:sync
```

## Supabase Shadow Commands After Target Approval

```powershell
.\data\postgres-shadow-handoffs\20260706-123443\commands\01-pre-migration-guard.ps1
.\data\postgres-shadow-handoffs\20260706-123443\commands\02-apply-migration.ps1
.\data\postgres-shadow-handoffs\20260706-123443\commands\03-compare-shadow.ps1
.\data\postgres-shadow-handoffs\20260706-123443\qc-checklist.ps1
```

## Completion Rule

Only after all commands above pass without `--allow-open`, QA may update the remaining blocked target tasks in `.ai-doc/dev_task.md`. `DEV-IND-007` must remain blocked until a disposable Supabase/Postgres target is approved/provided and live migration/advisor evidence passes.
