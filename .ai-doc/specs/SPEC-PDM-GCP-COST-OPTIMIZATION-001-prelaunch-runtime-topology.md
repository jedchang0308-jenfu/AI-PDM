# SPEC-PDM-GCP-COST-OPTIMIZATION-001：AI-PDM 預上線低成本 Runtime Topology

日期：2026-08-12

狀態：Live Implementation Complete / Billing Measurement Pending 24-72h

DEV：DEV-069 / DEV-PDM-GCP-PRELAUNCH-COST-OPTIMIZATION-001

Authority：`.ai-doc/decisions/ADR-PDM-GCP-COST-OPTIMIZATION-001-prelaunch-firebase-hosting-zonal-micro.md`

## 1. Goal

降低未正式放量期間的固定 GCP 成本，同時保留 Production 少量使用能力、Staging 完整發布驗證能力、Cloud SQL 資料保護、private networking 與 Terraform 可重現性。

## 2. Approved scope

- Production：`db-f1-micro`、`ZONAL`、always on。
- Staging：`db-f1-micro`、`ZONAL`、按需啟停。
- Production／Staging：Cloud Run max=2、pool max=2、min=0。
- Production／Staging：移除完整 external ALB chain，Firebase Hosting `web.app` 保持 canonical edge。
- 精確刪除：`jenfu-ai-pdm-prod / ai-pdm-prod-restore-20260716a`。

不改 schema、business data、numbering authority、IAM roles、Secret Manager、Production HSM、VPC、private service access、Firebase Auth、backup retention 或 PITR。

## 3. Target topology

```text
Browser
  -> Firebase Hosting web.app
  -> Cloud Run (min 0, max 2/revision, pool 2)
  -> Cloud SQL private IP
       Production: PostgreSQL 17 / db-f1-micro / ZONAL / ALWAYS
       Staging:    PostgreSQL 17 / db-f1-micro / ZONAL / NEVER when idle
```

Removed per environment：serverless NEG、兩個 backend services、兩個 URL maps、managed certificate、HTTP/HTTPS proxies、HTTP/HTTPS forwarding rules、edge IPv4，共 11 個 Terraform resources。

## 4. Low-cost Staging release cycle

1. 用 approved remote backend 產生 saved plan；僅允許 SQL activation、Cloud Run capacity 與 edge allowlist。
2. 將 SQL 切為 `ALWAYS`，等待 `RUNNABLE`。
3. 驗證 Cloud Run ready、Firebase Hosting `/login`、auth mode、未登入 permission boundary。
4. 執行 migration runner dry-run，確認 execution `Completed=True`。
5. 檢查 rollback revision 與 immutable image digest。
6. 將 SQL 切回 `NEVER`，確認 `STOPPED`；Cloud Run 維持 min=0。

Staging 停庫後，若 Cloud Run instance 尚未縮為零，Cloud SQL proxy 可能記錄 `invalidState` ephemeral-cert refresh；這是按需停止的預期噪音。HTTP 5xx、持續 instance 或 DB 被意外啟動才是 failure。

## 5. Production sequence

1. 先把 Cloud Run max/pool 收斂為 2/2並完成 smoke。
2. 建立最新 on-demand backup，確認 `SUCCESSFUL` 且 PITR enabled。
3. saved plan 僅允許 SQL in-place update與 11 個 edge deletes；SQL replacement/destroy 為 stop condition。
4. 套用 Micro/Zonal 與 ALB removal，等待 SQL `RUNNABLE`。
5. 驗證 Hosting smoke、recent error logs、private-IP-only、backup/PITR/deletion protection。
6. 以既有 migration runner 做唯讀 SQL readback，驗證 `SHOW max_connections` 與 migration ledger。

## 6. Restore deletion gate

刪除前必須同時成立：

- target 名稱精確等於 `ai-pdm-prod-restore-20260716a` 且不等於正式主庫。
- 既有 2026-07-16 reconciliation report 與 source／restore numbering hash equality 證據仍存在。
- Production backup 成功且 PITR enabled。
- deletion protection 未啟用於 Restore target。

刪除後以 describe not-found／absent readback確認；不得刪除正式主庫或證據文件。

## 7. Capacity and safety

- Live `max_connections=25`。
- 70% budget=`17`。
- Peak=`2 revisions × 2 instances × pool 2 + migration reserve 2 = 10`。
- `10 <= 17`，保留 7 connections 作平台／管理緩衝。
- Micro 發生 OOM、connection saturation、migration timeout 或持續 5xx 時，先暫時升回 `db-custom-1-3840 ZONAL`；不得單純放大 pool 掩蓋容量問題。

## 8. Cost model

| 項目 | 月效益估算 |
|---|---:|
| Production Regional custom -> Zonal micro | 約 NT$3,050 |
| Production + Staging ALB removal | 約 NT$591 |
| Restore storage removal | 約 NT$108 |
| 合計 | 約 NT$3,749／月 |

目標月化 run-rate 約 NT$550；年化效益約 NT$44,988。實際值受匯率、按秒計價與 Billing 延遲影響，24～72 小時後才能驗證。

## 9. Acceptance

- Terraform fmt／validate 與 DEV-069、DEV-032、DEV-046 regressions通過。
- Production=`RUNNABLE/db-f1-micro/ZONAL/ALWAYS`。
- Staging=`STOPPED/db-f1-micro/ZONAL/NEVER`，且已完成一次完整啟動驗證循環。
- 兩環境 Cloud Run ready，max/pool=2/2，immutable image未被舊 state 回滾。
- 兩環境 ALB live resource count與Terraform state count均為0。
- Restore absent；backup、PITR、private-IP-only與deletion protection保留。
- Production與Staging DEV-069 targeted final plan皆 `No changes`／exit 0。
- 24～72 小時後 Billing 不再新增 ALB minimum usage、Restore storage與Regional CPU/RAM；偏差超過20%建立後續DEV。

## 10. Completion semantics

核心開發與 live release在所有即時可驗證條件通過時標記完成；Billing是不可加速的 provider-latency observation。文件必須保持 `Billing Measurement Pending 24-72h`，直到實際帳務 readback 完成，不能把預估寫成發票事實。
