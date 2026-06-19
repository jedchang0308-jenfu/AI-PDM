# RD Report: Release Package Download Async Provider Conversion

Date: 2026-06-12

Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.

## Scope

This phase converts the authenticated release package download route from direct synchronous `@/lib/db` submission lookup to provider-neutral async submission detail access.

Covered route:

- `/api/submissions/[id]/release-package`

## Changes

- Rewired `src/app/api/submissions/[id]/release-package/route.ts` from `getSubmission(...)` to `getSubmissionAsync(...)`.
- Preserved behavior:
  - `requireAuthAsync(...)` authentication
  - `canReadSubmission(...)` authorization
  - Released / Obsolete status requirement
  - release package existence requirement
  - release package storage key resolution and read
  - release package storage access audit
  - zip download headers and filename disposition
  - path-boundary and missing-package error handling
- Tightened `scripts/qc-access-control-async-repository.mjs` so release package download route must use `getSubmissionAsync(...)` and avoid sync `@/lib/db` / `getSubmission(...)` imports.

## QC Coverage

`scripts/qc-access-control-async-repository.mjs` now includes:

- stricter `ROUTE-AUTH-ASYNC-016`: release package, share, and supplier response routes must avoid sync DB imports.
- `RELEASE-PACKAGE-ASYNC-001`: release package download route uses async submission detail and keeps storage audit/download behavior.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:access-control-async-repository` passed 224/224.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Minimal HTTP smoke against temporary `next dev` at `http://127.0.0.1:3020` passed:
  - manager login returned 200.
  - released submission with release package was discovered: `SUB-20260612-284CDBA2`.
  - `GET /api/submissions/[id]/release-package` returned 200.
  - response headers included `content-type=application/zip`, `content-length=1931`, and attachment filename `QC-REL-A-791882_rev-A_release-package.zip`.
  - downloaded byte length matched `content-length`.
  - temporary port 3020 listener was stopped and temp logs were removed after verification.

## Boundary

This phase does not convert release package creation internals beyond the route lookup already covered by earlier async release package helper work. It also does not convert sandbox routes, submission legacy BOM routes, numbering repositories, parts/cost/attachments, AI grounding/tooling internals, or remaining sync repositories.

No Supabase connector call, migration apply, project/branch creation, live Postgres validation, production cutover, or rollback operation was performed in this phase.
