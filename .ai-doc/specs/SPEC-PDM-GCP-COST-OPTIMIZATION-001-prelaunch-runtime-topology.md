# SPEC-PDM-GCP-COST-OPTIMIZATION-001：AI-PDM 預上線低成本 Runtime Topology

日期：2026-08-12  
狀態：`RD Implementation Ready / Human Confirmed / Local IaC Preparation Ready / Live GCP Release Gated`  
DEV：`DEV-069` / `DEV-PDM-GCP-PRELAUNCH-COST-OPTIMIZATION-001`  
Authority：`.ai-doc/decisions/ADR-PDM-GCP-COST-OPTIMIZATION-001-prelaunch-firebase-hosting-zonal-micro.md`  
Amends：`DEV-032`、`DEV-046`、`SPEC-PDM-ERP-GOOGLE-CLOUDSQL-002-five-year-platform-ontology-roadmap.md`

## 1. Goal

在 AI-PDM 尚未正式放量期間，將長期閒置的固定雲端成本降到最低合理水位，同時保留：

- Production 既有內部入口與少量使用能力。
- Staging 完整的 build、migration、Firebase Auth、Cloud Run、Cloud SQL、發布 smoke 與 rollback readiness 驗證能力。
- Production schema、正式資料、IAM、private networking、backup／PITR 與安全權威。
- 以 Terraform 為主要 IaC authority，避免 Console-only 漂移。

## 2. Human Decision Brief

2026-08-12 使用者已確認目前 phase：

- Production 採 `db-f1-micro`。
- Production 從 `REGIONAL` 改為 `ZONAL`。
- Staging 改為 Micro、Zonal、按需啟停，但不得失去完整發布驗證能力。
- 刪除 `ai-pdm-prod-restore-20260716a`。
- 刪除 Production 與 Staging 兩套目前未使用的 external ALB chain。

未採方向：

- 不刪除 Staging 環境。
- 不停止 Production 主庫。
- 不關閉 Production backup／PITR、private IP、IAM DB authentication 或 deletion protection。
- 不移除 Production HSM、Secret Manager、Firebase Auth／Identity Platform 或 logging／monitoring。
- 不在本 DEV 啟用 custom domain。

## 3. Spec Impact Preflight

判定：`Intentional replacement`。

本規格有意取代下列預上線契約：

- `HD-6-3 / 3A` 的 canary day-one Regional HA 強制要求。
- Production／Staging 為 deferred custom domain 長期保留 ALB、reserved IP 與 managed certificate 的成本姿態。
- Staging `db-custom-1-3840` 全天執行的資源姿態。

下列契約保持不變：

- Cloud SQL 是唯一正式 relational authority；Firestore／Supabase 不成為平行 authority。
- Production／Staging 位於 `asia-east1`，使用 private IP 與 IAM database authentication。
- Production automated backups、14 retained backups、7-day PITR、clean-seed、numbering integrity 與 source archive 邊界不變。
- Firebase Hosting 只做 HTTPS／rewrite；Cloud Run 仍是 Next.js BFF runtime。
- Production 資料、schema、principal、role、audit、outbox 與 numbering ledger 不在本 DEV 修改。

## 4. Baseline and Benefit

估算基準：2026-08-01～2026-08-12 Billing SKU 原價，依 730 小時正規化；實際帳單可能受匯率、延遲入帳與按秒計價影響。

| 項目 | 目前預估／月 | 目標預估／月 | 月效益 |
|---|---:|---:|---:|
| Production Cloud SQL：Regional custom → Zonal micro | NT$3,410 | NT$356 | 約 NT$3,054 |
| Staging Cloud SQL：已停止，保留 20 GiB | NT$108 | NT$108 + 啟動時數 | 固定費不變；執行約 NT$0.34／小時 |
| Restore：已停止，保留 20 GiB | NT$108 | NT$0 | 約 NT$108 |
| Production + Staging ALB | NT$591 | NT$0 | 約 NT$591 |
| Production + Staging KMS HSM | NT$81 | 本 phase 暫留 | NT$0 |
| 其他 Cloud Run／Artifact／Storage | 少於 NT$10 | 少於 NT$10 | 微量 |

核心批准範圍完成後，預估約 NT$550／月；相較目前約 NT$4,300／月，再省約 NT$3,750／月、NT$45,000／年。

Micro 與 Zonal 的效益互相重疊：不能把「Micro 約 NT$3,050」與「Zonal 約 NT$1,705」再次相加。

## 5. Current Architecture Impact

```text
Browser
  -> Firebase Hosting web.app
  -> Cloud Run (min 0, max 2/revision)
  -> Cloud SQL private IP
       Production: PostgreSQL 17 / db-f1-micro / ZONAL / always on
       Staging:    PostgreSQL 17 / db-f1-micro / ZONAL / on demand

Removed from active topology:
  external ALB -> forwarding rules -> proxies -> URL maps
               -> managed certificate -> reserved edge IPv4
```

不改 API、UI、資料模型、migration history、權限或使用者流程。架構影響只限 GCP runtime sizing、edge topology、IaC source 與 operation policy。

## 6. Execution Boundary

### Current phase：本機 IaC／契約實作

RD 可直接執行：

1. 恢復可重現的 Staging Terraform source。
2. 修改 Production／Staging Terraform、capacity contract、QC 與文件。
3. 執行 backend-disabled fmt／validate、targeted contract QC 與 plan parser 測試。
4. 建立只描述預期 live diff 的 machine-readable plan acceptance contract。

不得在本機文件／RD phase 執行：

- Terraform apply、GCP resource delete、Cloud SQL tier／availability patch。
- Production／Staging database start、stop、restart、資料寫入或 migration。
- DNS、Firebase Hosting deploy、Cloud Run traffic 變更。
- stage、commit、merge、PR 或 production release。

### Live phase：`Release Gate Required`

使用者已確認產品與成本方向，不需重問是否採用 Micro／Zonal／刪除 Restore／拆除兩套 ALB；但實際遠端操作仍須由 `deployment-release-gate` 產生 target、credential、saved plan、backup、rollback-readiness 與 post-change smoke artifacts。Production live execution 維持由 `DEV-032` 作唯一 release 入口，`DEV-069` 不建立第二條平行 production release path。

## 7. Repository and File Impact

### 7.1 Staging IaC authority recovery

目前 `infra/google-cloud/staging/` 只剩 `.terraform/terraform.tfstate`；它不是可維護 source of truth。Git 歷史顯示：

- `a29836e72f50d182849afb3967b5a7420654dcb7`：最後一份完整 staging IaC source。
- `18b468aeab33f3673dbbdefbb0440e1bda684b9a`：將 staging source 刪除。
- Approved remote backend：`gs://jenfu-ai-pdm-stg-361825-tfstate/ai-pdm/staging`。

RD 必須把 `a29836e7` 的 staging files 恢復為起點，再套用本規格。不得把本機 `.terraform/terraform.tfstate` 提升為 authority；credentialled live phase 必須連 approved remote backend，先產生 refresh/read-only baseline 並解釋所有 drift。

恢復範圍：

- `infra/google-cloud/staging/*.tf`
- `infra/google-cloud/staging/.terraform.lock.hcl`
- `infra/google-cloud/staging/README.md`
- `infra/google-cloud/staging/backend.staging.hcl.example`
- `infra/google-cloud/staging/terraform.tfvars.example`

不得恢復或提交真實 `.tfstate`、`.auto.tfvars`、credentials 或 secret values。

### 7.2 Production files

- `infra/google-cloud/production/database.tf`
  - `availability_type` 由 hard-coded `REGIONAL` 改為受限變數，預上線值 `ZONAL`。
  - `database_tier` 設為 `db-f1-micro`。
- `infra/google-cloud/production/variables.tf`
  - 增加／收斂 `database_availability_type`、`enable_external_load_balancer`、`cloud_run_max_instances`、`cloud_sql_pool_max` validation。
- `infra/google-cloud/production/production.auto.tfvars.json`
  - 設定 `db-f1-micro`、`ZONAL`、ALB disabled、max instances 2、pool max 2。
- `infra/google-cloud/production/locals.tf`
  - 新增 edge-resource gate；Firebase Hosting enabled 時不要求 ALB active。
- `infra/google-cloud/production/edge.tf`
  - 全部 edge resources 使用同一 `local.create_edge_resources` gate；不得只刪 forwarding rule 而留下 reserved IP／proxy／certificate。
- `infra/google-cloud/production/runtime.tf`
  - `min=0` 保持，`max=2`；runtime pool max 明確設 2。
- `infra/google-cloud/production/migration-runner.tf`
  - migration pool max 保持 2。
- `infra/google-cloud/production/outputs.tf`
  - edge disabled 時 IP／edge fields 回傳 `null`／`false`，不產生 index error。
- `infra/google-cloud/production/README.md`
  - 記錄 Firebase Hosting 是 pre-launch canonical edge；custom domain 是 re-entry trigger。

### 7.3 Shared contracts and QC

- `config/platform/cloud-sql-capacity.json`
  - `maxInstancesPerRevision=2`
  - `maximumConcurrentRevisions=2`
  - `effectiveMaximumInstances=4`
  - `poolMax=2`
  - `migrationAdminReserve=2`
  - `maxConnections=25`
  - validator 必須證明 `4 × 2 + 2 = 10 <= floor(25 × 0.70) = 17`
- `config/platform/cloud-run.contract.json`
  - Production／Staging active edge 改為 Firebase Hosting；ALB 改為未建立的 future re-entry topology。
- `config/platform/production-target.template.json`
  - future edge baseline 不再表示目前資源必須保留。
- `scripts/qc-dev-046-phase1a-runtime.mjs`
- `scripts/qc-dev-046-phase1c-cloud-sql.mjs`
- `scripts/qc-dev-046-firebase-hosting-entrypoint.mjs`
- `scripts/qc-dev-032-production-iac-package.mjs`
  - 更新 ALB、HA、Micro、connection-budget 與 Firebase Hosting assertions；Production HSM assertion保持。

## 8. Implementation Contract

### 8.1 Production Cloud SQL

- 只允許同一 instance 的 in-place settings update；plan 若顯示 replace／destroy `google_sql_database_instance.pdm`，立即停止。
- PostgreSQL version、instance name、region、private network、database、IAM users、backup／PITR、disk size/type、deletion protection 均不得改變。
- 在 DB sizing 前，先讓 Cloud Run 新 revision 使用 max instances 2、pool max 2；驗證後才進 DB 變更。
- Live readback 必須取得實際 `max_connections`；不得只相信靜態 25。
- Tier／availability 變更會 restart；需要預先公告可接受的維護中斷。

### 8.2 Low-cost Staging

- 採按需運作，不是刪除環境：平時停止，發布驗證窗口才啟動。
- 保留 Firebase Hosting、Cloud Run、migration runner、Cloud SQL、VPC、IAM、Secret Manager、Identity Platform、logs、monitoring、budgets 與 Artifact Registry。
- Cloud SQL 平時停止；停止時仍支付 20 GiB storage／IP 相關費用。
- 發布驗證窗口必須包含：啟動 DB、health/readiness、migration checksum/idempotence、登入／session、核心 API、資料寫入與重讀、candidate deploy smoke、rollback readiness、停止 DB。
- 若驗證中發現 Micro OOM、too many operations、connection saturation 或 migration 無法完成，可在該窗口暫時升到 `db-custom-1-3840 ZONAL`；完成後再降回 Micro 並記錄 evidence。這是受控 fallback，不把較大規格變成常駐設定。

### 8.3 ALB removal

每個環境必須以單一 saved plan 同時處理完整 edge chain：

- serverless NEG
- application／immutable-static backend services
- HTTPS／redirect URL maps
- managed SSL certificate
- HTTPS／HTTP target proxies
- HTTPS／HTTP global forwarding rules
- edge global reserved IPv4

Private service access address、VPC、subnet、service networking connection 與 Cloud SQL private IP 不屬於 ALB，不得刪除。

刪除前必須確認：

- canonical `web.app` URL 通過 unauthenticated 與 authenticated smoke。
- `pdm.jenfu.com.tw`／`pdm-stg.jenfu.com.tw` 沒有承接使用者流量的 DNS 指向。
- plan delete set 僅包含上述 edge chain，沒有 Cloud Run、Cloud SQL、Firebase、IAM、VPC 或 state backend。

### 8.4 Restore deletion

- 精確 target：`jenfu-ai-pdm-prod / asia-east1 / ai-pdm-prod-restore-20260716a`。
- 刪除前需確認 2026-07-16 restore reconciliation report、source／restore hash equality、最新 Production automatic/on-demand backup success 與 PITR enabled。
- 保留 report、operation ID、recovery point、schema/migration reconciliation 與 numbering snapshot hash；不得因刪 instance 刪除證據。
- 不得刪除 `ai-pdm-prod-postgres` 或 source archive。

### 8.5 Optional Staging peripheral optimization

下列不是本次 live apply 的必要項，完成核心 phase 後另行進入：

- HSM → SOFTWARE key：先新增新的 SOFTWARE asymmetric signing key，驗證相同 signing／verification contract，再請使用者核准舊 HSM version scheduled destruction。預估額外省約 NT$40／月；scheduled-for-destruction 期間仍可能計費。
- Artifact Registry cleanup：從 dry-run 改為保留最近 N 個已發布／rollback image，加 age-based untagged cleanup；目前效益少於數元／月，不可刪除 current／previous-known-good digest。
- Budgets：依預上線目標調低 alert threshold；budget alert 不是 hard cap，不列為直接節省。

## 9. Failure Recovery

| Failure | Required response |
|---|---|
| Production Hosting smoke 失敗 | 不刪 ALB；先修復 canonical entrypoint |
| Production DB plan 出現 replace/destroy | 停止；不得 apply |
| Tier／Zonal update 後無法連線 | 升回 `db-custom-1-3840 ZONAL`；若屬 availability 問題再恢復 `REGIONAL` |
| Micro OOM／連線飽和／核心 API 5xx | 立即 scale up；不得以增加 pool 掩蓋記憶體不足 |
| Staging source 與 remote state 無法收斂 | 停止 live change；先完成 import／drift disposition |
| ALB plan 夾帶 private network／Cloud SQL | 拒絕 plan，拆回 edge-only change |
| Restore backup／hash 證據缺失 | 不刪 Restore target |
| 成本未下降 | 以 Billing SKU／project／resource labels 追查；不得只看 budget alert |

## 10. QA and QC Gates

### Gate A：Local IaC readiness

- Terraform fmt／validate 通過。
- Staging source 能由 Git provenance 重建，不含 secret／state。
- QC assertions 覆蓋 Micro、Zonal、Firebase Hosting active edge、ALB disabled、Production HSM retained。
- Capacity formula通過，`10 <= 17`。
- Git diff 只包含 DEV-069 scope；目前工作樹其他未提交修改不得混入。

### Gate B：Credentialled plan review

- Production main DB：只允許 in-place tier／availability update。
- Production／Staging edge：delete set 精確等於完整 ALB chain。
- Restore：精確刪除單一 isolated target。
- Staging baseline drift 全部有 disposition；未知 drift 為 stop condition。
- 0 非預期 data、IAM、VPC、Secret Manager、Firebase、Cloud Run service delete／replace。

### Gate C：Staging release validation

- DB 可由停止狀態啟動並回到可連線狀態。
- Migration runner checksum／idempotence通過，重跑為 zero pending migration。
- Firebase login／session、privacy gate、permissions、核心 read/write/read-back 與 candidate revision smoke 通過。
- Rollback target 可辨識；完成後 DB 再次停止。
- ALB removal 後 `web.app` entrypoint 維持正常，無 5xx／未預期 console error。

### Gate D：Production post-change QC

- 最新 backup 成功且 PITR enabled。
- Cloud SQL 回到 `RUNNABLE`，tier=`db-f1-micro`、availability=`ZONAL`、private IP only。
- `SHOW max_connections` 與 deployed Cloud Run／pool config 滿足 capacity formula。
- Production `web.app` 登入、privacy acknowledgement、permissions、dashboard、核准的 draft persistence／re-login persistence smoke 通過。
- 觀察窗口內無 OOM、too-many-operations、connection acquisition failure、非預期 5xx 或持續資源飽和。
- Production source database identity、schema/migration count、Admin principal、roles／permissions 與 numbering integrity 不變。

### Gate E：Cost evidence

- 24～72 小時後 Billing 不再新增 global forwarding rule minimum usage。
- Restore instance compute／storage 不再新增費用。
- Production Cloud SQL SKU 轉為 Zonal shared-core／storage；沒有 Regional CPU／RAM 新增時數。
- 實際月化 run-rate 與 NT$550 目標比較；偏差超過 20% 必須建立原因與 owner。

## 11. Stop Conditions

出現任一項立即停止並回 Dev PM／release gate：

- 無新鮮可用的 Production backup／PITR readback。
- Production main DB、VPC、private service access、IAM、Secret Manager、Firebase 或 state backend 出現 delete／replace。
- `web.app` 不是可用 canonical entrypoint，或 custom domain 仍有真實流量。
- Staging IaC 無法從 `a29836e7` 與 approved remote backend 建立可解釋 baseline。
- 實際 `max_connections`、Cloud Run max instance 或 pool 設定不符合 70% connection budget。
- 需要變更 schema、正式資料、principal／role、numbering authority、backup retention 或 source archive。
- 需要銷毀 HSM key version、刪除 Staging DB 或停止 Production 主庫而未取得新的明確確認。
- 需要 stage／commit／merge／PR／deploy／apply 而尚未進入對應 Git／release boundary。

## 12. Completion Definition

DEV-069 只有在以下全部成立時才可標記完成：

- Local IaC source、contracts、QC 與文件收斂。
- Staging 可按需啟動並完成完整 release validation，再安全停止。
- Production 使用 Micro＋Zonal，canonical `web.app` 正常。
- Production／Staging ALB chain 與 edge IP 已移除，private network 未受影響。
- Restore target 已刪除，restore／hash／backup 證據保留。
- Production 資料、schema、IAM 與 numbering integrity 無漂移。
- Billing readback 證明目標 SKU 停止新增，run-rate 達到可解釋範圍。

`RD Implementation Ready` 不等於 `Release Ready`。本文件不授予跳過 saved plan、backup、角色分離 QC、rollback readiness 或 post-change smoke 的權限。
