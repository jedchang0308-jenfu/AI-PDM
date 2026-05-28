# DB Repository Split Verification - 2026-05-28

## Scope
Start splitting the 3000+ line `src/lib/db.ts` data layer into feature repositories without changing public imports or API behavior.

## Implemented Split
- Added `src/lib/repositories/dashboard-repository.ts` for dashboard metrics.
- Added `src/lib/repositories/ai-repository.ts` for LLM conversation/message persistence.
- Added `src/lib/repositories/system-repository.ts` for system settings.
- Added `src/lib/repositories/collaboration-repository.ts` for discussion comments, review issues, change requests, phase gates, and PDF markups.
- Added `src/lib/repositories/notification-repository.ts` for notification aggregation and role-scoped notification queries.
- Added `src/lib/repositories/item-lock-repository.ts` for checkout lock lookup, preflight matching, expiration, create, and release operations.
- Added `src/lib/repositories/release-repository.ts` for release packages, read-only shares, supplier portal responses, and procurement sync runs.
- Added `src/lib/repositories/sandbox-repository.ts` for sandbox branch listing, merge preview, create, status transition, and merge operations.
- Added `src/lib/repositories/approval-repository.ts` for approval decisions, approval summaries, and approval matrix workflows.
- Kept `src/lib/db.ts` re-export compatibility so existing route handlers and libraries do not need a broad import rewrite in this checkpoint.

## Second Batch QA Plan
- Scope: verify collaboration and notification extraction preserves existing public imports and route behavior.
- Risk: circular imports through `@/lib/db` re-exports could break runtime initialization.
- Risk: role-scoped notification queries could leak Engineer-owned records after moving query code.
- Pass criteria: repository split gate covers ownership and re-export checks, lint and build pass, API regression covers collaboration/notification routes, and industrialization acceptance gate remains green.

## Third Batch QA Plan
- Scope: verify item-lock extraction preserves checkout, preflight, active-lock notification, and `getSubmission()` active lock behavior.
- Risk: `getSubmission()` still needs an active-lock lookup after the exported functions move out of `db.ts`.
- Risk: lock create/release could regress if the repository depends on full submission hydration instead of only the submission item identity.
- Pass criteria: repository split gate covers item-lock ownership and `db.ts` no longer owns lock functions, lint/build pass, and API regression covers checkout/preflight/notification paths.

## Fourth Batch QA Plan
- Scope: verify release/share/procurement extraction preserves release package metadata, read-only public share access, supplier response lifecycle, and ERP sync lifecycle.
- Risk: `getSubmission()` still needs release package metadata after the exported release functions move out of `db.ts`.
- Risk: public share response must continue excluding local paths, token hashes, and audit logs after repository relocation.
- Pass criteria: repository split gate covers release ownership and `db.ts` no longer owns release/share/procurement functions, lint/build pass, and API regression covers package/share/supplier/procurement paths.

## Fifth Batch QA Plan
- Scope: verify sandbox extraction preserves branch list, merge preview, branch create/close/promote/merge behavior, and promoted sandbox release flow.
- Risk: `src/lib/repositories/sandbox-repository.ts` imports `getSubmission()` and `materializeBomDraftFromReferences()` through `@/lib/db`, so circular initialization must be caught by build and API regression.
- Risk: merge preview and merge promotion must continue isolating draft revisions until explicit merge.
- Pass criteria: repository split gate covers sandbox ownership and `db.ts` no longer owns sandbox functions, lint/build pass, and API regression covers sandbox create/list/preview/merge/release paths.

## Sixth Batch QA Plan
- Scope: verify approval extraction preserves approve/reject behavior, approval summaries, approval matrix initialize/refresh/waive behavior, and released handoff approval metadata.
- Risk: `src/lib/repositories/approval-repository.ts` imports `createAuditLog()` through `@/lib/db`, so circular initialization must be caught by build and API regression.
- Risk: matrix refresh could stop satisfying requirements after reviewer approvals if decision aggregation changes during relocation.
- Pass criteria: repository split gate covers approval ownership and `db.ts` no longer owns approval functions, lint/build pass, and API regression covers approve/reject/two-reviewer/approval-matrix paths.

## Evidence
- `npm.cmd run qc:db-repository-split`: PASS with 89 checks.
- `npm.cmd run lint`: PASS.
- `npm.cmd run build`: PASS with existing Next Turbopack NFT trace warning from dynamic path resolution in `src/lib/llm-usage.ts`.
- `npm.cmd run qc:api`: PASS with 391 checks.
- `npm.cmd run qc:industrialization`: PASS with 15/15 steps after the second repository batch. The third, fourth, fifth, and sixth batches used narrower validation to avoid redundant compute.

## Result
PARTIAL PASS. Low-coupling repositories plus collaboration, notification, item-lock, release/share/procurement, sandbox, and approval repositories are split; submissions, items, BOM, users/auth, and file-status repositories remain for later passes.
