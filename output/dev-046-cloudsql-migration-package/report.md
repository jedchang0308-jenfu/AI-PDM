# DEV-046 Cloud SQL Migration Package Preflight

Generated at: 2026-09-03T06:41:31.431Z
Package version: dev-046-cloudsql-migration-package/v1
Status: blocked_package_not_ready

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

- PostgreSQL SQL files scanned: 55
- Supabase role-reference lines: 34
- DDL review lines: 198
- Blocking destructive lines: 33
- Admin bootstrap required: true
- VPC-attached runner required: true
- Candidate package status: proposal_generated_not_reviewed
- Candidate schema files: 53
- Candidate excluded files: 2
- Candidate remaining Supabase role references: 0
- Candidate remaining RLS statements: 0

## Current Blockers

- STAGING_CLOUD_SQL_MIGRATION_PACKAGE_NOT_READY
- STAGING_ADMIN_BOOTSTRAP_GRANTS_NOT_EXECUTED
- STAGING_MIGRATION_AND_RUNTIME_SMOKE_NOT_EXECUTED

## Required Next Work

- Review the generated Cloud SQL-specific ordered migration manifest for the Phase 2B/3A no-file slice.
- Approve or correct the Cloud SQL BFF runtime choice to remove Supabase RLS/FORCE RLS from the current no-file slice.
- Use the reviewed VPC-attached runner Job for admin bootstrap, schema migration, checksum history and runtime grant verification only after separate live approvals.
- After migration succeeds, run runtime smoke through the Cloud Run service account and only then perform user/principal mapping smoke.

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
- db/postgres/021_number_lifecycle_simplification.sql: 2
- db/postgres/025_submission_part_scope.sql: 1
- db/postgres/026_drawing_revision_lifecycle_authority.sql: 4
- db/postgres/028_bom_material_identity_revision.sql: 2

## Candidate Exclusions

- db/postgres/002_supabase_rls_plan.sql: supabase_rls_baseline_excluded_for_cloud_sql_bff_runtime
- db/postgres/011_gcs_pointer_numbering_continuity.sql: phase_3b_file_authority_deferred

## Notes

- Existing Cloud SQL instance and database are present, but this report intentionally does not connect to them.
- The staging Cloud Run migration Job exists, but admin bootstrap, live migration and runtime smoke are not yet closed.
- Public DNS is deferred by user decision; this does not block database migration itself, but it still blocks browser login/runtime smoke.
