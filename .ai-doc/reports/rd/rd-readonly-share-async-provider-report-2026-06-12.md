# RD Report: Readonly Share Async Provider Conversion

Date: 2026-06-12

Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.

## Scope

This phase converts management readonly share create/list/revoke persistence from synchronous route-level `@/lib/db` imports to provider-neutral async database access.

Covered routes:

- `/api/submissions/[id]/shares`
- `/api/submissions/[id]/shares/[shareId]`

## Changes

- Extended `AsyncReleaseRepository` with provider-neutral readonly share SQL for:
  - list shares by submission
  - get share by token hash
  - insert share
  - revoke share
- Extended `src/lib/release-records-async.ts` with:
  - `listReadonlySharesAsync(...)`
  - `createReadonlyShareAsync(...)`
  - `revokeReadonlyShareAsync(...)`
- Extended `src/lib/readonly-share-async.ts` with token generation, token hashing, public URL building, and public share validation without importing the synchronous `readonly-share.ts` module.
- Rewired share routes to use `getSubmissionAsync(...)`, async share helpers, and async token helpers.
- Preserved behavior:
  - R&D Manager / Admin guard
  - submission read guard
  - Released-only share creation
  - release-package-required guard
  - share token response
  - public URL response
  - idempotent revoke fields through `COALESCE`
  - `ReadonlyShareCreated` and `ReadonlyShareRevoked` audit actions

## QC Coverage

`scripts/qc-access-control-async-repository.mjs` now includes:

- `READONLY-SHARE-ASYNC-001`: async release repository exposes provider-neutral readonly share SQL.
- `READONLY-SHARE-ASYNC-002`: runtime helpers expose readonly share and token operations without sync DB imports.
- `READONLY-SHARE-ASYNC-003`: share routes use async helpers and avoid direct sync DB imports.
- `READONLY-SHARE-ASYNC-004`: in-memory SQLite semantic check proves share create/list and audit behavior.
- `READONLY-SHARE-ASYNC-005`: in-memory SQLite semantic check proves share revoke and audit behavior.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:access-control-async-repository` passed 219/219.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Minimal HTTP smoke against temporary `next dev` at `http://127.0.0.1:3018` passed:
  - manager login returned 200.
  - released submission with release package was discovered through the API.
  - `POST /api/submissions/[id]/shares` returned share id, token, and public URL.
  - `GET /api/submissions/[id]/shares` returned the created share with `status=active`.
  - `PATCH /api/submissions/[id]/shares/[shareId]` returned `status=revoked` and `revoked_by=user-manager-demo`.
  - temporary port 3018 listener was stopped and temp logs were removed after verification.

## Boundary

This phase does not convert public share serialization/package routes, sandbox routes, submission legacy BOM routes, numbering repositories, parts/cost/attachments, AI grounding/tooling internals, or remaining sync repositories.

No Supabase connector call, migration apply, project/branch creation, live Postgres validation, production cutover, or rollback operation was performed in this phase.
