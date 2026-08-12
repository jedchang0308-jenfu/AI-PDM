# ADR-PDM-GCP-COST-OPTIMIZATION-001：預上線 Firebase Hosting、Zonal Micro 與按需 Staging

日期：2026-08-12

狀態：Accepted / Implemented

DEV：DEV-069

## Context

AI-PDM 尚未正式放量，但 Production Regional custom Cloud SQL、全天候 Staging SQL、兩套 external ALB 與隔離 Restore 持續產生固定費用。正式入口目前是 Firebase Hosting `web.app` rewrite 至 Cloud Run；custom domain 沒有 DNS 流量，因此 ALB 並非目前服務必要條件。

## Decision

1. Production Cloud SQL 使用 PostgreSQL 17、`db-f1-micro`、`ZONAL`、`ALWAYS`。
2. Staging Cloud SQL 使用 PostgreSQL 17、`db-f1-micro`、`ZONAL`；平時 `NEVER/STOPPED`，發布驗證窗口切為 `ALWAYS`。
3. Production／Staging Cloud Run 保持 min=0，max instances/revision=2，應用 pool max=2。
4. Firebase Hosting `web.app` 是預上線 canonical edge；兩環境 external ALB 完整 chain 不建立。
5. 刪除已完成 reconciliation 的 `ai-pdm-prod-restore-20260716a`，保留 restore report、operation、hash 與 Production backup/PITR 證據。
6. Production／Staging private networking、IAM DB auth、backup、PITR、deletion protection、Secret Manager、Identity Platform、logging、monitoring與Production HSM均保留。

## Capacity invariant

Production live `SHOW max_connections=25`。允許上限採 70%：`floor(25 × 0.70)=17`。Cloud Run 最壞兩個 revision、每 revision 最多兩個 instance、每 instance pool=2，再加 migration reserve=2，為 `4 × 2 + 2 = 10`，低於 17。

## Consequences

- 預估 run-rate 由約 NT$4,300／月降至約 NT$550／月，月省約 NT$3,749、年化約 NT$44,988。
- Production 不再有跨區域 HA；上線擴量、SLA 或負載提升前必須重新評估升級。
- Staging 平時資料庫停止；需要 DB 的驗證必須依 runbook 啟動，完成 migration／smoke／rollback readiness 後停止。
- custom domain 未來若重新啟用，必須另立 DEV 與 DNS／TLS／edge release gate，不得把已刪 ALB 當成仍存在。
- Google Billing 有 24～72 小時入帳延遲，估算不得冒充實際帳單證據。

## Rejected alternatives

- 刪除 Staging：拒絕，因會失去完整發布驗證能力。
- 停止 Production 主庫：拒絕，需保留少量正式使用能力。
- 關閉 backup／PITR／private IP／deletion protection：拒絕，節省有限且破壞資料保護。
- 保留未使用 ALB 等待 custom domain：拒絕，現階段沒有 DNS 流量，固定成本不合理。
- 將 Micro 與 Zonal 節省重複相加：拒絕，兩者效益重疊。
