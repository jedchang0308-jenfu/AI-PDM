# RD Report: Public Share Async Provider Conversion

Date: 2026-06-12

Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.

## Scope

This phase converts public readonly share serialization and release package access counting from synchronous helper/database paths to provider-neutral async database access.

Covered routes:

- `/api/public/shares/[token]`
- `/api/public/shares/[token]/package`

## Changes

- Extended `AsyncReleaseRepository` with provider-neutral readonly share access SQL:
  - increment `access_count`
  - set `last_accessed_at`
  - set `updated_at`
- Extended `src/lib/release-records-async.ts` with `recordReadonlyShareAccessAsync(...)`.
- Extended `src/lib/readonly-share-async.ts` with:
  - `recordPublicShareAccessAsync(...)`
  - `serializePublicShareAsync(...)`
  - async supplier response lookup for public share serialization
- Rewired public share routes to use async helpers from `@/lib/readonly-share-async`.
- Preserved behavior:
  - public token normalization and plausibility checks
  - active-share-only access
  - Released submission and release-package requirement
  - public share response shape
  - `package.download_url`
  - supplier response serialization
  - release package download headers
  - storage access audit on package download

## QC Coverage

`scripts/qc-access-control-async-repository.mjs` now includes:

- `PUBLIC-SHARE-ASYNC-001`: async release repository exposes provider-neutral readonly share access SQL.
- `PUBLIC-SHARE-ASYNC-002`: readonly share async helper serializes public share without sync DB imports.
- `PUBLIC-SHARE-ASYNC-003`: public share routes use async helpers and avoid sync readonly-share imports.
- `PUBLIC-SHARE-ASYNC-004`: in-memory SQLite semantic check proves share access count and timestamps update.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:access-control-async-repository` passed 223/223.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Minimal HTTP smoke against temporary `next dev` at `http://127.0.0.1:3019` passed:
  - manager login returned 200.
  - released submission with release package was discovered: `SUB-20260612-284CDBA2`.
  - `POST /api/submissions/[id]/shares` returned share id `54c491b2-33c5-4410-9441-86825e58db11` and a 32-character token.
  - `GET /api/public/shares/[token]` returned 200 with matching share id, submission id, package download URL, and `supplier_responses` array.
  - `GET /api/public/shares/[token]/package` returned 200 with `content-type=application/zip`, `content-length=1931`, and attachment filename `QC-REL-A-791882_rev-A_release-package.zip`.
  - temporary port 3019 listener was stopped and temp logs were removed after verification.

## Boundary

This phase does not convert management release-package creation, sandbox routes, submission legacy BOM routes, numbering repositories, parts/cost/attachments, AI grounding/tooling internals, or remaining sync repositories.

No Supabase connector call, migration apply, project/branch creation, live Postgres validation, production cutover, or rollback operation was performed in this phase.
