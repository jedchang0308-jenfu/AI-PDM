# RD Report: Supplier Response Async Provider Conversion

Date: 2026-06-12

Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.

## Scope

This phase converts supplier response persistence paths from synchronous route-level `@/lib/db` imports to provider-neutral async database access.

Covered routes:

- `/api/submissions/[id]/supplier-responses`
- `/api/submissions/[id]/supplier-responses/[responseId]`
- `/api/public/shares/[token]/responses`

## Changes

- Extended `AsyncReleaseRepository` with provider-neutral SQL for:
  - readonly share lookup by token hash
  - supplier response list and filtered list
  - supplier response lookup by id
  - supplier response create
  - supplier response close
- Extended `src/lib/release-records-async.ts` with readonly-share and supplier-response helpers.
- Added `src/lib/readonly-share-async.ts` for public share validation without importing the synchronous `readonly-share.ts` module.
- Rewired management supplier response routes to use `getSubmissionAsync(...)` and async supplier response helpers.
- Rewired public supplier response submit route to use `getPublicShareAsync(...)` and `createSupplierPortalResponseAsync(...)`.
- Preserved behavior:
  - R&D Manager / Admin guard for management list/close
  - submission read guard
  - public share token validation
  - released submission and release package requirement for public responses
  - create response status `open`
  - close response status `closed`
  - `SupplierPortalResponseCreated` and `SupplierPortalResponseClosed` audit actions

## QC Coverage

`scripts/qc-access-control-async-repository.mjs` now includes:

- `SUPPLIER-RESPONSE-ASYNC-001`: async release repository exposes provider-neutral readonly-share and supplier-response SQL.
- `SUPPLIER-RESPONSE-ASYNC-002`: runtime helpers expose async readonly-share and supplier-response operations without sync DB imports.
- `SUPPLIER-RESPONSE-ASYNC-003`: supplier response routes use async helpers and avoid direct sync DB imports.
- `SUPPLIER-RESPONSE-ASYNC-004`: in-memory SQLite semantic check proves share lookup plus supplier response create/list/filter/audit behavior.
- `SUPPLIER-RESPONSE-ASYNC-005`: in-memory SQLite semantic check proves supplier response close and audit behavior.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:access-control-async-repository` passed 214/214.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Minimal HTTP smoke against temporary `next dev` at `http://127.0.0.1:3017` passed:
  - manager login returned 200.
  - released submission with release package was discovered through the API.
  - management share creation returned a token.
  - public `POST /api/public/shares/[token]/responses` returned a supplier response with `status=open`.
  - management `GET /api/submissions/[id]/supplier-responses` returned the created response.
  - management `PATCH /api/submissions/[id]/supplier-responses/[responseId]` returned `status=closed` and `closed_by=user-manager-demo`.
  - temporary port 3017 listener was stopped and temp logs were removed after verification.

## Boundary

This phase does not convert share create/revoke routes themselves, package download/share serialization routes, sandbox routes, submission legacy BOM routes, numbering repositories, parts/cost/attachments, AI grounding/tooling internals, or remaining sync repositories.

No Supabase connector call, migration apply, project/branch creation, live Postgres validation, production cutover, or rollback operation was performed in this phase.
