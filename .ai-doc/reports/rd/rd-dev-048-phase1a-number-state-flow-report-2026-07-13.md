# RD Report: DEV-048 Phase 1A Number State Flow

Date: 2026-07-13
Status: `RD Implemented / Independent QC Pending`
Scope: local domain, data, BFF and focused tests only

## Delivered

- Added stable `numbering_draft_workspaces` and typed root/part/drawing/relation draft tables.
- Added candidate reservation authority, active-state partial uniqueness, append-only candidate events and immediate recycle history.
- Added root-first smallest-gap allocation for root, part and drawing scopes, with SQLite serialized writes, PostgreSQL scope-row `FOR UPDATE`, recovery reservation exclusion and three-attempt collision handling.
- Added create/read/update/acquire/cancel services and BFF routes with server auth, permission, company/owner scope, same-origin JSON, optimistic version, required idempotency and no-store error envelopes.
- Added `PdmCommand` create/acquire/cancel boundaries with domain audit plus command receipt and transactional outbox.
- Added a dry-run-only legacy classifier; it performs no legacy updates or automatic master demotion.
- Added SQLite schema, PostgreSQL migration 012, generated PostgreSQL fresh schema/RLS plan, and Supabase mirrors for previously missing 010/011 plus new 012.

## Safety Results

- Create leaves all official master tables unchanged.
- Acquire allocates `root -> part -> drawing` atomically and same-key replay returns the prior result.
- Cancel recycles active candidates in the same command transaction; a later workspace can reuse the same code with new reservation IDs.
- Forced relation conflict rolls back workspace, candidate event, audit and command receipt facts.
- Candidate events reject update/delete; recycled rows remain immutable history.
- No client/offline candidate fallback, fixed cooling period, automatic expiry, live provider call or production data migration was added.

## RD Self-Verification

| Gate | Result |
|---|---|
| `qc:pdm-number-state-flow-contract` | 19/19 pass |
| `qc:pdm-number-state-flow-runtime` | 7/7 pass on disposable SQLite |
| `qc:postgres-shadow` | 26/26 pass; no live target configured |
| `qc:supabase-runtime-migrations` | 46/46 pass; mirror only |
| Numbering core / duplicate submit / gap reuse | pass |
| ERP foundation / transfer Phase 3A-0 / controlled history | pass |
| TypeScript | pass |
| ESLint | 0 errors; 3 pre-existing attachment warnings |
| Isolated `next build` | pass; four new routes present |
| localhost negative HTTP | 401 auth and 403 cross-origin envelopes pass with private/no-store |

## Not Passed Or Not Executed

- Independent QC has not run. RD self-verification is not a QC pass.
- Existing API/data/concurrency/cross-role suites correctly refused the protected runtime database and require a disposable server bound to the same `PDM_DATA_DIR`.
- Existing access-control governance expects a server on port 3100; that fixture was not started in this RD turn.
- Live PostgreSQL/Cloud SQL, Supabase migration history, Firebase, GCS, provider credentials, staging and production were not used.
- Phase 1B UI/RWD/a11y, Phase 1C approval/publication and Phase 1D transfer integration were not implemented.

## QC Handoff

Run Phase 1A QC with a disposable application server and verify Company A/B isolation, owner/manager/admin/denied roles, 20-way parallel acquire, same-key replay, direct API bypass, recycle reference blockers, provider outage and standardized error responses. Do not use `data/ai-pdm.sqlite` for allocating tests.
