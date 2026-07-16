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
- Added `src/lib/repositories/submission-file-repository.ts` for submission file lookup, GDrive upload status, upload queue lookup, and Released filename conflict checks.
- Added `src/lib/repositories/user-repository.ts` for auth mode, demo/bootstrap user seed, user lookup, user create, and password update workflows.
- Added `src/lib/repositories/item-repository.ts` for item current revision reconcile, item revision history, submission revision uniqueness, and item find/create workflows.
- Added `src/lib/repositories/bom-repository.ts` for BOM detail, CAD reference materialization, BOM diff, and where-used workflows.
- Added `src/lib/repositories/submission-repository.ts` for submission list/detail/search, reuse and duplicate geometry, manufacturing handoff, create/update status, and release/obsolete workflows.
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

## Seventh Batch QA Plan
- Scope: verify submission file/status extraction preserves file download/preview lookup, GDrive upload queue behavior, and Released filename conflict detection.
- Risk: file routes could fail if the lookup moves out of `db.ts` but route imports still rely on public re-exports.
- Risk: Released filename conflict checks must still exclude the current submission and same item when blocking duplicate filenames.
- Pass criteria: repository split gate covers submission-file ownership and `db.ts` no longer owns file/status functions, lint/build pass, and API regression covers file download/preview, upload retry, and duplicate Released filename risk paths.

## Eighth Batch QA Plan
- Scope: verify users/auth extraction preserves demo auth mode, bootstrap user seeding, login/token flows, user lookup, user creation, and password update behavior.
- Risk: moving demo/bootstrap seed out of `initDatabase()` could break first-run login if seeded users are not inserted before auth routes execute.
- Risk: `DbUser` and `DbUserWithPassword` must remain re-exported from `@/lib/db` for auth, permission, chat, and AI tool modules.
- Pass criteria: repository split gate covers user ownership and `db.ts` no longer owns auth/user functions, lint/build pass, and API regression covers auth/login/token/me and role scoping paths.

## Ninth Batch QA Plan
- Scope: verify item core extraction preserves item current revision reconcile, item revision history API behavior, submission revision uniqueness, and create submission item linking.
- Risk: moving `findOrCreateItem()` out of `db.ts` could break submission creation if circular imports initialize before `getDb()` is ready.
- Risk: current revision reconcile must still run during DB initialization before API responses depend on item state.
- Pass criteria: repository split gate covers item ownership and `db.ts` no longer owns item functions, lint/build pass, and API regression covers submission create, duplicate revision rejection, and item revision history paths.

## Tenth Batch QA Plan
- Scope: verify BOM extraction preserves BOM detail, CAD reference materialization, BOM diff, where-used, and AI summary/risk source behavior.
- Risk: `src/lib/repositories/bom-repository.ts` imports `getSubmission()` through `@/lib/db`, so build and API regression must catch circular initialization issues.
- Risk: materializing BOM drafts must continue writing audit logs after relocation.
- Pass criteria: repository split gate covers BOM ownership and `db.ts` no longer owns BOM/where-used functions, lint/build pass, and API regression covers BOM, where-used, AI summary, AI risk, and handoff/procurement payload paths.

## Eleventh Batch QA Plan
- Scope: verify submission extraction preserves list/detail/search, reuse and duplicate geometry, manufacturing handoff, create/update status, and release/obsolete behavior.
- Risk: `src/lib/repositories/submission-repository.ts` imports BOM, item, item-lock, and release repositories while still using `createAuditLog()` and `getDb()` through `@/lib/db`, so build and API regression must catch circular initialization issues.
- Risk: release/obsolete flow must continue updating item current revision and audit history after relocation.
- Pass criteria: repository split gate covers submission ownership and `db.ts` no longer owns submission functions, lint/build pass, API regression covers submission/create/search/release/handoff paths, and the final industrialization gate remains green.

## Evidence
- `npm.cmd run qc:db-repository-split`: PASS with 132 checks.
- `npm.cmd run lint`: PASS.
- `npm.cmd run build`: PASS with existing Turbopack dynamic path tracing warnings in `src/lib/config.ts` and `src/lib/llm-usage.ts`.
- `npm.cmd run qc:api`: PASS with 391 checks.
- `npm.cmd run qc:industrialization`: PASS with 15/15 steps after the final submission repository batch.

## Result
PASS. `src/lib/db.ts` is now the provider/init/audit/re-export layer; feature data access is split under `src/lib/repositories/`.
