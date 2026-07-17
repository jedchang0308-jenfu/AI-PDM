# DEV-046 Cloud SQL Migration Package Preflight

Generated at: 2026-07-15T17:25:48.953Z
Package version: dev-046-cloudsql-migration-package/v1
Status: production_candidate_package_generated_not_applied

## Boundary

- This report is local-only and output-only.
- No Cloud SQL connection, psql command, Terraform action, gcloud mutation or credential lookup is executed.
- The current result blocks live migration apply until a Cloud SQL-specific migration package and VPC-attached runner are reviewed.

## Target

- Project: jenfu-ai-pdm-prod
- Region: asia-east1
- Instance: ai-pdm-prod-postgres
- Database: ai_pdm
- Connection: jenfu-ai-pdm-prod:asia-east1:ai-pdm-prod-postgres
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

- PRODUCTION_ADMIN_BOOTSTRAP_NOT_EXECUTED
- PRODUCTION_MIGRATION_NOT_EXECUTED
- PRODUCTION_RUNTIME_SMOKE_NOT_EXECUTED

## Required Next Work

- Apply only after the DEV-032 production infrastructure plan and target readback pass.
- Execute admin bootstrap separately, then run schema migration twice to prove idempotence.
- Run production runtime, restore and numbering reconciliation before canary.

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

- This package is tied to the dedicated production project and IAM database users.
- No source business rows, staging identities, credentials or GCS file-authority migration are included.
- Generation performs no cloud or database action.

