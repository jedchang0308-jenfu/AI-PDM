# RD Report: AI Summary And Risk Routes Async Provider Conversion

Date: 2026-06-12

Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.

## Scope

This phase converts AI submission summary and AI risk hint routes from direct synchronous `@/lib/db` submission lookup to provider-neutral async submission detail access.

Covered routes:

- `/api/submissions/[id]/ai-summary`
- `/api/submissions/[id]/ai-risks`

## Changes

- Rewired both routes from `getSubmission(...)` to `getSubmissionAsync(...)`.
- Preserved behavior:
  - `requireAuthAsync(...)` authentication
  - `canReadSubmission(...)` authorization
  - scoped `submittedBy` behavior for Engineer users
  - existing AI summary payload shape
  - existing AI risk report payload shape
- Tightened `scripts/qc-access-control-async-repository.mjs` so AI summary/risk routes must use `getSubmissionAsync(...)` and avoid sync `@/lib/db` / `getSubmission(...)` imports.

## QC Coverage

`scripts/qc-access-control-async-repository.mjs` now includes:

- stricter `ROUTE-AUTH-ASYNC-017`: AI summary and risk routes must use async submission detail and avoid sync DB imports.
- `AI-ROUTE-ASYNC-001`: AI summary and risk routes use async submission detail while retaining builder calls.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:access-control-async-repository` passed 225/225.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Minimal HTTP smoke against temporary `next dev` at `http://127.0.0.1:3021` passed:
  - manager login returned 200.
  - selected submission `SUB-20260612-24EA18A9`.
  - `GET /api/submissions/[id]/ai-summary` returned 200 with `summary` keys: `submission_id`, `title`, `generated_at`, `sections`, `missing_file_roles`, `source_count`, `sources`.
  - `GET /api/submissions/[id]/ai-risks` returned 200 with `report` keys: `submission_id`, `generated_at`, `risk_count`, `risks`.
  - temporary port 3021 listener was stopped and temp logs were removed after verification.

## Boundary

This phase does not convert AI grounding/tooling internals, chat LLM provider behavior, sandbox routes, submission legacy BOM routes, numbering repositories, parts/cost/attachments, or remaining sync repositories.

No Supabase connector call, migration apply, project/branch creation, live Postgres validation, production cutover, or rollback operation was performed in this phase.
