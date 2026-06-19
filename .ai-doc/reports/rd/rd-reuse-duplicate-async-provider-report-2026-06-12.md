# RD Report: Reuse And Duplicate Candidate Async Provider Conversion

Date: 2026-06-12

## Scope

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: Phase 3BU, design reuse and duplicate geometry candidate route async provider conversion.
- Converted `GET /api/submissions/[id]/reuse-candidates` and `GET /api/submissions/[id]/duplicate-geometry` away from direct synchronous `@/lib/db` access.
- Preserved auth, submission read permission checks, submitted-by scoping, limit clamping, reuse scoring, duplicate fingerprint scoring, and response envelopes.

## Implementation

- Updated `src/lib/repositories/submission-list-async-repository.ts`.
  - Added provider-neutral candidate lookup SQL for SQLite and Postgres.
  - Added `listDesignReuseCandidates(...)` and `listDuplicateGeometryCandidates(...)`.
  - Ported the existing reuse and duplicate scoring helpers into the async repository path.
- Updated `src/lib/submissions-async.ts`.
  - Added `listDesignReuseCandidatesAsync(...)` and `listDuplicateGeometryCandidatesAsync(...)`.
- Updated `src/app/api/submissions/[id]/reuse-candidates/route.ts`.
  - Uses `getSubmissionAsync(...)` and `listDesignReuseCandidatesAsync(...)`.
- Updated `src/app/api/submissions/[id]/duplicate-geometry/route.ts`.
  - Uses `getSubmissionAsync(...)` and `listDuplicateGeometryCandidatesAsync(...)`.
- Updated `scripts/qc-access-control-async-repository.mjs`.
  - Static gate now rejects sync DB/helper use in both routes.
  - SQLite semantic proof now covers candidate SQL output for reuse file names and duplicate fingerprints.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match in reuse or duplicate geometry routes.
- `npm.cmd run qc:access-control-async-repository` passed 231/231.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.

## Runtime Smoke

- Started a temporary Next dev server at `http://127.0.0.1:3024` and stopped it after the smoke.
- Logged in as `manager@example.com` with the local demo password.
- Selected submission `SUB-20260612-3D550288`.
- `GET /api/submissions/SUB-20260612-3D550288/reuse-candidates?limit=6` returned HTTP 200 with `submissionId`, `candidates[]`, and 6 reuse candidates.
- Top reuse candidate was `SUB-20260612-6B1C80B2`.
- `GET /api/submissions/SUB-20260612-3D550288/duplicate-geometry?limit=6` returned HTTP 200 with `submissionId`, `method=file_fingerprint`, and `candidates[]`; the local data set returned 0 duplicate geometry candidates.
- Cleaned up the temporary server, PID file, and logs.

## Boundary

- No Supabase connector calls were made.
- No migration was applied.
- No Supabase project or branch was created.
- No live Postgres validation was performed.
- No provider pointer, production cutover, or rollback operation was changed.
