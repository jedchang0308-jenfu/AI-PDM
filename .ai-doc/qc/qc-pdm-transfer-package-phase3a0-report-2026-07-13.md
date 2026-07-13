# QC Report - DEV-041 Phase 3A-0 技轉包工作台

Date: 2026-07-13
Status: PASS - Local Implementation And QA Complete
Scope: `DEV-041` Phase 3A-0 only

## 1. Verification Boundary

This report verifies the persistent Draft workbench shell, package identity, header/scope maintenance, owner-module adapters, blocker summary, return context and terminal cancellation. It does not approve Phase 3A-1 to 3C, a live PostgreSQL/Supabase migration, production data work, native SolidWorks integration, deployment or release.

## 2. Implemented Contract

- Opening or refreshing `/transfer-packages/new` is read-only; only explicit `建立技轉包` persists a Draft.
- Creation requires an idempotency key and returns a stable package ID/code; a canonical source drawing or part is inserted in the same transaction.
- Package, scope item and event access is company-scoped with owner/Manager/Admin edit rules and optimistic `row_version` checks.
- Source aliases normalize to `drawing_number` or `part_number`; duplicate scope rows are not created.
- Cancellation is terminal, reasoned and audited; evidence is retained and later edits fail closed.
- Create and detail routes share one workbench. Drawing/part, BOM, attachment and approval modules remain owner authorities.
- Pack-and-Go upload and formal approval are displayed as unavailable, not as fake ready or empty states.

## 3. Automated Evidence

| Check | Result |
|---|---|
| `npx.cmd tsc --noEmit --pretty false` | PASS |
| `npm.cmd run lint -- --quiet` | PASS |
| `npm.cmd run qc:pdm-transfer-package-phase3a0` | PASS 18/18 |
| `npm.cmd run qc:pdm-submission-gate-phase1` | PASS 15/15 |
| `npm.cmd run qc:pdm-account-lifecycle` | PASS 26/26 |
| Isolated `next build` with `.tmp/next-build-dev041-20260713` | PASS, 108 pages |
| In-memory SQLite full schema initialization | PASS |

The build reported the existing Next.js middleware deprecation and Turbopack NFT trace warnings only; neither was introduced as a transfer-package runtime failure.

## 4. Runtime API Evidence

| Contract | Observed result |
|---|---|
| Create-context GET does not persist | count before `0`, count after GET `0` |
| Source context resolution | `A0001-M01` resolved and pre-added |
| Explicit create | HTTP success and stable detail URL |
| Repeated idempotency key | same package ID |
| Header update | row version advanced |
| Add scope | count advanced from 1 to 2 |
| Duplicate scope add | count and row version remained stable |
| Remove scope | count returned to 1 |
| Readiness | `ready=false`, later-phase capability honestly unavailable |
| Cancel and repeated cancel | terminal `Cancelled`, repeated call stable |
| Edit after cancellation | HTTP 409 |

## 5. Browser Evidence

The flow was exercised with `engineer@example.com` against the project-owned local server. UI creation produced package `b8acee92-4eab-4b5f-ab5c-fd2bc6e0101d`, added `A0001-P01`, opened the cancellation confirmation at mobile width and reached a terminal disabled state.

| Viewport/state | Evidence |
|---|---|
| 1440 detail workbench | `output/playwright/dev041-transfer-detail-1440.png` |
| 1024 detail workbench | `output/playwright/dev041-transfer-detail-1024.png`; viewport 1024, document width 1009 |
| 390 detail workbench | `output/playwright/dev041-transfer-detail-390-top.png`; viewport 390, document width 375 |
| 390 cancellation modal | `output/playwright/dev041-transfer-cancel-modal-390-fixed.png`; opaque white surface, body scroll locked, no overlap |

No visible unexpected alert, raw API error, `Not Found` or `Internal Server Error` appeared in the tested transfer-package flow. The Engineer sidebar still issues an existing `/api/approvals/inbox` 403 console request; it is not visible, is outside the transfer-package API and is recorded as unrelated residual work.

## 6. Residual And Deferred Scope

- `db/postgres/010_transfer_package_phase3a0.sql` is an offline migration artifact only. No live Supabase/PostgreSQL migration, grant verification, advisor run or production mutation was executed.
- Phase 3A-1 ZIP safety/parser/manifest/classification is not implemented.
- Phase 3A-2 mapping/BOM/integer baseline, Phase 3B readiness/SolidWorks evidence and Phase 3C submit/sign-off/release handoff are not implemented.
- No Git stage, commit, branch, merge, PR, deploy, rollback or release action was performed.

## 7. Conclusion

Phase 3A-0 meets its local acceptance contract and is QA-passed. The next eligible implementation slice is Phase 3A-1 only after an explicit request; this report does not authorize later phases or release work.
