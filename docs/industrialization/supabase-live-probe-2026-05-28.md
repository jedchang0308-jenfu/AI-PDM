# Supabase Live Probe - 2026-05-28

## Scope

- DEV-IND-007: determine whether a disposable Supabase project or branch is available for the live advisor/RLS portion of the SQLite to Postgres shadow migration gate.
- This probe is read-only. No migration, DDL, data import, branch creation, or project creation was executed.

## QA Validation Plan

- Confirm available Supabase projects without creating paid resources.
- Confirm whether any available target can be treated as a disposable AI_PDM shadow database.
- Run read-only advisor/table inspections only.
- Keep DEV-IND-007 blocked unless evidence proves the target is both disposable and running the AI_PDM shadow schema.

## QC Evidence

- Supabase changelog scan:
  - Current database-related breaking changes include Data/GraphQL API exposure behavior changes for new tables.
  - Current security notes include PostgreSQL version lifecycle changes, so the shadow plan should continue targeting current Postgres versions.
- Supabase project list:
  - `ProJED` (`knodlkxqpcqyrtgwpdst`) is ACTIVE_HEALTHY, Postgres 17.
  - `ProJED_TEST` (`fhisnnufoeulxqrchldf`) is ACTIVE_HEALTHY, Postgres 17.
- Branch listing:
  - `_list_branches` returned an MCP permission/argument error: `Project reference is missing when validating permissions`.
- `ProJED_TEST` public table inspection:
  - 19 public tables were found and all reported `rls_enabled=true`.
  - The table set is not the generated AI_PDM 24-table schema; observed tables include `profiles`, `tenants`, `projects`, `wbs_items`, `documents`, and RAG-related tables.
- Target guard implication:
  - `scripts/guard-postgres-shadow-target.mjs --phase pre-migration` would fail closed for this shape because the target is not empty.
  - `scripts/guard-postgres-shadow-target.mjs --phase compare` would fail closed because the public table set is not the complete generated AI_PDM schema.
- `ProJED_TEST` security advisor:
  - WARN findings include mutable function search path, public execution of SECURITY DEFINER functions, signed-in execution of SECURITY DEFINER functions, and leaked password protection disabled.
- `ProJED_TEST` performance advisor:
  - INFO/WARN findings include unindexed foreign keys, RLS init-plan warnings, unused indexes, and multiple permissive policies.

## Result

BLOCKED. A read-only Supabase connection is available, but no disposable AI_PDM shadow project or branch is configured. Existing projects must not be mutated for this gate without explicit user approval and, if creating new resources, cost confirmation.
