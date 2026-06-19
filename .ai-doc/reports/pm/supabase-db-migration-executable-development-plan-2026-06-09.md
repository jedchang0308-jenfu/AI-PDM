# AI_PDM Supabase 資料庫遷移可執行開發文件 - 2026-06-09

關聯 DEV task：`DEV-SUPABASE-DB-001`  
狀態：`In Progress`  
治理模式：PM-dev，並以 RD / QA / QC gate 驗證  
範圍：將 AI_PDM runtime database 由本機 SQLite / Google Drive 時代的 runtime 假設，逐步升級為 Supabase Postgres。Supabase Storage 另列後續工作流，不併入本次 DB cutover。

## 1. PM 決策

本次遷移採用 DB-first。

本機 `data` 目錄已完成 reset。先前盤點出的待遷移檔案候選皆屬測試型 runtime artifact，不是正式 PDM 生產資料。因此：

- 不遷移舊的 `submission_files`、`release_packages`、QC artifacts、handoff packages、backups，或已刪除的 defect register。
- Supabase DB 從乾淨 schema 加上受控 seed / baseline data 開始。
- Supabase Storage 初始保持空白，未來只有真實上傳資料才進入 Storage。
- SQLite 暫時保留為 local fallback、regression baseline、cutover rollback path。

這不是一次性轉換。未來仍會修改，但必須用 phase gate、QC evidence 與 cutover approval 控制。

## 2. 目前基準

已完成的本機基準與架構工作：

- `C:\VIBE CODING\AI_PDM\data` 已完成 full reset。
- `data/quality/defect-register.json` 已依決策刪除，並保留為 Git tracked deletion。
- `supabase/migrations` 已建立 Supabase migration mirror。
- `db/postgres` 已建立 Postgres schema mirror。
- 已建立 target guard，避免誤用非 AI_PDM target，例如 `ProJED` 與 `ProJED_TEST`。
- 已建立 `sqlite` / `postgres` async DB provider foundation。
- 已建立 async auth、audit、system settings、user、access-control、numbering permission pilot path。
- API route direct sync auth 與 sync numbering permission guard 已在 Phase 3AK 後於本機清除。

仍未完成：

- Domain repositories 仍有 sync DB helper usage。
- 本 workspace 尚未設定正式 Supabase staging / production project。
- 尚未對 live Supabase target 執行 Postgres-mode API regression。
- 尚未取得 Supabase security / performance advisor evidence。
- Production cutover、rollback drill、Supabase Storage follow-up 尚未完成。

## 3. 目標架構

Runtime access path：

```text
Browser
  -> Next.js server API
  -> provider-neutral repository / service layer
  -> AsyncDatabaseClient
  -> SQLite local fallback 或 Supabase Postgres
```

規則：

- Browser 不得取得 database password、service role key、pooler URL、migration credential。
- Server API 是應用程式唯一的 Supabase DB access path。
- Public Supabase tables 必須 enable RLS 並 force RLS。
- `anon` / `authenticated` roles 不得直接讀寫 base tables，除非未來另有明確設計與核准。
- `PDM_DB_PROVIDER=sqlite` 保留為 local fallback。
- `PDM_DB_PROVIDER=postgres` 必須搭配 `PDM_POSTGRES_URL`。
- `PDM_SUPABASE_TARGET_NAME` 必須指向已核准的 AI_PDM target。

禁止使用的 targets：

- `ProJED`
- `ProJED_TEST`
- 任何未被明確核准為 `AI_PDM_STAGING` 或 `AI_PDM_PROD` 的 Supabase project

## 4. 開發階段

### Phase 0 - Clean Baseline

狀態：本機已完成。

交付：

- 刪除 `data` 下的 runtime artifacts。
- 用 `npm.cmd run db:init` 重建乾淨 SQLite runtime。
- 除非測試場景明確需要，否則不執行 demo seed。
- 記錄 `data/quality/defect-register.json` 的 tracked deletion。

Gate：

- `git status --short -- data`
- `npm.cmd run db:init`
- `npm.cmd run db:postgres:compare -- --no-write`
- `npm.cmd run qc:postgres-shadow`
- `npm.cmd run build`

### Phase 1 - Migration Mirror and Target Guard

狀態：本機已實作，尚未 apply 到 live target。

交付：

- 將 `db/postgres/*.sql` mirror 到 `supabase/migrations`。
- 維護 migration manifest 與 hash check。
- 阻擋非 AI_PDM Supabase target。
- 文件化 RLS deny-by-default baseline。

Gate：

- `npm.cmd run supabase:migrations:sync`
- `npm.cmd run qc:supabase-runtime-migrations`
- `npm.cmd run qc:postgres-shadow-target-guard`
- `npm.cmd run db:postgres:compare -- --no-write`
- `npm.cmd run qc:postgres-shadow`

### Phase 2 - Async DB Provider Foundation

狀態：本機已實作。

交付：

- 透過 `PDM_DB_PROVIDER` 選擇 provider。
- SQLite async adapter。
- Postgres async adapter。
- named parameter normalization，支援 portable repository SQL。
- SQLite / Postgres 共同 transaction contract。

Gate：

- `npm.cmd run qc:db-provider-contract`
- `npm.cmd run qc:db-provider-postgres`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint -- --quiet`

### Phase 3 - Repository and Route Conversion

狀態：進行中。

已完成：

- API route sync auth guard migration 已進行到 Phase 3AK。
- API route sync numbering permission guard migration 已進行到 Phase 3AK。
- 每個受控切片後，本機 API regression 維持 green。

未完成：

- 將 sync domain repositories 轉為 provider-neutral async repositories。
- 保持 API response contract 不變。
- 為已遷移區域加入 static QC，避免重新引入 `@/lib/db` sync access。
- 在可行範圍內加入 SQL portability semantic QC。

建議下一個切片：

- Phase 3AL：將 item revision history 與 where-used read-only repository access 轉為 async / provider-neutral repository。
- 目標 routes：
  - `src/app/api/items/[partNumber]/revisions/route.ts`
  - `src/app/api/items/[partNumber]/where-used/route.ts`
- 需替換的 sync helpers：
  - `listItemRevisionHistory`
  - `listWhereUsed`

每個切片的 Gate：

- `npm.cmd run qc:access-control-async-repository`
- `npx.cmd tsc --noEmit`
- `npm.cmd run qc:managed-auth`
- `npm.cmd run lint -- --quiet`
- touched domain 的專屬 QC
- `npm.cmd run db:postgres:compare -- --no-write`
- `npm.cmd run qc:postgres-shadow`
- `npm.cmd run build`
- `npm.cmd run qc:api`

### Phase 4 - AI_PDM_STAGING Live Validation

狀態：尚未開始。

前置條件：

- 使用者確認 Supabase organization。
- 使用者確認 region。
- 使用者確認 cost。
- 核准 target name：`AI_PDM_STAGING`。

交付：

- 建立或指定 staging Supabase project。
- Apply migrations。
- 設定 server-only Postgres credentials。
- 執行 target guard。
- 執行 schema compare。
- 執行 RLS / advisor checks。
- 以 Postgres mode 執行 API regression。
- 記錄 rollback path。

Exit criteria：

- Migration history clean。
- 無 schema mismatch。
- RLS baseline 已 enforced。
- Security advisor 無 release blocker。
- Performance advisor 無 release blocker，或已記錄 remediation。
- API regression 在 Postgres mode 通過。
- SQLite fallback 仍通過 local regression。

### Phase 5 - AI_PDM_PROD Cutover

狀態：尚未開始。

前置條件：

- Phase 4 完成。
- Production cutover window 已核准。
- Rollback drill 已完成。
- Production secrets 僅存在 server-side。

交付：

- 建立或指定 `AI_PDM_PROD`。
- Apply migrations。
- Apply controlled production seed。
- 將 production runtime 設為 `PDM_DB_PROVIDER=postgres`。
- 執行 production smoke。
- 記錄 cutover evidence。

Exit criteria：

- Production smoke pass。
- Supabase advisors 無 release blocker。
- Rollback procedure 已證明可執行。
- PM / RD / QA / QC documents 已更新。

### Phase 6 - Supabase Storage Follow-up

狀態：刻意延後。

交付：

- Private bucket design。
- Upload / download / preview / signed URL APIs。
- Content hash 與 file metadata migration policy。
- Google Drive retirement plan。
- Storage-specific rollback / restore drill。

此階段只有在 DB runtime migration 穩定後才開始，避免 Storage 變更掩蓋 DB cutover 缺陷。

## 5. RD 實作規則

- 一次只轉換一個 bounded repository slice。
- 除非另有 spec change，不改 API response shape。
- SQL 必須兼容 SQLite 與 Postgres。
- 優先透過 `AsyncDatabaseClient` 使用 named parameters。
- 已遷移的 provider-neutral repository 不得直接使用 `better-sqlite3`、`getDb`、`@/lib/db`。
- Route files 維持 thin：auth、parameter validation、repository / service call、response。
- 每個已遷移切片都必須加 QC static checks。

## 6. QA 驗證計畫

QA 驗證行為，不只看實作形式。

必測：

- 未登入仍被阻擋。
- 角色限制與既有行為一致。
- Engineer scoping 與既有行為一致。
- Manager / Admin visibility 與既有行為一致。
- Empty result 行為一致。
- Validation errors 與 status codes 一致。
- CSV / XLS / PDF / file response headers 在相關場景中一致。
- SQLite fallback 仍可用。
- Staging / prod 前必須證明 Postgres-mode behavior。

Local gate：

- TypeScript
- lint
- build
- route / domain QC
- full `qc:api`
- Postgres shadow compare

Live gate：

- Supabase migration apply
- target guard
- security advisor
- performance advisor
- Postgres-mode API regression
- rollback drill

## 7. QC 事實查核計畫

QC 必須從檔案與 command output 查核事實。

Static checks：

- `src/app/api` 不再有 direct sync auth import / call。
- `src/app/api` 不再有 sync numbering permission guard call。
- 已遷移 repository slice 不 import `@/lib/db`。
- 已遷移 repository slice 使用 `AsyncDatabaseClient`。
- 已遷移 SQL 避免 provider-specific functions，除非有 guard 或測試覆蓋。
- Target guard 會阻擋 forbidden Supabase targets。

Runtime checks：

- SQLite local runtime 的 `qc:api` pass。
- Postgres shadow compare 無 schema mismatch。
- Supabase staging API regression 在 target 設定後 pass。
- Advisor output 已記錄並審查。

Evidence rule：

- Phase 不會因為 code compile 就算完成。
- Phase 必須同時具備 RD delivery、QA validation、QC fact-check、PM status evidence 才能完成。

## 8. 風險表

| 風險 | 影響 | 控制方式 |
|---|---|---|
| 測試 artifacts 被誤遷移 | Supabase baseline 被污染 | 已完成 full `data` reset；從 clean schema 與 controlled seed 開始 |
| 用錯 Supabase target | 可能破壞其他 project data | Target guard 阻擋 `ProJED`、`ProJED_TEST` 與未核准 target |
| Secrets 暴露到 browser | Credential compromise | DB URL 與 service credential 僅放 server-side |
| RLS 誤解 | Direct table exposure | Force RLS、deny direct access、跑 security advisor |
| SQLite / Postgres SQL 差異 | Runtime bug | Async provider contract、portable SQL、shadow compare、Postgres-mode regression |
| Repository conversion regression | 使用者流程破壞 | 一次一個 slice、保留 API contract、跑 domain QC 與 `qc:api` |
| Pooler transaction 行為不同 | Production instability | Staging 測 direct / session / transaction pooler 假設 |
| Cutover rollback 未證明 | 事故時間拉長 | 保留 SQLite fallback，production 前跑 rollback drill |
| Storage 與 DB cutover 混在一起 | Debug 困難 | Storage 延到 Phase 6 |

## 9. 未來修改政策

未來修改分三組。

Staging 前：

- 完成 domain read / write paths 的 provider-neutral async repository conversion。
- 擴充 static QC，阻擋已遷移區域重新使用 sync repository。
- 確認 Supabase organization、region、cost。

Production 前：

- 完成 `AI_PDM_STAGING` live migration 與 Postgres-mode API regression。
- 修正 advisor findings。
- 確認 backup、restore、rollback、production secret handling。

Production DB cutover 後：

- 實作 Supabase Storage。
- 退役 Google Drive runtime dependency。
- 將 backup / restore drill 納入例行作業。
- 依 Supabase performance advisor 補 index 與 slow-query remediation。
- 持續用 migrations 與 PM-dev evidence 管控 schema changes。

## 10. 完成定義

`DEV-SUPABASE-DB-001` 只有在下列條件都成立時才能標示完成：

- `AI_PDM_STAGING` live migration pass。
- `AI_PDM_STAGING` Postgres-mode API regression pass。
- Supabase security advisor 無 release blocker。
- Supabase performance advisor 無 release blocker，或 remediation 已核准。
- `AI_PDM_PROD` migration apply pass。
- Production runtime 使用 `PDM_DB_PROVIDER=postgres`。
- Production smoke pass。
- SQLite fallback 與 rollback drill 已證明可執行。
- Supabase Storage follow-up 已完成，或明確拆成新的 tracked DEV task。
- PM / RD / QA / QC documents 與 `.ai-doc/dev_task.md` 已記錄 final evidence。

## 11. 立即下一個 Gate

建議下一步：

1. 實作 Phase 3AL item revision history / where-used repository provider-neutral conversion。
2. 執行 local gate commands。
3. 更新 PM / RD / QA / QC evidence。

替代下一步：

1. 暫停 local repository conversion。
2. 請使用者確認 Supabase organization、region、cost。
3. 建立或設定 `AI_PDM_STAGING`。
4. 執行 live migration 與 Postgres-mode validation。

PM 建議：先繼續 Phase 3AL 本機 repository conversion，因為 sync repository usage 仍是 live Supabase staging regression 前的主要阻礙。
