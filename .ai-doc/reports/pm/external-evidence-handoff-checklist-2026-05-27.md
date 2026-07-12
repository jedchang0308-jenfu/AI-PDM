# External Evidence Handoff Checklist

Date: 2026-07-10
Purpose: Checklist for first-version external evidence and deferred full-PDM/CAD evidence.

Authoritative task file: `.ai-doc/dev_task.md`

## Required Evidence Packages

| Gate | Current Status | Evidence Location | Required Next Action |
|---|---|---|---|
| Formal field-test preflight | first-version blocker; strict evidence gate still `ready=false` | `data/field-test-handoffs/20260706-123433`; command output from `field-test:preflight -- --profile all --require-evidence` | Run field-test focused on official numbering, draft creation, unavailable-feature inert state, permissions, and issue closure |
| Supabase/Postgres shadow target | complete for first-version disposable Postgres boundary | `data/quality/postgres-shadow/shadow-compare-1783676196559.json`; `data/postgres-shadow-handoffs/20260710-034552` | No longer blocks first-version local readiness; future live Supabase cutover still needs `DEV-030` / `DEV-032` release gate |
| Document Manager/equivalent component | deferred from first-version blocker; human test SW upload OK and 3D preview OK, 2D preview not available | `data/document-manager-reports/20260706-123421/report.json` | Resume only for 2D preview/native metadata/full CAD phase |
| SolidWorks Add-in real-machine validation | deferred from first-version blocker; no current Add-in product route | `data/sw-addin-test-reports/20260706-123421/report.json` | Resume only if future product route explicitly reintroduces Add-in |
| Independent restore drill | deferred from first-version blocker; full drill belongs to full PDM/file-storage readiness | `data/restore-drill-reports/20260706-123421/report.json` | First-version release gate still needs minimal snapshot / rollback owner; full restore drill resumes for full PDM/file-storage production readiness |

## Current Local Gate Status

| Gate | Latest QC Result |
|---|---|
| Completion audit | Updated expectation: first-version open external blocker is `DEV-FIELD-001` |
| Production readiness | Updated expectation: `ready=false` until field-test / release gate is complete |
| Evidence sync | Supabase shadow evidence now resolves through `data/quality/postgres-shadow/shadow-compare-1783676196559.json`; CAD/SW/restore remain deferred |
| DEV-CAD local adapter contract | `qc:native-cad-extractor-contract` 14/14, `qc:document-manager-extractor-probe` 6/6, `qc:document-manager-probe-redaction` 9/9, `qc:document-manager-probe-path-gate` 4/4 |
| Field-test local handoff package | `field-test:preflight -- --profile all` ready=true; latest package `data/field-test-handoffs/20260706-123433`; `qc:field-test-handoff-package` 53/53; `qc:field-test-issue-intake` 11/11 |
| Postgres shadow handoff package | `postgres-shadow:handoff` generated `data/postgres-shadow-handoffs/20260710-034552`; `qc:postgres-shadow-handoff-package` validates package structure, SQL hashes, no hardcoded Postgres URL, and latest doc references |
| Postgres shadow live compare | disposable local Postgres target applied schema/RLS, compare guard passed, schema/RLS-only compare passed, `qc:postgres-shadow` 26/26 passed |
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

This section is now for future live Supabase cutover only; first-version disposable Postgres shadow evidence already exists.

```powershell
.\data\postgres-shadow-handoffs\20260710-034552\commands\01-pre-migration-guard.ps1
.\data\postgres-shadow-handoffs\20260710-034552\commands\02-apply-migration.ps1
.\data\postgres-shadow-handoffs\20260710-034552\commands\03-compare-shadow.ps1
.\data\postgres-shadow-handoffs\20260710-034552\qc-checklist.ps1
```

## Completion Rule

Only after first-version field-test evidence and release-gate checks pass without `--allow-open`, QA may update the remaining blocked first-version target tasks in `.ai-doc/dev_task.md`. `DEV-IND-007` no longer blocks the first-version boundary; future live Supabase cutover/advisor evidence remains controlled by `DEV-030` / `DEV-032`.
