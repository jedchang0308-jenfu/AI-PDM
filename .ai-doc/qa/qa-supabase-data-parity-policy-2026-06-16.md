# QA Supabase Data Parity Policy

Date: 2026-06-16
Task: `DEV-SUPABASE-DB-001-DATA-PARITY`
Mode: PM-dev / QA policy preparation
Status: Prepared, not executed

## 1. Scope

This policy defines the data parity boundary for `DEV-SUPABASE-DB-001`.

It does not authorize live Supabase connection, staging runtime smoke, data migration, provider pointer changes, production cutover, or cost-incurring actions. Full data parity execution remains blocked until PM approves a controlled seed/data migration scope.

## 2. Current Supabase References

References reviewed for this policy:

- Supabase changelog: https://supabase.com/changelog
- Supabase branching troubleshooting: https://supabase.com/docs/guides/deployment/branching/troubleshooting
- Supabase working with branches: https://supabase.com/docs/guides/deployment/branching/working-with-branches
- Supabase GitHub integration / preview branch seeding: https://supabase.com/docs/guides/deployment/branching/github-integration
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase securing data: https://supabase.com/docs/guides/database/secure-data

Relevant current constraints:

- Preview branch data is temporary and is lost when the branch is deleted or recreated.
- Preview branches are seeded from `./supabase/seed.sql` by default.
- No production data is copied to preview branches through the GitHub integration.
- New public tables are not automatically exposed to the Data API / GraphQL API on newer Supabase projects.
- RLS must be enabled for exposed-schema tables, and backend secrets must remain server-side.

## 3. Approved Data Classes

Allowed before full data parity approval:

- Non-production smoke records created specifically for the runtime gate.
- Deterministic baseline seed required for roles, permissions, numbering rules, approval rules, and system settings.
- Schema/RLS metadata needed to prove target shape.

Not allowed in this gate:

- Production customer data.
- CAD files.
- Release packages.
- Handoff packages.
- Field-test artifacts.
- QC artifacts or evidence attachments.
- File blobs or external storage objects.
- Browser-side direct Supabase Data API access to AI_PDM base tables.
- Any service role key, database password, pooler URL, or secret exposed through `NEXT_PUBLIC_*`.

## 4. Parity Tiers

### `schema_rls_only`

Purpose:

- Prove table coverage, migration traceability, and RLS baseline for an intentionally empty staging target.

Allowed command:

```powershell
npm.cmd run db:postgres:compare:schema-rls -- --no-write
```

Boundary:

- Does not compare row counts.
- Does not compare key hashes.
- Does not prove full data migration.
- Valid only when staging is intentionally empty or seeded with separately declared smoke/baseline records.

### `smoke_seed`

Purpose:

- Prove a small, deterministic set of non-production records can support runtime smoke.

Required controls:

- Unique smoke prefix.
- Explicit table list.
- Cleanup owner.
- Cleanup command or retention reason.
- Expiry timestamp or evidence owner.
- No production customer data, CAD/release/handoff/QC artifacts, or file blobs.

Allowed examples:

- Test numbering root / part / drawing records with a smoke prefix.
- Admin matrix read baseline.
- Rule simulator baseline.
- Minimal role/permission/system setting seed required for the route under test.

### `full_data`

Purpose:

- Compare controlled source data against staging with row counts and primary-key hashes.

Approval preconditions:

- Explicit PM approval for full data parity execution.
- Approved target identity: `AI_PDM_STAGING`.
- Server-side `PDM_POSTGRES_SHADOW_URL` stored outside the repository.
- Source SQLite snapshot path declared through `PDM_SHADOW_SQLITE_PATH` or the default local data path.
- Declared table set and exclusions.
- No production customer data, CAD files, release packages, handoff packages, field-test artifacts, QC artifacts, file blobs, or storage objects.
- Rollback / cleanup owner assigned.
- `npm.cmd run qc:supabase-data-parity-policy` passes.
- `npm.cmd run qc:supabase-secret-boundary` passes.

Execution boundary:

- `full_data` may use row counts and key hashes from `scripts/compare-sqlite-postgres-shadow.mjs`.
- It may not run against production.
- It may not run when target identity is missing or points to ProJED / ProJED_TEST.
- It may not write reports containing secrets.

## 5. Evidence Required For Full Data Parity

When `full_data` is approved and executed, record:

- Approval source and timestamp.
- Target identity evidence.
- Source SQLite snapshot path or declared source alias.
- Redacted environment variable names used.
- Table set and exclusions.
- Row-count report path.
- Key-hash report path.
- Mismatches, if any.
- Cleanup evidence for smoke records.
- Residual risk and owner.

## 6. Stop Point

This policy completes local preparation only.

Full data parity execution remains blocked until PM approves the controlled seed/data migration scope, staging target, credentials, cleanup owner, and evidence path.
