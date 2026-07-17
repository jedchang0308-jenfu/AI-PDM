# DEV-046 Cloud SQL Migration Runner Package Preflight

Generated at: 2026-07-15T04:46:36.896Z
Package version: dev-046-cloudsql-migration-runner-package/v1
Status: live_migration_and_runtime_smoke_completed_acceptance_gated

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
- Cloud Run Job apply evidence verified: true
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
- Ordered schema migrations: 18
- Live apply allowed by manifest: false

## Current Blockers

- STAGING_PRINCIPAL_MAPPING_EVIDENCE_MISSING
- STAGING_APPLICATION_ARTIFACT_PROVENANCE_AND_DRIFT_EVIDENCE_MISSING

## Required Next Work

- Create or verify the staging principal mapping after a real provider UID exists.
- Resolve the deployed application artifact provenance and source drift before full staging acceptance.

## Notes

- The existing web Cloud Run service image remains separate from the migration runner.
- Admin bootstrap and all 18 intended migrations completed; the immediate second run applied zero versions.
- The Cloud Run Job was restored to dry-run posture and contains no live approval environment values.
- Runtime Cloud SQL smoke passed; remaining staging blockers are principal mapping and application artifact provenance.

