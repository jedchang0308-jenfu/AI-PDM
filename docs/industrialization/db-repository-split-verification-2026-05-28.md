# DB Repository Split Verification - 2026-05-28

## Scope
Start splitting the 3000+ line `src/lib/db.ts` data layer into feature repositories without changing public imports or API behavior.

## Implemented Split
- Added `src/lib/repositories/dashboard-repository.ts` for dashboard metrics.
- Added `src/lib/repositories/ai-repository.ts` for LLM conversation/message persistence.
- Added `src/lib/repositories/system-repository.ts` for system settings.
- Added `src/lib/repositories/collaboration-repository.ts` for discussion comments, review issues, change requests, phase gates, and PDF markups.
- Added `src/lib/repositories/notification-repository.ts` for notification aggregation and role-scoped notification queries.
- Kept `src/lib/db.ts` re-export compatibility so existing route handlers and libraries do not need a broad import rewrite in this checkpoint.

## Second Batch QA Plan
- Scope: verify collaboration and notification extraction preserves existing public imports and route behavior.
- Risk: circular imports through `@/lib/db` re-exports could break runtime initialization.
- Risk: role-scoped notification queries could leak Engineer-owned records after moving query code.
- Pass criteria: repository split gate covers ownership and re-export checks, lint and build pass, API regression covers collaboration/notification routes, and industrialization acceptance gate remains green.

## Evidence
- `npm.cmd run qc:db-repository-split`: PASS with 41 checks.
- `npm.cmd run lint`: PASS.
- `npm.cmd run build`: PASS with existing Next Turbopack NFT trace warning from dynamic path resolution in `src/lib/llm-usage.ts`.
- `npm.cmd run qc:api`: PASS with 391 checks.
- `npm.cmd run qc:industrialization`: PASS with 15/15 steps.

## Result
PARTIAL PASS. Low-coupling repositories plus collaboration and notification repositories are split; submissions, items, release, BOM, shares, procurement, sandbox, item locks, approvals, users/auth, and file-status repositories remain for later passes.
