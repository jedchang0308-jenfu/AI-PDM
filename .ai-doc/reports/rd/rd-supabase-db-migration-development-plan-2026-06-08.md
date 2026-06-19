# RD Supabase DB Migration Development Plan - 2026-06-08

關聯任務：`DEV-SUPABASE-DB-001`  
關聯 SPEC：`.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md`  
關聯 ADR：`.ai-doc/decisions/ADR-SUPABASE-DB-001-runtime-provider-and-target.md`

## Current Baseline

- 本機 `data` 已完成 reset，重新初始化後只保留乾淨 runtime。
- 舊 `submission_files`、`release_packages`、`file_assets` 不列入遷移。
- `src/lib/db-provider.ts` 目前仍只有 `sqlite` provider。
- Postgres schema 與 RLS plan 已存在於 `db/postgres/001_initial_schema.sql` 與 `db/postgres/002_supabase_rls_plan.sql`。
- `DEV-IND-007` 已提供 shadow migration、compare 與 target safety gate。
- Supabase CLI 尚未安裝，因此目前只有本機 deterministic migration mirror，尚未形成正式 Supabase CLI migration history。

## RD Objective

建立可正式切換的 SQLite / Supabase Postgres dual runtime 架構。完成後，AI_PDM 可以在 staging 與 production 使用 Supabase Postgres，SQLite 作為 fallback，且所有 migration、RLS、target、secret 與 smoke evidence 都可追蹤。

## Phase 1: Supabase Migration Structure

已完成：

- 建立 `supabase/migrations`。
- 新增 `npm.cmd run supabase:migrations:sync`，由 `db/postgres/*.sql` 同步 deterministic mirror。
- 新增 `npm.cmd run qc:supabase-runtime-migrations`，檢查 migration mirror、source hash、RLS baseline、env 文件與 dev_task evidence。
- 補 `.env.example`：
  - `PDM_POSTGRES_URL`
  - `PDM_POSTGRES_ADMIN_URL`
  - `PDM_POSTGRES_POOLER_MODE`
  - `PDM_SUPABASE_TARGET_NAME`
- 強化 target identity guard，阻擋 `ProJED` / `ProJED_TEST` project ref 或 target name。

待完成：

- 安裝或導入 Supabase CLI 後，建立正式 CLI migration history。
- 在 live target apply 前跑 target guard。

## Phase 2: DB Provider Abstraction

RD 工作項目：

- 將 `DatabaseProviderKind` 擴充為 `"sqlite" | "postgres"`。
- 新增 async DB interface：
  - `query`
  - `queryOne`
  - `execute`
  - `transaction`
- 建立 SQLite adapter，包裝既有 `better-sqlite3`。
- 建立 Postgres adapter，連線 Supabase Postgres。
- 依 `PDM_POSTGRES_POOLER_MODE` 設計 pooler 相容行為。
- 新增 provider contract QC，先驗證 repository-neutral behavior。

2026-06-08 Phase 2A 已完成：

- 新增 `src/lib/db-async-provider.ts`。
- 定義 `AsyncDatabaseClient` 與 `"sqlite" | "postgres"` async provider kind。
- 建立 `SQLiteAsyncDatabaseClient`，支援 `query`、`queryOne`、`execute`、`transaction`。
- SQLite adapter 不支援 awaited transaction callback，會以 `SQLITE_ASYNC_TRANSACTION_CALLBACK_UNSUPPORTED` fail closed，避免同步 SQLite transaction 被 async callback 破壞。
- 擴充 `qc:db-provider-contract`，新增 `qc:db-provider-async-contract` alias。

2026-06-08 Phase 2B 已完成：

- 新增 `pg` 與 `@types/pg`。
- 建立 `PostgresAsyncDatabaseClient` 最小 server-side adapter。
- 使用 `Pool` 與 unnamed `query(text, values)`，避免 Supabase transaction pooler 不支援 named prepared statements 的問題。
- 支援 array params 與 named params normalization，將 `:name` / `@name` 轉為 `$1`、`$2`。
- 支援 `BEGIN` / `COMMIT` / `ROLLBACK` transaction boundary。
- nested transaction 以 `POSTGRES_NESTED_TRANSACTION_UNSUPPORTED` fail closed。
- 缺少 connection string 時以 `POSTGRES_CONNECTION_STRING_REQUIRED` fail closed。
- 新增 `qc:db-provider-postgres`；未設定 `PDM_POSTGRES_URL` 時 live probe 明確 skipped，不宣稱 staging/live 驗證。

## Phase 3: Repository Migration

建議遷移順序：

1. auth / users / roles / role permissions / settings
2. submissions / submission_files / audit_logs
3. numbering / approval / task_items / notifications
4. BOM workbench
5. release packages / share / file_assets metadata

每一批 repository 必須處理：

- SQLite-only SQL，例如 `datetime('now')`、`INSERT OR IGNORE`、`PRAGMA`。
- `better-sqlite3` sync transaction 轉 async transaction。
- JSON text 與 Postgres JSONB 差異。
- Conflict handling 差異。
- API response contract 不可破壞。
- Audit append-only 語意不可退化。

2026-06-08 Phase 3A pilot 已完成：

- 新增 `src/lib/repositories/system-settings-async-repository.ts`。
- 以 `AsyncDatabaseClient` 實作 `getSetting`、`setSetting`、`getAllSettings`。
- SQL 使用 named params 與 `ON CONFLICT(key) DO UPDATE`，同時可被 SQLite adapter 與 Postgres adapter normalization 使用。
- Repository 不依賴 `getDb` 或 `better-sqlite3`。
- 本輪未把 `/api/settings` 切到 async runtime；先保留既有同步路徑，避免全 repository migration 前擴大 blast radius。
- 新增 `qc:system-settings-async-repository`，抽取 repository SQL 常數並在 in-memory SQLite 驗證 insert、update、missing read、get-all 語意。

2026-06-08 Phase 3B pilot 已完成：

- 新增 `src/lib/repositories/access-control-async-repository.ts`。
- 以 `AsyncDatabaseClient` 抽出 roles、users、role permissions 的 provider-neutral access-control repository。
- SQL 使用 named params、JOIN 與 `ON CONFLICT(role_id, permission_kind, permission_code) DO UPDATE`。
- `setRolePermission` 先查 role，再 upsert permission；role 不存在時以 `ACCESS_CONTROL_ROLE_NOT_FOUND` fail closed。
- Repository 不依賴 `getDb` 或 `better-sqlite3`，且本輪不切現有 numbering admin API runtime。
- 新增 `qc:access-control-async-repository`，抽取 SQL 常數並在 in-memory SQLite 驗證 role list、user list、role lookup、permission upsert、permission list deterministic order。

2026-06-08 Phase 3C runtime read path 已完成：

- 新增 `src/lib/numbering-permission-async.ts`，先以 `SQLiteAsyncDatabaseClient(getDb())` bridge 現有 SQLite runtime 與 `AsyncAccessControlRepository`。
- `AsyncAccessControlRepository` 新增 `checkPermission`，覆蓋 base roles、assigned roles、active role priority、delegation scope、enabled role 與 explicit permission lookup。
- `/api/numbering/permissions` 改用 `checkNumberingPermissionAsync`，輸出 payload 維持 `{ generatedAt, pages, actions }` 不變。
- `requireNumberingPermission` 與 admin matrix 寫入路徑本輪仍保留同步 repository，避免一次性翻動所有 guard 與 audit 寫入。
- 修正 `qc:pdm-numbering-permission-guard-ui` selector，使其只驗證 sidebar 內的 `/numbering/request` link，不再被首頁 CTA 誤導。

2026-06-08 Phase 3D async guard route migration 已完成：

- `src/lib/numbering-permission-guard.ts` 新增 `requireNumberingPermissionAsync`、`requireNumberingPageAsync`、`requireNumberingActionAsync` 與 `canUserUseNumberingActionAsync`。
- 既有同步 guard 保留，避免一次性翻動所有 mutating route、audit 寫入與 admin matrix。
- `/api/numbering/search`、`/api/numbering/tasks`、`/api/numbering/notifications`、`/api/parts`、`/api/numbering/drawings` 改用 `await requireNumberingPageAsync(...)`，成為第一批低風險 read-only route guard 遷移。
- `qc:access-control-async-repository` 擴充檢查 async guard helper、5 個 read-only route 接線、permission route 接線與 access-control semantic SQL。

2026-06-08 Phase 3E async auth/session user lookup pilot 已完成：

- 新增 `src/lib/repositories/user-async-repository.ts`，以 `AsyncDatabaseClient` 實作 `getUserById`、`getUserByEmail`、`getUserByEmailWithPassword`。
- 新增 `src/lib/auth-async.ts`，沿用既有 `pdm_session` cookie / bearer token 格式，先抽出 user id，再透過 `AsyncUserRepository` 讀取 session user。
- `requireNumberingPermissionAsync` 改用 `requireAuthAsync`，使已遷移的 async permission guard 不再透過同步 `requireAuth` 執行 user lookup。
- 同步 `requireAuth`、同步 guard、login/password 寫入與一般 API auth 本輪保留不動。

2026-06-08 Phase 3F async login/token user lookup pilot 已完成：

- `src/lib/auth-async.ts` 新增 `getUserByEmailWithPasswordAsync`。
- `/api/auth/login` 與 `/api/auth/token` 改用 async user repository 讀取 password hash。
- `ensureDemoUser`、`createAuditLog`、password verify、session cookie 與 bearer token 產生邏輯維持原樣。
- `qc:managed-auth` 擴充 bearer token flow，驗證 token route 在 managed mode 下仍可登入並讀取 settings。

2026-06-08 Phase 3G async auth audit write pilot 已完成：

- 新增 `src/lib/repositories/audit-async-repository.ts`，以 `AsyncDatabaseClient` 實作 append-only audit insert。
- 新增 `src/lib/audit-async.ts`，先 bridge 現有 SQLite runtime 與 `AsyncAuditRepository`。
- `/api/auth/login` 的 demo shortcut / password login 與 `/api/auth/token` 的 Login audit 改用 `await createAuditLogAsync(...)`。
- `qc:managed-auth` 擴充 audit row 驗證，確認 managed login/token 會寫入 `audit_logs`，且 token audit 保留 `SolidWorks Add-in` client marker。

## Phase 4: Staging Supabase Validation

RD 工作項目：

- 取得使用者對 Supabase organization、region、cost 的確認。
- 建立 `AI_PDM_STAGING`，不可使用 `ProJED` / `ProJED_TEST`。
- 執行 pre-migration target guard。
- 套用 migrations 與 controlled seed。
- 執行：

```powershell
npm.cmd run db:postgres:compare -- --require-postgres
npm.cmd run qc:postgres-shadow
npm.cmd run qc:db-provider-postgres
npm.cmd run qc:api:postgres
npm.cmd run build
```

- 檢查 Supabase security / performance advisors。

## Phase 5: Production Cutover

RD 工作項目：

- 建立 `AI_PDM_PROD`。
- 重跑 staging migration、RLS、advisor、API regression。
- 設定 production env：

```text
PDM_DB_PROVIDER=postgres
PDM_POSTGRES_URL=<server runtime url>
PDM_POSTGRES_ADMIN_URL=<migration/maintenance url>
PDM_SUPABASE_TARGET_NAME=AI_PDM_PROD
```

- 執行 production smoke：
  - login
  - create numbering draft
  - upload metadata record
  - approve / reject
  - BOM draft / list / release path
  - audit log write
- 保留 SQLite rollback snapshot 與 env rollback plan。

## File Impact Forecast

預期後續會碰到：

- `src/lib/db-provider.ts`
- `src/lib/db.ts`
- `src/lib/*repository*.ts`
- `scripts/init-db.mjs`
- `scripts/generate-postgres-migration.mjs`
- `scripts/compare-sqlite-postgres-shadow.mjs`
- `scripts/qc-db-provider-contract-test.mjs`
- `package.json`
- `.env.example`
- `db/postgres/README.md`
- `supabase/migrations/*`

## Open Engineering Decisions

- Postgres client package：`postgres` 或 `pg`。
- Migration apply path：Supabase CLI、Supabase MCP migration 或 direct psql。
- Backup / restore drill：production cutover 前是否要求完整 restore drill。
- API regression 層級：repository contract、Next API HTTP test，或兩者都做。

## RD Completion Criteria

- SQLite mode 與 Postgres mode 都通過 provider contract。
- Main API regression 在 Postgres mode 通過。
- Target guard 阻擋非 AI_PDM target。
- Migration 與 RLS 可由 committed files 重現。
- Production secrets 僅留 server-side。
- Supabase Storage 被明確列為 follow-up，不混入 DB runtime completion。

## 2026-06-08 Local Slice Evidence

- `npm.cmd run supabase:migrations:sync`：PASS。
- `npm.cmd run qc:supabase-runtime-migrations`：PASS，17/17。
- `npm.cmd run db:postgres:compare -- --no-write`：PASS，64/64 tables，0 missing，0 RLS missing。
- `npm.cmd run qc:postgres-shadow-target-guard`：PASS，11/11。
- `npm.cmd run qc:postgres-shadow`：PASS，22/22。
- `npm.cmd run qc:db-provider-contract`：PASS，27/27，含 async provider contract / SQLite adapter / fail-closed checks。
- `npm.cmd run qc:db-provider-contract`：PASS，31/31，含 Postgres async adapter / unnamed query / transaction boundary checks。
- `npm.cmd run qc:db-provider-postgres`：PASS，8/8；live probe skipped because `PDM_POSTGRES_URL` is not configured。
- `npm.cmd run qc:system-settings-async-repository`：PASS，11/11，含 SQL portability 與 in-memory SQLite semantic checks。
- `npm.cmd run qc:access-control-async-repository`：PASS，37/37，含 async permission route/service 接線、async guard helper、5 個 read-only route 接線、async user repository、async auth/session user lookup、login/token async password lookup、async audit insert、roles/users/role_permissions provider-neutral SQL 與 in-memory SQLite semantic checks。
- `npm.cmd run qc:pdm-numbering-core`：PASS，238/238，確認 numbering core static/semantic checks 仍通過。
- `npm.cmd run qc:managed-auth`：PASS，11/11，確認既有 managed auth login/settings、bearer token flow 與 Login audit 寫入未被 async auth/audit pilot 破壞。
- `npm.cmd run qc:pdm-numbering-cross-role-permission`：PASS，45/45，證明 async permission API 仍支援 custom role priority、assignment、delegation 與 backend guard parity。
- `npm.cmd run qc:pdm-numbering-permission-guard-ui`：PASS，35/35，證明 permission API enable/disable 會反映到 sidebar 與 record-create guard。
- `npx.cmd tsc --noEmit`：PASS。
- `npm.cmd run lint -- --quiet`：PASS。
- `npm.cmd run lint`：PASS。
- `npm.cmd run build`：PASS，僅有既有 Turbopack NFT tracing warning。

## 2026-06-08 Phase 3H Evidence Addendum

- Phase: async auth user write pilot.
- Added `src/lib/auth-config.ts` so auth mode / role typing is separated from the sync DB aggregate.
- Added provider-neutral async user write SQL in `src/lib/repositories/user-async-repository.ts` for user upsert, create, and password hash update.
- Added `createUserAsync`, `updateUserPasswordAsync`, and `ensureDemoUserAsync` in `src/lib/auth-async.ts`.
- `/api/auth/login` and `/api/auth/token` now seed demo/admin users through async helpers and no longer import `@/lib/db` for auth mode / demo seed behavior.
- Supabase connection decision remains: runtime should use the Supabase pooler where appropriate; transaction pooler mode does not support prepared statements, so the current unnamed `pg` query path is intentional.
- Verification completed for this slice: `npm.cmd run qc:access-control-async-repository` passed 42/42, `npm.cmd run qc:managed-auth` passed 11/11, and `npx.cmd tsc --noEmit` passed.
- Still incomplete: full runtime provider selection, remaining sync API routes/repositories, live Supabase staging/prod target validation, Supabase advisors, and production cutover.

## 2026-06-08 Phase 3I Evidence Addendum

- Phase: `/api/settings` async runtime wiring.
- Added `src/lib/system-settings-async.ts` to expose `getSystemSettingAsync`, `getAllSystemSettingsAsync`, and `setSystemSettingAsync` through `AsyncSystemSettingsRepository`.
- Added `requireRoleAsync` in `src/lib/auth-async.ts`.
- Updated `/api/settings` GET/POST to use async auth, async settings repository, and async audit insert.
- Verification completed for this slice: `npm.cmd run qc:system-settings-async-repository` passed 15/15, `npm.cmd run qc:managed-auth` passed 11/11, `npm.cmd run qc:gdrive-folder-tree-settings` passed 35/35, `npm.cmd run qc:api` passed 391/391 with a temporary local dev server, `npx.cmd tsc --noEmit` passed, `npm.cmd run lint -- --quiet` passed, and `npm.cmd run build` passed with the existing Turbopack NFT warning.
- Still incomplete: provider selection beyond SQLite bridge, remaining sync API routes/repositories, live Supabase staging/prod target validation, advisors, and production cutover.

## 2026-06-08 Phase 3J Evidence Addendum

- Phase: async runtime provider selector.
- Added `getAsyncDatabaseClient()` and `closeAsyncDatabaseClient()` in `src/lib/db-async-provider.ts`.
- Runtime selector supports SQLite fallback and Postgres runtime through `PDM_DB_PROVIDER`, `PDM_POSTGRES_URL`, `PDM_POSTGRES_POOLER_MODE`, and `PDM_POSTGRES_MAX_CONNECTIONS`.
- Rewired `src/lib/auth-async.ts`, `src/lib/audit-async.ts`, `src/lib/numbering-permission-async.ts`, and `src/lib/system-settings-async.ts` to use the selector instead of directly constructing `SQLiteAsyncDatabaseClient`.
- Updated `.env.example` to document `PDM_POSTGRES_MAX_CONNECTIONS=5`.
- Expanded QC in `scripts/qc-db-provider-contract-test.mjs`, `scripts/qc-db-provider-postgres.mjs`, `scripts/qc-access-control-async-repository.mjs`, and `scripts/qc-system-settings-async-repository.mjs`.
- Verification completed for this slice: `qc:db-provider-contract` 35/35, `qc:db-provider-postgres` 9/9 with live probe skipped because `PDM_POSTGRES_URL` is not configured, `qc:access-control-async-repository` 42/42, `qc:system-settings-async-repository` 15/15, `tsc --noEmit`, `qc:managed-auth` 11/11, `qc:pdm-numbering-core` 238/238, `lint -- --quiet`, `qc:gdrive-folder-tree-settings` 35/35, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3K Evidence Addendum

- Phase: auth session route async migration.
- Updated `/api/auth/me` to use async session lookup through `getSessionUserAsync`.
- Updated `/api/auth/logout` to use async session lookup and async audit insert while preserving the existing logout cookie contract.
- Expanded managed-auth QC to cover cookie `/api/auth/me`, bearer `/api/auth/me`, logout cookie clearing, and logout audit logging.
- Expanded async access-control QC to statically prevent `auth/me` and `auth/logout` from regressing to sync session lookup or `@/lib/db`.
- Verification completed for this slice: `qc:access-control-async-repository` 44/44, `qc:managed-auth` 18/18, `tsc --noEmit`, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3L Evidence Addendum

- Phase: settings Google Drive admin route async guard migration.
- Updated `/api/settings/gdrive/folders` and `/api/settings/gdrive/folders/verify` to use `requireRoleAsync` for Admin-only access.
- Expanded system settings async QC to cover both Google Drive settings subroutes.
- Updated Google Drive folder tree QC static checks so Admin-only verification expects async guard while preserving runtime 200/403 behavior coverage.
- Verification completed for this slice: `qc:system-settings-async-repository` 16/16, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `qc:gdrive-folder-tree-settings` 35/35, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3M Evidence Addendum

- Phase: file metadata detect route async role guard migration.
- Updated `/api/file-metadata/detect` to use `requireRoleAsync` for Engineer/Admin access.
- Expanded async access-control QC with a route-level static guard check so the metadata detection route cannot regress to sync auth or import the DB aggregate.
- Verification completed for this slice: `qc:access-control-async-repository` 45/45, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime metadata evidence: `qc:api` `META-001` through `META-004` continued to pass after the async guard migration.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3N Evidence Addendum

- Phase: manufacturing handoff route async auth guard migration.
- Updated `/api/handoff` and `/api/handoff/export` to use `requireAuthAsync`.
- Tightened async auth result typing through `AsyncAuthResult` and `AsyncRoleResult`, giving migrated routes a stronger authenticated-user contract after `auth.response` has been handled.
- Expanded async access-control QC with a handoff route static guard check.
- Verification completed for this slice: `qc:access-control-async-repository` 46/46, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime handoff evidence: `qc:api` `HANDOFF-001` through `HANDOFF-011` continued to pass after the async guard migration.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3O Evidence Addendum

- Phase: search and notifications read-only route async auth guard migration.
- Updated `/api/search` and `/api/notifications` to use `requireAuthAsync`.
- Expanded async access-control QC with a search/notifications route static guard check.
- Verification completed for this slice: `qc:access-control-async-repository` 47/47, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime read-only evidence: `qc:api` `AUTH-013`, `SEARCH-001` through `SEARCH-003`, and `NOTIFY-001` through `NOTIFY-009` continued to pass after the async guard migration.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3Q Evidence Addendum

- Phase: item revision history and where-used read-only route async auth guard migration.
- Updated `/api/items/[partNumber]/revisions` and `/api/items/[partNumber]/where-used` to use `requireAuthAsync`.
- Preserved existing `listItemRevisionHistory` and `listWhereUsed` query paths; this slice only moves the route session guard onto the async runtime path.
- Expanded async access-control QC with an item revisions / where-used route static guard check.
- Verification completed for this slice: `qc:access-control-async-repository` 48/48, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime read-only evidence: `qc:api` `HIST-001` through `HIST-006` and `WHEREUSED-001` through `WHEREUSED-011` continued to pass after the async guard migration.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3R Evidence Addendum

- Phase: procurement releases integration read-only route async role guard migration.
- Updated `/api/integrations/procurement/releases` to use `requireRoleAsync` for R&D Manager/Admin access.
- Removed the route-local procurement role branching while preserving the existing handoff query and procurement payload response schema.
- Expanded async access-control QC with a procurement releases route static guard check.
- Verification completed for this slice: `qc:access-control-async-repository` 49/49, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime read-only evidence: `qc:api` `PROCAPI-001` through `PROCAPI-008` continued to pass after the async role guard migration.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3S Evidence Addendum

- Phase: numbering permissions matrix route async auth guard hardening.
- Updated `/api/numbering/permissions` to use `requireAuthAsync` for session lookup while retaining `checkNumberingPermissionAsync`, parallel page/action permission evaluation, and the existing `{ generatedAt, pages, actions }` response shape.
- Hardened `ACCESS-ASYNC-012` in `scripts/qc-access-control-async-repository.mjs` to check async auth wiring and prevent sync auth import regression for the permissions route.
- Verification completed for this slice: `qc:access-control-async-repository` 49/49, `tsc --noEmit`, `qc:pdm-numbering-permission-guard-ui` 35/35, `qc:pdm-numbering-cross-role-permission` 45/45, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime permission evidence: `qc:pdm-numbering-permission-guard-ui` and `qc:pdm-numbering-cross-role-permission` continued to pass after the async auth guard migration, covering permission reads, role matrix toggles, custom role assignment, delegation, revocation, sidebar behavior, and backend guard parity.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3T Evidence Addendum

- Phase: procurement sync-runs route async role guard migration.
- Updated `/api/integrations/procurement/sync-runs` GET/POST and `/api/integrations/procurement/sync-runs/[runId]` PATCH to use `requireRoleAsync` for R&D Manager/Admin access.
- Removed the route-local `canManageProcurementSync` branching while preserving existing submission visibility checks, released-only sync gate, sync payload shape, list filtering, acknowledge/fail action parsing, and duplicate acknowledgement behavior.
- Tightened `AsyncRoleResult` in `src/lib/auth-async.ts` so migrated routes can safely use `auth.user` after `auth.response` has been handled; `forbidden` is re-exported from `auth-async` so migrated routes do not need a sync auth import for secondary scoping checks.
- Expanded async access-control QC with `ROUTE-AUTH-ASYNC-006` for both procurement sync-run route files.
- Verification completed for this slice: `qc:access-control-async-repository` 50/50, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime sync-run evidence: `qc:api` `ERPSYNC-001` through `ERPSYNC-012` continued to pass after the async role guard migration.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3U Evidence Addendum

- Phase: chat route async auth guard migration.
- Updated `/api/chat` to use `requireAuthAsync` for session lookup and `forbidden` from `auth-async` for conversation ownership denial.
- Preserved existing chat persistence and response behavior: conversation creation, conversation continuation, user/assistant message writes, source payloads, whitelisted tool handling, blocked tool handling, and cross-user conversation 403.
- Expanded async access-control QC with `ROUTE-AUTH-ASYNC-007` for the chat route.
- Verification completed for this slice: `qc:access-control-async-repository` 51/51, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and a warmed `qc:api` 391/391 with a temporary local dev server.
- Runtime chat evidence: `qc:api` `AUTH-012` and `AI-009` through `AI-021` continued to pass after the async auth guard migration.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3V Evidence Addendum

- Phase: submission file download and PDF preview route async auth guard migration.
- Replaced the separate file download and preview handlers with `/api/submissions/[id]/files/[...filePath]`, which uses `requireAuthAsync` and preserves both `/api/submissions/[id]/files/[fileId]` and `/api/submissions/[id]/files/preview/[fileId]`.
- Preserved existing stored-file retrieval and response behavior: `getStoredSubmissionFile`, `buildFileResponse`, attachment download disposition, inline PDF preview disposition, PDF content type, and non-PDF preview `415`.
- Expanded async access-control QC with `ROUTE-AUTH-ASYNC-008` for both submission file route files.
- Verification completed for this slice: `qc:access-control-async-repository` 52/52, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime file evidence: `qc:api` `AUTH-003` and `FILE-001` through `FILE-005` continued to pass after the async auth guard migration.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3W Evidence Addendum

- Phase: submission discussions and review issues route async auth guard migration.
- Updated `/api/submissions/[id]/discussions`, `/api/submissions/[id]/discussions/[commentId]`, `/api/submissions/[id]/issues`, and `/api/submissions/[id]/issues/[issueId]` to use `requireAuthAsync`.
- Preserved existing discussion/issue domain behavior: submission visibility checks, file ownership checks, discussion create/list/resolve, issue create/list/resolve, assignee validation, and response status contracts.
- Expanded async access-control QC with `ROUTE-AUTH-ASYNC-009` for the four discussion/issue route files.
- Verification completed for this slice: `qc:access-control-async-repository` 53/53, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime discussion/issue evidence: `qc:api` `DISCUSS-001` through `DISCUSS-014` and `ISSUE-001` through `ISSUE-013` continued to pass after the async auth guard migration.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3X Evidence Addendum

- Phase: submission change request route async auth and role guard migration.
- Updated `/api/submissions/[id]/changes` GET to use `requireAuthAsync`; updated `/api/submissions/[id]/changes` POST and `/api/submissions/[id]/changes/[changeId]` PATCH to use `requireRoleAsync`.
- Preserved existing change request behavior: ECR/ECO/ECN validation, submission visibility, list/create/decision helpers, manager decision metadata, and duplicate-decision conflict handling.
- Expanded async access-control QC with `ROUTE-AUTH-ASYNC-010` for the two change route files.
- Verification completed for this slice: `qc:access-control-async-repository` 54/54, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime change evidence: `qc:api` `CHANGE-001` through `CHANGE-017` continued to pass after the async auth/role guard migration.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3Y Evidence Addendum

- Phase: submission phase gate route async auth and role guard migration.
- Updated `/api/submissions/[id]/phase-gates` GET to use `requireAuthAsync`; updated `/api/submissions/[id]/phase-gates` POST and `/api/submissions/[id]/phase-gates/[checkId]` PATCH to use `requireRoleAsync`.
- Preserved existing phase gate behavior: visibility checks, initialization, summary calculation, required-check blocking, decision validation, duplicate-decision conflict handling, and release readiness behavior.
- Expanded async access-control QC with `ROUTE-AUTH-ASYNC-011` for the two phase gate route files.
- Verification completed for this slice: `qc:access-control-async-repository` 55/55, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime phase gate evidence: `qc:api` `PHASE-001` through `PHASE-013` continued to pass after the async auth/role guard migration.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3Z Evidence Addendum

- Phase: submission approval matrix route async auth and role guard migration.
- Updated `/api/submissions/[id]/approval-matrix` GET to use `requireAuthAsync`; updated `/api/submissions/[id]/approval-matrix` POST and `/api/submissions/[id]/approval-matrix/[requirementId]` PATCH to use `requireRoleAsync`.
- Preserved existing approval matrix behavior: visibility checks, refresh/init helpers, summary calculation, required-role validation, requirement lookup, waiver flow, approval progression, and release gating behavior.
- Expanded async access-control QC with `ROUTE-AUTH-ASYNC-012` for the two approval matrix route files.
- Verification completed for this slice: `qc:access-control-async-repository` 56/56, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, clean rerun `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime approval matrix evidence: `qc:api` `MATRIX-001` through `MATRIX-015` continued to pass after the async auth/role guard migration.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3AA Evidence Addendum

- Phase: submission preflight lock route async role guard migration.
- Updated `/api/submissions/preflight-lock` POST to use `requireRoleAsync` for Engineer/Admin access.
- Preserved existing preflight behavior: body parsing, drawing/part number validation, active lock lookup, current-user ownership calculation, matched identifier response, and lock payload shape.
- Expanded async access-control QC with `ROUTE-AUTH-ASYNC-013` for the preflight lock route.
- Verification completed for this slice: `qc:access-control-async-repository` 57/57, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime preflight evidence: `qc:api` `CHECKOUT-010` through `CHECKOUT-016` continued to pass after the async role guard migration.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3AB Evidence Addendum

- Phase: submission checkout route async role guard migration.
- Updated `/api/submissions/[id]/checkout` POST and DELETE to use `requireRoleAsync` for Engineer/Admin access.
- Preserved existing checkout behavior: submission visibility, lock creation/reuse, conflict response, reason/hour validation, lock release, admin force release, and response payload shape.
- Expanded async access-control QC with `ROUTE-AUTH-ASYNC-014` for the checkout route.
- Verification completed for this slice: `qc:access-control-async-repository` 58/58, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime checkout evidence: `qc:api` `CHECKOUT-001` through `CHECKOUT-009` continued to pass after the async role guard migration.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-08 Phase 3AC Evidence Addendum

- Phase: submission approve/reject route async role guard migration plus file preview route stabilization.
- Updated `/api/submissions/[id]/approve` and `/api/submissions/[id]/reject` POST to use `requireRoleAsync` for R&D Manager/Admin access.
- Preserved approve/reject behavior: Pending-only checks, duplicate reviewer blocking, phase gate and approval matrix release gates, two-reviewer flow, release package creation, lifecycle obsolete marking, ReleaseFailed behavior, reject reason/comment persistence, and audit logging.
- Replaced the unstable sibling/nested file route pair with `/api/submissions/[id]/files/[...filePath]`, preserving `/files/[fileId]` and `/files/preview/[fileId]` public URL behavior while fixing runtime PDF preview 404.
- Verification completed: `qc:access-control-async-repository` 59/59, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and redirected `qc:api` 391/391.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-09 Phase 3AD Evidence Addendum

- Phase: release package, read-only share, and supplier response route async guard migration.
- Updated `/api/submissions/[id]/release-package` to use `requireAuthAsync` while preserving package download authorization, ZIP response headers, and Released/Obsolete gates.
- Updated `/api/submissions/[id]/shares`, `/api/submissions/[id]/shares/[shareId]`, `/api/submissions/[id]/supplier-responses`, and `/api/submissions/[id]/supplier-responses/[responseId]` to use `requireRoleAsync` for R&D Manager/Admin access.
- Removed route-local share/supplier role helpers while preserving `canReadSubmission`, share token flow, share redaction, revoke behavior, supplier response list/close behavior, and duplicate close 409.
- Verification completed: `qc:access-control-async-repository` 60/60, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and redirected `qc:api` 391/391.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-09 Phase 3AE Evidence Addendum

- Phase: AI submission summary and AI risk route async auth guard migration.
- Updated `/api/submissions/[id]/ai-summary` and `/api/submissions/[id]/ai-risks` to use `requireAuthAsync`.
- Preserved AI helper behavior: submission visibility checks, scoped submitter display, summary source generation, risk hint generation, Manager access, Engineer own-submission access, and cross-engineer denial.
- Expanded async access-control QC with `ROUTE-AUTH-ASYNC-017` for both AI routes.
- Verification completed: `qc:access-control-async-repository` 61/61, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and redirected `qc:api` 391/391.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-09 Phase 3AF Evidence Addendum

- Phase: submission list/create/detail route async auth and role guard migration.
- Updated `/api/submissions` GET to use `requireAuthAsync` and POST to use `requireRoleAsync` for Engineer/Admin access.
- Updated `/api/submissions/[id]` GET to use `requireAuthAsync`.
- Preserved existing submission behavior: status filter, pagination, Engineer `scopedSubmittedBy` list/metrics scoping, input validation, uploaded-file validation, duplicate drawing/revision conflict, CAD references, local upload cleanup, background Google Drive upload, detail `canReadSubmission`, and cross-engineer 403.
- Expanded async access-control QC with `ROUTE-AUTH-ASYNC-018` for the submission list/create/detail routes.
- Verification completed: `qc:access-control-async-repository` 62/62, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, clean rerun `build` with the existing Turbopack NFT warning, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and redirected `qc:api` 391/391.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-09 Phase 3AG Evidence Addendum

- Phase: submission BOM materialize/read/diff/export route async auth guard migration.
- Updated `/api/submissions/[id]/bom`, `/api/submissions/[id]/bom/diff`, and `/api/submissions/[id]/bom/export` to use `requireAuthAsync`.
- Preserved existing BOM behavior: `canReadSubmission` authorization, materialization from references, existing BOM lookup, previous/explicit base diff, CSV export, XLS export, content headers, filename sanitization, and cross-engineer denial.
- Expanded async access-control QC with `ROUTE-AUTH-ASYNC-019` for the three submission BOM routes.
- Verification completed: `qc:access-control-async-repository` 63/63, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and redirected `qc:api` 391/391.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, BOM repository async conversion, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-09 Phase 3AI Evidence Addendum

- Phase: BOM workbench, draft, review, and release export route async guard migration.
- Updated `/api/bom/workbench`, `/api/bom/drafts/from-assembly`, `/api/bom/drafts/import-xls`, `/api/bom/drafts/[draftId]`, `/api/bom/drafts/[draftId]/active`, `/api/bom/drafts/[draftId]/diff`, `/api/bom/drafts/[draftId]/submit-review`, `/api/bom/reviews/pending`, `/api/bom/reviews/[reviewId]/approve`, `/api/bom/reviews/[reviewId]/reject`, and `/api/bom/releases/[releaseId]/export`.
- Read, draft, import, active, diff, submit-review, and release export routes now use `requireAuthAsync`; pending/approve/reject review routes now use `requireRoleAsync(request, ["R&D Manager", "Admin"])`.
- Removed route-local review role checks while preserving `canReadBomDraft`, `canReadSubmission`, `canReadBomReleasedSnapshot`, workbench summary, create-from-assembly, SolidWorks XLS import, draft save/active/diff/submit-review, pending review list, approve/reject release gates, released snapshot CSV/XLSX export, edit events, audit logs, and role-specific released-only visibility.
- Expanded async access-control QC with `ROUTE-AUTH-ASYNC-020` for the 11 BOM workbench/review/release routes.
- Verification completed: `qc:access-control-async-repository` 64/64, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, `qc:bom-workbench-foundation` 27/27, `qc:bom-workbench-tree-rules` 22/22, `qc:bom-workbench-release-gate-resubmit` 43/43, `qc:bom-workbench-solidworks-xls-import` 34/34, `qc:bom-workbench-release-export` 21/21, `qc:bom-workbench-review-release` 25/25, `qc:bom-workbench-released-only-permission` 31/31, and redirected `qc:api` 391/391.
- Still incomplete: live Supabase staging/prod target validation, advisors/RLS review, Postgres-mode API regression against a configured target, BOM repository async conversion, remaining sync API routes/repositories, production cutover, and rollback evidence.

## 2026-06-09 Phase 3AJ Evidence Addendum

- Phase: submission auxiliary routes and numbering approval batch detail route async guard migration.
- Updated `/api/submissions/[id]/reuse-candidates`, `/duplicate-geometry`, `/retry-upload`, `/sandbox`, `/sandbox/[branchId]`, `/pdf-markups`, and `/pdf-markups/[markupId]` to use async auth/role guards.
- Updated retry upload to use async system setting lookup and async audit logging.
- Updated `/api/numbering/approval-batches/[batchId]` to use `requireNumberingPageAsync` and `canUserUseNumberingActionAsync`.
- Behavior preserved: design reuse scoping, duplicate geometry scoping, retry upload status accounting, sandbox branch create/merge/promote/close, PDF markup create/list/resolve, and approval batch decide/resubmit behavior.
- Expanded async access-control QC with `ROUTE-AUTH-ASYNC-021` and `ROUTE-AUTH-ASYNC-022`.
- Verification completed: `qc:access-control-async-repository` 66/66, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `qc:pdm-numbering-core` 238/238, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, `build` with the existing Turbopack NFT warning, and redirected `qc:api` 391/391.
- Static cleanup result: direct sync auth import/call search under `src/app/api` now returns no matches.
- Still incomplete: remaining numbering routes still use sync numbering permission guard helpers, domain repositories still need async conversion, and live Supabase staging/prod validation, advisors/RLS review, Postgres-mode regression, cutover, and rollback evidence remain open.

## 2026-06-09 Phase 3AK Evidence Addendum

- Phase: numbering and numbering-adjacent parts API permission guard async migration.
- Updated all remaining `src/app/api/numbering/**/route.ts` sync numbering permission guard calls to `requireNumberingPageAsync`, `requireNumberingActionAsync`, or `canUserUseNumberingActionAsync`.
- Updated `src/app/api/parts/[partNumber]/**` numbering-adjacent routes to async numbering permission guards for part detail, attachments, attachment sync/delete, variant update, and cost profile creation.
- Repointed `forbidden` imports in `numbering/admin/matrix` and `numbering/approval-decisions` to `@/lib/auth-async`, so API routes no longer directly import sync `@/lib/auth`.
- Expanded async access-control QC with recursive route scans: `ROUTE-AUTH-ASYNC-023` for numbering API routes and `ROUTE-AUTH-ASYNC-024` for parts API numbering-adjacent routes.
- Verification completed: full API sync guard search returned no matches; `qc:access-control-async-repository` 68/68; `tsc --noEmit`; `qc:managed-auth` 18/18; `lint -- --quiet`; `qc:pdm-numbering-core` 238/238; `db:postgres:compare -- --no-write` with 64/64 table coverage and no mismatches; `qc:postgres-shadow` 22/22; `build` with the existing Turbopack NFT warning; and redirected `qc:api` 391/391.
- Still incomplete: sync domain repositories still need async/provider-neutral conversion, and live Supabase staging/prod validation, advisors/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and Storage follow-up remain open.

## 2026-06-09 RD Executable Document Addendum

- Added implementation entry point: `.ai-doc/reports/pm/supabase-db-migration-executable-development-plan-2026-06-09.md`.
- RD rule confirmed: continue one bounded repository/provider-neutral slice at a time, preserve API response contracts, and avoid direct `@/lib/db`, `getDb`, or `better-sqlite3` access in migrated repository slices.
- Current implementation baseline: API route direct sync auth and sync numbering permission guard migration is locally complete through Phase 3AK; domain repositories still require async/provider-neutral conversion.
- Recommended next RD slice: Phase 3AL, converting `listItemRevisionHistory` and `listWhereUsed` behind `src/app/api/items/[partNumber]/revisions/route.ts` and `src/app/api/items/[partNumber]/where-used/route.ts`.
- Required RD gate for Phase 3AL: provider-neutral async repository wrapper, portable SQL, route response preservation, static QC preventing sync repository regression, TypeScript, lint, build, Postgres shadow compare, and full API regression.

## 2026-06-09 Phase 3AL RD Evidence Addendum

- Phase: item revision history and where-used provider-neutral async repository conversion.
- Added `src/lib/repositories/item-insight-async-repository.ts` with `AsyncItemInsightRepository`, `SELECT_ASYNC_ITEM_REVISION_HISTORY_SQL`, and `SELECT_ASYNC_WHERE_USED_SQL`.
- Added `src/lib/item-insights-async.ts` as the runtime wrapper using `getAsyncDatabaseClient`.
- Updated `/api/items/[partNumber]/revisions` to call `await listItemRevisionHistoryAsync(...)`.
- Updated `/api/items/[partNumber]/where-used` to call `await listWhereUsedAsync(...)`.
- Preserved behavior: part number decoding, authenticated scoping through `scopedSubmittedBy`, revision history response shape, where-used response shape, child outdated calculation, quantity/source filename fields, and empty where-used behavior.
- SQL portability work: where-used SQL now uses named parameters, `lower(...)`, `COALESCE(...)`, and deterministic `id` ordering instead of SQLite-only `datetime(...)` and `rowid`.
- Verification completed: `qc:access-control-async-repository` 75/75, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, `build`, and `qc:api` 391/391.
- Still incomplete: remaining sync domain repositories and live Supabase staging/prod validation remain open.

## 2026-06-09 Phase 3AM RD Evidence Addendum

- Phase: dashboard metrics read-only provider-neutral async repository conversion.
- Implemented `AsyncDashboardRepository` and `SELECT_ASYNC_DASHBOARD_STATUS_COUNTS_SQL` to count submission statuses through `AsyncDatabaseClient`.
- Added `src/lib/dashboard-metrics-async.ts` runtime helper using `getAsyncDatabaseClient`.
- Updated `/api/submissions` GET to await `getDashboardMetricsAsync(submittedBy)` and preserve global versus scoped engineer metrics behavior.
- SQL portability: named `:submittedBy` parameter, nullable scope predicate, standard `COUNT(*)`, and `GROUP BY status`.
- QC added static and semantic checks for repository boundary, runtime helper use, route connection, all-status counts, and submittedBy scoping.
- Verification completed: `qc:access-control-async-repository` 81/81, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Full `qc:api` was intentionally skipped for this slice to preserve the freshly reset local runtime DB and avoid reintroducing `P-QC-*` fixtures.
- Still incomplete: submission list/search/write paths, BOM repository, numbering repository, release/collaboration repositories, and live Supabase staging/prod validation remain open.

## 2026-06-09 Phase 3AN RD Evidence Addendum

- Phase: submission list read-only provider-neutral async repository conversion.
- Implemented `AsyncSubmissionListRepository` with SQLite/Postgres SQL constants, provider-specific aggregation, status/submittedBy filters, pagination, release-package flag, active-lock flag, and numeric aggregate normalization.
- Added `src/lib/submissions-async.ts` runtime helper using `getAsyncDatabaseClient`.
- Updated `/api/submissions` GET to await `listSubmissionsAsync({ status, submittedBy, limit: limit + 1, offset })`.
- Preserved behavior: authentication scoping, manager/global visibility, engineer submittedBy scoping, status filter, pagination, `hasMore`, dashboard metrics, and existing POST/write behavior.
- SQL portability: named parameters, provider-specific `GROUP_CONCAT`/`STRING_AGG`, standard joins, deterministic `ORDER BY s.created_at DESC, s.id DESC`, and no direct `getDb` or `better-sqlite3` imports in the migrated repository.
- QC added static and semantic checks for repository boundary, runtime helper use, route connection, ordering, aggregate flags, filters, limit, and offset.
- Verification completed: `qc:access-control-async-repository` 87/87, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Full `qc:api` was intentionally skipped for this slice to preserve the freshly reset local runtime DB and avoid reintroducing `P-QC-*` fixtures.
- Still incomplete: `searchSubmissions`, submission detail/create/write/upload paths, BOM repository, numbering repository, release/collaboration repositories, and live Supabase staging/prod validation remain open.

## 2026-06-09 Phase 3AO RD Evidence Addendum

- Phase: `/api/search` submission search read-only provider-neutral async repository conversion.
- Implemented async search in `AsyncSubmissionListRepository` with SQLite/Postgres SQL constants, portable named parameters, query search, status/submittedBy filters, finder filters, child drawing/part filters, and BOM issue filters.
- Removed SQLite-only `datetime(...)` and `rowid` ordering from the migrated search path; latest child release ordering now uses `COALESCE(... ) DESC, id DESC`.
- Added `searchSubmissionsAsync` runtime helper using `getAsyncDatabaseClient`.
- Updated `/api/search` to await `searchSubmissionsAsync(...)` and stop importing `@/lib/db`.
- Preserved behavior: async auth guard, query length threshold, no-query/no-filter empty response, `scopedSubmittedBy`, dashboard finder filters, BOM child/outdated filters, and `{ submissions }` response shape.
- Verification completed: `qc:access-control-async-repository` 94/94, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Full `qc:api` was intentionally skipped for this slice to preserve the freshly reset local runtime DB and avoid reintroducing `P-QC-*` fixtures.
- Still incomplete: submission detail/create/write/upload paths, BOM repository, numbering repository, release/collaboration repositories, and live Supabase staging/prod validation remain open.

## 2026-06-09 Phase 3AP RD Evidence Addendum

- Phase: `/api/submissions/[id]` submission detail read-only provider-neutral async repository conversion.
- Implemented async detail loading in `AsyncSubmissionListRepository` with provider-neutral SQL constants for the submission row, files, file references, approvals, audit logs, active lock, release package, BOM header, and BOM lines.
- Added `getSubmissionAsync(id)` runtime helper using `getAsyncDatabaseClient`.
- Updated `/api/submissions/[id]` GET to await `getSubmissionAsync(id)` and stop importing sync `getSubmission` from `@/lib/db`.
- Preserved behavior: authenticated access, `canReadSubmission` authorization, not-found response, response envelope, detail child collections, release package metadata, active lock detection, and BOM detail structure.
- SQL portability: detail and BOM queries use named parameters, `COALESCE(...)`, deterministic `id` ordering, and avoid SQLite-only `datetime(...)` and `rowid` in the migrated detail path.
- QC added static and semantic checks for route wiring, SQL constant exposure, runtime provider selection, full detail payload, active lock, and missing detail behavior.
- Verification completed: `qc:access-control-async-repository` 101/101, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Full `qc:api` was intentionally skipped for this slice to preserve the freshly reset local runtime DB and avoid reintroducing `P-QC-*` fixtures.
- Still incomplete: submission create/write/upload paths, file/download routes, BOM repository, numbering repository, release/collaboration repositories, and live Supabase staging/prod validation remain open.

## 2026-06-09 Phase 3AQ RD Evidence Addendum

- Phase: submission file metadata read/update provider-neutral async repository conversion.
- Implemented `AsyncSubmissionFileRepository` with SQL constants for `submission_files` lookup, upload queue lookup, status-only update, and status-with-Google-Drive-id update.
- Added `src/lib/submission-files-async.ts` as the runtime wrapper using `getAsyncDatabaseClient`.
- Updated `src/lib/file-response.ts` to resolve submission authorization through `getSubmissionAsync` and file metadata through `getSubmissionFileAsync` before local file byte reads.
- Updated retry upload to await async submission and file metadata helpers while preserving Google Drive retry behavior and async audit logging.
- Updated PDF markup, discussion, and issue creation routes so file validation uses `getSubmissionFileAsync`; existing collaboration create/list helpers remain intentionally out of this slice.
- SQL portability: named parameters only, standard `UPDATE`, deterministic upload queue ordering by `created_at ASC, id ASC`, no direct `getDb`, and no `better-sqlite3` import in the migrated repository.
- Verification completed: `qc:access-control-async-repository` 108/108, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Full `qc:api` was intentionally skipped for this slice to preserve the freshly reset local runtime DB and avoid reintroducing `P-QC-*` fixtures.
- Still incomplete: submission create/write/upload, collaboration repositories, BOM repository, numbering repository, release repositories, and live Supabase staging/prod validation remain open.

## 2026-06-09 Phase 3AR RD Evidence Addendum

- Phase: collaboration discussion, review issue, and PDF markup list/create/resolve provider-neutral async repository conversion.
- Implemented `AsyncCollaborationRepository` with SQL constants for discussion comments, review issues, PDF markups, create operations, resolve operations, and audit-backed write events.
- Added `src/lib/collaboration-async.ts` as the runtime wrapper using `getAsyncDatabaseClient`.
- Added `getUserByIdAsync` in `src/lib/auth-async.ts` for issue assignee validation.
- Updated discussion, issue, and PDF markup collection/detail routes to await async collaboration helpers and stop importing sync collaboration DB helpers.
- Preserved behavior: async auth guard, `canReadSubmission`, file-id validation, PDF-only markup validation, issue assignee validation, missing resource 404s, resolve idempotence boundary, and existing response envelopes.
- SQL portability: named parameters only, deterministic `created_at ASC, id ASC` ordering, standard `INSERT` / `UPDATE`, no direct `getDb`, no `better-sqlite3` import, and no SQLite-only `datetime(...)` or `rowid` in the migrated collaboration repository.
- Verification completed: `qc:access-control-async-repository` 116/116, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Full `qc:api` was intentionally skipped for this slice to preserve the freshly reset local runtime DB and avoid reintroducing `P-QC-*` fixtures.
- Still incomplete: submission create/write/upload, change request, phase gate, approval matrix, BOM repository, numbering repository, release repositories, attachment/AI repositories, and live Supabase staging/prod validation remain open.

## 2026-06-09 Phase 3AS RD Evidence Addendum

- Phase: change request list/create/decide provider-neutral async repository conversion.
- Implemented change request SQL constants and async methods in `AsyncCollaborationRepository`.
- Added `listChangeRequestsAsync`, `getChangeRequestAsync`, `createChangeRequestAsync`, and `decideChangeRequestAsync` runtime wrappers.
- Updated change request collection and detail routes to await async submission lookup plus async change request helpers.
- Preserved behavior: async auth/role guards, `canReadSubmission`, not-found handling, ECR/ECO/ECN validation, title/reason/impact bounds, approve/reject/close action mapping, comment length guard, open-only decision boundary, and response envelopes.
- SQL portability: named parameters only, deterministic ordering by open status plus `created_at ASC, id ASC`, standard `INSERT` / `UPDATE`, no direct `getDb`, no `better-sqlite3` import, and no SQLite-only `datetime(...)` or `rowid` in the migrated change request path.
- Verification completed: `qc:access-control-async-repository` 123/123, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Full `qc:api` was intentionally skipped for this slice to preserve the freshly reset local runtime DB and avoid reintroducing `P-QC-*` fixtures.
- Still incomplete: submission create/write/upload, phase gate, approval matrix, BOM repository, numbering repository, release repositories, attachment/AI repositories, and live Supabase staging/prod validation remain open.

## 2026-06-09 Phase 3AT RD Evidence Addendum

- Phase: phase gate list/initialize/decide provider-neutral async repository conversion.
- Implemented phase gate SQL constants and async methods in `AsyncCollaborationRepository`, including default check initialization and audit-backed decisions.
- Added `listPhaseGateChecksAsync`, `getPhaseGateCheckAsync`, `initializePhaseGateChecksAsync`, `decidePhaseGateCheckAsync`, and `listOpenRequiredPhaseGateChecksAsync` runtime wrappers.
- Updated phase gate collection and detail routes to await async submission lookup plus async phase gate helpers.
- Preserved behavior: async auth/role guards, `canReadSubmission`, missing submission/check handling, `complete`/`waive` action validation, comment length guard, open-only decision boundary, summary shape, `created` status code behavior, and response envelopes.
- SQL portability: named parameters only, deterministic gate ordering plus `created_at ASC, id ASC`, standard `INSERT` / `UPDATE`, no direct `getDb`, no `better-sqlite3` import, and no SQLite-only `datetime(...)` or `rowid` in the migrated phase gate path.
- Verification completed: `qc:access-control-async-repository` 130/130, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Full `qc:api` was intentionally skipped for this slice to preserve the freshly reset local runtime DB and avoid reintroducing `P-QC-*` fixtures.
- Still incomplete: submission create/write/upload, approval matrix, BOM repository, numbering repository, release repositories, attachment/AI repositories, and live Supabase staging/prod validation remain open.

## 2026-06-09 Phase 3AU RD Evidence Addendum

- Phase: approval matrix list/initialize/refresh/waive provider-neutral async repository conversion.
- Implemented `AsyncApprovalRepository` with approval matrix SQL constants, default requirements, list/get/initialize/refresh/waive methods, and open-required helper.
- Added `src/lib/approval-async.ts` runtime wrappers through `getAsyncDatabaseClient`.
- Updated approval matrix collection and detail routes to await async submission lookup plus async approval matrix helpers.
- Preserved behavior: async auth/role guards, `canReadSubmission`, missing submission/requirement handling, default Manager/Admin requirements, custom requirement validation, automatic satisfied refresh when approved count meets min count, open-only waive boundary, summary shape, `created` status code behavior, and response envelopes.
- SQL portability: named parameters only, deterministic role ordering plus `created_at ASC, id ASC`, standard `INSERT` / `UPDATE`, no direct `getDb`, no `better-sqlite3` import, and no SQLite-only `datetime(...)` or `rowid` in the migrated approval matrix path.
- Verification completed: `qc:access-control-async-repository` 137/137, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Full `qc:api` was intentionally skipped for this slice to preserve the freshly reset local runtime DB and avoid reintroducing `P-QC-*` fixtures.
- Still incomplete: submission create/write/upload, approve/reject release decision flows, BOM repository, numbering repository, release package/share/supplier/sandbox repositories, attachment/AI repositories, and live Supabase staging/prod validation remain open.

## 2026-06-09 Phase 3AV RD Evidence Addendum

- Phase: reject release decision flow provider-neutral async repository conversion.
- Implemented approval decision SQL constants and async methods in `AsyncApprovalRepository` for decision insert, reviewer duplicate lookup, and approval summary aggregation.
- Added `addApprovalAsync`, `reviewerHasDecisionAsync`, and `getApprovalSummaryAsync` runtime wrappers through `getAsyncDatabaseClient`.
- Added `AsyncSubmissionStatusRepository` with a bounded `REJECT_ASYNC_SUBMISSION_SQL` update and `rejectSubmissionAsync` runtime wrapper.
- Updated `/api/submissions/[id]/reject` to await async submission lookup, reviewer decision check, approval insertion, reject status update, and audit insertion; the route no longer imports sync `@/lib/db`.
- Preserved behavior: Manager/Admin role guard, Pending-only reject boundary, duplicate reviewer decision guard, reject reason/comment fallback, `approval_steps` insertion, `submissions` status update, `Reject` audit action, and `{ submissionId, status: "Rejected" }` response envelope.
- SQL portability: named parameters only, standard `INSERT` / `UPDATE`, no direct `getDb`, no `better-sqlite3` import, and no SQLite-only `datetime(...)` or `rowid` in the migrated decision/status path.
- Verification completed: `qc:access-control-async-repository` 144/144, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Full `qc:api` was intentionally skipped for this slice to preserve the freshly reset local runtime DB and avoid reintroducing `P-QC-*` fixtures.
- Still incomplete: submission create/write/upload, approve release decision flow, BOM repository, numbering repository, release package/share/supplier/sandbox repositories, attachment/AI repositories, and live Supabase staging/prod validation remain open.

## 2026-06-09 Phase 3AW RD Evidence Addendum

- Phase: approve release decision flow provider-neutral async repository conversion.
- Extended `AsyncSubmissionStatusRepository` with active sandbox lookup, releasing/failure updates, released lifecycle update, previous release obsolete update, and obsolete audit insertion.
- Added `AsyncReleaseRepository` with provider-neutral release package lookup/upsert and released-filename conflict lookup.
- Added `src/lib/release-records-async.ts`, `src/lib/release-async.ts`, and `src/lib/release-package-async.ts` runtime wrappers/services using async DB helpers while preserving existing Google Drive and zip packaging boundaries.
- Updated `/api/submissions/[id]/approve` to await async submission lookup, approval decision helpers, phase gate and approval matrix blockers, release status helpers, release service, release package creation, lifecycle update, and audit insertion; the route no longer imports sync `@/lib/db`.
- Preserved behavior: Manager/Admin role guard, Pending-only approval boundary, active sandbox block, duplicate reviewer guard, approval count threshold, phase gate block, approval matrix block, ReleaseFailed recovery path, release package response behavior, `ReleaseSucceeded` audit, and previous release obsolescence.
- SQL portability: named parameters only, standard `INSERT ... ON CONFLICT` for release package upsert, deterministic lookups, explicit transaction boundary for Postgres lifecycle writes, and no direct `getDb` / `better-sqlite3` import in the migrated repository path.
- Verification completed: `qc:access-control-async-repository` 153/153, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Full `qc:api` was intentionally skipped for this slice to preserve the freshly reset local runtime DB and avoid reintroducing `P-QC-*` fixtures.
- Still incomplete: submission create/write/upload, BOM repository, numbering repository, release package/share/supplier/sandbox repositories beyond this approve path, attachment/AI repositories, and live Supabase staging/prod validation remain open.

## 2026-06-09 Phase 3AX RD Evidence Addendum

- Phase: `/api/submissions` POST create/write provider-neutral async repository conversion.
- Added `AsyncSubmissionWriteRepository` with provider-neutral SQL constants for revision duplicate lookup, item upsert, submission insert, submission file insert, file reference insert, submit audit insertion, BOM header upsert, BOM line refresh, and BOM draft materialization audit.
- Added `submissionRevisionExistsAsync` and `createSubmissionRecordAsync` runtime wrappers through `src/lib/submissions-async.ts`.
- Updated `/api/submissions` POST to await async duplicate checks, create/write operations, system setting lookup, and background upload file status updates; the route no longer imports sync `@/lib/db`.
- Preserved behavior: duplicate drawing/revision conflict, required metadata validation, uploaded file/reference persistence, Google Drive pending-folder fallback, background upload status transitions, `Submit` audit, and BOM draft materialization from `assembly_component` file references.
- SQL portability: named parameters only, standard `INSERT` / `UPDATE`, `ON CONFLICT` scoped to declared unique keys, explicit Postgres transaction boundary, sequential SQLite fallback writes, no direct `getDb` / `better-sqlite3` import, and no SQLite-only `datetime(...)` or `rowid` in the migrated write repository path.
- Verification completed: `qc:access-control-async-repository` 161/161, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Full `qc:api` was intentionally skipped for this slice to preserve the freshly reset local runtime DB and avoid reintroducing `P-QC-*` fixtures.
- Still incomplete: BOM workbench/domain repositories, numbering repository, release package/share/supplier/sandbox repositories beyond migrated release paths, attachment/AI repositories, and live Supabase staging/prod validation remain open.

## 2026-06-09 Phase 3AY RD Evidence Addendum

- Phase: `/api/bom/workbench` GET summary read provider-neutral async repository conversion.
- Added `AsyncBomWorkbenchRepository` with provider-neutral SQL constants for parent workbench lookup, draft summary list, draft detail lookup, and draft line lookup.
- Added `src/lib/bom-workbench-async.ts` runtime wrappers through `getAsyncDatabaseClient`.
- Updated `/api/bom/workbench` to await async submission lookup plus async BOM workbench summary lookup; the route no longer imports sync `@/lib/db`.
- Preserved behavior: auth guard, missing `submissionId` validation, missing submission 404, `canReadBomDraft` authorization, response shape `{ workbench }`, active draft selection for active `Draft` / `Rejected` drafts, and line detail with joined `part_name`.
- SQL portability: named parameters only, deterministic `updated_at DESC, id DESC` and `sequence_no ASC, id ASC` ordering, no direct `getDb` / `better-sqlite3` import, and no SQLite-only `datetime(...)` or `rowid` in the migrated workbench read path.
- Verification completed: `qc:access-control-async-repository` 169/169, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Full `qc:api` was intentionally skipped for this slice to preserve the freshly reset local runtime DB and avoid reintroducing `P-QC-*` fixtures.
- Still incomplete: BOM draft create/save/active/diff/review/release/export paths, numbering repository, release package/share/supplier/sandbox repositories beyond migrated release paths, attachment/AI repositories, and live Supabase staging/prod validation remain open.
