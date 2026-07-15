# SPEC PDM ERP Bounded Schema Migration

Date: 2026-07-13
DEV: `DEV-PDM-ERP-BOUNDED-SCHEMA-MIGRATION-001` / `DEV-047`
Status: Phase A0 local inventory tooling complete; authoritative Phase A blocked until the DEV-046 Phase 3A pilot is stable
Parent: `DEV-046`

## Purpose

Reduce the post-pilot hybrid-schema debt by moving only approved legacy PostgreSQL objects from locked-down `public` into bounded schemas without changing stable IDs, history, business authority or the first-version launch path.

This work is not a launch blocker. It must not become a big-bang rename, a second PDM authority, a permanent dual-write system, a compatibility-view end state or a broad `search_path` workaround.

## Authority order

When evidence conflicts, use this order:

1. Approved representative PostgreSQL runtime catalog and migration-history evidence.
2. Immutable PostgreSQL migration artifacts and checksums.
3. Canonical SQLite/PostgreSQL mirror evidence.
4. Repository, script and QC source dependencies.
5. Named owner and external-consumer confirmation.

The Phase A0 lexical baseline is discovery evidence only. It cannot prove the live object set, usage, ownership, destination schema or migration batch.

## Phase contract

| Phase | State | Entry condition | Deliverable | Prohibited action |
|---|---|---|---|---|
| A0 Local tooling | Complete | Explicit DEV-047 continuation instruction | Deterministic local artifact/dependency inventory, focused QC and read-only catalog query contract | DB connection, credentials, destination inference, schema movement |
| A Authoritative inventory | Blocked post-pilot | Stable Phase 3A pilot, approved target/snapshot identity and read-only operator | Runtime catalog, migration history, source dependencies, external consumers and owner classification | DDL, locks, data repair, batch execution |
| B Batch contract | Pending A acceptance | Complete inventory with bounded unknowns | Domain/dependency batches, explicit SQL qualification, compatibility boundary, lock/downtime and rollback design | Permanent dual write/view/search-path workaround |
| C Rehearsal | Pending B acceptance | Approved batch manifest and representative disposable PostgreSQL target | Per-batch apply/rollback receipts, schema/grant/RLS/history diff, old/new runtime regression and downtime | Live target or unapproved repair |
| D Release | Release gated | Dedicated release instruction, target identity, backup/restore, downtime owner and go/no-go | Controlled production movement and post-move smoke/evidence | Unreviewed lock, drift, source deletion or ProJED change |

## Phase A0 implementation contract

### Commands

- `npm run inventory:dev-047-local`
- `npm run qc:dev-047-local-inventory`

The generator writes `output/dev-047-bounded-schema-inventory/local-baseline.json`. The artifact is deterministic for the same source hashes and is always classified `pre_pilot_non_authoritative`.

### Inventory contents

The machine-readable baseline contains:

- SHA-256 and byte size for PostgreSQL SQL artifacts, canonical SQLite schema, Supabase compatibility manifest and future catalog query contract.
- Artifact-level declarations for tables, sequences, indexes, constraints, foreign keys, views, materialized views, functions, triggers, policies, grants/revokes and RLS controls.
- SQLite/PostgreSQL table-name mirror status.
- Conservative table dependency candidates from repositories, DB runtime, application runtime, operational scripts and QC scripts, with file/line/excerpt evidence.
- Dynamic SQL candidates requiring manual review.
- Explicit unknown external-consumer state, zero proposed batches, open post-pilot blockers and a code-source fingerprint.

Artifact declaration counts can include the same logical object in canonical schema and historical migrations. Code dependency candidates can include identifiers that are not executing SQL. Neither count is a live production count.

### Safety properties

- No environment or credential lookup.
- No network, PostgreSQL client, subprocess, staging or production target.
- No data row access or database mutation.
- No destination schema inference, migration batch or schema-move SQL generation.
- Excerpts redact connection URLs and common secret assignments.

### Future read-only catalog contract

`scripts/sql/dev-047-postgres-catalog-read-only.sql` is prepared but not executed. After Phase A entry approval, it may run through an approved read-only operator against the named representative target. It inventories relations, indexes, constraints/FKs, functions, triggers, table/routine privileges, RLS flags, policies and known migration-history relations without reading business rows.

Target-specific migration-history rows must be exported separately after the authoritative migration table and retention policy are confirmed. The query output alone does not classify external consumers or owner domains.

## Phase A task list

- [ ] `A1` Record stable-pilot evidence, representative target/snapshot identity, read-only role, operator, approver and evidence location.
- [ ] `A2` Execute the reviewed catalog query and preserve output hash, database/server identity and execution receipt.
- [ ] `A3` Export actual migration history/checksums and compare them with `db/postgres` and the compatibility manifest.
- [ ] `A4` Re-run the repository baseline at the exact application commit and reconcile runtime objects, mirror differences and dynamic SQL.
- [ ] `A5` Confirm external consumers such as reports, BI, scheduled jobs, integrations, manual SQL and support tools with named owners.
- [ ] `A6` Assign each object an owner domain and classification: retain `public`, candidate for bounded migration, provider-specific, obsolete pending separate approval, or unknown.
- [ ] `A7` Build the dependency graph and show that every unknown blocks only the future batch containing that dependency.
- [ ] `A8` Obtain independent QC acceptance before Phase B begins.

## Phase A acceptance

- Runtime catalog and migration history come from a named representative snapshot, not local inference.
- Every object category has explicit evidence, including valid zero-count categories.
- Repository raw SQL, scripts/QC, dynamic SQL and external consumers are reconciled to exact commit and owner.
- Unknowns are visible and bounded. No object with an unknown dependency enters a proposed batch.
- Browser grants remain zero and runtime/migration privileges remain least privilege.
- No schema location is treated as authorization.
- No DDL, table lock, downtime or data repair occurred during inventory.

## Phase B-D invariants

- Every application SQL reference at the selected deployment boundary is schema-qualified.
- Stable IDs, business history, audit and outbox semantics remain unchanged.
- Each batch defines old/new app compatibility, exact lock/downtime expectation, rollback point and preserved evidence.
- Rehearsal uses a disposable PostgreSQL target restored from a representative snapshot and validates apply plus rollback.
- Any unknown dependency, unexpected lock, grant/RLS/checksum drift or runtime regression stops that batch.
- Production movement requires a dedicated release instruction and the applicable deployment/release gate.

## Ownership boundary

DEV-047 can change AI_PDM-owned PostgreSQL schemas and AI_PDM source references only after the matching phase gate. It does not modify ProJED code, data, schema or deployment. Any Project/Equipment or ProJED-owned dependency requires a separate ProJED owner contract and must remain unknown/blocked here until accepted.

