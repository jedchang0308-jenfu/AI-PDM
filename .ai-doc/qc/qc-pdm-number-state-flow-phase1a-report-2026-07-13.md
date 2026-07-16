# DEV-048 Phase 1A Independent QC Report

Date: 2026-07-13  
QC boundary: Local Phase 1A domain, data, BFF, permission, concurrency and failure behavior only  
Verdict: PASS for Phase 1A local implementation; Phase 1B may be dispatched separately; NOT READY for staging or production

## Execution identity and isolation

- Base commit at execution: `ec68981`.
- Worktree was dirty before QC and contained concurrent DEV-046/auth/staging plus DEV-048 changes. QC did not revert or stage those changes.
- HTTP tests used a random localhost port, managed-auth bootstrap users, a disposable `PDM_DATA_DIR`, a disposable repository directory and a separate `PDM_NEXT_DIST_DIR`.
- The existing application on port 3000 and its data were not stopped or mutated. Disposable server, database and build directories were removed after each run.
- No live PostgreSQL, Supabase, Cloud SQL, Firebase, GCS, credential, billing, DNS, migration, deployment or production resource was used.

## Evidence matrix

| Evidence | Result |
|---|---|
| `npm run qc:pdm-number-state-flow-phase1a` | PASS, 47/47 total focused assertions |
| `qc:pdm-number-state-flow-contract` within aggregate | PASS, 19/19 schema/domain/static API assertions |
| `qc:pdm-number-state-flow-runtime` within aggregate | PASS, 7/7 isolated command/runtime assertions |
| `qc:pdm-number-state-flow-http` within aggregate | PASS, 20/20 disposable HTTP/DB assertions |
| `qc:pdm-number-state-flow-provider-outage` within aggregate | PASS, 1/1; 503 fail-closed and no candidate issued |
| `npm run qc:postgres-shadow` | PASS, 26/26; no live PostgreSQL target |
| `npm run qc:supabase-runtime-migrations` | PASS, 46/46 after sequential rerun; no live Supabase target |

The first ad hoc HTTP run reported 19/20 because its cross-company assertion incorrectly required the generic permission code for an Admin who selected another valid company. The observed response was `404 workspace_not_found`, which is the intended non-disclosure behavior. The reusable test was corrected to require that response and the complete 20-case suite was rerun from a clean disposable fixture with 20/20 passing. No product-code correction was required.

## HTTP, authorization and data facts

- Unauthenticated, denied-role, wrong-company membership, cross-origin, wrong content type and missing-idempotency requests returned controlled 4xx envelopes with `private, no-store` caching.
- A peer Engineer could not read another owner's workspace; R&D Manager and Admin could read it within the same company.
- Admin lookup under the wrong company returned `404 workspace_not_found`; a user without that company membership returned `403 numbering_permission_denied`.
- Company JENFU and MAXIMA independently allocated candidate root `A0001` without cross-company visibility or collision.
- Twenty parallel, distinct acquire commands returned 20 successful responses and unique roots `A0002` through `A0021`.
- Twenty parallel requests using one idempotency key all returned the same `A0022` reservation result.
- Create, acquire and cancel replay returned the original receipt/result. A stale row version returned `409 workspace_version_conflict`.
- Cancel recycled the root/part/drawing candidate bundle atomically, and the next workspace reused the lowest gap `A0001` with new reservation identities.
- A disposable `review_locked` approval reference caused `409 candidate_recycle_blocked`; all reservations stayed locked and the workspace stayed active with no partial cancellation.
- Official master tables `part_roots`, `part_numbers` and `drawing_numbers` remained at zero before and after the HTTP suite.
- The HTTP fixture persisted 51 numbering audits, 51 completed command receipts and 51 outbox events for 24 JENFU workspaces and one MAXIMA workspace; no duplicate active candidate existed within a tenant.
- An unreachable disposable PostgreSQL endpoint produced `503 numbering_authority_unavailable`, `retryable: true`, no command result and no candidate number.

## Provider and release boundary

PostgreSQL DDL/mirror checks passed, but no disposable PostgreSQL runtime target or Cloud SQL staging target was authorized. This report grants Phase 1A local G0-G3 evidence only. It does not grant G8 provider/staging, G9 production release, backup/restore, canary, field-test or `DEV-FIELD-001` credit.

## QC conclusion

DEV-048 Phase 1A satisfies its local schema, domain, command-transaction, idempotency, authorization, company isolation, concurrency, recycle-blocker and provider-unavailable contracts. Phase 1B is now eligible for a new RD instruction. This QC did not implement or validate Phase 1B UI, Phase 1C approval/publication, Phase 1D transfer/handoff, live provider behavior or release readiness.
