# Cloud SQL PostgreSQL Migrations

This directory is the authoritative PostgreSQL migration source for AI_PDM. The approved production database is Google Cloud SQL for PostgreSQL; Supabase is retired and is not a staging, migration, rollback, or release target.

Use the current production Cloud SQL migration lane:

```powershell
npm.cmd run dev-032:cloudsql-migration-package
$env:PDM_MIGRATION_PACKAGE_TARGET = "production"
npm.cmd run dev-046:cloudsql-migration-runner:dry-run
```

The former DEV-046 staging package depends on a retired staging preflight manifest and is not a current migration entrypoint. Do not use it for production or shadow migration.

Safety rules:

- Authenticate Cloud SQL through the approved localhost proxy/connector path.
- Never use a static Cloud SQL password in production.
- Do not copy current migrations into a top-level `supabase/` directory.
- Do not use the Supabase CLI, project URLs, service-role keys, migration history, live smoke, or cutover commands.
- Keep `scripts/postgres-shadow-target-guard-utils.mjs`; it rejects known retired/non-AI_PDM Supabase projects and protects generic PostgreSQL shadow checks.

For an approved disposable PostgreSQL shadow target, run the fail-closed identity/schema guard before any migration-like action:

```powershell
npm.cmd run db:postgres:guard -- --phase pre-migration
```

After an approved generic PostgreSQL shadow migration, use `db:postgres:compare` or `db:postgres:compare:schema-rls` for evidence. These commands do not authorize Supabase use; known retired projects remain explicitly rejected.

Run `npm.cmd run qc:postgres-shadow` to verify the provider-neutral PostgreSQL schema, RLS baseline traceability, target guard, and compare contract without authorizing a live provider target.

The file `002_supabase_rls_plan.sql` is a historical deny-direct-access baseline retained for traceability. Current Cloud SQL package generation excludes that provider-specific file; it must not be applied as a current Cloud SQL migration. Current migrations begin with the provider-neutral schema and the approved Cloud SQL migration package manifest.

Implementation notes:

- IDs remain application-generated `TEXT` values for SQLite compatibility.
- PostgreSQL timestamps use `TIMESTAMPTZ` and JSON payloads use `JSONB`.
- Migrations with `updated_at` columns install the controlled update trigger where required.
- Application database access remains server-side through the repository and BFF boundaries.
- DEV-068 additive recognition schema is migration `033_drawing_recognition.sql`. It is local/shadow implementation evidence only until a separately authorized production migration package includes it.
- DEV-063 human-label rename is migration `034_root_vocabulary_human_label.sql`; it updates only the approval action title and leaves root identifiers/contracts unchanged.
- DEV-071 XMind-style BOM draft editing is migration `035_bom_draft_floating_topics.sql`; it adds optimistic editor versioning and draft-only Floating Topic storage. Unresolved floating topics remain blocked from review and release by the server repository.
- Human-controlled PDM approval decisions are migration `036_human_approval_decisions.sql`; it adds the distinct `request_more_information` audit action without deriving available decisions from FFF outcomes.
- DEV-068 pre-submit recognition source context is migration `037_drawing_recognition_pre_submit_source.sql`; it extends the session constraint for `drawing_number` and remains local/shadow evidence until separately authorized for production.
- DEV-069 cancelled-candidate number release is migration `039_allow_recycled_candidate_drawing_codes.sql`; it runs after the canonical Drawing aggregate exists and keeps every Cloud SQL migration-history version unique.
- DEV-081 supervisor workflow authority is migration `040_supervisor_workflow_authority.sql`; it grants `rd_manager` the explicit publication action while owner override, company scope and lifecycle checks remain enforced by the application policy.
