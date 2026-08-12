# QC：DEV-069 GCP 成本最佳化續行驗證報告

日期：2026-08-13（Asia/Taipei）
角色：QC（獨立事實驗證）
Repo：`C:\VIBE CODING\AI_PDM\.worktrees\AI_PDM\DEV-069`
Branch：`codex/dev-069-cost-optimization`
Source HEAD：`391de27e93277d502bd1d24b879e06dea87d6b9b`
Staging project：`jenfu-ai-pdm-stg-361825`
Region：`asia-east1`

## 1. 結論

結論：**NOT FINAL PASS；平台與 migration gate 通過，authenticated UI gate 受外部登入設定阻塞。**

本輪沒有修改 Production，沒有使用 Docker，沒有輸出或重用任何 token／cookie／Authorization header。Staging 已在驗證完成後回到 `STOPPED / NEVER`。

## 2. Gate 判定

| Gate | 判定 | 事實 |
|---|---|---|
| Static／RD regression | PASS | compatibility allowlist、PostgreSQL-safe migration 033、local QC 與 build/typecheck 已通過；既有 package、phase、JSONB 與 unified aggregate evidence 可追溯。 |
| Migration live contract | PASS | dry-run `b4p6w`、apply `m7587`、idempotence `x5s9d`、ledger `dph4b` 均成功；apply 套用 `021`～`033`，idempotence 無待套 migration。 |
| Named-user bootstrap | PASS | `ai-pdm-stg-migration-runner-5582g` 建立／讀回 `stg-pdm-admin-001`，9 roles、216 permissions，`allChecksPassed=true`。 |
| Runtime／entrypoint／unauth boundary | PASS | canonical `/login=200`、`/api/auth/mode=200`、`/api/auth/me=401`、`/api/numbering/permissions=401`；RWD 1440×900、390×844 均可載入。 |
| Staging stop／cost guard | PASS | Cloud SQL `STOPPED / NEVER`，backup/PITR/deletion protection 保留；Cloud Run min 0/max 2；forwarding rules 0；temporary IAM grants 0。 |
| Authenticated Staging UI CRUD | BLOCKED-EXTERNAL-CREDENTIAL | `/api/auth/mode` 穩定回報 `googleOAuth.enabled=true`，但 browser click 後沒有可取得的 Google account-selection tab／既有 session；password login 需要未提供 credential。沒有把 bootstrap 或 unauth smoke 冒充 authenticated PASS。 |
| Production canary／soak | NOT EXECUTED | 本輪沒有 Production named-user、主要流程或 10 分鐘 soak，Production 未變更。 |
| Billing | OUT OF SCOPE | 依使用者指示刪除本輪 QC acceptance，不判定 T+24/T+48/T+72 節費。 |

## 3. Live evidence 摘要

### 3.1 Immutable artifact 與 migration

- app image：`sha256:d7f2d799888ffcce121176022e8d9e9479db714a58fd5924cb474186ac1aea78`
- migration image：`sha256:6f9ba17310054eb9c43bcd56f4c72ccd3c607e0690ab066318a89c23142d85d3`
- Job contract：`node scripts/run-dev-046-cloudsql-migrations.mjs --dry-run`；無 approval env vars。
- dry-run：execution `b4p6w`，target exact、31 migrations、`001`～`033`、`connectionAttempted=false`。
- apply：execution `m7587`，`connectionAttempted=true`，`021`～`033` 成功套用。
- idempotence：execution `x5s9d`，success，`appliedVersions=[]`。
- ledger：execution `dph4b`，31 rows，無 missing／duplicate／checksum drift。

### 3.2 Runtime 與成本邊界

- Cloud SQL：`ai-pdm-stg-postgres`；`STOPPED`、activation `NEVER`、`db-f1-micro`、`ZONAL`、private IP `10.4.0.3`、public IPv4 disabled、PITR enabled、14 retained backups、deletion protection enabled。
- Cloud Run：`ai-pdm-stg`；`Ready=True`、min 0、max 2、immutable app digest、VPC all-traffic。
- Firebase canonical：`https://jenfu-ai-pdm-stg-361825.web.app`。
- edge：Staging forwarding rules 0；custom domain 未宣稱 ready。
- temporary IAM：project 與 Cloud Build bucket 均查無 Cloud Build Compute Service Account 殘留 grant。

### 3.3 Authentication boundary

- UI login page 可開啟；穩定載入後 Google button 為 enabled，`/api/auth/mode` 回報 `googleOAuth.enabled=true`。點擊後進入「等待 Google 帳號選擇」，但 browser session 沒有可取得的 account-selection tab／既有登入狀態。
- 未登入 API：`/api/auth/me=401`、`/api/numbering/permissions=401`。
- password login 需要應用程式 credential；QC 未取得、未猜測、未建立或修改使用者密碼。
- 因此 `named-user create/read/update/read/cleanup` 尚無瀏覽器 authenticated evidence；本報告將它列為 external credential/config blocker。

## 4. 需保留的既有決策

- Staging 目前應維持 STOPPED；若下一輪 authenticated test 需要啟動，測試後仍須回到 `STOPPED / NEVER`。
- Restore 目前 live instance 不存在；歷史 restore reconciliation 與 cleanup chain 仍是 evidence，不重新建立付費 restore instance。
- Zonal residual risk 已保留 owner、RTO、RPO、授權角色與 Regional re-entry trigger；正式放量前仍需依 trigger 重新評估 Regional HA。
- Production／Staging ALB edge inventory 為 0；custom domain 未存在，不得宣稱 ready。
- Billing QC 項目已移除；本報告不以舊 billing report 或短期報表宣稱實際節費。
- Docker shadow QC 未執行；因 Docker Desktop engine 不可用且使用者要求不要使用 Docker，改以 Cloud Run VPC live evidence；這是範圍差異，不是 authenticated gate 的替代品。

## 5. 下一個可驗收動作

1. 由環境 owner 提供可用的 Google account-selection session，或提供已核准的測試用 password credential；QC 不自行建立或修改真實 named-user 密碼。OAuth configuration 本身已由 `/api/auth/mode` 驗證為 enabled。
2. 在 Staging 重新執行 authenticated login → permissions → disposable draft/candidate create → read → update → read → cleanup。
3. 取得零 active residue 證據後停止 Cloud SQL，重做 `STOPPED / NEVER` readback。
4. 若要宣稱整體 `FINAL PASS`，另補 Production named-user canary 與 10 分鐘 soak；本輪不執行 Production 變更。

## 6. 證據索引

- QA 計畫與本輪 addendum：`.ai-doc/qa/qa-dev-069-gcp-cost-optimization-validation-plan-2026-08-12.md`
- 前一輪 QC：`.ai-doc/qc/qc-dev-069-gcp-cost-optimization-qc-execution-2026-08-12.md`
- migration compatibility：`config/platform/cloudsql-migration-history-compatibility.json`
- migration runner：`scripts/run-dev-046-cloudsql-migrations.mjs`
- migration package：`scripts/dev-046-cloudsql-migration-package.mjs`
- PostgreSQL-safe migration 033：`db/postgres/030_unified_drawing_aggregate.sql`
- generated build evidence：`output/dev-069-cloud-build/`
- generated migration package evidence：`output/dev-046-cloudsql-migration-runner-package/`
