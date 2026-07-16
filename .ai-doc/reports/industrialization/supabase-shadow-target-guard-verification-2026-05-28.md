# Supabase Shadow Target Guard Verification - 2026-05-28

## Scope

- `DEV-IND-007`: harden the local SQLite to PostgreSQL/Supabase shadow workflow so migration and compare steps cannot be accidentally run against an existing non-AI_PDM project.
- This closes a local target-safety gap only. It does not complete the live Supabase migration/advisor/RLS gate, which still requires a disposable AI_PDM Supabase project or branch.

## RD Changes

- Added `scripts/guard-postgres-shadow-target.mjs` for explicit target checks before migration and before compare.
- Added `scripts/postgres-shadow-target-guard-utils.mjs` for shared schema extraction, target snapshot collection, and guard evaluation.
- Added `scripts/qc-postgres-shadow-target-guard.mjs` with mockable target-shape checks.
- `scripts/compare-sqlite-postgres-shadow.mjs` now runs the compare-phase target guard before collecting live Postgres row counts and key hashes.
- `qc:postgres-shadow` now includes the target guard QC and confirms the compare report exposes `postgresTargetGuard`.
- `db/postgres/README.md`, the migration plan, and the live Supabase probe document now describe the pre-migration and compare guard workflow.

## QA Validation Plan

| Case | Priority | Method | Pass criteria |
|---|---|---|---|
| PG-GUARD-001 | P0 | Evaluate an empty public schema in `pre-migration` phase. | Guard returns safe. |
| PG-GUARD-002 | P0 | Evaluate a non-empty non-AI_PDM public schema in `pre-migration` phase. | Guard fails closed with `target_not_empty`. |
| PG-GUARD-003 | P0 | Evaluate a complete generated AI_PDM table set with RLS enabled and forced in `compare` phase. | Guard returns safe. |
| PG-GUARD-004 | P0 | Evaluate a partial AI_PDM table set in `compare` phase. | Guard fails closed with `partial_ai_pdm_schema`. |
| PG-GUARD-005 | P0 | Evaluate a complete AI_PDM table set without forced RLS in `compare` phase. | Guard fails closed with `rls_not_forced`. |
| PG-GUARD-006 | P0 | Evaluate the observed `ProJED_TEST`-style table shape. | Guard fails closed because the schema is not the generated AI_PDM shadow schema. |
| PG-GUARD-007 | P1 | Run the compare script without a live Postgres URL. | Local compare still passes and reports `postgresTargetGuard: null`. |
| PG-GUARD-008 | P1 | Run the industrialization gate. | Postgres shadow guard is included and all industrialization steps pass. |

## FMEA

| Failure mode | Cause | Effect | Detection | Control |
|---|---|---|---|---|
| Wrong Supabase target mutation | Operator points migration at an existing project | Existing schema or data is damaged | Pre-migration guard sees public base tables | Block every non-empty public schema before migration |
| Partial migration accepted | SQL apply stops mid-way | Compare result is misleading | Compare guard detects missing expected tables | Block partial AI_PDM schemas |
| RLS baseline skipped | RLS SQL is not applied after migration | Shadow target posture is weaker than intended | Compare guard inspects `relrowsecurity` and `relforcerowsecurity` | Require enabled and forced RLS on every expected table |
| Existing project reused as shadow | A non-AI_PDM Supabase project is convenient but unsafe | Advisor and row-count results do not represent AI_PDM | Guard reports unknown public tables | Require complete generated AI_PDM schema only |
| Missing target URL hidden by local fallback | Live gate intended but environment is not configured | False confidence in live readiness | CLI guard returns `target_unavailable` | Fail closed when the explicit guard lacks `PDM_POSTGRES_SHADOW_URL` |

## QC Evidence

- `npm.cmd run qc:postgres-shadow-target-guard`
  - PASS: 10 passed, 0 failed.
  - Verified empty pre-migration target is allowed.
  - Verified non-empty and non-AI_PDM target shapes are blocked.
  - Verified complete AI_PDM schema requires forced RLS in compare phase.
  - Verified missing `PDM_POSTGRES_SHADOW_URL` fails closed for the explicit guard.
- `npm.cmd run db:postgres:compare -- --no-write`
  - PASS for local SQLite/static coverage.
  - `postgresShadowConfigured` was `false`, and `postgresTargetGuard` was `null`.
- `npm.cmd run qc:postgres-shadow`
  - PASS: 20 passed, 0 failed.
- `npm.cmd run qc:industrialization`
  - PASS: 17 passed, 0 failed.
  - Included Postgres shadow, lint, build, API regression, UI E2E, and file hash integrity.
  - `qc:file-hashes`: 2640 checked, 2640 ok.
  - Existing build warnings remain the known Turbopack dynamic path tracing warnings in `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`; build passed.

## Source Notes

- Supabase documentation warns that user-editable auth metadata must not be used for authorization decisions in RLS policies: https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0015_rls_references_user_metadata
- Supabase user metadata guidance distinguishes user-editable `raw_user_meta_data` from server-managed `raw_app_meta_data`: https://supabase.com/docs/guides/auth/users

## Result

PASS for local Supabase/PostgreSQL shadow target safety. `DEV-IND-007` remains blocked for the live Supabase advisor gate until a disposable AI_PDM Supabase project or branch is configured and approved for migration testing.
