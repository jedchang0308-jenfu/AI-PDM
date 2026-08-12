# QA：DEV-069 GCP 成本最佳化 FMEA 與驗證計畫

日期：2026-08-12

角色：QA（定義風險、驗證門檻與證據契約；不修改產品碼、Terraform state 或 GCP 資源）

文件狀態：`QA Plan Ready / Live Platform Revalidated / Authenticated UI Blocked By Staging Auth Configuration / Production Canary Pending / Billing Removed From Current QC Scope`

本文件將需求中的「FEAM」依品質工程慣例解讀為 `FMEA`（Failure Mode and Effects Analysis，失效模式與效應分析）。先完成 FMEA，再由風險反推驗證案例。既有 QC 報告的核心實作 PASS 可作為證據來源，但不能取代本版新增的登入後主流程、Staging 寫讀閉環與 Billing 歸因驗證。

## 1. FMEA 分析

### 1.1 評分與優先級

| 維度 | 1 | 3 | 5 |
|---|---|---|---|
| S：嚴重度 | 幾乎無營運影響 | 成本、驗證或局部服務受影響 | 正式資料、安全邊界、不可逆資源或主要服務受影響 |
| O：發生度 | 已有強護欄、極少發生 | 需特定條件，仍可能發生 | 高機率或日常操作即可觸發 |
| D：難偵測度 | 變更前即可自動攔截 | 需 live readback 或人工比對 | 通常在使用者、資料或帳單受影響後才發現 |

`RPN = S × O × D`。優先級判定如下：

- `P0`：涉及正式資料、安全／權限、不可逆刪除或私網邊界且 `S=5`，或 `RPN >= 60`。
- `P1`：`RPN 40-59`，或直接阻斷正式入口、成本目標、Staging 發布閉環。
- `P2`：`RPN 20-39`，可帶著明確 owner 與期限觀察。
- `P3`：`RPN < 20`，例行監測即可。

`P0/P1` 每列都必須對應 Test ID、結果、UTC 時間、原始證據路徑與 residual owner；任一未通過，不得宣稱 `Final PASS`。

### 1.2 FMEA 風險表

| ID | 失效模式 | 可能原因 | 使用者／營運影響 | 偵測方式 | S | O | D | RPN | 優先級 | 對策／建議測試 |
|---|---|---|---|---|---:|---:|---:|---:|---|---|
| FMEA-01 | 在錯誤 project、SQL instance 或 Terraform backend 執行 | CLI context、變數或工作目錄沿用其他環境 | 變更錯誤環境，可能中斷或刪錯正式資源 | exact ID preflight、backend／workspace readback、證據 manifest | 5 | 2 | 4 | 40 | P0 | `QA069-001`、`QA069-005`；任何 ID 不一致立即停止 |
| FMEA-02 | Production 主庫被 replace／destroy，或成本變更夾帶未核准刪除 | saved plan 未受 allowlist 保護、state drift、provider 差異 | 正式資料遺失或長時間停機 | plan JSON parser、forbidden resource scan、final plan | 5 | 2 | 4 | 40 | P0 | `QA069-003`、`QA069-004`、`QA069-023`；replacement 必須為 0 |
| FMEA-03 | 備份／PITR 顯示開啟但實際不可復原 | 備份失敗、過期、restore 證據與現況不一致 | 故障後無法回復正式資料 | backup metadata、既有隔離 restore reconciliation、hash evidence | 5 | 2 | 4 | 40 | P0 | `QA069-006`、`QA069-027`；缺乏可用 restore 證據即 NO-GO |
| FMEA-04 | SQL 降規後 schema、migration、編號或權限資料漂移 | instance 變更、migration runner、錯誤 DB target | 使用者看到錯誤資料或正式編號失真 | migration ledger、唯讀資料不變量、角色權限取樣 | 5 | 2 | 4 | 40 | P0 | `QA069-008`、`QA069-017`；禁止只以 instance `RUNNABLE` 判定 |
| FMEA-05 | `db-f1-micro` 在真實預上線流量下 CPU／連線飽和 | 規格過低、冷啟動、查詢尖峰 | 登入後 timeout、5xx、操作延遲 | 受控 soak、Cloud SQL／Cloud Run metrics、error logs | 4 | 3 | 4 | 48 | P1 | `QA069-010`、`QA069-011`；連線必須維持在安全預算內 |
| FMEA-06 | Cloud Run revision、instance max 或 DB pool 漂移，連線總量超出 25 | 舊 revision 並存、pool env 未同步、startup config rollback | SQL 拒絕連線，連帶影響所有使用者 | live service readback、revision inventory、連線公式與峰值 metrics | 4 | 3 | 3 | 36 | P1 | `QA069-009`～`QA069-011`；驗證 `10 <= 17 < 25` |
| FMEA-07 | 移除 ALB 後 Firebase Hosting 正式入口失效 | rewrite、Cloud Run IAM、base URL 或 auth domain 不一致 | 使用者無法登入或開啟系統 | browser、HTTP、network、visible-error sweep | 4 | 2 | 2 | 16 | P1 | `QA069-012`、`QA069-019`；正式 canonical entrypoint 必須是 `web.app` |
| FMEA-08 | 未登入 smoke 通過，但登入後權限、session 或主要 PDM 流程失敗 | 只測 200／401，未測 named user 與 BFF session | 真實使用者無法工作，或發生權限外洩 | named-user canary、角色正負向、network payload | 5 | 3 | 4 | 60 | P0 | `QA069-013`、`QA069-018`；連結 DEV-032 Level 4 證據 |
| FMEA-09 | ALB chain 只刪部分，仍持續產生固定費用 | live resource、Terraform state 或跨環境殘留 | 成本未下降且未被立即察覺 | 8 類 live inventory、11 addresses state scan、Billing SKU | 3 | 3 | 4 | 36 | P1 | `QA069-022`、`QA069-023`、`QA069-029`～`031` |
| FMEA-10 | VPC、private service access、IAM、Secret、Firebase 資源被誤改 | 非 target drift 混入 apply | SQL 私網或登入中斷，安全邊界改變 | forbidden resource type scan、live private-IP readback | 5 | 1 | 4 | 20 | P0 | `QA069-004`、`QA069-007`、`QA069-016`、`QA069-023` |
| FMEA-11 | Terraform state 或舊 image 把 live 設定回滾 | 非 immutable artifact、refresh drift、錯誤 revision | 舊程式或高成本設定重新出現 | commit／digest manifest、Cloud Run revision readback、final plan | 4 | 3 | 3 | 36 | P1 | `QA069-001`、`QA069-003`、`QA069-009`、`QA069-023` |
| FMEA-12 | 低成本 Staging 無法完成完整發布驗證 | SQL 停止模式、migration、auth 或 Hosting 只驗證一半 | 正式上線前無可信 rehearsal 環境 | start → migrate → auth／write-read → smoke → stop 全循環 | 4 | 3 | 3 | 36 | P1 | `QA069-015`～`QA069-021`；缺任一步不算完整閉環 |
| FMEA-13 | Staging 驗證後未停止，或被非預期重新啟動 | cleanup 漏執行、排程／revision 殘留連線 | 無使用仍持續收 compute 費用 | activation policy、SQL state、Cloud Run instance 時序、Billing | 2 | 4 | 3 | 24 | P2 | `QA069-020`、`QA069-021`、`QA069-029` |
| FMEA-14 | migration dry-run 成功但 migration checksum／冪等性或目標 DB 錯誤 | runner 只回 Completed、未驗證 ledger | 下一次發布才發現 schema 不一致 | target identity、migration count／last ID／checksum、重跑零變更 | 5 | 2 | 4 | 40 | P0 | `QA069-008`、`QA069-017` |
| FMEA-15 | 刪錯 Restore 或誤認 Restore 已刪，主庫健康未同步確認 | instance 名稱相近、只看 delete operation | 正式主庫受損，或殘留儲存費用 | exact absent assertion與主庫 positive assertion同時執行 | 5 | 2 | 3 | 30 | P0 | `QA069-005`、`QA069-025`；負向與正向證據必須同時存在 |
| FMEA-16 | Production 改 Zonal 後遇單區故障，服務不可用 | 預上線成本策略主動放棄 Regional HA | 使用者無法連線，需人工復原／升規 | 故障桌上演練、監控與升回 Regional 決策時限 | 4 | 3 | 5 | 60 | P0 | `QA069-028`；屬已知 residual risk，正式放量前必須重評 |
| FMEA-17 | Cloud SQL proxy `startup_cpu_boost` 或其他非成本 runtime 設定漂移 | Terraform 未明示、provider refresh | 冷啟動延遲或 state 持續不收斂 | Terraform readback、revision template、final plan | 3 | 3 | 3 | 27 | P2 | `QA069-009`、`QA069-021` |
| FMEA-18 | 實際帳務未下降，或用總帳／折抵誤判節費 | Billing 延遲、SKU 歸因錯誤、部分日換算、credits 混入 | 錯估 ROI，持續支付未預期費用 | project + SKU + usage window 對帳；gross／effective 分列 | 3 | 4 | 4 | 48 | P1 | `QA069-029`～`QA069-031`；72h 前不得宣稱發票已下降 |
| FMEA-19 | 預期 proxy `invalidState` 被誤判為事故，或真實 5xx 被噪音掩蓋 | 只依 ERROR severity，不關聯 request/status/time window | 誤報造成不必要操作，或漏掉真故障 | log correlation、HTTP status、instance state、時間窗 | 3 | 3 | 4 | 36 | P1 | `QA069-014`、`QA069-021`；需逐筆分類並保留 query |
| FMEA-20 | `pdm.jenfu.com.tw`／`pdm-stg.jenfu.com.tw` 仍指向已拆 ALB，或被誤宣稱可用 | DNS TTL、文件／base URL 未同步、未來誤啟 custom domain | 使用者走到失效入口或 TLS 錯誤 | DNS／runtime URL／Firebase auth domain readback、deferred gate | 4 | 2 | 4 | 32 | P1 | `QA069-024`、`QA069-026`；未重建 edge 前不得宣稱 custom domain ready |
| FMEA-21 | 證據來自不同 commit／時間窗或缺少原始輸出 | 手工複製結論、未保存 SHA／UTC／target | 無法重現，錯誤把舊 PASS 套到新狀態 | evidence manifest、hash、UTC、command exit code | 3 | 3 | 4 | 36 | P1 | `QA069-001`、`QA069-032`；只有摘要文字不算證據 |
| FMEA-22 | cancelled drawing projection 佔住已回收 provisional code | canonical `drawings` 使用 unconditional `(company_id, drawing_number)` unique，與 candidate recycle contract 不一致 | 第二次 create／acquire 可能回傳 `numbering_conflict`，阻斷完整 cleanup／重用驗證 | SQLite／PostgreSQL schema parity、cancel→reuse runtime regression、migration checksum | 4 | 3 | 4 | 48 | P1 | `QA069-018`、新增 canonical reuse regression；歷史值 immutable、active projection partial unique |

### 1.3 FMEA 結論與優先處置

1. **不可逆與資料保護風險最高**：錯環境、主庫 replacement、備份不可復原、刪錯 Restore 必須由 exact-target、saved-plan negative gate 與 restore evidence 三層攔截。
2. **現有 smoke 尚未覆蓋真實使用能力**：`/login=200` 與 unauth `401` 只能證明入口和未登入邊界，不能證明 named-user session、權限與主要讀取流程。
3. **Staging 的「完整能力」必須包含受控寫入／讀回**：只有啟庫、migration dry-run 與 unauth smoke，仍不足以證明發布驗證能力完整。
4. **Zonal 是主動接受的高 residual risk**：預上線期間可接受，但需有監控、人工升回 Regional 的時限與正式放量前 re-entry gate。
5. **節費效益屬延遲證據**：目前只能保留月省約 `NT$3,749`、年化約 `NT$44,988` 的估算；需以 24–72 小時後的 project／SKU 用量完成事實判定。

## 2. 驗證計畫

### 2.1 目標與範圍

驗證 DEV-069 在降低未正式放量固定成本後，仍符合以下契約：

- Production：`jenfu-ai-pdm-prod / ai-pdm-prod-postgres` 為 `RUNNABLE / db-f1-micro / ZONAL / ALWAYS`。
- Staging：`jenfu-ai-pdm-stg-361825 / ai-pdm-stg-postgres` 平時為 `STOPPED / db-f1-micro / ZONAL / NEVER`，且可完成一次完整發布驗證循環。
- 兩環境 Cloud Run：`min=0 / max=2 per revision / pool max=2`，immutable image digest 不變。
- Production Firebase Hosting `https://jenfu-ai-pdm-prod.web.app`、Staging Firebase Hosting `https://jenfu-ai-pdm-stg-361825.web.app` 為目前 canonical entrypoint；external ALB live count 與 Terraform state count 均為 0；custom domain deferred。
- Production 主庫保留 private IP、backup、PITR、deletion protection；Restore target 精確 absent。
- Billing 不列入本輪 QC acceptance；若日後要驗證成本實效，另開 PM／Finance monitoring task。

不在本計畫內直接執行：Terraform apply、SQL delete、ALB delete、新建付費 restore drill、修改 IAM／Secret／Firebase／VPC、Production 業務資料寫入。若 QC 需要上述動作，必須另走 release gate 與授權。

### 2.2 既有證據與本版新增缺口

| 項目 | 2026-08-12 既有證據 | 本版判定 |
|---|---|---|
| Terraform／靜態契約 | DEV-069 `17/17`；Production／Staging validate 0 error／0 warning | 可作 baseline，需綁定 commit 與重新執行記錄 |
| Production SQL／Cloud Run | Micro、Zonal、RUNNABLE、max/pool 2/2、`max_connections=25` | 核心 topology 有證據；需補受控流量與 named-user canary |
| Staging release cycle | 啟動、migration dry-run、`jenfu-ai-pdm-stg-361825.web.app` smoke、停止 | 缺 authenticated session 與 disposable write-read 閉環 |
| ALB／Restore | 8 類 live count 0、11 state addresses 0、Restore absent | 已有核心證據；需補 DNS／入口誤宣稱檢查 |
| Billing | 僅估算月省 `NT$3,749` | 本輪 QC scope 已移除；不判定 PASS／FAIL |

### 2.3 Entry criteria

- QC 使用獨立身分取得必要 read-only 權限；不得沿用 RD 的未記錄 shell context。
- 工作樹、branch、commit SHA、UTC 起始時間、`gcloud config` project、Terraform backend 都已寫入 evidence manifest。
- 兩個環境的 remote state 可讀，且執行前沒有未審查的 target drift。
- Production 最新成功 backup、PITR 與 deletion protection 可讀。
- Staging 驗證窗口、可停止資料庫的授權與 disposable test data cleanup owner 已確認。
- `QA069-013` 有核准的 Production named-user test account；`QA069-018` 有 Staging test account。缺少帳號時標記 `BLOCKED-EXTERNAL-CREDENTIAL`，不可用 unauth smoke 代替。
- 若未來另開成本 monitoring，Billing report 或 Billing Export 才需依 project、service、SKU、usage time 與 credits 分組。

### 2.4 測試資料需求

| 資料 | 用途 | 限制 |
|---|---|---|
| Production named-user | 登入、session、permissions、唯讀主要流程 | 不建立正式編號、不異動正式業務資料 |
| Staging named-user | 完整發布驗證 | 只建立可清除的 draft／candidate；不得發布正式編號 |
| Staging disposable fixture | write → read → cleanup | 記錄 fixture ID、建立者、建立／刪除 UTC 與 cleanup 結果 |
| Production backup ID／operation | 復原能力證據 | 必須是成功且早於成本變更；目前 baseline 為 `1786527874220` |
| 既有 restore reconciliation | 證明備份曾可復原 | 連結 2026-07-16 reconciliation 與 hash equality；不在本輪重建付費 instance |
| Cloud Run image digest／revision | 防止 state 回滾 | Production／Staging 各記錄 immutable digest 與 Ready revision |
| Billing hourly／daily rows | 驗證成本實效 | 同時保留 gross cost、credits、effective cost；不得只截總額 |

### 2.5 Gate 與測試案例

#### G0 — 身分、靜態契約與 plan safety

| Test ID | 方法 | Pass rule | 必備證據 | 對應 FMEA |
|---|---|---|---|---|
| QA069-001 | 建立 evidence manifest：repo root、branch、SHA、dirty status、UTC、operator、gcloud account／project、Terraform backend | 所有欄位存在；project 與環境 exact match；工作樹差異有說明 | `manifest.json`、`git-status.txt`、context readback | 01、11、21 |
| QA069-002 | 執行 DEV-069 Terraform validate、focused QC 與相關 DEV-032／046 regression | 全部 exit 0；assertion count 與 log 完整 | command logs、exit codes | 02、06、07、10、11 |
| QA069-003 | 對既有 saved plan 及 parser negative fixtures 驗證：replace、unexpected change、wrong SQL tier、wrong activation policy、wrong Cloud Run max/pool | 真實 plan 通過；每個 mutation fixture 必須 fail closed | plan JSON、verifier logs、fixture diff | 02、11 |
| QA069-004 | 掃描 forbidden types：VPC、subnet、private service access、service networking、Secret、Firebase、Identity Platform、project IAM | add／update／delete／replace 均為 0 | normalized plan inventory | 02、10 |
| QA069-005 | 對 Production／Staging／Restore exact project + instance 做正負向 target preflight | 兩個主庫存在且 ID 正確；Restore ID 只允許 absent | gcloud JSON readback | 01、15 |

#### G1 — Production 資料保護、容量與真實入口

| Test ID | 方法 | Pass rule | 必備證據 | 對應 FMEA |
|---|---|---|---|---|
| QA069-006 | 讀取最新成功 on-demand／automated backup、PITR 與 retention metadata | 至少一個變更前成功 backup；PITR enabled；時間與 ID 可追溯 | backup JSON、SQL settings JSON | 03 |
| QA069-007 | 讀取 SQL state、tier、availability、activation、IP、deletion protection | `RUNNABLE / db-f1-micro / ZONAL / ALWAYS`；public IPv4 disabled；private IP present；deletion protection enabled | SQL instance JSON | 02、10 |
| QA069-008 | 以唯讀 migration runner／SQL 查核 target DB、PostgreSQL 17、migration ledger、last migration、必要資料不變量 | target exact；migration ledger 無缺號／重複／checksum 異常；既有 baseline 不變 | runner execution、sanitized query result、baseline diff | 04、14 |
| QA069-009 | 讀取 Cloud Run service／revision／digest／min-max／pool／startup boost | Ready=True；immutable digest 符合 release；min=0、max=2、pool=2；startup boost 符合 IaC | service JSON、revision JSON、digest manifest | 06、11、17 |
| QA069-010 | 重算連線安全預算：同時 revision、每 revision instances、pool、admin reserve，並和 live `max_connections` 比較 | 計算峰值 `10`；allowed `17`；`10 <= 17 < 25`；無未計入的 active revision | formula sheet／JSON、SQL readback | 05、06 |
| QA069-011 | 以預上線代表性低流量做 10 分鐘 named-user read-only soak，觀察 request、DB connection、CPU 與 errors | HTTP 5xx=0、DB connection error／timeout=0、peak connections <=17；Cloud Run 不超過計算上限；DB CPU >=90% 持續 5 分鐘為 FAIL，>=70% 持續 5 分鐘為 warning | request result、metrics export、log query | 05、06 |
| QA069-012 | 由瀏覽器與 HTTP 驗證 `https://jenfu-ai-pdm-prod.web.app`：`/login`、`/api/auth/mode`、unauth permissions、hard reload、1440px／390px visible-error sweep | `/login=200`、auth mode=200、unauth permissions=401；無 5xx、route error、空白畫面或非預期 alert | screenshot、network／console、HTTP log | 07 |
| QA069-013 | 核准 named user 執行 login → session → permissions → 一個主要清單 → 一個 detail 唯讀 canary；含未授權角色負向案例 | 授權角色成功；未授權角色 403／受控拒絕；無跨角色資料外洩、5xx 或 session loop | redacted HAR、screen record／screenshots、DEV-032 Level 4 evidence link | 08 |
| QA069-014 | 查變更後 Cloud Run／SQL logs，關聯 HTTP status、revision、instance state 與時間窗 | 非預期 ERROR／5xx=0；每筆 proxy `invalidState` 有停庫時間關聯且無對應 request failure | logging query、raw JSON、classification table | 19 |

#### G2 — 低成本 Staging 完整發布驗證循環

| Test ID | 方法 | Pass rule | 必備證據 | 對應 FMEA |
|---|---|---|---|---|
| QA069-015 | 驗證初始 idle state | SQL=`STOPPED / NEVER / db-f1-micro / ZONAL`；Cloud Run min=0 | pre-cycle JSON | 12、13 |
| QA069-016 | 以核准 SQL-only saved plan 啟動 Staging 並做 live readback | plan 只更新 activation；SQL 在時限內 `RUNNABLE`；private IP、backup、PITR 不變 | plan verifier、apply evidence、SQL JSON | 10、12 |
| QA069-017 | 執行 migration dry-run／冪等性與 ledger check | target exact、execution successful；第二次 dry-run 無待套 migration；ledger／checksum 無漂移 | runner execution、query result | 04、12、14 |
| QA069-018 | named user 執行登入、permissions、disposable draft/candidate create → read → update → read → cleanup | 每步符合權限；讀回與輸入一致；cleanup 後零殘留；未建立正式編號 | API／browser evidence、fixture manifest、DB/API zero-delta | 08、12 |
| QA069-019 | 驗證 Staging `https://jenfu-ai-pdm-stg-361825.web.app` entrypoint、hard reload、API rewrite、1440px／390px visible errors | HTTP／browser 無 5xx、route error、空白畫面或非預期 alert | screenshots、network／console、HTTP results | 07、12 |
| QA069-020 | 以 SQL-only saved plan 切回 `NEVER` 並等待停止 | plan 只更新 activation；SQL=`STOPPED / NEVER`；fixture 已清理 | plan verifier、SQL JSON、cleanup result | 12、13 |
| QA069-021 | 停庫後觀察一個縮容窗口，檢查 Cloud Run instances、DB restart 與 proxy logs | 無非預期 DB restart、HTTP 5xx 或持續 instance；`invalidState` 只可依規則列 expected noise | metrics timeline、logs、classification | 12、13、17、19 |

#### G3 — ALB、DNS、Restore 與 state convergence

| Test ID | 方法 | Pass rule | 必備證據 | 對應 FMEA |
|---|---|---|---|---|
| QA069-022 | Production／Staging 清點 forwarding rules、HTTP proxy、HTTPS proxy、URL maps、managed SSL cert、backend services、edge IP、serverless NEG | 兩環境 8 類 live count 各為 0 | resource inventory JSON | 09 |
| QA069-023 | 讀取兩個 remote state 的 11 個 edge addresses，並執行 DEV-069 targeted final plan | edge address count=0；兩環境 `No changes`、exit 0；無 forbidden drift | state list、plan text／JSON | 02、09、10、11 |
| QA069-024 | 查 `pdm.jenfu.com.tw`、`pdm-stg.jenfu.com.tw` DNS 與已刪 edge IP／TLS 宣稱 | 不得仍導向已刪 edge IP；若 DNS 尚存在，文件與 UI 不得宣稱 ready，並建立 owner | DNS output、old edge IP evidence、decision record | 20 |
| QA069-025 | 精確查 `ai-pdm-prod-restore-20260716a` absent，同時正向查 `ai-pdm-prod-postgres` healthy | Restore=`NOT_FOUND`／明確 absent；主庫仍 `RUNNABLE` 且 protection 完整 | 同一 UTC window 的兩份 JSON | 15 |
| QA069-026 | 檢查 Production／Staging runtime public base URL、session issuer、Firebase auth domain 與 IaC custom-domain flag | Production／Staging 分別使用正確 project web.app；external ALB flag=false；custom domain 為 deferred | Terraform values、Cloud Run env redacted readback | 07、20 |

#### G4 — 復原與 Zonal residual risk

| Test ID | 方法 | Pass rule | 必備證據 | 對應 FMEA |
|---|---|---|---|---|
| QA069-027 | 稽核 2026-07-16 隔離 restore reconciliation、hash equality、備份來源與 cleanup | 四者可串成同一 chain of evidence；hash equality 成立；不得把已刪 Restore instance 當唯一 recovery path | reconciliation、hash、backup source、cleanup evidence | 03 |
| QA069-028 | 桌上演練「Zonal SQL 不可用」：告警 → 停止發布 → 溝通 → restore／升回 Regional 決策 → 驗證入口 | owner、RTO 目標、授權人、Terraform rollback 路徑與驗證清單完整；正式放量前有 HA re-entry trigger | signed tabletop record、rollback plan | 16 |

#### G5 — Billing 24–72 小時效益驗證

| Test ID | 方法 | Pass rule | 必備證據 | 對應 FMEA |
|---|---|---|---|---|
| QA069-029 | `T+24h` 依 project + service + SKU + usage time 查 gross／credits／effective cost，建立變更前後 hourly baseline | 可辨識 ALB、Restore storage、Regional SQL 舊 SKU 是否停止新增；資料仍延遲時標 `PENDING`，不可硬判 PASS | exported CSV／BigQuery query、report screenshot、filter manifest | 09、13、18 |
| QA069-030 | `T+48h` 重複歸因，計算 post-change hourly run-rate 與 rolling completeness | targeted deleted-resource SKU 無持續新增；新 Zonal micro 使用量與 topology 一致；若仍不完整維持 `PENDING` | normalized comparison、公式 | 05、09、18 |
| QA069-031 | `T+72h` 完成月化：`post-change average hourly gross × 730`，另列 credits 後 effective；比較目標 `NT$550/月` 與月省 `NT$3,749` | 方向一致，且相對估算偏差 <=20%；偏差 >20% 或已刪資源仍計費則 FAIL 並建立後續 DEV／CAPA；provider 仍未回傳則 `BLOCKED-BILLING-LATENCY` | billing table、公式、異常 ticket／CAPA link | 09、18 |

#### G6 — 最終證據與追溯

| Test ID | 方法 | Pass rule | 必備證據 | 對應 FMEA |
|---|---|---|---|---|
| QA069-032 | 建立 QC final report，逐列連結 FMEA → Test ID → result → evidence → residual owner；校驗檔案 hash | P0/P1 100% 有結果；證據同一 SHA／時間窗；無 secret/token；未執行項目不能標 PASS | `final-report.md`、`sha256.txt`、coverage table | 21 與全部 P0/P1 |

### 2.6 建議執行順序與命令

先執行完全唯讀／本機 gate，再做受控 Staging cycle、Production canary，最後等待 Billing。QC 不得因 plan 內容看似正確而跳過 live readback。

```powershell
npm.cmd run dev-069:iac-terraform-validate
npm.cmd run qc:dev-069-gcp-cost-optimization
npm.cmd run qc:dev-032-production-iac-package
npm.cmd run qc:dev-032-production-target-contract
npm.cmd run qc:dev-046-firebase-hosting-entrypoint
npm.cmd run qc:dev-046-phase1a
npm.cmd run qc:dev-046-phase2a
git diff --check
```

Saved plan 必須逐 phase 驗證，不接受人工目視取代 parser：

```powershell
npm.cmd run dev-069:verify-terraform-plan -- --phase=production-runtime --plan=<production-runtime-plan.json>
npm.cmd run dev-069:verify-terraform-plan -- --phase=production-cost --plan=<production-cost-plan.json>
npm.cmd run dev-069:verify-terraform-plan -- --phase=staging-validation --plan=<staging-validation-plan.json>
npm.cmd run dev-069:verify-terraform-plan -- --phase=staging-stop --plan=<staging-stop-plan.json>
```

Live resource readback 應以 JSON 保存，不只截圖。至少包含：

```powershell
gcloud sql instances describe ai-pdm-prod-postgres --project=jenfu-ai-pdm-prod --format=json
gcloud sql instances describe ai-pdm-stg-postgres --project=jenfu-ai-pdm-stg-361825 --format=json
gcloud run services describe ai-pdm-prod --project=jenfu-ai-pdm-prod --region=asia-east1 --format=json
gcloud run services describe ai-pdm-stg --project=jenfu-ai-pdm-stg-361825 --region=asia-east1 --format=json
gcloud sql backups list --instance=ai-pdm-prod-postgres --project=jenfu-ai-pdm-prod --format=json
```

上述命令不含 apply／delete。若命令版本或欄位不同，QC 應記錄實際 `gcloud version` 與替代 read-only command，不得省略 evidence。

### 2.7 可量化通過門檻

| Gate | PASS | FAIL／BLOCKED |
|---|---|---|
| Static／plan | validate 與 regression 全部 exit 0；0 replace；0 unexpected；0 forbidden | 任一非 0、replacement、forbidden 或未解釋 drift |
| Production protection | 主庫 exact、backup successful、PITR／private IP／deletion protection 保留 | 缺任一保護、target identity 不明 |
| Capacity | 計算峰值 10 <= allowed 17 < max 25；soak 無 connection error／timeout | peak >17、連線錯誤、DB CPU >=90% 持續 5 分鐘 |
| Hosting／auth | unauth boundary正確；named-user positive／negative 都有證據；0 5xx | 只有 unauth smoke、session loop、權限外洩或 5xx |
| Staging release | start、migration、auth、write-read、cleanup、smoke、stop 全通過 | 缺任一步、fixture 殘留、無法回 STOPPED |
| Edge／Restore | 8 類 live=0、11 state address=0、Restore absent、主庫 healthy | 任一殘留、刪錯 target、custom domain 被誤宣稱 ready |
| Billing | 本輪不列入 QC acceptance | 若日後重開，另依 PM／Finance monitoring task 判定 |

### 2.8 狀態語意

- `TOPOLOGY PASS`：DEV-069 即時 infrastructure、data protection、edge、state convergence 的 P0/P1 已通過。
- `OPERABILITY CONDITIONAL PASS`：topology 通過，但 Production Level 4 或 Staging authenticated write-read 仍缺證據。
- `COST BENEFIT OUT OF SCOPE`：依使用者指示，本輪不以 Billing usage 判定成本效益。
- `FINAL PASS`：所有本輪 in-scope P0/P1、完整 Staging cycle、Production named-user canary 都通過；Billing 不在本輪 acceptance。
- `FAIL`：任一 P0 失敗、資料／權限／主要入口受損、費用偏差超過門檻或已刪資源持續計費。
- `BLOCKED`：外部帳號、provider operation 或權限無法取得；不得把 blocked 轉寫為 pass。

在第 5 節新增執行證據前，baseline 只能判定：`TOPOLOGY PASS / OPERABILITY CONDITIONAL PASS / COST BENEFIT OUT OF SCOPE`；本輪最終執行判定以第 5 節 addendum 與 QC 報告為準。

### 2.9 Stop／NO-GO conditions

- CLI project、Terraform backend 或 instance identity 不一致。
- Production SQL 出現 replace／destroy，或任何 VPC、private service access、IAM、Secret、Firebase、state backend 未核准變更。
- backup／PITR／private IP／deletion protection 任一缺失。
- Hosting 5xx、named-user session／permissions 失敗、跨角色資料外洩。
- migration ledger、checksum、正式編號／資料不變量出現差異。
- 連線峰值超出 17、出現 connection error／timeout，或 DB CPU >=90% 持續 5 分鐘。
- Staging 無法完成 authenticated write-read-cleanup，或驗證後無法回到 `STOPPED / NEVER`。
- Restore target 判定不明、主庫 positive assertion 缺失。
- 本輪不以 Billing SKU 作 stop condition；若日後重開成本 monitoring，另依 PM／Finance task 定義 stop condition。

停止後由 QC 保留原始證據並通報 PM／RD；是否 rollback、升規或建立 CAPA 由 release owner 決策，QA 不直接修改環境。

### 2.10 Evidence contract

建議輸出至 `output/qc/dev-069/<UTC-run-id>/`：

```text
manifest.json
git-status.txt
local-validation.log
terraform-plan/
  production-runtime.json
  production-cost.json
  staging-validation.json
  staging-stop.json
live/
  production-sql.json
  staging-sql-before.json
  staging-sql-running.json
  staging-sql-stopped.json
  cloud-run-production.json
  cloud-run-staging.json
  edge-inventory.json
  restore-and-primary-readback.json
browser/
  production/
  staging/
logs/
  production-errors.json
  staging-stop-window.json
billing/
  t-plus-24h.csv
  t-plus-48h.csv
  t-plus-72h.csv
  calculation.md
fmea-coverage.csv
final-report.md
sha256.txt
```

每份證據需包含 command／query、UTC、target project、exit code、原始輸出或可重現 export。Token、cookie、Authorization header、Secret 值與個資必須遮蔽；只提供摘要或人工轉述不算可重現證據。

## 3. QA → QC 交接

QC 應依 `G0 → G1 → G2 → G3 → G4 → G5 → G6` 執行並做獨立事實判定。若沿用 2026-08-12 既有 QC 證據，必須先核對 commit、resource ID、UTC 與 hash；新增缺口 `QA069-011`、`013`、`018`、`024`、`027`～`031` 不得因舊報告為 PASS 而略過。

本輪不以 Billing observation 作為 QC acceptance；若日後恢復成本事實驗證，必須另開 PM／Finance monitoring task。Zonal residual risk 已由使用者接受，並保留 owner 與 Regional re-entry trigger 作為後續控制。

## 4. 本輪 scope amendment（2026-08-12）

依使用者指示，`QA069-029`～`QA069-031` 的 Billing T+24／T+48／T+72 不再是本輪 QC acceptance item，也不得作為本輪 QC blocker。原測試定義保留作為未來 PM／Finance monitoring 參考，不回填本輪 `PASS` 或 `FAIL`，不在本輪 QC 報告宣稱實際節費。

## 5. QC execution addendum（2026-08-12 21:34 UTC+8）

- `QA069-016 PASS WITH UI-ONLY VARIANCE`：第二輪 Staging start operation `21:11:50→21:19:16` 完成並取得 RUNNABLE。
- `QA069-017 PASS WITH BASELINE LEDGER`：fresh migration dry-run execution `ai-pdm-stg-migration-runner-t448h` 於 `21:21:40→21:22:00` 成功，1/1 task；未執行 migration apply。
- `QA069-018 FAIL / PARTIAL CLEANUP PASS`：principal `stg-pdm-admin-001` named-user 登入成功；主要 `/numbering/request` 寫入出現 `operator does not exist: jsonb ~~ unknown`，搜尋確認正式資料為 0。替代候選草稿 `QC-DEV069-20260812-212700` 已完成 create／read／void cleanup，active residue 為 0；因未完成主要路徑及 update → read，本項維持 FAIL。
- `QA069-020 PASS WITH UI-ONLY VARIANCE`：第二輪 stop operation `21:33:06→21:34:09` 完成，終態 `STOPPED / NEVER`。
- `QA069-021 PARTIAL PASS`：停庫後 canonical Hosting／auth mode 為 200、unauth permissions 為 401；完整 shrink／log soak 尚未補齊。
- `QA069-028 PASS WITH ACCEPTED RESIDUAL RISK`：使用者已明確接受現階段 Zonal 架構風險；任一既定 Regional re-entry trigger 成立即重新評估 Regional HA。

整體狀態更新為：`TOPOLOGY PASS / STAGING OPERABILITY FAIL / PRODUCTION OPERABILITY INCOMPLETE / COST BENEFIT OUT OF SCOPE`。詳細事實、變更邊界與 evidence index 以 QC 執行報告為準。

## 6. RD fix revalidation addendum（2026-08-12 22:05 UTC+8）

- 原 live `jsonb ~~ unknown` 已定位為 Staging image 與目前 source 不一致；source regression scan 確認現行 JSONB search 均先 cast 為 text，combined create-and-acquire path 仍由同一 state-flow command 經手。
- 新發現並修正 canonical reuse defect：取消 projection 保留 immutable `drawing_number`，但 active unique namespace 排除 `cancelled`；PostgreSQL 以 migration 033 落地，SQLite bootstrap／backfill 同步。
- Local evidence：runtime 8/8、HTTP 21/21、unified aggregate 7/7、JSONB 3/3、DEV-069 17/17、typecheck/build exit 0。
- QA 判定：`LOCAL RD FIX PASS / LIVE STAGING REVALIDATION OPEN`。必須以 current immutable image 與 reviewed migration 033 完成 Staging start → migration → named-user create/read/update/read/cleanup → stop，才可改判 `QA069-018 PASS`。

## 7. QC execution addendum (2026-08-13)

本節記錄 GCP authentication 恢復後的續行驗證；不覆寫 2026-08-12 的歷史執行紀錄。

### 7.1 已完成且可重現的 live evidence

- Migration image 使用 immutable digest `sha256:6f9ba17310054eb9c43bcd56f4c72ccd3c607e0690ab066318a89c23142d85d3`；app image 使用 immutable digest `sha256:d7f2d799888ffcce121176022e8d9e9479db714a58fd5924cb474186ac1aea78`。
- Migration dry-run execution `b4p6w` 成功；target 為 `jenfu-ai-pdm-stg-361825 / ai_pdm`，migration count 31，涵蓋 `001`～`033`，未建立 DB connection。
- Migration apply execution `m7587` 成功；runner log 顯示 `connectionAttempted=true`，本輪套用 `021`～`033`，含 reviewed migration `033`。
- Idempotence execution `x5s9d` 成功；`appliedVersions=[]`。
- Ledger read-only execution `dph4b` 成功；31 筆 ledger、無缺號、無重複、無 checksum drift；既有 v001 歷史 checksum 由 Staging-only allowlist 明確控管。
- Named-user bootstrap execution `ai-pdm-stg-migration-runner-5582g` 成功；`stg-pdm-admin-001`、canonical role count 9、permission count 216、`allChecksPassed=true`。
- Migration Job 已恢復為 `node scripts/run-dev-046-cloudsql-migrations.mjs --dry-run`，無 approval environment variables。
- Staging Cloud SQL 最終為 `STOPPED / NEVER / db-f1-micro / ZONAL`；private IP、backup enabled、PITR enabled、14 retained backups 與 deletion protection 保留。Staging Cloud Run 為 `Ready=True`、min 0、max 2。
- Canonical HTTP smoke：`/login=200`、`/api/auth/mode=200`、未登入 `/api/auth/me=401`、未登入 `/api/numbering/permissions=401`。
- Browser RWD smoke：1440×900 與 390×844 均可載入 `/login`；browser session 已清理，viewport 已 reset。
- Staging forwarding rules 為 0；temporary Cloud Build Compute Service Account grants 在 project IAM 與 Cloud Build bucket IAM 均查無殘留。Production 未變更。

### 7.2 未通過／外部阻塞

- `QA069-018`：`BLOCKED-EXTERNAL-CREDENTIAL`，不是把 bootstrap mapping 當作 UI authenticated PASS。Staging login 顯示 Google OAuth「未開放：Google OAuth 憑證尚未完成設定」；password login 需要未提供的應用程式密碼。未輸入或保存密碼、OTP、token，也未繞過登入。
- 因 authenticated session 不可取得，尚未完成 UI/API 的 named-user permissions、disposable draft/candidate create → read → update → read → cleanup；不得宣稱 Staging authenticated operability 通過。
- `QA069-011`、`QA069-013`：Production named-user canary／10 分鐘 soak 仍未執行；此為 Production release gate 缺證據，不是本輪 Production 變更。
- `QA069-021`：已完成停庫後 canonical endpoint 與 SQL STOPPED readback，但未宣稱完整 post-stop soak PASS。
- 本機 Docker shadow QC 未執行；Docker Desktop engine 不可用且使用者已指定不使用 Docker。Cloud Run VPC live evidence 取代其環境檢查，但不把 local shadow 標為 PASS。

### 7.3 本輪判定

`TOPOLOGY PASS / MIGRATION AND PLATFORM OPERABILITY PASS / AUTHENTICATED STAGING UI BLOCKED / PRODUCTION OPERABILITY INCOMPLETE / COST BENEFIT OUT OF SCOPE`。

本輪不得標記 `FINAL PASS`。下一輪只需在 Staging 提供已核准的 Google OAuth configuration 或測試用 password credential，完成 authenticated write-read-cleanup；完成後再次執行 stop readback，再由 QC 重判 `QA069-018`。不需重做已通過的 migration ledger、immutable artifact 或 topology evidence，除非資源或 digest 改變。
