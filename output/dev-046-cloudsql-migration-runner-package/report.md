# DEV-046 Cloud SQL Migration Runner Package Preflight

Generated at: 2026-08-28T22:27:22.731Z
Package version: dev-046-cloudsql-migration-runner-package/v1
Status: blocked_runner_not_ready

## Boundary

- This report is local-only and output-only.
- This report command performs no Cloud SQL connection, psql command, Terraform action, gcloud mutation or credential lookup.
- Existing apply and live-execution evidence is read from DEV-046 output files only.
- This command does not approve or execute migration, runtime smoke or principal mapping.

## Existing Staging Pattern

- Cloud Run service present: true
- Service default URL disabled: undefined
- Service uses private-IP Cloud SQL proxy: true
- Service has VPC access: true
- Runtime and migration identities separate: true

## Runner Gap

- Cloud Run Job IaC present: true
- Cloud Run Job apply evidence verified: false
- Cloud Run Job execution requested: true
- Migration service account used by runner: true
- Cloud SQL proxy pattern used by runner: true
- Runner defaults disabled in tfvars example: true
- Runner live apply approval env absent: true
- Runtime image copies migration assets: true
- Runtime image command is web server only: true
- Application migration executor present: true

## Migration Package Input

- Manifest present: true
- Manifest status: proposal_only_not_approved_for_live_apply
- Ordered schema migrations: 49
- Live apply allowed by manifest: false

## Current Blockers

- STAGING_CLOUD_RUN_JOB_APPLY_EVIDENCE_MISSING
- STAGING_CLOUD_RUN_JOB_EXECUTION_UNAPPROVED
- STAGING_ADMIN_BOOTSTRAP_PATH_NOT_APPROVED

## Required Next Work

- Review the proposal-only Cloud SQL migration manifest and candidate SQL before any live apply.
- Keep the created Cloud Run Job unexecuted until admin bootstrap and live migration approvals are separately granted.
- Approve a separate admin bootstrap path before role/grant bootstrap SQL is executed.
- Only after runner review, execute staging migration, runtime smoke and principal mapping evidence in order.

## Notes

- The existing web Cloud Run service image is intentionally web-runtime focused and should not be treated as a migration runner.
- This runner preflight is a child gate under STAGING_CLOUD_SQL_MIGRATION_PACKAGE_NOT_READY; it does not add a fifth top-level live blocker.
- The Cloud Run Job has been created from the reviewed saved plan, but has not been executed.
- Private-IP-only Cloud SQL makes direct local apply inappropriate unless an approved VPC-attached execution path exists.
