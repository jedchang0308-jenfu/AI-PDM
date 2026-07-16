# RD Report: DEV-SUPABASE-DB-001 Supabase Secret Boundary QC

日期：2026-06-12

## Scope

- Task: `DEV-SUPABASE-DB-001`
- Phase: server-side secret boundary static gate
- Goal: prevent Supabase/Postgres service credentials from being exposed through frontend or `NEXT_PUBLIC_*` configuration while the live staging target remains pending.

## Changes

- Added `scripts/qc-supabase-secret-boundary.mjs`.
- Registered `npm.cmd run qc:supabase-secret-boundary`.

## Coverage

The QC verifies:

- `.env.example` documents `PDM_POSTGRES_URL`, `PDM_POSTGRES_ADMIN_URL`, `PDM_POSTGRES_POOLER_MODE`, and `PDM_POSTGRES_MAX_CONNECTIONS` without defining public Postgres variables.
- `.env.example` does not define public service-role, secret, password, or token variables.
- `next.config.mjs` does not expose a Next.js `env` block.
- `src/lib/db-async-provider.ts` is the only source file that reads `PDM_POSTGRES_URL`.
- `src/lib/file-storage.ts` rejects `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.
- `src/lib/file-storage.ts` rejects public S3-compatible credentials.
- SPEC / ADR / handoff docs preserve the server-side secret boundary.

## Verification

- `node --check scripts/qc-supabase-secret-boundary.mjs` passed.
- `npm.cmd run qc:supabase-secret-boundary` passed 15/15.

## Guardrails

- No real credentials were read.
- No Supabase connector calls.
- No database connection.
- No migration or provider pointer change.

## Remaining Work

- Run live target guard, RLS/advisor checks, and Postgres-mode API regression after an approved server-side `PDM_POSTGRES_URL` is configured outside the repository.
