# ADR-SUPABASE-DB-001: Runtime Provider 與 Supabase Target 決策

日期：2026-06-08  
狀態：Superseded for staging/production execution by `ADR-PDM-ERP-PLATFORM-002`; historical compatibility evidence only
關聯任務：`DEV-SUPABASE-DB-001`  
關聯規格：`SPEC-SUPABASE-DB-001`

2026-07-13 superseding amendment：`ADR-PDM-ERP-PLATFORM-002` 已將 staging/production operational relational authority 改為 Google Cloud SQL PostgreSQL `asia-east1`。本 ADR 的 Supabase target、GATE-B、RLS、migration history 與 adapter 證據只保留為 historical/disposable compatibility evidence，不得再據此建立 production Supabase target。Local SQLite 與 provider-neutral PostgreSQL 工作仍可重用。

## Context

AI_PDM 已完成本機 runtime 資料重置，舊測試檔案、release packages、QC artifacts 與 handoff packages 不再需要遷移。現有系統仍以 SQLite runtime 運作，但 Postgres shadow schema、RLS baseline、target guard 與 compare QC 已存在。

目前可見 Supabase connector 內有 `ProJED` 與 `ProJED_TEST`，兩者不是 AI_PDM 專用 target，因此不可拿來承接正式遷移。

## Decision

1. 採 DB-first 遷移策略；Supabase Storage 延後另開任務。
2. 新建 AI_PDM 專用 target：`AI_PDM_STAGING` 與 `AI_PDM_PROD`。
3. Browser 不直接使用 Supabase Data API 存取 public base tables；仍透過 AI_PDM server API。
4. Server runtime 新增 `postgres` provider，保留 `sqlite` fallback。
5. Repository contract 改往 async DB interface，SQLite 先用 wrapper 過渡。
6. RLS baseline 採 deny-by-default：所有 public tables enable + force RLS，並 revoke `anon` / `authenticated` direct table grants。
7. Service role、database password、pooler URL 都視為 server-side secret。
8. Target guard 必須阻擋 `ProJED`、`ProJED_TEST` 及任何非 AI_PDM target。

## Alternatives Considered

### A. 直接把舊 SQLite runtime data 搬到 Supabase

不採用。2026-06-08 reset 後，舊 runtime rows 與檔案多屬測試 artifacts。搬遷會把假資料帶入正式系統，違背乾淨上線目標。

### B. 讓前端直接使用 Supabase Data API

不採用。AI_PDM 目前有 server-side role permission、workflow rules、audit 與 BOM/numbering domain rules。直接 Data API 會把授權邏輯拆散到 RLS policy，風險過高。現階段保留 server API 邊界。

### C. 只保留 Supabase shadow，不做 runtime cutover

不採用。`DEV-IND-007` 已完成 shadow readiness，但使用者目標是正式把資料庫由 Google Drive / local runtime 路徑升級到 Supabase。Shadow 只能作為驗證，不是終態。

### D. DB 與 Storage 同時遷移

不採用。DB runtime provider、RLS、backup/restore、pooler、advisor gate 已是高風險工作。Storage 另有 bucket policy、preview/download、content hash、Google Drive flow retirement，應獨立控管。

## Consequences

正面：

- Cutover 後資料庫 runtime 由 Supabase Postgres 承接。
- SQLite fallback 保留，降低切換風險。
- Target guard 與 deny-by-default RLS 降低誤用 target 與資料暴露風險。
- Production seed 可保持乾淨，不搬遷測試 artifacts。

代價：

- Repository 與 QC script 需要逐步 async 化。
- 需要建立 Supabase Postgres backup / restore drill。
- 需要 user cost confirmation 與新 target 建立流程。
- Supabase Storage 仍需 follow-up。

## Implementation Notes

- App runtime 使用 `PDM_POSTGRES_URL`。
- Migration / maintenance 使用 `PDM_POSTGRES_ADMIN_URL`。
- `PDM_SUPABASE_TARGET_NAME` 用於 target guard evidence。
- Supabase transaction pooler 模式下需避免 prepared-statement 相容性問題。
- `.env.example` 只列 key，不放任何 secret。

## References

- [SPEC-SUPABASE-DB-001](C:/VIBE%20CODING/AI_PDM/.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md)
- [Supabase Runtime Migration Plan](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/industrialization/supabase-runtime-migration-plan-2026-06-08.md)
- [Supabase database connection docs](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase secure data docs](https://supabase.com/docs/guides/database/secure-data)
