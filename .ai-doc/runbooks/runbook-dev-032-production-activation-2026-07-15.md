# DEV-032 Production Activation Runbook

Status: template-only handoff; not executed
Scope: DEV-032 / DEV-046 Phase 3A.0 official-numbering and draft production slice
Production action authorized by this file: none

## Purpose

This runbook defines the sequence for turning the existing DEV-032 release gate package into a controlled production activation. It is a handoff checklist, not an approval. Every live write boundary still needs separate explicit authorization.

## Inputs

- `config/platform/production-target.template.json`
- `config/platform/clean-production-seed.template.json`
- `config/platform/production-activation-checklist.template.json`
- `infra/google-cloud/production/`
- `.ai-doc/runbooks/runbook-dev-032-production-canary-restore-reconciliation-2026-07-15.md`
- `output/dev-032-release-source/manifest.json`
- `output/dev-032-production-target-preflight/report.json`

## Sequence

1. Reconfirm the exact release commit and source boundary. Stop if unknown-risk paths are not zero.
2. Read back `jenfu-ai-pdm-prod`, production Cloud Run, Cloud SQL and Secret Manager metadata. Names only; no secret values.
3. Review production Firebase/Auth and environment source. Stop if any staging project, `web.app` gateway, staging Cloud SQL, staging Cloud Run or staging secret value appears.
4. Run a credentialled Terraform plan for review only after explicit approval. Stop on any delete, replace, target drift or estimate above USD 240.
5. Apply production resources only after separate apply approval and the exact acknowledgement in the Terraform package.
6. Import or apply clean seed/admin bootstrap only after separate data-write approval. Seed must contain only new production IDs, minimum company/role/config, initial Admin, numbering sequence and non-reuse reservations.
7. Execute Cloud SQL migration only after backup, rollback and migration-history checks are present.
8. Complete `HD-8-4 / 1A`: restore a production recovery point to a separate isolated target and pass schema, account, audit, receipt, outbox, numbering sequence and non-reuse reconciliation.
9. Run Level 3 production-like smoke before production traffic.
10. Deploy and cut traffic only after separate deploy approval.
11. Run Level 4 production smoke at the production entrypoint and feature-level smoke for login, privacy acknowledgement, numbering, draft persistence and non-canary denial.
12. Decide Wave 0 go/no-go only when zero open P0/P1, rollback readiness and named-user allowlist evidence exist.

## Mandatory Stops

- Plan contains delete or replace.
- Monthly estimate is above USD 240.
- Production project or active gcloud project is ambiguous.
- Production env source is missing or contains staging values.
- Any secret value appears in files, reports or terminal output intended for evidence.
- Clean seed includes source business, draft, demo, test, credential, session or historical actor rows.
- `HD-8-4 / 1A` restore/reconciliation is missing or failed.
- Level 3 or Level 4 smoke is missing or failed.

## Explicit Non-Scope

- This runbook does not authorize production apply, deploy, SQL import, Cloud Run Job execution or traffic cutover.
- This runbook does not activate GCS file authority.
- This runbook does not start DEV-047 schema migration.
- This runbook does not replace full PDM/GCS/offline restore drills deferred under DEV-037.
