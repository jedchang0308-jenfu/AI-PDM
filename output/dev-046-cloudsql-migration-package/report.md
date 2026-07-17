# DEV-046 Cloud SQL Migration Package Preflight

Generated at: 2026-07-15T04:46:01.209Z
Package version: dev-046-cloudsql-migration-package/v1
Status: live_migration_and_runtime_smoke_completed_acceptance_gated

## Boundary

- This report is local-only and output-only.
- No Cloud SQL connection, psql command, Terraform action, gcloud mutation or credential lookup is executed.
- The current result blocks live migration apply until a Cloud SQL-specific migration package and VPC-attached runner are reviewed.

## Target

- Project: jenfu-ai-pdm-stg-361825
- Region: asia-east1
- Instance: ai-pdm-stg-postgres
- Database: ai_pdm
- Connection: jenfu-ai-pdm-stg-361825:asia-east1:ai-pdm-stg-postgres
- Private IP only: true

## Findings

- PostgreSQL SQL files scanned: 20
- Supabase role-reference lines: 25
- DDL review lines: 90
- Blocking destructive lines: 0
- Admin bootstrap required: true
- VPC-attached runner required: true
- Candidate package status: proposal_generated_not_reviewed
- Candidate schema files: 18
- Candidate excluded files: 2
- Candidate remaining Supabase role references: 0
- Candidate remaining RLS statements: 0

## Current Blockers

- STAGING_PRINCIPAL_MAPPING_EVIDENCE_MISSING
- STAGING_APPLICATION_ARTIFACT_PROVENANCE_AND_DRIFT_EVIDENCE_MISSING

## Required Next Work

- Create or verify the staging principal mapping after a real provider UID exists.
- Resolve the deployed application artifact provenance and source drift before full staging acceptance.

## Supabase Role References By File

- db/postgres/002_supabase_rls_plan.sql: 2
- db/postgres/006_account_invitations.sql: 1
- db/postgres/007_auth_identities_google_oauth.sql: 1
- db/postgres/008_erp_module_foundation.sql: 4
- db/postgres/009_account_lifecycle.sql: 1
- db/postgres/010_transfer_package_phase3a0.sql: 1
- db/postgres/012_number_state_flow_phase1a.sql: 1
- db/postgres/013_firebase_bff_identity_invitations.sql: 1
- db/postgres/014_employee_login_aliases.sql: 3
- db/postgres/015_employee_privacy_notice_acknowledgements.sql: 4
- db/postgres/016_number_state_flow_phase1c.sql: 3
- db/postgres/017_number_state_flow_phase1d.sql: 2
- db/postgres/020_account_session_records.sql: 1

## Candidate Exclusions

- db/postgres/002_supabase_rls_plan.sql: supabase_rls_baseline_excluded_for_cloud_sql_bff_runtime
- db/postgres/011_gcs_pointer_numbering_continuity.sql: phase_3b_file_authority_deferred

## Notes

- This local report reads durable evidence but does not connect to Cloud SQL or execute cloud actions.
- Admin bootstrap and all 18 intended schema migrations completed; an immediate second run applied zero versions.
- The Cloud Run runtime identity completed the read-only Cloud SQL smoke without creating business data.
- Migration work is complete; the remaining blockers belong to staging identity evidence and application artifact provenance.

