# RD Report: Numbering Admin / Simulator / Analysis Async Provider

Date: 2026-06-16
Phase: 3CS
Task: `DEV-SUPABASE-DB-001`

## Scope

Converted the final direct `@/lib/db` numbering API routes to the async provider path:

- `src/app/api/numbering/admin/matrix/route.ts`
- `src/app/api/numbering/dvt-candidates/route.ts`
- `src/app/api/numbering/impact-analysis/route.ts`
- `src/app/api/numbering/rule-simulator/route.ts`
- `src/app/api/numbering/variants/route.ts`

## Implementation

- Added async repository support for admin matrix read/write operations, approval rule simulation, numbering gate simulation, DVT candidate list/submission, main drawing impact analysis, and drawing-part variant linking.
- Added facade helpers in `src/lib/numbering-async.ts`.
- Updated the five routes to call async helpers while preserving existing permission guards, response envelopes, status codes, and error mapping.
- Extended `scripts/qc-access-control-async-repository.mjs` so the final numbering routes are covered by the async provider gate.

## Verification

- `npx.cmd tsc --noEmit`: passed.
- `rg -n "@/lib/db" src/app/api --glob route.ts`: no matches; direct route DB import count is `0`.
- `node --check scripts/qc-access-control-async-repository.mjs`: passed.
- `npm.cmd run qc:access-control-async-repository`: passed, `253/253`.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed. Existing Turbopack NFT trace warning remains through `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`.

## Runtime Smoke

Temporary server:

- `npx.cmd next dev --hostname 127.0.0.1 --port 3037`
- isolated `PDM_DATA_DIR`: `output/runtime-numbering-final-20260616135052-15da70a9/data`

Covered paths:

- Admin login: `POST /api/auth/login`
- Write path: `POST /api/numbering/records`
- Write path: `POST /api/numbering/variants`
- Read path: `GET /api/numbering/admin/matrix`
- Simulation path: `POST /api/numbering/rule-simulator` for approval rule evaluation
- Simulation path: `POST /api/numbering/rule-simulator` for DVT gate evaluation
- Read path: `GET /api/numbering/dvt-candidates`
- Analysis path: `POST /api/numbering/impact-analysis`

Result:

- Created root `0001`, part `P-0001-001`, drawing `D-0001-MA1`.
- Admin matrix returned `roleCount=6`, `approvalRuleCount=17`.
- Approval rule simulation returned `requiresApproval=true`, `requiredRoles=["rd_manager"]`.
- DVT gate simulation returned `allowed=true`, `issueCount=0`.
- Variant link returned `linkType=primary_manufacturing`, `variantCount=1`.
- DVT candidates returned `total=1`.
- Impact analysis returned `applied=false`, `impacted=1`.
- Cleanup proof: `cleanupExists=false`, `portRemaining=false`.

## Stop Point

Direct `@/lib/db` API route migration is complete with count `0`.

Do not start Supabase runtime cutover, provider pointer changes, project/branch creation, or cost-incurring actions without explicit approval. The next PM decision is whether to open a controlled Supabase runtime gate for staging Postgres smoke, rollback evidence, and data parity boundaries.
