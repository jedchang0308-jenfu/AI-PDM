# QA Supabase DB Migration Validation Plan - 2026-06-08

關聯任務：`DEV-SUPABASE-DB-001`  
驗證目標：確認 AI_PDM 可以由 SQLite runtime 安全切換到 Supabase Postgres runtime，且不誤用既有 Supabase target、不搬遷測試 artifacts、不洩漏 server-side secret。

## Validation Scope

包含：

- Clean baseline
- Migration reproducibility
- Target safety
- SQLite fallback
- Postgres provider
- API behavior parity
- RLS deny-by-default
- Secret boundary
- Supabase advisor evidence
- Production cutover smoke
- Rollback drill

不包含：

- Supabase Storage 檔案本體遷移
- 舊 test files 搬遷
- Browser 直接 Supabase Data API policy 設計

## Test Matrix

| Case | Priority | Method | Pass criteria |
|---|---|---|---|
| QA-SUPA-001 clean baseline | P0 | Inspect SQLite counts after reset. | Runtime business tables have no test artifacts; only controlled seed remains. |
| QA-SUPA-002 target guard | P0 | Run target guard against empty, non-empty, partial AI_PDM, and known non-AI_PDM targets. | Only empty pre-migration target and complete forced-RLS AI_PDM compare target pass. |
| QA-SUPA-003 migration reproducibility | P0 | Apply committed Supabase migrations to staging. | Schema matches expected AI_PDM table set. |
| QA-SUPA-004 RLS baseline | P0 | Inspect every public table. | RLS enabled and forced; direct `anon` / `authenticated` table grants revoked. |
| QA-SUPA-005 SQLite fallback | P0 | Run local SQLite mode. | `db:init`, key QC scripts, and `build` pass. |
| QA-SUPA-006 Postgres provider contract | P0 | Run provider contract in Postgres mode. | `query`, `queryOne`, `execute`, and `transaction` semantics pass. |
| QA-SUPA-006A async provider boundary | P0 | Run provider contract static/type checks before repository migration. | Async interface and SQLite adapter exist; Postgres fails closed until implemented; SQLite transaction rejects awaited callback misuse. |
| QA-SUPA-006B Postgres adapter local gate | P0 | Run static/type checks without live target. | `pg` dependency, unnamed query, named parameter normalization, transaction boundaries, missing URL fail-closed all pass; live probe is skipped when env is absent. |
| QA-SUPA-006C repository async pilot | P0 | Run first provider-neutral repository QC. | System settings async repository avoids sync DB dependency and passes insert/update/read/get-all semantic checks. |
| QA-SUPA-006D access-control async pilot | P0 | Run second provider-neutral repository QC. | Roles, users, and role permissions queries avoid sync DB dependency and pass role/permission semantic checks. |
| QA-SUPA-006E permission API async read path | P0 | Run permission API and UI regressions with role matrix toggles. | `/api/numbering/permissions` uses async permission service while preserving enable/disable, custom role, delegation, and sidebar behavior. |
| QA-SUPA-006F async guard read-only route migration | P0 | Run async access-control QC and TypeScript. | Async page/action guard helpers exist, sync guard remains available, and the first batch of read-only routes uses async page guard without changing response contracts. |
| QA-SUPA-006G async auth/session user lookup | P0 | Run async access-control QC and auth source checks. | Async permission guard uses `requireAuthAsync`, which resolves session users through provider-neutral async user repository while sync auth remains available. |
| QA-SUPA-006H async login/token user lookup | P0 | Run async access-control QC and managed auth regression. | Login and token routes resolve password users through async user repository while preserving managed login, session cookie, and bearer token behavior. |
| QA-SUPA-006I async auth audit write | P0 | Run async access-control QC and managed auth audit regression. | Login and token routes write Login audit rows through async audit repository while preserving audit detail markers. |
| QA-SUPA-007 API parity | P0 | Run API regression against Postgres mode. | Main flows keep existing response contracts. |
| QA-SUPA-008 audit append-only | P0 | Attempt audit row update/delete through app-level and DB-level checks. | Audit rows cannot be mutated outside approved insert path. |
| QA-SUPA-009 pooler compatibility | P1 | Run runtime through selected Supabase pooler config. | No prepared-statement or pooler failure. |
| QA-SUPA-010 secret boundary | P0 | Static and bundle scan. | Postgres URL/service role never appears in frontend bundle or public env. |
| QA-SUPA-011 advisor | P0 | Run Supabase security/performance advisors. | No unresolved P0/P1 findings before cutover. |
| QA-SUPA-012 production smoke | P0 | After prod migration, run smoke flows. | Login, numbering, upload metadata, approval, BOM, audit all pass. |
| QA-SUPA-013 rollback | P1 | Validate env rollback and SQLite snapshot. | Operator can return to SQLite mode during staging drill without ambiguity. |

## Local Command Checklist

```powershell
npm.cmd run db:init
npm.cmd run db:postgres:compare -- --no-write
npm.cmd run supabase:migrations:sync
npm.cmd run qc:supabase-runtime-migrations
npm.cmd run qc:postgres-shadow-target-guard
npm.cmd run qc:postgres-shadow
npm.cmd run qc:db-provider-contract
npm.cmd run qc:db-provider-async-contract
npm.cmd run qc:db-provider-postgres
npm.cmd run qc:system-settings-async-repository
npm.cmd run qc:access-control-async-repository
npm.cmd run qc:pdm-numbering-cross-role-permission
npm.cmd run qc:pdm-numbering-permission-guard-ui
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
```

## Live Staging Command Checklist

After `AI_PDM_STAGING` is created and env is configured:

```powershell
npm.cmd run db:postgres:guard -- --phase pre-migration
npm.cmd run db:postgres:compare -- --require-postgres
npm.cmd run qc:postgres-shadow
npm.cmd run qc:db-provider-postgres
npm.cmd run qc:api:postgres
npm.cmd run qc:supabase-secret-boundary
npm.cmd run build
```

## Entry Criteria

- User approves new Supabase organization, region, and cost.
- `AI_PDM_STAGING` exists and is empty.
- Migration files are committed or otherwise traceable.
- `.env` is configured locally, with no secrets committed.
- Target guard passes before migration apply.

## Exit Criteria

- Staging evidence package is complete.
- Supabase advisors are reviewed.
- Production target is created and migrated from committed migrations.
- Production smoke passes.
- `DEV-SUPABASE-DB-001` remains incomplete until live production cutover evidence exists.

## 2026-06-08 Local QA Result

- `qc:supabase-runtime-migrations` passed 17/17.
- Migration mirror coverage and source SHA-256 traceability passed.
- RLS deny-by-default SQL checks passed.
- Env documentation and package script checks passed.
- Target identity guard passed 11/11.
- Async provider contract passed 27/27 through `qc:db-provider-contract`.
- Postgres async adapter local gate passed 8/8 through `qc:db-provider-postgres`; live probe skipped because `PDM_POSTGRES_URL` is not configured.
- System settings async repository pilot passed 11/11 through `qc:system-settings-async-repository`.
- Access-control async repository pilot, permission async service, async guard helper, 5 read-only route wiring checks, async user repository, async auth/session lookup, login/token async lookup, and async audit insert checks passed 37/37 through `qc:access-control-async-repository`.
- Numbering core regression passed 238/238 through `qc:pdm-numbering-core`.
- Managed auth regression passed 11/11 through `qc:managed-auth`, including bearer token login, bearer-token settings access, and Login audit row checks.
- Permission API custom role / delegation regression passed 45/45 through `qc:pdm-numbering-cross-role-permission`.
- Permission sidebar / backend guard regression passed 35/35 through `qc:pdm-numbering-permission-guard-ui`.
- TypeScript passed through `npx.cmd tsc --noEmit`.
- Lint passed through `npm.cmd run lint -- --quiet`.

## 2026-06-08 Phase 3H QA Addendum

- Scope validated: async auth user write pilot.
- Expected behavior: demo/admin seed paths use async helpers; login/token routes do not import the sync DB aggregate for auth mode / seed behavior.
- Validation evidence: `npm.cmd run qc:access-control-async-repository` passed 42/42, `npm.cmd run qc:managed-auth` passed 11/11, and `npx.cmd tsc --noEmit` passed.
- Still required before completion: lint/build rerun after all documentation edits, provider runtime selection tests, Postgres live target tests, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3I QA Addendum

- Scope validated: `/api/settings` async runtime wiring.
- Expected behavior: admin-only settings GET/POST uses async auth, async settings repository, and async audit helper while preserving existing settings response and validation behavior.
- Validation evidence: `npm.cmd run qc:system-settings-async-repository` passed 15/15, `npm.cmd run qc:managed-auth` passed 11/11, `npm.cmd run qc:gdrive-folder-tree-settings` passed 35/35, `npm.cmd run qc:api` passed 391/391 with a temporary local dev server, `npx.cmd tsc --noEmit` passed, `npm.cmd run lint -- --quiet` passed, and `npm.cmd run build` passed with the existing Turbopack NFT warning.
- Still required before completion: lint/build after final edits, Postgres live target tests, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3J QA Addendum

- Scope validated: async runtime provider selector.
- Expected behavior: already-migrated async helpers must no longer hard-code SQLite; they must select SQLite or Postgres through the shared async provider selector while preserving SQLite fallback behavior.
- Validation evidence: `npm.cmd run qc:db-provider-contract` passed 35/35, `npm.cmd run qc:db-provider-postgres` passed 9/9 with live probe skipped because `PDM_POSTGRES_URL` is not configured, `npm.cmd run qc:access-control-async-repository` passed 42/42, `npm.cmd run qc:system-settings-async-repository` passed 15/15, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 11/11, `npm.cmd run qc:pdm-numbering-core` passed 238/238, `npm.cmd run lint -- --quiet` passed, `npm.cmd run qc:gdrive-folder-tree-settings` passed 35/35, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3K QA Addendum

- Scope validated: `/api/auth/me` and `/api/auth/logout` async session route migration.
- Expected behavior: session read should work for cookie and bearer token through async auth; logout should clear the session cookie and write audit through async audit without changing response behavior.
- Validation evidence: `npm.cmd run qc:access-control-async-repository` passed 44/44, `npm.cmd run qc:managed-auth` passed 18/18, `npx.cmd tsc --noEmit` passed, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3L QA Addendum

- Scope validated: Google Drive settings admin subroutes async guard migration.
- Expected behavior: folder list and folder verify remain Admin-only, Admin requests continue to pass, Engineer requests remain forbidden, and verified folder save metadata behavior remains unchanged.
- Validation evidence: `npm.cmd run qc:system-settings-async-repository` passed 16/16, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run qc:gdrive-folder-tree-settings` passed 35/35, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3M QA Addendum

- Scope validated: `/api/file-metadata/detect` async role guard migration.
- Expected behavior: Engineer/Admin access remains allowed through async auth lookup; unauthenticated access remains blocked by the shared auth contract; metadata detection behavior remains unchanged.
- Validation evidence: `npm.cmd run qc:access-control-async-repository` passed 45/45, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `META-001` through `META-004` covered the Engineer metadata detect path and native CAD metadata response.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3N QA Addendum

- Scope validated: manufacturing handoff async auth guard migration.
- Expected behavior: `/api/handoff` and `/api/handoff/export` continue to reject unauthenticated requests and return handoff JSON/CSV for an authenticated manager while using async session lookup.
- Validation evidence: `npm.cmd run qc:access-control-async-repository` passed 46/46, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `HANDOFF-001` through `HANDOFF-011` covered unauthenticated 401, authenticated manager 200, release package metadata, file hash exposure, approval exposure, and CSV export content.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3O QA Addendum

- Scope validated: `/api/search` and `/api/notifications` async auth guard migration.
- Expected behavior: unauthenticated requests remain blocked, authenticated manager/engineer reads continue to return scoped results, and engineer scoping continues to exclude other engineers' records.
- Validation evidence: `npm.cmd run qc:access-control-async-repository` passed 47/47, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `AUTH-013`, `SEARCH-001` through `SEARCH-003`, and `NOTIFY-001` through `NOTIFY-009` covered search/notifications auth and scoping behavior.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3Q QA Addendum

- Scope validated: `/api/items/[partNumber]/revisions` and `/api/items/[partNumber]/where-used` async auth guard migration.
- Expected behavior: unauthenticated requests remain blocked; manager revision history sees all relevant revisions; engineer revision history and where-used remain scoped to the authenticated engineer; unused parts still return an empty where-used list.
- Validation evidence: `npm.cmd run qc:access-control-async-repository` passed 48/48, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `HIST-001` through `HIST-006` and `WHEREUSED-001` through `WHEREUSED-011` covered item revision and where-used auth/scoping behavior.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3R QA Addendum

- Scope validated: `/api/integrations/procurement/releases` async role guard migration.
- Expected behavior: unauthenticated requests remain blocked, Engineer remains forbidden, Manager/Admin access remains allowed, and procurement release payload redaction/filtering stays unchanged.
- Validation evidence: `npm.cmd run qc:access-control-async-repository` passed 49/49, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `PROCAPI-001` through `PROCAPI-008` covered procurement releases auth, role guard, package metadata, file/BOM payload shape, redaction, partNumber filter, and since filter behavior.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3S QA Addendum

- Scope validated: `/api/numbering/permissions` async auth guard hardening.
- Expected behavior: authenticated users can still read the page/action permission matrix; unauthenticated requests remain blocked by the shared async auth contract; role toggles, custom role assignment, delegation, revocation, sidebar visibility, and backend permission denial behavior remain unchanged.
- Validation evidence: `npm.cmd run qc:access-control-async-repository` passed 49/49, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:pdm-numbering-permission-guard-ui` passed 35/35, `npm.cmd run qc:pdm-numbering-cross-role-permission` passed 45/45, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:pdm-numbering-permission-guard-ui` covered `/api/numbering/permissions` reads and UI/backend guard parity; `qc:pdm-numbering-cross-role-permission` covered Admin, R&D Manager, custom role, assigned role, delegation, revocation, and permission matrix parity.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3T QA Addendum

- Scope validated: `/api/integrations/procurement/sync-runs` and `/api/integrations/procurement/sync-runs/[runId]` async role guard migration.
- Expected behavior: unauthenticated requests remain 401, Engineer remains 403, Manager/Admin access remains allowed, pending submissions still cannot be synced, released package payloads remain included, list filtering still returns created runs, acknowledgement still preserves external refs, and duplicate acknowledgement still returns 409.
- Validation evidence: `npm.cmd run qc:access-control-async-repository` passed 50/50, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `ERPSYNC-001` through `ERPSYNC-012` covered procurement sync-run auth, role guard, released-only sync gate, create/list/acknowledge flow, package payload, external reference, and duplicate acknowledgement behavior.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3U QA Addendum

- Scope validated: `/api/chat` async auth guard migration.
- Expected behavior: unauthenticated chat remains 401; authenticated manager chat can create conversations and append messages; cross-user conversation access remains 403; source payloads and tool whitelist/blocking behavior remain unchanged.
- Validation evidence: `npm.cmd run qc:access-control-async-repository` passed 51/51, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and a warmed `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `AUTH-012`, `AI-009` through `AI-021`, and the contextual AI checks `AI-022` through `AI-026` covered chat auth, conversation persistence, cross-user 403, source lists, and AI policy/tool behavior.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3V QA Addendum

- Scope validated: `/api/submissions/[id]/files/[...filePath]` async auth guard migration while preserving `/api/submissions/[id]/files/[fileId]` download and `/api/submissions/[id]/files/preview/[fileId]` preview URL behavior.
- Expected behavior: unauthenticated file download remains 401; authenticated download remains 200 with attachment disposition; PDF preview remains 200 with `application/pdf` and inline disposition; non-PDF preview remains rejected with `415`.
- Validation evidence: `npm.cmd run qc:access-control-async-repository` passed 52/52, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `AUTH-003` and `FILE-001` through `FILE-005` covered submission file auth, download, attachment disposition, PDF preview, PDF content type, and inline disposition behavior.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3W QA Addendum

- Scope validated: `/api/submissions/[id]/discussions`, `/api/submissions/[id]/discussions/[commentId]`, `/api/submissions/[id]/issues`, and `/api/submissions/[id]/issues/[issueId]` async auth guard migration.
- Expected behavior: unauthenticated discussion/issue reads and creates remain 401; authenticated engineers can create/list their own comments and issues; managers can resolve and see team metadata; cross-submission file references remain 400; engineers remain blocked from other engineers' records with 403.
- Validation evidence: `npm.cmd run qc:access-control-async-repository` passed 53/53, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `DISCUSS-001` through `DISCUSS-014` and `ISSUE-001` through `ISSUE-013` covered auth, create/list/resolve, file metadata, cross-submission validation, manager visibility, and engineer scope isolation.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3X QA Addendum

- Scope validated: `/api/submissions/[id]/changes` and `/api/submissions/[id]/changes/[changeId]` async auth/role guard migration.
- Expected behavior: unauthenticated change list remains 401; invalid payloads remain 400; Engineer can create ECR/ECN but cannot decide; Manager can create ECO and approve; duplicate decisions remain 409; engineers remain blocked from other engineers' changes with 403.
- Validation evidence: `npm.cmd run qc:access-control-async-repository` passed 54/54, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `CHANGE-001` through `CHANGE-017` covered auth, validation, ECR/ECO/ECN create/list behavior, role denial, manager approval, decision metadata, duplicate-decision conflict, and engineer scope isolation.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3Y QA Addendum

- Scope validated: `/api/submissions/[id]/phase-gates` and `/api/submissions/[id]/phase-gates/[checkId]` async auth/role guard migration.
- Expected behavior: unauthenticated phase gate list remains 401; Engineer cannot initialize or decide phase gates; Manager can initialize and decide; open required phase gates still block approval; completed required gates allow release; duplicate phase decisions remain 409.
- Validation evidence: `npm.cmd run qc:access-control-async-repository` passed 55/55, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `PHASE-001` through `PHASE-013` covered auth, role denial, initialization, summary counts, approval blocking, decisions, ready summary, duplicate-decision conflict, and release flow.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3Z QA Addendum

- Scope validated: `/api/submissions/[id]/approval-matrix` and `/api/submissions/[id]/approval-matrix/[requirementId]` async auth/role guard migration.
- Expected behavior: unauthenticated approval matrix list remains 401; Engineer cannot initialize the matrix; Manager/Admin can initialize and decide required roles; the submission remains Pending until required roles are satisfied; Admin requirement can be waived; waived matrix can be released by Manager-only approval.
- Validation evidence: `npm.cmd run qc:access-control-async-repository` passed 56/56, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning after a clean rerun, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `MATRIX-001` through `MATRIX-015` covered auth, role denial, matrix initialization, summary counts, Manager/Admin approvals, release progression, Admin waiver, and manager-only release after waiver.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3AA QA Addendum

- Scope validated: `/api/submissions/preflight-lock` async role guard migration.
- Expected behavior: unauthenticated preflight remains 401; Engineer/Admin access remains allowed; preflight still reports whether a drawing/part identifier has an active lock; owner requests still report `lockedByCurrentUser=true`; other engineer requests still expose the active lock and report `lockedByCurrentUser=false`.
- Validation evidence: `npm.cmd run qc:access-control-async-repository` passed 57/57, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `CHECKOUT-010` through `CHECKOUT-016` covered unauthenticated preflight blocking, owner preflight, active lock exposure, non-owner state, and lock owner field behavior.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3AB QA Addendum

- Scope validated: `/api/submissions/[id]/checkout` async role guard migration.
- Expected behavior: unauthenticated checkout remains 401; Manager remains 403; Engineer/Admin access remains allowed; Engineer can acquire and reuse own lock; competing checkout still returns 409 with owner lock; Engineer can release own lock.
- Validation evidence: `npm.cmd run qc:access-control-async-repository` passed 58/58, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `CHECKOUT-001` through `CHECKOUT-009` covered unauthenticated checkout blocking, role denial, acquire/reuse flow, competing conflict owner exposure, and release behavior.
- Still required before completion: live Supabase staging/prod tests, Postgres-mode API regression against a configured target, advisor/RLS review, production smoke, and rollback drill.

## 2026-06-08 Phase 3AC QA Addendum

- Scope validated: approve/reject async role guard migration and file preview route stabilization.
- Required regression coverage: Manager/Admin approve/reject access, Engineer approve denial, Pending/Released/Rejected status gates, two-reviewer approval flow, release package creation, phase gate blocking, approval matrix blocking, PDF preview `200`, `application/pdf`, and inline disposition.
- Validation result: `qc:access-control-async-repository` 59/59, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build`, and redirected `qc:api` 391/391 passed.
- QA residual risk: live Supabase Postgres-mode API regression and Supabase advisor/RLS validation remain open because no configured staging/prod target is present in this workspace.

## 2026-06-09 Phase 3AD QA Addendum

- Scope validated: release package download, read-only share management, and supplier response management async guard migration.
- Required regression coverage: unauthenticated package/share blocking, package ZIP download, Engineer share/supplier denial, Manager share create/list/revoke, public share metadata/package behavior, supplier response list/close, and duplicate close conflict.
- Validation result: `qc:access-control-async-repository` 60/60, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build`, and redirected `qc:api` 391/391 passed.
- QA residual risk: live Supabase Postgres-mode API regression and Supabase advisor/RLS validation remain open because no configured staging/prod target is present in this workspace.

## 2026-06-09 Phase 3AE QA Addendum

- Scope validated: AI summary and AI risk route async auth guard migration.
- Required regression coverage: unauthenticated 401, Engineer own-submission 200, Manager 200, cross-engineer 403, summary sections and sources, risk codes and traceable sources, duplicate Released filename risk detection, and Pending status preservation.
- Validation result: `qc:access-control-async-repository` 61/61, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build`, and redirected `qc:api` 391/391 passed.
- QA residual risk: live Supabase Postgres-mode API regression and Supabase advisor/RLS validation remain open because no configured staging/prod target is present in this workspace.

## 2026-06-09 Phase 3AF QA Addendum

- Scope validated: submission list, create, and detail route async auth/role guard migration.
- Required regression coverage: unauthenticated list remains 401, Engineer/Admin create remains allowed, input/file validation still returns 400, duplicate drawing/revision still returns 409, Engineer list remains scoped to own submissions, Engineer cross-submission detail remains 403, and Manager detail remains 200.
- Validation result: `qc:access-control-async-repository` 62/62, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and redirected `qc:api` 391/391 passed.
- QA residual risk: live Supabase Postgres-mode API regression and Supabase advisor/RLS validation remain open because no configured staging/prod target is present in this workspace.

## 2026-06-09 Phase 3AG QA Addendum

- Scope validated: submission BOM materialize/read/diff/export route async auth guard migration.
- Required regression coverage: unauthenticated BOM read/diff/export remains 401, Engineer can materialize/read/export/diff own BOM, Manager can read/export/diff, cross-engineer BOM read/export/diff remains 403, missing BOM export remains 404, no-previous diff remains 404, CSV keeps UTF-8 BOM and content type, and XLS keeps Excel content type/workbook content.
- Validation result: `qc:access-control-async-repository` 63/63, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and redirected `qc:api` 391/391 passed.
- Runtime evidence: `BOM-001` through `BOM-013`, `BOMEXPORT-001` through `BOMEXPORT-010`, and `BOMDIFF-001` through `BOMDIFF-013` passed.
- QA residual risk: live Supabase Postgres-mode API regression and Supabase advisor/RLS validation remain open because no configured staging/prod target is present in this workspace.

## 2026-06-09 Phase 3AI QA Addendum

- Scope validated: BOM workbench, draft, review, and release export route async guard migration.
- Required regression coverage: unauthenticated blocking, draft creation from assembly, SolidWorks XLS import, draft detail/save/active/diff/submit-review, pending review list, Manager/Admin approve/reject, release-gate blocking, released snapshot CSV/XLSX export, Manufacturing/Procurement released-only export access, and draft denial for released-only roles.
- Validation result: `qc:access-control-async-repository` 64/64, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and redirected `qc:api` 391/391 passed.
- Runtime evidence: `qc:bom-workbench-foundation` 27/27, `qc:bom-workbench-tree-rules` 22/22, `qc:bom-workbench-release-gate-resubmit` 43/43, `qc:bom-workbench-solidworks-xls-import` 34/34, `qc:bom-workbench-release-export` 21/21, `qc:bom-workbench-review-release` 25/25, and `qc:bom-workbench-released-only-permission` 31/31 passed against a temporary local server.
- QA residual risk: live Supabase Postgres-mode API regression and Supabase advisor/RLS validation remain open because no configured staging/prod target is present in this workspace.

## 2026-06-09 Phase 3AJ QA Addendum

- Scope validated: submission auxiliary route async guards and numbering approval batch detail async permission guard migration.
- Required regression coverage: unauthenticated submission auxiliary reads remain 401, Engineer own access remains 200, cross-engineer submission auxiliary access remains 403, Manager access remains allowed where applicable, sandbox create/merge/release flow remains intact, PDF markup validation and resolve flow remains intact, reuse/duplicate geometry scoping remains intact, and approval batch detail/decision/resubmit permission checks remain intact.
- Validation result: `qc:access-control-async-repository` 66/66, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `qc:pdm-numbering-core` 238/238, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, `build`, and redirected `qc:api` 391/391 passed.
- Runtime evidence: `qc:api` covered `SANDBOX-001` through `SANDBOX-019`, `MARKUP-001` through `MARKUP-012`, `REUSE-001` through `REUSE-010`, duplicate geometry behavior, and full API auth regression after the async guard migration.
- QA residual risk: direct sync auth is cleared from API route files, but many numbering API routes still use sync numbering permission guard helpers; live Supabase Postgres-mode API regression and Supabase advisor/RLS validation remain open because no configured staging/prod target is present in this workspace.

## 2026-06-09 Phase 3AK QA Addendum

- Scope validated: remaining numbering API route permission guards and numbering-adjacent parts API route permission guards migrated to async helpers.
- Required regression coverage: numbering page/action guards still deny unauthenticated or unauthorized users, approval batch/detail/admin matrix/approval decision behavior remains intact, parts detail and attachment routes remain protected by numbering search/attachment permissions, and no API route contains sync `@/lib/auth` or sync numbering permission guard calls.
- Validation result: full API sync guard search returned no matches; `qc:access-control-async-repository` 68/68, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `qc:pdm-numbering-core` 238/238, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, `build`, and redirected `qc:api` 391/391 passed.
- Runtime evidence: `qc:pdm-numbering-core` passed the numbering route/static/domain suite after the guard migration, and `qc:api` passed the full API auth regression suite against a temporary local server.
- QA residual risk: API route guard migration is now locally complete, but sync domain repositories, real Supabase Postgres-mode API regression, Supabase advisor/RLS validation, production cutover, and rollback drill remain open because no configured staging/prod target is present in this workspace.

## 2026-06-09 QA Executable Document Addendum

- Added validation entry point: `.ai-doc/reports/pm/supabase-db-migration-executable-development-plan-2026-06-09.md`.
- QA scope confirmed: validate behavior parity while the runtime moves from sync SQLite helpers toward async/provider-neutral repositories.
- Current QA baseline: local SQLite-mode route guard migration is green through Phase 3AK; API route sync auth and sync numbering permission guard usage is locally cleared.
- Remaining QA gates: domain repository conversion parity, Postgres-mode API regression against `AI_PDM_STAGING`, Supabase RLS/advisor review, production smoke, and rollback drill.
- Phase 3AL QA focus: item revision history and where-used must preserve unauthenticated blocking, manager visibility, engineer scoping, empty where-used results, ordering, quantity fields, and response shape.

## 2026-06-09 Phase 3AL QA Addendum

- Scope validated: `/api/items/[partNumber]/revisions` and `/api/items/[partNumber]/where-used` now read through async/provider-neutral repository helpers.
- Required regression coverage: unauthenticated access remains blocked, manager revision/where-used visibility remains intact, engineer scoping remains intact, unused parts return empty where-used lists, revision history ordering remains newest first, where-used remains case-insensitive for child part numbers, quantity/source filename fields remain present, and response shapes remain unchanged.
- Validation result: `qc:access-control-async-repository` 75/75, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, `build`, and `qc:api` 391/391 passed.
- Runtime evidence: `qc:api` continued to pass `HIST-001` through `HIST-006` and `WHEREUSED-001` through `WHEREUSED-011` after the repository conversion.
- QA residual risk: real Supabase Postgres-mode API regression and Supabase advisor/RLS validation remain open because no configured staging/prod target is present in this workspace.

## 2026-06-09 Phase 3AM QA Addendum

- Scope validated: `/api/submissions` GET dashboard metrics now read through async/provider-neutral `getDashboardMetricsAsync`.
- Route contract preserved: response still contains `submissions`, `pagination`, and `metrics`; metric keys remain `pending`, `released`, `rejected`, and `failed`.
- Repository checks added: static QC prevents sync DB imports in the migrated dashboard metrics repository and verifies runtime helper use.
- SQL behavior checks added: in-memory SQLite validates all-status counts and submittedBy-scoped counts.
- Validation passed: `qc:access-control-async-repository` 81/81, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- QA note: full API regression was intentionally skipped in this slice because it repopulates local QC fixture data after the user-requested clean DB reset.
- QA residual risk: submission list/search/write paths and broader domain repositories still need async/provider-neutral conversion and live Supabase Postgres-mode evidence.

## 2026-06-09 Phase 3AN QA Addendum

- Scope validated: `/api/submissions` GET submission list now reads through async/provider-neutral `listSubmissionsAsync`.
- Route contract preserved: response still contains `submissions`, `pagination`, and `metrics`; list rows preserve file counts, file roles, package flag, active-lock flag, and pagination behavior.
- Repository checks added: static QC prevents sync DB imports in the migrated submission list repository and verifies runtime helper use.
- SQL behavior checks added: in-memory SQLite validates newest-first ordering, file count/roles, release-package flag, active-lock flag, status filter, submittedBy filter, limit, and offset.
- Validation passed: `qc:access-control-async-repository` 87/87, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- QA note: full API regression was intentionally skipped in this slice because it repopulates local QC fixture data after the user-requested clean DB reset.
- QA residual risk: `searchSubmissions`, submission detail/create/write/upload paths, broader domain repositories, and live Supabase Postgres-mode evidence remain open.

## 2026-06-09 Phase 3AO QA Addendum

- Scope validated: `/api/search` now reads through async/provider-neutral `searchSubmissionsAsync`.
- Route contract preserved: unauthenticated access still goes through async auth guard; short query without filters still returns `{ submissions: [] }`; filtered or two-character query responses still return `{ submissions }`.
- Repository checks added: static QC prevents sync DB imports in the search route and verifies SQLite/Postgres search SQL constants plus async runtime helper use.
- SQL behavior checks added: in-memory SQLite validates file query search, status/submittedBy/finder filters, child part filter, and outdated BOM filter.
- Validation passed: `qc:access-control-async-repository` 94/94, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- QA note: full API regression was intentionally skipped in this slice because it repopulates local QC fixture data after the user-requested clean DB reset.
- QA residual risk: submission detail/create/write/upload paths, broader domain repositories, and live Supabase Postgres-mode evidence remain open.

## 2026-06-09 Phase 3AP QA Addendum

- Scope validated: `/api/submissions/[id]` GET now reads through async/provider-neutral `getSubmissionAsync`.
- Route contract preserved: unauthenticated access still goes through async auth guard; unauthorized users still fail through `canReadSubmission`; missing submissions still return 404; successful responses still return `{ submission }`.
- Detail payload preserved: submission files, file references, approvals, audit logs, active lock, release package, and BOM detail are loaded by the async repository path.
- Repository checks added: static QC verifies provider-neutral detail SQL constants, runtime helper use, route wiring, and absence of direct sync `@/lib/db` detail import in the migrated route.
- SQL behavior checks added: in-memory SQLite validates full detail payload, files, active lock, release package, references, approvals, audit, BOM lines, and missing submission handling.
- Validation passed: `qc:access-control-async-repository` 101/101, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- QA note: full API regression was intentionally skipped in this slice because it repopulates local QC fixture data after the user-requested clean DB reset; business tables remained at 0 after validation.
- QA residual risk: submission create/write/upload paths, file/download routes, broader domain repositories, and live Supabase Postgres-mode evidence remain open.

## 2026-06-09 Phase 3AQ QA Addendum

- Scope validated: submission file metadata lookup/update now runs through async/provider-neutral helpers.
- Route contract preserved: file download/preview still uses authenticated access, submission authorization, repository-root containment, PDF-only inline preview, and the same binary response headers.
- Retry upload contract preserved: Manager/Admin role gate, pending folder setting lookup, Google Drive retry loop, status update, audit log, and failure accounting remain intact.
- File validation preserved: PDF markup, discussion, and issue creation still reject missing or cross-submission file IDs; PDF markup still requires a PDF file.
- Repository checks added: static QC verifies async file repository SQL constants, runtime helper use, file-response use of async submission/file metadata helpers, and absence of sync file helper calls in the migrated read-adjacent routes.
- SQL behavior checks added: in-memory SQLite validates file lookup, missing file behavior, upload queue ordering, status-only update, and status-with-Google-Drive-id update.
- Validation passed: `qc:access-control-async-repository` 108/108, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- QA note: full API regression was intentionally skipped in this slice because it repopulates local QC fixture data after the user-requested clean DB reset; business and collaboration tables remained at 0 after validation.
- QA residual risk: submission create/write/upload, collaboration repositories, broader domain repositories, and live Supabase Postgres-mode evidence remain open.

## 2026-06-09 Phase 3AR QA Addendum

- Scope validated: discussion comments, review issues, and PDF markups now list/create/resolve through async/provider-neutral collaboration helpers.
- Route contract preserved: async auth guard, `canReadSubmission`, missing submission/resource handling, file-id validation, PDF-only markup validation, issue assignee validation, and response envelopes remain intact.
- Audit behavior preserved: create and resolve operations write collaboration audit actions through the async audit repository boundary.
- Repository checks added: static QC verifies collaboration SQL constants, async runtime helper use, absence of direct sync DB imports in migrated collaboration routes, and no SQLite-only `datetime(...)` / `rowid` ordering in the repository.
- SQL behavior checks added: in-memory SQLite validates discussion create/list/resolve, review issue create/list/resolve, PDF markup create/list/resolve, joined filenames/user display names, and collaboration audit action insertion.
- Validation passed: `qc:access-control-async-repository` 116/116, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- QA note: full API regression was intentionally skipped in this slice because it repopulates local QC fixture data after the user-requested clean DB reset; business, BOM, and collaboration runtime tables remained at 0 after validation, and no local dev server was listening on 3000/3001/3101.
- QA residual risk: submission create/write/upload, change request, phase gate, approval matrix, BOM/numbering/release/attachment/AI repositories, and live Supabase Postgres-mode evidence remain open.

## 2026-06-09 Phase 3AS QA Addendum

- Scope validated: change request list/create/decide now runs through async/provider-neutral collaboration helpers.
- Route contract preserved: async auth/role guards, `canReadSubmission`, missing submission/change handling, ECR/ECO/ECN validation, title/reason/impact validation, approve/reject/close action mapping, and response envelopes remain intact.
- Audit behavior preserved: create and decide operations write `ChangeRequestCreated` and `ChangeRequestDecided` through the async audit repository boundary.
- Repository checks added: static QC verifies change request SQL constants, async runtime helper use, absence of direct sync DB imports in migrated change routes, and no SQLite-only `datetime(...)` / `rowid` ordering in the repository.
- SQL behavior checks added: in-memory SQLite validates change request create/list, requested/decided user display names, decision update, decision comment, and audit action insertion.
- Validation passed: `qc:access-control-async-repository` 123/123, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- QA note: full API regression was intentionally skipped in this slice because it repopulates local QC fixture data after the user-requested clean DB reset; business, BOM, and collaboration runtime tables remained at 0 after validation, and no local dev server was listening on 3000/3001/3101.
- QA residual risk: submission create/write/upload, phase gate, approval matrix, BOM/numbering/release/attachment/AI repositories, and live Supabase Postgres-mode evidence remain open.

## 2026-06-09 Phase 3AT QA Addendum

- Scope validated: phase gate list/initialize/decide now runs through async/provider-neutral collaboration helpers.
- Route contract preserved: async auth/role guards, `canReadSubmission`, missing submission/check handling, initialization idempotence, summary payload, created status code, `complete`/`waive` validation, comment length guard, and response envelopes remain intact.
- Audit behavior preserved: initialize and decide operations write `PhaseGateInitialized` and `PhaseGateDecided` through the async audit repository boundary.
- Repository checks added: static QC verifies phase gate SQL constants, async runtime helper use, absence of direct sync DB imports in migrated phase gate routes, and no SQLite-only `datetime(...)` / `rowid` ordering in the repository.
- SQL behavior checks added: in-memory SQLite validates phase gate list ordering, creator/decider display names, decision update, decision comment, and audit action insertion.
- Validation passed: `qc:access-control-async-repository` 130/130, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- QA note: full `qc:api` was intentionally skipped in this slice because it repopulates local QC fixture data after the user-requested clean DB reset; business, BOM, and collaboration runtime tables remained at 0 after validation, and no local dev server was listening on 3000/3001/3101.
- QA residual risk: submission create/write/upload, approval matrix, BOM/numbering/release/attachment/AI repositories, and live Supabase Postgres-mode evidence remain open.

## 2026-06-09 Phase 3AU QA Addendum

- Scope validated: approval matrix list/initialize/refresh/waive now runs through async/provider-neutral approval helpers.
- Route contract preserved: async auth/role guards, `canReadSubmission`, missing submission/requirement handling, initialization idempotence, summary payload, created status code, custom requirement validation, `waive` action validation, comment length guard, and response envelopes remain intact.
- Refresh behavior preserved: approved count from `approval_steps` automatically satisfies an open requirement when it reaches `min_count`.
- Audit behavior preserved: initialize and waive operations write `ApprovalMatrixInitialized` and `ApprovalMatrixWaived` through the async audit repository boundary.
- Repository checks added: static QC verifies approval matrix SQL constants, async runtime helper use, absence of direct sync DB imports in migrated approval matrix routes, and no SQLite-only `datetime(...)` / `rowid` ordering in the repository.
- SQL behavior checks added: in-memory SQLite validates list ordering, approved count aggregation, automatic satisfy refresh, waive update, decision comment, decider display name, and audit action insertion.
- Validation passed: `qc:access-control-async-repository` 137/137, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- QA note: full `qc:api` was intentionally skipped in this slice because it repopulates local QC fixture data after the user-requested clean DB reset; business, BOM, and collaboration runtime tables remained at 0 after validation, and no local dev server was listening on 3000/3001/3101.
- QA residual risk: submission create/write/upload, approve/reject release decision flows, BOM/numbering/release/attachment/AI repositories, and live Supabase Postgres-mode evidence remain open.

## 2026-06-09 Phase 3AV QA Addendum

- Scope validated: reject release decision flow now runs through async/provider-neutral approval and submission status helpers.
- Route contract preserved: async Manager/Admin role guard, missing submission 404, Pending-only rejection, duplicate reviewer decision conflict, reject reason/comment fallback, and `{ submissionId, status: "Rejected" }` response remain intact.
- Audit behavior preserved: reject operation writes a `Reject` audit action through the async audit repository boundary.
- Repository checks added: static QC verifies approval decision SQL constants, async runtime helper use, reject status SQL/helper use, absence of direct sync DB imports in the migrated reject route, and no SQLite-only `datetime(...)` / `rowid` in the migrated decision/status path.
- SQL behavior checks added: in-memory SQLite validates approval decision insert, reviewer duplicate lookup, approval summary aggregation, reject status update, reject reason, released error clearing, rejected timestamp, and reject audit insertion.
- Validation passed: `qc:access-control-async-repository` 144/144, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- QA note: full `qc:api` was intentionally skipped in this slice because it repopulates local QC fixture data after the user-requested clean DB reset; business, BOM, approval, and collaboration runtime tables remained at 0 after validation, and no local dev server was listening on 3000/3001/3101.
- QA residual risk: submission create/write/upload, approve release decision flow, BOM/numbering/release/attachment/AI repositories, and live Supabase Postgres-mode evidence remain open.

## 2026-06-09 Phase 3AW QA Addendum

- Scope validated: approve release decision flow now runs through async/provider-neutral approval, status, release record, release package, collaboration blocker, and audit helpers.
- Route contract preserved: async Manager/Admin role guard, missing submission 404, Pending-only approval, active sandbox block, duplicate reviewer conflict, phase gate block, approval matrix block, approval count threshold, release failure recovery, release package creation, `ReleaseSucceeded` audit, and `{ submissionId, status: "Released", releasePackage }` response remain intact.
- Release lifecycle preserved: current submission moves through Releasing to Released, item current revision is updated, previous released submissions for the item are marked Obsolete, and obsolete audit rows are inserted.
- Repository checks added: static QC verifies async release/status SQL constants, runtime helper use, async service use, absence of direct sync DB imports in the migrated approve route, and no SQLite-only `datetime(...)` / `rowid` in the migrated decision/status/release path.
- SQL behavior checks added: in-memory SQLite validates active sandbox lookup, released filename conflict lookup, releasing update, release failure update, release package upsert, released lifecycle update, previous release obsolete update, and obsolete audit insertion.
- Validation passed: `qc:access-control-async-repository` 153/153, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- QA note: full `qc:api` was intentionally skipped in this slice because it repopulates local QC fixture data after the user-requested clean DB reset; business, BOM, approval, collaboration, release, and sandbox runtime tables remained at 0 after validation, and no local dev server was listening on 3000/3001/3101.
- QA residual risk: submission create/write/upload, broader BOM/numbering/release/share/supplier/sandbox/attachment/AI repositories, and live Supabase Postgres-mode evidence remain open.

## 2026-06-09 Phase 3AX QA Addendum

- Scope validated: `/api/submissions` POST create/write now runs through async/provider-neutral submission write, settings, and file status helpers.
- Route contract preserved: async auth guard, duplicate drawing/revision conflict, required form/file validation, metadata JSON validation, response envelope, Google Drive pending-folder lookup, and background upload status behavior remain intact.
- Write behavior preserved: item upsert, submission insert, submission file insert, file reference insert, `Submit` audit action, BOM header/line materialization from assembly component references, and `BomDraftMaterialized` audit action.
- Repository checks added: static QC verifies provider-neutral create SQL constants, async runtime helper use, async route wiring, absence of direct sync DB imports in `/api/submissions`, and no SQLite-only `datetime(...)` / `rowid` in the migrated write path.
- SQL behavior checks added: in-memory SQLite validates revision duplicate lookup, item upsert conflict behavior, submission/file/reference/audit insertion, and BOM materialization from assembly references.
- Validation passed: `qc:access-control-async-repository` 161/161, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- QA note: full `qc:api` was intentionally skipped in this slice because it repopulates local QC fixture data after the user-requested clean DB reset; business, BOM, approval, collaboration, release, sandbox, and audit runtime tables remained at 0 after validation, and no local dev server was listening on 3000/3001/3101.
- QA residual risk: BOM workbench/domain repositories, numbering, release package/share/supplier/sandbox, attachment/AI repositories, and live Supabase Postgres-mode evidence remain open.

## 2026-06-09 Phase 3AY QA Addendum

- Scope validated: `/api/bom/workbench` GET summary read now runs through async/provider-neutral BOM workbench and submission helpers.
- Route contract preserved: async auth guard, missing `submissionId` 400, missing submission 404, `canReadBomDraft` authorization, and `{ workbench }` response envelope remain intact.
- Read behavior preserved: parent submission summary, draft summary ordering, active draft selection for active `Draft` / `Rejected` drafts, draft detail lookup, and BOM line lookup with joined `part_name`.
- Repository checks added: static QC verifies provider-neutral BOM workbench SQL constants, async runtime helper use, async route wiring, absence of direct sync DB imports in `/api/bom/workbench`, and no SQLite-only `datetime(...)` / `rowid` in the migrated read path.
- SQL behavior checks added: in-memory SQLite validates parent/draft summary lookup, active draft selection, active draft line ordering, joined part name, numeric quantity handling, and missing workbench/draft behavior.
- Validation passed: `qc:access-control-async-repository` 169/169, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- QA note: full `qc:api` was intentionally skipped in this slice because it repopulates local QC fixture data after the user-requested clean DB reset; business, BOM, approval, collaboration, release, sandbox, and audit runtime tables remained at 0 after validation, and no local dev server was listening on 3000/3001/3101.
- QA residual risk: BOM draft create/save/active/diff/review/release/export paths, numbering, release package/share/supplier/sandbox, attachment/AI repositories, and live Supabase Postgres-mode evidence remain open.
