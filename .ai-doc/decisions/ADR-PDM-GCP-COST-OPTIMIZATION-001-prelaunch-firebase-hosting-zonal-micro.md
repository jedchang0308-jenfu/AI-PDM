# ADR-PDM-GCP-COST-OPTIMIZATION-001：預上線 Firebase Hosting、Zonal Micro 與按需 Staging

日期：2026-08-12  
狀態：`Accepted / Human Confirmed / Live GCP Release Gated`  
Owner：Dev PM / ERP Platform RD  
相關 DEV：`DEV-069`  
修訂：`ADR-PDM-ERP-PLATFORM-002-google-taiwan-cloud-sql-production.md` 的預上線成本、Cloud SQL 可用性與外部 ALB 基線

## Context

AI-PDM 尚未正式使用，但免費試用抵免已於 2026-08-11 到期。2026-08-01～2026-08-12 的帳務讀值顯示，主要費用來自全天候配置的 Cloud SQL、兩套未承接正式流量的全域負載平衡器，以及 HSM key version，而不是實際使用流量。

現況已完成兩項可逆措施：

- `ai-pdm-stg-postgres` 已停止；資料與儲存空間保留。
- `ai-pdm-prod-restore-20260716a` 已停止；正式主庫 `ai-pdm-prod-postgres` 仍可運作，Production Firebase Hosting smoke 通過。

原 ADR 要求 Production 從 canary day one 使用 Regional HA，並保留外部 ALB／固定 IP／managed TLS 供未來 custom domain。這適合已進入正式營運、具 SLA 與公開網域需求的系統，不符合目前「快速開發、少量內部人員、尚未正式上線」階段。

## Human Decision

使用者於 2026-08-12 明確要求：

1. Production Cloud SQL 改成預上線最低合理規格。
2. Production 由 Regional HA 改成 Zonal。
3. 重新設計低成本 Staging，保留完整發布驗證能力。
4. 刪除已完成驗證的 Restore 資料庫。
5. 拆除 Production 與 Staging 未使用的外部負載平衡器。

## Considered Options

### A. 維持既有 Production HA、Staging 全天運作與兩套 ALB

- 優點：不改架構、不需停機。
- 缺點：預估約 NT$4,300／月，與目前使用量不相稱。

### B. 刪除所有雲端環境，只保留本機

- 優點：雲端成本最低。
- 缺點：失去 Firebase Auth、Cloud Run、Cloud SQL、IAM migration、發布與 smoke 的完整驗證能力；不接受。

### C. 採低成本預上線拓撲

- Production 保持可用，但改為 `db-f1-micro`、`ZONAL`。
- Staging 保留完整發布鏈，改為 `db-f1-micro`、`ZONAL`、平時停止、驗證時啟動。
- Production／Staging 入口均使用既有 Firebase Hosting `web.app`；未啟用 custom domain 前不保留 ALB。
- Restore 驗證資源在證據與備份確認後刪除。
- 優點：保留端到端發布能力，預估降至約 NT$550／月。
- 缺點：Production 無 Cloud SQL SLA、單區故障不自動 failover、Micro 資源與並行操作受限。

## Decision

採方案 C。

### Production

- Canonical origin 維持 `https://jenfu-ai-pdm-prod.web.app`。
- Cloud SQL PostgreSQL 17 維持 `asia-east1`、private IP、IAM database authentication、20 GiB SSD、automated backups、14 份保留與 7 日 PITR。
- Machine tier 改為 `db-f1-micro`；availability 改為 `ZONAL`。
- 接受 shared-core 與 single-zone 不在 Cloud SQL SLA covered service 內。
- Cloud Run 維持 `minInstances=0`，並把最大 instance 與 SQL pool 收斂到 Micro connection budget。
- 未啟用 `pdm.jenfu.com.tw` 前，刪除 external ALB、serverless NEG、backend services、URL maps、managed certificate、target proxies、HTTP/HTTPS forwarding rules 與 edge reserved IPv4。
- Production HSM、Secret Manager、private VPC、logging、monitoring、budget alerts、Artifact Registry 與 Firebase／Identity Platform 保留。

### Staging

- Canonical origin 維持 `https://jenfu-ai-pdm-stg-361825.web.app`。
- Cloud SQL 改為 `db-f1-micro`、`ZONAL`，private IP、IAM DB auth、backups 與 PITR 保留。
- 採按需運作：平時 activation policy 為 `NEVER`；發布驗證窗口啟動，完成 migration idempotence、Firebase Auth、Cloud Run、資料庫持久性、發布 smoke 與 rollback readiness 後再次停止。
- Cloud Run 維持 `minInstances=0`；Firebase Hosting、Cloud Run、migration runner、Identity Platform、Secret Manager、VPC/private service access、logs、monitoring 與 budget alerts 保留。
- 刪除完整 external ALB chain 與 edge reserved IPv4；不刪除 private service access 使用的內部位址。
- 現行 HSM 暫留於核心批准範圍之外。後續可建立 SOFTWARE signing key、完成簽署／驗簽 parity，再另行核准舊 HSM key version 的 scheduled destruction；不得直接就地改 protection level。

### Restore Target

- `ai-pdm-prod-restore-20260716a` 已完成 separate-target restore 與 reconciliation，source／restore numbering snapshot SHA-256 相同。
- 在最新 Production backup／PITR readback 成功、既有 restore report 與 hash 證據可讀後刪除。
- 刪除後若需重做演練，以 Production backup／PITR 建立新的隔離 target；不依賴被刪除 instance。

## Capacity Contract

`db-f1-micro` 預設 `max_connections` 約 25。預上線設定固定為：

| 項目 | 值 |
|---|---:|
| Cloud Run max instances per revision | 2 |
| Maximum concurrent revisions | 2 |
| Effective maximum instances | 4 |
| SQL pool max per instance | 2 |
| Migration/admin reserve | 2 |
| Cloud SQL max connections baseline | 25 |
| Required connections | 10 |
| 70% application ceiling | 17 |

因此 `4 × 2 + 2 = 10 <= floor(25 × 0.70) = 17`。若實際 `SHOW max_connections` 低於 25，或計畫後公式不成立，停止 Production 變更。

## Consequences

- 預估從目前約 NT$4,300／月降到約 NT$550／月；約再省 NT$3,750／月、NT$45,000／年。
- `Production 改 Micro` 與 `Regional 改 Zonal` 是同一條重疊節省路徑；合併效益約 NT$3,050／月，不可再加上 NT$1,705 重複計算。
- Production 失去自動跨 zone failover 與 Cloud SQL SLA；故障時以 backup／PITR、人工 scale-up 或重新啟用 Regional HA 恢復。
- Micro 適合預上線少量使用者，不是正式放量規格。觀察到 OOM、connection saturation、持續高 CPU、核心 API 延遲或 5xx 時，先升級到 `db-custom-1-3840 ZONAL`；有正式 SLA／可用性需求時再恢復 Regional HA。
- Firebase Hosting 成為目前唯一 canonical browser entrypoint。Custom domain 需求恢復時，必須新建 edge release DEV／ADR review，不預先為未使用資源付費。

## Re-entry Triggers

符合任一條件時重新評估規格：

- 正式開放超過 5 位同時使用者或出現可重現的容量壓力。
- 業務要求 Cloud SQL SLA、自動 zone failover 或具體可用性承諾。
- 啟用 `pdm.jenfu.com.tw`、Cloud CDN、LB-only ingress 或停用 Cloud Run default URL。
- Staging 需要長時間壓力測試或連續整合環境，不再適合按需啟停。
- Production／Staging 需要正式 signed-ledger HSM parity。

## Official References

- Cloud SQL smallest instance and shared-core SLA exclusion: https://docs.cloud.google.com/sql/docs/postgres/faq
- Cloud SQL availability and setting-change impact: https://docs.cloud.google.com/sql/docs/postgres/instance-settings
- Disable high availability: https://docs.cloud.google.com/sql/docs/postgres/configure-ha
- PostgreSQL `max_connections` defaults: https://docs.cloud.google.com/sql/docs/postgres/flags
- Cloud SQL start/stop billing behavior: https://docs.cloud.google.com/sql/docs/postgres/start-stop-restart-instance
- Cloud KMS protection-level pricing: https://cloud.google.com/kms/pricing

