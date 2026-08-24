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
- DEV-088 replacement attachment selection uses `041_part_attachment_reuse_snapshot.sql`; it adds only snapshot/origin tables and does not rewrite `file_assets`, permissions or attachment lifecycle. DEV-087 canonical workbench authority remains `042_status_data_rebuild.sql`; 042 is independent of 041 and must apply idempotently when 041 is absent. If 042 applied first, the singleton runner may apply 041 afterward without rewriting the 042 checksum or schema. Verification must cover both orders, re-run, provider parity and forward-fix only; applied migration files are immutable.
- DEV-090 inline formal relation matrix is migration `043_inline_relation_matrix.sql`; it must run after 042 (and is independent of 041). The migration takes a transaction-scoped advisory lock, fails closed on active Relation work/review, unresolved relation quarantine, duplicate pairs, multiple primary links or orphan/cross-company links, then removes only current Relation projections and `relation_change_works`. Formal `drawing_part_links`, `relation_approved_change_snapshots` and `pdm_review_traces` are retained. `scripts/migrate-dev-090-inline-relation-matrix.mjs --provider=postgres` is the provider-aware inventory/rehearsal wrapper; it cannot apply without the explicit isolated-restore or production-cutover environment gate. Never edit 041/042 checksums; rollback before commit is transaction rollback, while a committed production change requires the approved RPO=0 release recovery procedure.
- Canonical item classification is migration `044_canonical_item_kind_two_values.sql`. The stored codes remain `manufactured|purchased`, but their human meanings are `依圖製作件|外購標準件`: in-house and outsourced drawing-made items both belong to `manufactured`. The migration deterministically maps `outsourced|custom` to `manufactured`. A legacy `shared` value expresses universality rather than a base category, so the provider-aware converter must first assign its explicit base category and preserve `is_universal=true`; migration 044 fails closed instead of guessing. The migration preserves every row, relationship, file reference and timestamp and may run only after source/target reconciliation is 100%.
- Legacy change-control draft item classification is migration `045_part_number_draft_item_type_two_values.sql`. It normalizes historical `standard` rows to `purchased`, replaces the draft check with `self_made|purchased`, and fails closed on unresolved rows. It does not create a shared item type; shared-ness belongs to the canonical part attribute `is_universal`.
- DEV-065 Part identity preview authority is migration `046_part_preview_settings.sql`. It adds the persistent company+Part setting, same-Part reserved image guards and a final soft-delete trigger for active preview assets without backfill or data rewrite. The default-off `PDM_PART_PREVIEW_V1` gate must remain off until SQLite/PostgreSQL re-run, command concurrency, storage compensation and browser evidence pass; committed production apply remains release-gated.
- DEV-095 legacy assembly BOM intake retirement is migration `047_retire_legacy_assembly_bom_intake.sql`. It deletes only drafts, snapshots, headers and file-reference rows whose stored source identifies the retired CAD/XLS intake, drops the two XLS import tables and source-package columns, and narrows active BOM sources to manual. Canonical/manual BOM history and generic review/release remain. Production apply is separately release-gated; the local SQLite counterpart defaults to dry-run and requires a fingerprint-gated explicit primary-data override.
- Fresh databases use the generated current baseline `001_initial_schema.sql`, then `002_supabase_rls_plan.sql`, `003_harden_set_updated_at_search_path.sql`, the current retirement migration `047_retire_legacy_assembly_bom_intake.sql`, and forward migrations beginning with `048_shared_assembly_bom.sql`. Migrations `004` through `046` are forward-only history for databases created from older versions of `001`; their results are already folded into the generated current baseline and they must not be replayed on top of that baseline.
- DEV-096 shared assembly BOM authority is migration `048_shared_assembly_bom.sql`. It is additive, takes the transaction advisory lock `ai_pdm:dev096:shared-assembly-bom-v1`, and introduces Definition, explicit Parent applicability, stable logical-line component mappings, schema-v2 review/release evidence and exact resolved Parent projections. Apply it while `PDM_ASSEMBLY_SHARED_BOM_V1=false`; activation requires the DEV-096 reconciliation and multi-provider release gate.
