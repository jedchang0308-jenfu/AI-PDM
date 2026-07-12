# QC Report: DEV-044 ERP-ready PDM foundation Phase 1-3

Date: 2026-07-12
Verdict: Pass for local development scope; release not authorized

## Acceptance Evidence

| Gate | Result | Evidence |
|---|---:|---|
| Focused architecture/transaction/IAM QC | 26/26 | Server context and spoof denial, selected routes, client boundary, duplicate/concurrent command, audit/outbox rollback, retry state, mapping suspension and payload redaction |
| Production-slice regression | 27/27 | Official numbering/draft remains bounded; unopened workflows stay blocked |
| Invitation regression | 25/25 | One-time invite, local password, identity and audit behavior |
| Google identity regression | 19/19 | Stable PDM user, conflict rollback, suspended account and session invalidation |
| Managed auth regression | 21/21 | Managed login/session/token/audit paths |
| Numbering sequence integrity QC | 2/2 | Clean fixture accepted; contaminated fixture detected |
| Supabase migration QC | 36/36 | Ordered eight-migration manifest, hashes, RLS/default-deny |
| PostgreSQL shadow QC | 26/26 | 103-table schema/RLS parity and target guards |
| TypeScript | Pass | `npx.cmd tsc --noEmit --pretty false` |
| ESLint | Pass | `npm.cmd run lint -- --quiet` |
| Production build | Pass | Next.js 16.2.6, 101 static pages generated; existing middleware/NFT warnings only |

## Critical Runtime Facts

- Repeating one command/idempotency key produced exactly one business row, audit row, outbox row and receipt.
- Forced outbox failure rolled business, audit and receipt counts back to zero.
- Forced audit failure rolled business, receipt and outbox counts back to zero.
- Two SQLite connections proved `BEGIN IMMEDIATE` serialization: the competing claim received `SQLITE_BUSY`, retry changed zero rows and final receipt count remained one.
- Failed delivery recorded `failed`, incremented `attempt_count`, retained only a redacted error and scheduled `next_attempt_at`.
- Command service explicitly rejects inactive principal and organization mappings.
- Linking a shared principal retained `actor_id=erp-fnd-user` while platform evidence became `erp:principal:001`.
- Linking the organization retained `company_id=company-jenfu` while platform evidence became `erp:organization:jenfu`.
- Outbox fixture payload contained only `{businessId}` and matched no password, token, secret, OAuth code or signed URL pattern.

## Mapping Dry-run

The source local database was copied to a disposable output path before schema initialization and mapping tests.

| Check | Result |
|---|---:|
| Users / companies | 5 / 2 |
| Duplicate normalized emails | 0 |
| Duplicate provider subjects | 0 |
| Orphan identities | 0 |
| Users without membership | 0 |
| Mapping apply on copy | 5 principals / 2 organizations |
| Post-apply idempotency check | remained 5 / 2 |

## Limitations and No-claim Boundary

- `qc:postgres-shadow` had no external `PDM_POSTGRES_SHADOW_URL`; it proves generated schema/RLS parity and guard behavior, not an actual remote PostgreSQL apply.
- Supabase CLI migration files were generated and statically validated; no linked/live project migration list or apply was run.
- Target Supabase Auth, MFA and central session revocation are architecture decisions, not deployed behavior.
- No production smoke, field test, release or ProJED integration was performed.

These limitations are outside DEV-044 Phase 1-3 local development scope and remain release/IAM rollout gates.
