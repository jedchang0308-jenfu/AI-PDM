# QA PDM ERP Bounded Schema Migration Validation Plan

Date: 2026-07-13
DEV: `DEV-PDM-ERP-BOUNDED-SCHEMA-MIGRATION-001` / `DEV-047`
SPEC: `.ai-doc/specs/SPEC-PDM-ERP-BOUNDED-SCHEMA-MIGRATION-001.md`
Status: Phase A0 accepted locally; Phase A-D not executed

## Objective

Verify that inventory, design, rehearsal and release evidence are complete enough to move approved legacy `public` objects without breaking SQL, dependencies, permissions, stable history or runtime compatibility. This plan does not authorize a database connection, DDL, deployment or release.

## Phase A0 focused validation

| Gate | Expected evidence | Blocking rule |
|---|---|---|
| `A0-DET-001` determinism | Two same-source builds serialize identically and expose a source fingerprint | Timestamp/random/order drift blocks |
| `A0-AUTH-001` authority label | `pre_pilot_non_authoritative`; pilot/runtime/snapshot evidence false | Any Phase A completion claim blocks |
| `A0-SAFE-001` local boundary | No env/credential/network/DB client/subprocess/cloud action | Any external access path blocks |
| `A0-OBJ-001` object coverage | Required PostgreSQL and SQLite categories exist, including valid empty arrays | Missing category blocks |
| `A0-HIST-001` migration history | Compatibility manifest entries and checksums are preserved | Missing or malformed checksum blocks |
| `A0-CODE-001` source dependencies | Repository/DB, script/QC and dynamic SQL candidates have reviewable evidence | Missing owner surface blocks |
| `A0-EXT-001` external consumers | State remains unknown and blocks only its future candidate batch | Silent `none` or global false acceptance blocks |
| `A0-BATCH-001` no premature design | No batch/destination/schema-move SQL is generated | Any inferred move blocks |
| `A0-CAT-001` future catalog query | Covers catalog/privilege/RLS metadata and is a single read-only statement | Data-row access or mutating statement blocks |
| `A0-SEC-001` evidence hygiene | Output contains no connection URL, provider key or private key | Secret evidence blocks |

Required command: `npm run qc:dev-047-local-inventory`.

## Phase A authoritative validation

### Entry

- Signed or otherwise reviewable evidence that DEV-046 Phase 3A pilot behavior is stable.
- Named representative PostgreSQL snapshot/target, database identity, commit, migration history and read-only role.
- Named operator, approver and evidence-retention location.

### Scenarios

- Compare runtime relations against local PostgreSQL artifacts. Explain every extra, missing or changed object.
- Compare actual migration versions/checksums/order against source and compatibility history. Any drift blocks batch design.
- Inventory table/sequence/index/constraint/FK/view/materialized view/function/trigger/grant/RLS/policy with explicit zero-count evidence where applicable.
- Re-run code inventory at the exact application commit and manually resolve all dynamic SQL candidates.
- Trace each repository raw SQL and script/QC dependency to an object and deployment boundary.
- Confirm external consumers with named owners, including BI/reporting, scheduled jobs, integrations, support tools and manual SQL.
- Verify unknown dependencies block only their containing future batch and cannot be silently classified as unused.
- Verify no DDL, lock, data repair or business-row export occurred.

### Acceptance

Independent QC must show complete evidence provenance, object/dependency classification and zero premature migration actions. Only then may Phase B be requested.

## Phase B contract validation

- Every candidate object has one owner domain, destination rationale and complete inbound/outbound dependency graph.
- Migration batches are ordered by dependencies and isolate unknown/ProJED-owned consumers.
- Old/new application compatibility is defined for the selected deployment sequence.
- Application SQL is explicitly qualified. Broad `search_path`, permanent dual write and compatibility view are rejected as end states.
- Each batch defines lock type, estimated downtime, transaction boundary, rollback point and evidence preservation.
- Browser grants remain zero and runtime/migration roles remain least privilege.

## Phase C rehearsal validation

- Restore a representative snapshot to a disposable PostgreSQL target without modifying the source.
- Capture pre-state schema, migration history, grants, RLS, row/control totals and application version.
- Dry-run, apply and roll back each batch independently; preserve command receipts and elapsed lock/downtime.
- Compare schema/grants/RLS/history after apply and after rollback.
- Run old/new application compatibility plus focused domain, numbering, audit/outbox and account regressions.
- Stop on unknown dependency, unexpected lock, checksum/grant/RLS drift, stable-ID/history change or runtime regression.

## Phase D release validation

- Require dedicated release instruction, exact target and artifact identity, backup/restore evidence, downtime owner and batch-level go/no-go.
- Execute only accepted batches and verify post-move SQL, FK/view/function/trigger, grants/RLS, browser denial and runtime smoke.
- Roll back or stop at the accepted point after any regression. No ad hoc direct repair is credited.
- Confirm no ProJED modification and preserve the source/release evidence package.

## Residual risk

Static lexical inventory cannot prove production use, runtime-generated SQL or external consumers. Runtime catalog cannot prove consumer behavior. Owner confirmation cannot replace executable rehearsal. Phase A requires all three evidence layers before batch design.

