# SPEC-SUPABASE-DB-001: Supabase 正式資料庫 Runtime 遷移

狀態：Superseded for staging/production by `SPEC-PDM-ERP-GOOGLE-CLOUDSQL-002`; historical migration evidence only
日期：2026-06-08  
關聯任務：`DEV-SUPABASE-DB-001`  
關聯前置任務：`DEV-IND-007`  
產品：AI_PDM

2026-06-29 PM consistency note: this spec was written before the approved `AI_PDM_STAGING` GATE-B execution. Current authoritative state is recorded in `.ai-doc/dev_task.md`: staging GATE-B passed with target identity, schema/RLS compare, migration history evidence, permission/rule seed repair, app API smoke, cleanup proof, and rollback proof. Production/cutover and full data parity remain unapproved and deferred.

2026-07-13 supersession: the user later selected Cloud SQL PostgreSQL in Google Taiwan for staging/production. Read `.ai-doc/decisions/ADR-PDM-ERP-PLATFORM-002-google-taiwan-cloud-sql-production.md` and `.ai-doc/specs/SPEC-PDM-ERP-GOOGLE-CLOUDSQL-002-five-year-platform-ontology-roadmap.md` before any execution. Supabase target instructions below are non-executable history.

## 1. 背景

AI_PDM 目前正式 runtime 仍以 SQLite 為主。Postgres / Supabase shadow migration、RLS baseline、target guard 與 handoff package 已具備基礎能力，但尚未把正式 runtime 切到 Supabase Postgres。

2026-06-08 已完成本機 `data` reset。舊的 `submission_files`、`release_packages`、QC artifacts、handoff packages 與 tracked defect register 已依使用者指示清除，因此本次正式遷移不搬遷舊測試檔案或舊 runtime artifacts。

## 2. 目標

將 AI_PDM 正式資料庫 runtime 從 SQLite 升級為 Supabase Postgres，同時保留 SQLite fallback，讓 staging 與 production 都能以乾淨 schema、受控 seed、可追蹤 migration、RLS deny-by-default 與 rollback evidence 運作。

## 3. 範圍

本任務包含：

- 建立 AI_PDM 專用 Supabase target：`AI_PDM_STAGING` 與 `AI_PDM_PROD`。
- 建立 Supabase migration 結構與本機 migration mirror。
- 實作 `postgres` runtime provider，保留 `sqlite` fallback。
- 將 repository 逐步移除 SQLite-only API 與 SQL dialect 假設。
- 建立 Postgres provider contract QC、API regression、RLS gate、advisor gate 與 production smoke。
- 明確阻擋既有 `ProJED` / `ProJED_TEST` target 被誤用。

本任務不包含：

- Supabase Storage 檔案本體遷移。
- 舊測試檔案、QC 報告、handoff artifacts 搬遷。
- 讓 browser 直接使用 Supabase Data API 存取 public base tables。

## 4. Target 規則

只能使用新建且專用於 AI_PDM 的 Supabase target：

- Staging：`AI_PDM_STAGING`
- Production：`AI_PDM_PROD`

不可使用：

- `ProJED`
- `ProJED_TEST`
- 任何非空 public schema
- 任何 partial / 非 AI_PDM schema

Live migration 前必須跑 target guard。若 URL 或 `PDM_SUPABASE_TARGET_NAME` 指向已知非 AI_PDM target，guard 必須 fail closed。

## 5. Runtime 架構

Browser 僅呼叫 AI_PDM server API。Server API 透過 runtime provider 存取資料庫。

Provider kind 由：

```ts
"sqlite"
```

擴充為：

```ts
"sqlite" | "postgres"
```

必要 env：

```text
PDM_DB_PROVIDER=sqlite|postgres
PDM_POSTGRES_URL=
PDM_POSTGRES_ADMIN_URL=
PDM_POSTGRES_POOLER_MODE=direct|session|transaction
PDM_SUPABASE_TARGET_NAME=
```

`PDM_POSTGRES_URL` 用於 server runtime；`PDM_POSTGRES_ADMIN_URL` 僅用於 migration、compare、maintenance。所有 secret 必須停留在 server-side env，不得進入 frontend bundle。

## 6. DB Provider Contract

新增 async database client contract：

```ts
query<T>(sql, params): Promise<T[]>
queryOne<T>(sql, params): Promise<T | null>
execute(sql, params): Promise<void>
transaction<T>(fn): Promise<T>
```

SQLite adapter 先包裝現有 `better-sqlite3`，避免一次性翻動所有 repository。Postgres adapter 使用 server-side Postgres client，並依 Supabase pooler 模式避免 prepared-statement 相容性問題。

2026-06-08 已選用 `pg` / node-postgres 作為最小 Postgres async adapter。Adapter 只使用 unnamed `query(text, values)`，避免 Supabase transaction pooler 不支援 named prepared statements 的問題。正式 repository/API 切換仍需後續 provider-neutral migration 與 staging live validation。

## 7. Migration 策略

目前 authoritative source：

- `db/postgres/001_initial_schema.sql`
- `db/postgres/002_supabase_rls_plan.sql`

本機 Supabase mirror：

- `supabase/migrations/20260608000100_initial_ai_pdm_schema.sql`
- `supabase/migrations/20260608000200_force_rls_deny_direct_access.sql`
- `supabase/migrations/manifest.json`

Mirror 由 `npm.cmd run supabase:migrations:sync` 產生，並在檔案內保留 source SHA-256。正式套用 live target 前，仍需 Supabase CLI 或 Supabase MCP migration path 產生 live migration history evidence。

## 8. Seed 策略

只允許受控 baseline seed：

- roles
- role permissions
- numbering rule versions
- rule templates
- approval rules
- system settings

Demo data 與舊測試資料不得進入 production。

## 9. 分期

### Phase 0: Clean Baseline

已完成：清除本機 `data` runtime/QC/handoff/report artifacts，重新初始化乾淨 SQLite runtime。

### Phase 1: Supabase Migration Structure

已完成本機 slice：

- 建立 `supabase/migrations` mirror。
- 新增 `supabase:migrations:sync`。
- 新增 `qc:supabase-runtime-migrations`。
- 補 `.env.example` 與 Supabase README。
- 強化 target identity guard，阻擋 `ProJED` / `ProJED_TEST`。

2026-06-29 current-state amendment：

- Local Supabase CLI migration history remains unavailable because Supabase CLI is not installed locally.
- Target-linked migration evidence for `AI_PDM_STAGING` was captured through Supabase MCP `list_migrations`.
- `AI_PDM_STAGING` GATE-B passed under the approved staging-only smoke scope.
- Production target apply, production cutover, and full data parity are still deferred until PM explicitly approves that scope.

### Phase 2: DB Provider Abstraction

- 建立 async DB interface。
- 建立 SQLite adapter。
- 建立 Postgres adapter。
- 新增 provider contract QC。

### Phase 3: Repository Migration

遷移順序：

1. auth / users / roles / permissions / settings
2. submissions / submission_files / audit_logs
3. numbering / approval / task_items / notifications
4. BOM workbench
5. release / share / file_assets metadata

每一批都必須保留 API response contract 與 audit semantics。

### Phase 4: Staging Validation

- 建立 `AI_PDM_STAGING`。
- 跑 pre-migration target guard。
- 套用 migrations 與 seed。
- 跑 compare、RLS、advisor、Postgres-mode API regression、build、smoke。

### Phase 5: Production Cutover

- 建立 `AI_PDM_PROD`。
- 重跑 staging gate。
- 設定 production env：`PDM_DB_PROVIDER=postgres`。
- 跑 production smoke。
- 保留 SQLite rollback snapshot 與 env rollback plan。

### Phase 6: Supabase Storage Follow-up

Storage 另開任務，不併入 DB runtime completion。後續才處理 private bucket、upload/download/preview API、content hash、Google Drive flow retirement。

## 10. 驗收標準

- SQLite mode 與 Postgres mode 都通過 provider contract。
- Postgres-mode API regression 通過。
- `anon` / `authenticated` 不得直接存取 public base tables。
- 所有 public tables 必須 enable + force RLS。
- Supabase advisor 無未處理 P0/P1 blocker。
- Target guard 能阻擋非 AI_PDM target。
- Production smoke 證明正式 runtime 寫入並讀回 Supabase Postgres。
- Storage follow-up 明確獨立追蹤。

## 11. 2026-06-08 本機證據

- `npm.cmd run supabase:migrations:sync`：PASS，產生 deterministic migration mirror。
- `npm.cmd run qc:supabase-runtime-migrations`：PASS，17/17。
- `npm.cmd run db:postgres:compare -- --no-write`：PASS，64/64 tables，0 missing，0 RLS missing。
- `npm.cmd run qc:postgres-shadow-target-guard`：PASS，11/11。
- `npm.cmd run qc:postgres-shadow`：PASS，22/22。
- `npm.cmd run lint`：PASS。
- `npm.cmd run build`：PASS，僅有既有 Turbopack NFT tracing warning。

## 12. 參考文件

- [PostgreSQL / Supabase Migration README](C:/VIBE%20CODING/AI_PDM/db/postgres/README.md)
- [Supabase migration mirror README](C:/VIBE%20CODING/AI_PDM/supabase/README.md)
- [RD Supabase DB Migration Development Plan](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/rd/rd-supabase-db-migration-development-plan-2026-06-08.md)
- [QA Supabase DB Migration Validation Plan](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-db-migration-validation-plan-2026-06-08.md)
- [QC Supabase DB Migration Fact-Check Plan](C:/VIBE%20CODING/AI_PDM/.ai-doc/qc/qc-supabase-db-migration-fact-check-plan-2026-06-08.md)
- [Supabase database connection docs](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase secure data docs](https://supabase.com/docs/guides/database/secure-data)
- [Supabase Storage access control docs](https://supabase.com/docs/guides/storage/security/access-control)
