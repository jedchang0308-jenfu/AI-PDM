# DEV-046 Phase 2A staging preflight QC report

Date: 2026-07-13
Boundary: local IaC/static preflight only
Verdict: PASS for Phase 2A; BLOCKED as expected for credentialled staging

## Evidence

| Check | Result |
|---|---|
| Phase 1 regression | PASS, focused DEV-046 86/86 |
| `npm run preflight:dev-046-phase2a` | PASS, local static 20/20; `blocked_expected` |
| `npm run qc:dev-046-phase2a` | PASS, 20/20 |
| Terraform resource guard | PASS, 37/37 Google resource blocks gated |
| Terraform init | PASS, backend disabled; no Google credential mounted |
| Provider lock | PASS, `hashicorp/google` 7.39.0 |
| Terraform fmt | PASS |
| Terraform validate | PASS, zero errors/warnings |
| Credential lookup | NOT RUN by contract |
| Terraform plan/apply/import | NOT RUN by contract |
| Cloud/billing/DNS/resource action | NONE |

## Open blockers

The machine report currently contains 23 blockers. The decision-relevant groups are:

- Google Organization, approved staging project/billing account, remote-state bucket and change ticket.
- Named business/runtime/data/privacy/security/cost owners plus backup responder.
- Approved employee privacy notice and measured/approved budget evidence.
- Controlled non-Google staging account and verified alert channels.
- At Phase 2A execution time: live Firebase adapter and real `firebase_bff` integration. Phase 2B local work later closed the application implementation portion; provider configuration and migration/runtime smoke remain open.
- Existing `_Default` sink import evidence and a separately authorized credentialled plan.

These blockers are correct Phase 2B entry conditions, not Phase 2A failures. `safeToCreateResources` remains false.

2026-07-14 addendum: after approved Phase 2B bootstrap/runtime execution, the local Phase 2A QC was rerun and passed 20/20. The preflight remains intentionally local/non-mutating, but completed evidence now closes the default log sink import and credentialled plan/apply blockers. At that time, machine-readable live blockers were DNS A record/managed TLS active evidence, Cloud SQL migration/runtime smoke and staging principal mapping. This addendum does not change the historical Phase 2A verdict; the 2026-07-15 addenda below supersede the current blocker count.

2026-07-15 addendum: the user decided not to configure public staging DNS for short-term internal use. DNS A record / managed TLS active evidence is now a deferred external gate, not a passed smoke result. Current machine-readable internal-pilot blockers are 4: internal HTTPS entrypoint, Cloud SQL-specific migration package, Cloud SQL migration/runtime smoke and staging principal mapping. The added migration-package blocker records that existing `db/postgres` SQL still contains Supabase role assumptions and must not be directly applied to Cloud SQL.

2026-07-15 migration-package addendum: `npm run dev-046:cloudsql-migration-package` now generates proposal-only `cloudsql-migration-manifest.json`, `runner-contract.md` and candidate Cloud SQL SQL files under `output/dev-046-cloudsql-migration-package/`. Focused QC `qc:dev-046-cloudsql-migration-package` passed 22/22 and verifies no generated candidate SQL contains Supabase `anon` / `authenticated` / `service_role` references, forced RLS statements or transaction wrappers. This is review evidence only: no Cloud SQL connection, migration apply, admin bootstrap, runtime smoke or principal mapping was executed, so `STAGING_CLOUD_SQL_MIGRATION_PACKAGE_NOT_READY` remains open until package review and VPC-attached runner approval.

2026-07-15 migration-runner addendum: `npm run dev-046:cloudsql-migration-runner-package` records the runner child gate under `STAGING_CLOUD_SQL_MIGRATION_PACKAGE_NOT_READY`. A dry-run-first executor, separate Docker `migration-runner` target and review-only Cloud Run Job IaC now exist for local review. The job defaults disabled, uses the migration service account and private IAM Cloud SQL proxy pattern, and is dry-run only. After separate approval later on 2026-07-15, the reviewed saved plan created the dry-run Cloud Run Job, but the job has not been executed. Focused QC passes only readiness and apply evidence; it does not approve admin bootstrap, run the job, execute live migration or perform runtime smoke.

2026-07-15 migration-runner plan/apply addendum: after explicit user approval, the migration-runner image was built and pushed to Artifact Registry with digest `asia-east1-docker.pkg.dev/jenfu-ai-pdm-stg-361825/ai-pdm/ai-pdm-migration@sha256:8794eae1ff71807dd69166f8db2e81b42f99ecbc79911271b48e7a1ff7dc1a1c`. The credentialled Terraform Docker plan review generated `output/dev-046-migration-runner-plan/plan-summary.json`: exactly 1 actionable add, 0 update, 0 delete and 0 replace; dry-run command only; migration service account; private IAM proxy; no live approval env. After a separate approval, Terraform applied only that saved plan and created `ai-pdm-stg-migration-runner`; `output/dev-046-migration-runner-plan/apply-summary.json` verifies 1 added, 0 changed, 0 destroyed, reviewed digest, `--dry-run`, migration service account and private IAM proxy. `output/dev-046-migration-runner-plan/cloud-run-job-executions.json` returned an empty list. Cloud Run Job execution, admin bootstrap, live migration and runtime smoke remain not executed.

2026-07-15 live migration addendum: after separate explicit approvals, on-demand backup `1784085929277` completed successfully, admin bootstrap succeeded through Cloud SQL SQL import, and the corrected immutable migration image applied all 18 intended schema versions through `ai-pdm-stg-migration-runner-k5pg9`. Immediate execution `nkrhj` applied zero versions. Earlier timeout and foreign-key failures applied no partial migration because the runner transaction rolled back; the initial bootstrap default-privilege failure also rolled back. The Job was restored to the reviewed `--dry-run` image with no live approval environment values. Focused package QC now passes 25/25 and runner-package QC passes 21/21. Durable evidence is `output/dev-046-live-migration/execution-summary.json`. This closes the package, admin-bootstrap and live-migration blockers; internal HTTPS entrypoint, runtime smoke and principal mapping remain open.

## QC conclusion

The original Phase 2A local/no-credential verdict remains historical. Subsequent controlled Phase 2B evidence now proves the staging resource apply and Cloud SQL schema migration only. It still does not prove runtime identity, browser login, principal mapping, restore rehearsal or full staging/production acceptance.
