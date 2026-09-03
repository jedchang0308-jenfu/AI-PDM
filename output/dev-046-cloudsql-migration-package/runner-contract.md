# DEV-046 Staging Cloud SQL Migration Runner Contract

Status: proposal_only_not_approved_for_live_apply

## Execution Boundary

- Runner must execute inside a VPC path that can reach the private Cloud SQL IP.
- Runner must use Cloud SQL Auth Proxy or equivalent connector with automatic IAM database authentication.
- Static database passwords, service-account keys, public IP enablement and browser-direct database access are forbidden.
- Admin bootstrap and schema migration are separate phases; runtime smoke must not run before both complete.

## Proposed Order

1. For a fresh database execute `sql/000_admin_bootstrap_grants.sql`; for an existing database execute only `sql/001_ai_pdm_contract_schema_bootstrap.sql` through the approved privileged path.
2. Execute ordered schema files in `cloudsql-migration-manifest.json` through the migration identity.
3. Execute `sql/999_runtime_grants_refresh.sql`.
4. Run runtime database smoke through the Cloud Run runtime service account.
5. Only after runtime smoke passes, create/verify real staging principal mappings.

## Current Blockers

- STAGING_CLOUD_SQL_MIGRATION_PACKAGE_NOT_READY
- STAGING_ADMIN_BOOTSTRAP_GRANTS_NOT_EXECUTED
- STAGING_MIGRATION_AND_RUNTIME_SMOKE_NOT_EXECUTED
