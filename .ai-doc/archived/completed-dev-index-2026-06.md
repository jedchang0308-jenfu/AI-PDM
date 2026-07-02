# Completed DEV / Gate Index - 2026-06

Updated: 2026-06-30
Owner: Dev PM
Purpose: completed DEV/Gate evidence index after PM documentation governance restructure. No unfinished task is archived here as its only record; unfinished work remains in `.ai-doc/dev_task.md`.

Archive policy:

- `Logical Archive / Protected Evidence`: completed or evidence-captured work that remains at original paths because QC scripts or active package docs reference those paths.
- `Closed Local Package`: completed work with commit or validation evidence and no current next action unless PM expands scope.
- `Parent Deferred`: parent objective is not Done because a later gate, production/cutover, or external blocker remains open.

## Completed / Evidence-Captured DEV IDs

| ID | Status | Evidence | Original/current location | Archive treatment |
|---|---|---|---|---|
| `DEV-PDM-LIFECYCLE-ACTIONS-001` | Completed local/staging implementation and QC; local commit `21bcf16`. | ADR, SPEC, implementation contract, QA plan, PM handoff, lifecycle QC scripts, controlled-history screenshots, release-readiness QC. | `.ai-doc/decisions/ADR-PDM-LIFECYCLE-ACTIONS-001-ui-vocabulary-and-backend-lifecycle.md`; `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-delete-restore-obsolete.md`; `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-implementation-contract.md`; `.ai-doc/qa/qa-pdm-lifecycle-actions-validation-plan-2026-06-29.md`; `.ai-doc/reports/pm/pdm-lifecycle-actions-phase-1-git-boundary-handoff-2026-06-29.md`; `scripts/qc-pdm-lifecycle-release-readiness.mjs`; output screenshots. | Logical Archive / Protected Evidence. Do not move because `qc:pdm-lifecycle-actions-git-boundary` and `qc:pdm-lifecycle-release-readiness` reference original paths and exact phrases. |
| `DEV-PDM-CHANGE-CONTROL-001` | Phase 1-5 local implementation evidence captured. | ADR, SPEC, implementation contract, QA plan, QC reports, `scripts/qc-pdm-change-control.mjs`, `npm.cmd run qc:pdm-change-control` 50/50. | `.ai-doc/decisions/ADR-PDM-CHANGE-CONTROL-001-reserved-draft-number-policy.md`; `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`; `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-implementation-contract.md`; `.ai-doc/qa/qa-pdm-change-control-validation-plan-2026-06-24.md`; `.ai-doc/reports/qc/qc-pdm-change-control-phase-*.md`. | Logical Archive / Protected Evidence. Production/Supabase migration mirror remains separate approval-gated scope. |
| `DEV-PDM-REVISION-001` | Closed local package. | Branch `codex/pdm-revision-policy`; commits `8f472d0`, `af08d81`; QA manual validation plan; focused QC. | `.ai-doc/qa/qa-pdm-revision-manual-validation-plan-2026-06-22.md`; `.ai-doc/dev_task.md`. | Closed Local Package. No further action unless PM expands revision-control scope. |
| `DEV-SW-LICENSE-PDM-001` | Closed local implementation and evidence package. | Supabase evidence commit `be333eb`; SW/PDM scoped commit `6f4dbab`; PM plan; SPEC; ADR; handoff; `qc:sw-license-pdm-git-boundary`. | `.ai-doc/reports/pm/pm-sw-license-pdm-company-operational-shared-development-plan-2026-06-18.md`; `.ai-doc/specs/SPEC-SW-LICENSE-PDM-001-operational-shared-company-scope.md`; `.ai-doc/decisions/ADR-SW-LICENSE-PDM-001-operational-shared.md`; `.ai-doc/reports/pm/pm-sw-license-pdm-company-git-boundary-handoff-2026-06-18.md`. | Logical Archive / Protected Evidence. `documentation_map.md` must keep package heading and handoff link for QC. |
| `DEV-SUPABASE-DB-001-GATE-A` | Done for preparation; runtime execution evidence belongs to GATE-B. | Runtime provider gate QA plan and gate-plan QC. | `.ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md`; `scripts/qc-supabase-runtime-gate-plan.mjs`. | Protected Evidence. Parent `DEV-SUPABASE-DB-001` is not Done because production/cutover remains deferred. |
| `DEV-SUPABASE-DB-001-GATE-B` | Passed for `AI_PDM_STAGING`. | Approval package, runbook, smoke API matrix, runtime smoke report, target identity receipt, rollback readiness, local readiness. | `.ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md`; `.ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md`; `.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md`; `.ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md`; `supabase/migrations/manifest.json`. | Protected Evidence. Parent production/cutover remains deferred. |
| `DEV-SUPABASE-DB-001-GATE-B-STAGING-QA-QC` | Passed read-only staging QA/QC validation. | QA plan and QC report confirm `AI_PDM_STAGING`, seed state, permissions, and zero active smoke residue. | `.ai-doc/qa/qa-supabase-gate-b-staging-validation-plan-2026-06-18.md`; `.ai-doc/reports/qc/qc-supabase-gate-b-staging-validation-report-2026-06-18.md`. | Protected Evidence. |
| `DEV-SUPABASE-DB-001-GATE-B-PERMISSION-SEED` | Passed staging permission repair. | Built-in roles, role permissions, and admin smoke permissions verified. | `.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md`; `.ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md`. | Protected Evidence. |
| `DEV-SUPABASE-DB-001-GATE-B-RULE-SEED` | Passed minimal `numbering-rule-v1` seed repair. | Active `numbering-rule-v1`; write path FK issue closed. | `.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md`; `.ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md`. | Protected Evidence. |
| `DEV-SUPABASE-DB-001-MIGRATION-HISTORY` | Evidence captured. | Migration history policy and runtime migrations QC; Supabase CLI locally absent. | `.ai-doc/decisions/ADR-SUPABASE-DB-002-migration-history-policy.md`; `supabase/README.md`; `supabase/migrations/manifest.json`; `scripts/qc-supabase-migration-history-policy.mjs`; `scripts/qc-supabase-runtime-migrations.mjs`. | Protected Evidence. |
| `DEV-SUPABASE-DB-001-ROLLBACK-PROOF` | Passed rollback readiness after stopping Postgres-mode local process. | Rollback readiness plan and QC. | `.ai-doc/qa/qa-supabase-runtime-rollback-readiness-plan-2026-06-16.md`; `scripts/qc-supabase-runtime-rollback-readiness.mjs`. | Protected Evidence. |

## Parent Objectives Not Archived As Done

| ID | Reason it remains active/deferred in `dev_task.md` |
|---|---|
| `DEV-SUPABASE-DB-001` | Staging GATE-B passed, but production/cutover, data parity execution, and production gate remain unapproved/deferred. |
| `DEV-PDM-UI-POLISH-001` | Intake/backlog is still open; no RD implementation authorized. |
| `DEV-STORAGE-COST-001` | Product rollout is parked until real target, cost, retention, and production timing are approved. |
| `DEV-IND-007` | External disposable Supabase/Postgres shadow target evidence is missing. |
| `DEV-CAD-001` | SolidWorks Document Manager or equivalent reader evidence is missing. |
| `DEV-SW-001` | SolidWorks Add-in real-machine evidence is missing. |
| `DEV-BACKUP-001` | Offline backup/restore drill evidence is missing. |
| `DEV-FIELD-001` | Formal field-test evidence is missing. |

## Physical Archive Actions In This Pass

Created snapshots:

- `.ai-doc/archived/dev_task_before_pm_governance_restructure_2026-06-30.md`
- `.ai-doc/archived/documentation_map_before_pm_governance_restructure_2026-06-30.md`

No protected evidence file was physically moved in this pass.
