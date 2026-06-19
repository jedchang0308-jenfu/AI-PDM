# RD Report: DEV-SUPABASE-DB-001 Supabase Staging Read-only Preflight

Date: 2026-06-12

## Scope

- Task: `DEV-SUPABASE-DB-001`
- Target: `AI_PDM_STAGING`
- Project ref: `qerabudthnnpqvybpcsq`
- Organization: `Jenfu Machinery / ydxbtstvlunmpjdlrhml`
- Region: `ap-northeast-1`
- Mode: Supabase connector read-only preflight

## Evidence

- `list_projects` returned one project: `AI_PDM_STAGING / qerabudthnnpqvybpcsq`.
- `get_project(qerabudthnnpqvybpcsq)` returned `status=ACTIVE_HEALTHY`, Postgres engine `17`, database version `17.6.1.127`.
- `list_tables(project_id=qerabudthnnpqvybpcsq, schemas=["public"])` returned an empty table list.
- `list_migrations(project_id=qerabudthnnpqvybpcsq)` returned an empty migration list.
- `get_project_url` resolved the project API URL.
- `get_publishable_keys` proved a legacy anon key and a modern publishable key exist and are not disabled. Key values were intentionally not recorded.
- `get_advisors(type=security)` returned no lints.
- `get_advisors(type=performance)` returned one INFO advisory for Auth DB connection allocation. It is not a schema/cutover blocker for pre-migration.

## Boundary

- No SQL was executed.
- No `apply_migration` call was made.
- No Supabase project or branch was created.
- No credential values were written to repository files.
- No runtime provider pointer was changed.
- This proves target identity / emptiness / advisor preflight only. Migration apply, RLS proof, schema compare, Postgres-mode API parity, production cutover, and rollback remain open.
