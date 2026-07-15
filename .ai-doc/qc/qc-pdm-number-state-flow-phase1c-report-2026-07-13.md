# DEV-048 Phase 1C QC Report

Date: 2026-07-13  
QC boundary: Local candidate review, immutable approval snapshot, explicit atomic publication, permission/company isolation and browser recovery flows  
Verdict: PASS after independent defect recheck; Phase 1D is eligible

## Isolation

- All functional, HTTP and browser runs used disposable SQLite data and random local ports. Existing `localhost:3000` was not accessed or changed.
- No live Cloud SQL, Supabase, Firebase, GCS, staging, production, credential, billing, deploy or release action was used.
- The dirty worktree was preserved; QC did not stage, commit or revert unrelated changes.

## Independent findings and corrections

The first independent QC blocked Phase 1C on five gaps: PostgreSQL impact snapshots were mutable, decision/apply disclosed cross-company request existence, QA IDs and fault coverage were incomplete, required viewport/recovery browser evidence was missing, and unexpected approval errors could expose provider detail.

RD corrected the provider triggers, company-scoped lookup order, redacted error envelope, QA ID mapping and transaction fault injection. A fresh independent QC then reported no P0, P1 or P2 findings and returned `PASS`.

## Evidence

| Evidence | Result |
|---|---|
| `npm run qc:pdm-number-state-flow-phase1c` | PASS 43/43: domain 27/27, HTTP 11/11, browser 5/5 |
| Publication fault matrix | PASS at root, part, drawing, relation, reservation promotion, workspace update, audit, outbox enqueue and command receipt boundaries |
| Cross-company request probes | Valid and missing foreign request IDs both return `404 APPROVAL_REQUEST_NOT_FOUND` for decision and apply |
| PostgreSQL/Supabase snapshot immutability | UPDATE and DELETE rejection triggers present in both Phase 1C provider migrations |
| `npm run qc:pdm-number-state-flow-phase1b` | PASS 14/14 |
| `npm run qc:supabase-runtime-migrations` | PASS 56/56 |
| `npm run qc:postgres-shadow` | PASS 26/26 static schema/RLS parity; no disposable PostgreSQL target was configured |
| Focused ESLint | PASS |
| `npm run build:isolated` | PASS, TypeScript and 118 generated pages/routes |

## Browser facts

Evidence directory: `output/playwright/dev048-phase1c-qc-rerun/`.

- Published workspace passed 1440, 1024, 768, 390 and 320 width checks with zero page overflow, zero clipped drawer controls and no candidate warning.
- Owner withdraw confirmation and restored editable state were exercised.
- Needs-info and rejected projections remained draft-only.
- Apply-failed recovery showed the retry action; retry ended at approval `applied`, workspace `active`, and zero promoted reservations.
- Browser console, page errors and 5xx network responses were zero.

## Scope limit

This grants only the local Phase 1C gate and unlocks local Phase 1D RD. It does not prove a live PostgreSQL target, provider deployment, staging, production migration, backup/restore, field test or release readiness.
