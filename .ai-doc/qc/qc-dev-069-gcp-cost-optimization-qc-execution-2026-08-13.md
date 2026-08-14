# QC：DEV-069 GCP 成本最佳化續行驗證報告

日期：2026-08-13（Asia/Taipei）
角色：QC（獨立事實驗證）
Repo：`C:\VIBE CODING\AI_PDM\.worktrees\AI_PDM\DEV-069`
Branch：`codex/dev-069-cost-optimization`
Source HEAD：`93cb8170a6d43e100a21036f26d8ad922bc2c263`
Staging project：`jenfu-ai-pdm-stg-361825`
Region：`asia-east1`

## 1. 結論

結論：**STAGING QC PASS；整體 DEV-069 release gate 仍待 Production named-user canary／soak。**

本輪沒有修改 Production，沒有使用 Docker，沒有輸出或重用任何 token／cookie／Authorization header。Staging 已在驗證完成後回到 `STOPPED / NEVER`。

## 2. Gate 判定

| Gate | 判定 | 事實 |
|---|---|---|
| Static／RD regression | PASS | compatibility allowlist、PostgreSQL-safe migration 033、local QC 與 build/typecheck 已通過；既有 package、phase、JSONB 與 unified aggregate evidence 可追溯。 |
| Migration live contract | PASS | dry-run `b4p6w`、apply `m7587`、idempotence `x5s9d`、ledger `dph4b` 均成功；apply 套用 `021`～`033`，idempotence 無待套 migration。 |
| Named-user bootstrap | PASS | `ai-pdm-stg-migration-runner-5582g` 建立／讀回 `stg-pdm-admin-001`，9 roles、216 permissions，`allChecksPassed=true`。 |
| Runtime／entrypoint／unauth boundary | PASS | canonical `/login=200`、`/api/auth/mode=200`、`/api/auth/me=401`、`/api/numbering/permissions=401`；RWD 1440×900、390×844 均可載入。 |
| Staging stop／cost guard | PASS | Cloud SQL `STOPPED / NEVER`，backup/PITR/deletion protection 保留；Cloud Run min 0/max 2；forwarding rules 0；build IAM 僅為 Staging immutable build path 所需 grants。 |
| Authenticated Staging UI CRUD | PASS | 已使用已登入的 Staging Google session，完成 canonical UI 的 create → read → update → read → cancel/cleanup；取消後「進行中」清單為空，無 active fixture。 |
| Production canary／soak | NOT EXECUTED | 本輪沒有 Production named-user、主要流程或 10 分鐘 soak，Production 未變更。 |
| Billing | OUT OF SCOPE | 依使用者指示刪除本輪 QC acceptance，不判定 T+24/T+48/T+72 節費。 |

## 3. Live evidence 摘要

### 3.1 Immutable artifact 與 migration

- app image：`sha256:35fbbdb77f11cdbbdbff17c3553623a5809a1e28ecca3394e99e9bde350b84fa`
- Cloud Build：`86f845bd-f090-4236-8a9e-708e5ed24bea`，status `SUCCESS`；Cloud Run revision `ai-pdm-stg-00016-qwc` 接收 100% traffic。
- Privacy contract repair：source commit `93cb8170a6d43e100a21036f26d8ad922bc2c263`，source notice 對齊 DB immutable approved snapshot；content SHA-256 `94eccfc2b519db02e410c9fa057f582fae2f057eb03ce37cf0a77df4697b0d6d`。
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
- Cloud Build Staging prerequisites：Compute Service Account `1042387036944-compute@developer.gserviceaccount.com` 目前保留 `roles/logging.logWriter`（project）、`roles/storage.objectViewer`（Cloud Build bucket）與 `roles/artifactregistry.writer`（`ai-pdm` repo），供 immutable build path 使用；未修改 Production IAM。

### 3.3 Authentication boundary

- Browser session 顯示 `[鉦富]張仕杰 Jed，已登入`、角色 `系統管理員`；測試只使用既有登入 session，未輸入或保存 token、cookie、密碼或 OTP。
- canonical route：`/numbering/search?tab=reserved`。
- Create/read：建立 disposable fixture `QC DEV069 20260813 CRUD`，取得 `A0001-P01`、`A0001-M01`，畫面狀態 `編輯中`，detail 可讀回。
- Update/read：更新為 `QC DEV069 20260813 CRUD UPDATED`，toast `申請內容已更新`，list/detail 均讀回新名稱。
- Cleanup：取消申請並確認；toast `申請已取消`，狀態為 `已取消`，取消記錄保留歷史稽核且不再列於 `進行中`；切換 `進行中` 後 `目前沒有符合條件的編號申請`，無 active residue。
- Browser post-deploy smoke：工作台可載入，無 app `role=alert` 錯誤；唯一 console 訊息為 Chrome extension asynchronous-response noise，非應用程式錯誤。

## 4. 需保留的既有決策

- Staging 目前應維持 STOPPED；若下一輪 authenticated test 需要啟動，測試後仍須回到 `STOPPED / NEVER`。
- Restore 目前 live instance 不存在；歷史 restore reconciliation 與 cleanup chain 仍是 evidence，不重新建立付費 restore instance。
- Zonal residual risk 已保留 owner、RTO、RPO、授權角色與 Regional re-entry trigger；正式放量前仍需依 trigger 重新評估 Regional HA。
- Production／Staging ALB edge inventory 為 0；custom domain 未存在，不得宣稱 ready。
- Billing QC 項目已移除；本報告不以舊 billing report 或短期報表宣稱實際節費。
- Docker shadow QC 未執行；因使用者要求不要使用 Docker，改以 Cloud Build provider pipeline 與 Cloud Run VPC live evidence；未使用 Docker Desktop。

## 5. 下一個可驗收動作

1. 若要宣稱整體 `FINAL PASS`，另補 Production named-user canary 與 10 分鐘 soak；本輪不執行 Production 變更。
2. Staging 平時維持 `STOPPED / NEVER`；下一次驗證窗口需重複 start → migration／smoke → authenticated test → stop。

## 6. 證據索引

- QA 計畫與本輪 addendum：`.ai-doc/qa/qa-dev-069-gcp-cost-optimization-validation-plan-2026-08-12.md`
- 前一輪 QC：`.ai-doc/qc/qc-dev-069-gcp-cost-optimization-qc-execution-2026-08-12.md`
- migration compatibility：`config/platform/cloudsql-migration-history-compatibility.json`
- migration runner：`scripts/run-dev-046-cloudsql-migrations.mjs`
- migration package：`scripts/dev-046-cloudsql-migration-package.mjs`
- PostgreSQL-safe migration 033：`db/postgres/030_unified_drawing_aggregate.sql`
- generated build evidence：`output/dev-069-cloud-build/`
- generated migration package evidence：`output/dev-046-cloudsql-migration-runner-package/`

## 7. Final revalidation addendum (2026-08-13 21:40 Asia/Taipei)

本節 supersede 本文件前述「authenticated UI blocked」的即時狀態；第 2026-08-13 早期段落保留為歷史阻塞紀錄。

### 7.1 Final Staging authenticated evidence

- Cloud SQL 因測試暫時啟用，測試完成後已切回 `activationPolicy=NEVER`；最終 readback：`state=STOPPED`、`NEVER`、`db-f1-micro`、`ZONAL`、private IP `10.4.0.3`。
- 以既有 authenticated Chrome session 完成 named-user lifecycle：create → read → update → read → cancel/cleanup。
- Fixture：`QC DEV069 20260813 CRUD` → `QC DEV069 20260813 CRUD UPDATED`；取得 `A0001-P01` 與 `A0001-M01`。
- Cleanup pass rule：取消後狀態 `已取消`；`進行中` filter 無 fixture，畫面顯示 `目前沒有符合條件的編號申請`；取消記錄保留歷史稽核，故本證據稱為 zero active residue，不宣稱 physical delete。

### 7.2 Final deployment and contract evidence

- Source：`93cb8170a6d43e100a21036f26d8ad922bc2c263`；Cloud Build `86f845bd-f090-4236-8a9e-708e5ed24bea` `SUCCESS`。
- Cloud Run：`ai-pdm-stg-00016-qwc` receives `100%` traffic；image digest `sha256:35fbbdb77f11cdbbdbff17c3553623a5809a1e28ecca3394e99e9bde350b84fa`；min `0`／max `2`。
- Privacy contract drift repaired by restoring the DB-approved immutable v1.0 snapshot; content SHA-256 `94eccfc2b519db02e410c9fa057f582fae2f057eb03ce37cf0a77df4697b0d6`; local `typecheck` and privacy QC `20/20` passed。
- DEV-069 focused QC `17/17` passed; `git diff --check` passed。

### 7.3 Final scope verdict

`STAGING TOPOLOGY PASS / STAGING MIGRATION PASS / STAGING AUTHENTICATED CRUD PASS / STAGING STOP-COST GUARD PASS / PRODUCTION CANARY NOT EXECUTED / BILLING OUT OF SCOPE`。

因此，本次 Staging QC 已通過；不得把本報告擴大解讀為 Production release `FINAL PASS`。Production 未修改。

## 8. QC continuation addendum (2026-08-14 Asia/Taipei)

### 8.1 Local／no-Docker evidence

本次 IaC QC 使用本機 Terraform 1.14.5，不使用 Docker Desktop：

- `dev-069:iac-terraform-validate`：Production／Staging `valid=true`、`error_count=0`、`warning_count=0`。
- `qc:dev-069-gcp-cost-optimization`：`17/17 PASS`。
- `typecheck`、`git diff --check`：PASS。
- machine report：`terraform_static_validate_passed_no_plan_no_apply`、`productionActionPerformed=false`、`planExecuted=false`、`applyExecuted=false`、`destroyExecuted=false`。

### 8.2 Remote-state read-only evidence

以 `jedchang0308@jenfu.com.tw` 讀取兩套 GCS backend，state list 成功。Production／Staging refresh-only plan 均 exit 0；JSON 判定的 non-no-op resource action 為 0。remaining `resource_drift` 屬 computed/provider metadata（Artifact Registry time、Cloud Run execution metadata、IAM etag、OIDC normalization、Cloud SQL computed settings），不涉及成本目標的 tier、Zonal、activation policy、backup/PITR、private IP 或 edge resources。

注意：refresh-only output drift 仍存在歷史 gate summary／review target 與目前 variables defaults 的差異；這不是資源 drift，也不能改寫成正常 plan `No changes`。本輪未 apply refresh-only plan，避免將 output state 更新寫回 remote backend。

### 8.3 Live resource fact check

| Target | Readback |
|---|---|
| Production Cloud SQL | `RUNNABLE / db-f1-micro / ZONAL / ALWAYS`；private `10.42.0.2`；public IPv4 disabled；backup/PITR/deletion protection enabled |
| Staging Cloud SQL | `STOPPED / db-f1-micro / ZONAL / NEVER`；private `10.4.0.3`；public IPv4 disabled；backup/PITR/deletion protection enabled |
| Cloud Run | Production／Staging min `0`、max `2` |
| Edge inventory | Production／Staging forwarding rules、backend services、URL maps 均為 `0` |
| Restore | `ai-pdm-prod-restore-20260716a` exact target 回傳 Cloud SQL `404 instance does not exist`；主庫同窗口 healthy |

### 8.4 QC conclusion

`TOPOLOGY PASS / STAGING MIGRATION PASS / STAGING AUTHENTICATED CRUD PASS / PRODUCTION TOPOLOGY PASS / PRODUCTION AUTHENTICATED CANARY PENDING / BILLING OUT OF SCOPE`。

Production browser OAuth account chooser 在本輪未完成可追溯 session 回跳；因此 `QA069-011`（10 分鐘 named-user soak）與 `QA069-013`（named-user canary）維持 `NOT EXECUTED/PENDING`，不得以 `/login=200`、`/api/auth/mode=200` 或 unauth `401` 代替。Production 未修改。
