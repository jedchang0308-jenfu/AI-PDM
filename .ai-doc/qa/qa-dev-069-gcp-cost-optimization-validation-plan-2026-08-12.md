# QA：DEV-069 GCP 成本最佳化驗證計畫

日期：2026-08-12

狀態：Executed

## Validation matrix

| Gate | 驗證 | Pass rule |
|---|---|---|
| A | Terraform fmt／validate | Production、Staging 皆 0 error／0 warning |
| A | 靜態 contract QC | Micro、Zonal、ALB gate、capacity、startup boost assertions通過 |
| B | Saved-plan allowlist | 0 replace；只允許 Cloud Run／SQL update與明列 edge delete |
| C | Staging release cycle | SQL啟動、migration dry-run、Hosting smoke、rollback target、停止皆通過 |
| D | Production backup | on-demand backup successful、PITR enabled |
| D | Production SQL | RUNNABLE、Micro、Zonal、private-IP-only、deletion protection |
| D | Capacity | live max_connections=25；peak 10 <= budget 17 |
| D | Hosting | `/login=200`、`/api/auth/mode=200`、unauth permissions=401 |
| D | Error sweep | Production recent Cloud Run ERROR=0；無非預期5xx |
| E | Edge removal | 兩環境8類edge live count與Terraform edge state皆0 |
| E | Restore | 精確target absent，正式主庫存在且健康 |
| F | Final convergence | 兩環境DEV-069 targeted plan `No changes`／exit 0 |
| G | Billing | 24～72小時後檢查SKU與月化run-rate |

## Stop conditions

- Production main SQL replacement／destroy。
- VPC、private service access、IAM、Secret Manager、Firebase或state backend delete／replace。
- backup／PITR缺失。
- Hosting 5xx或SQL未回 `RUNNABLE`。
- Staging無法完成啟動、migration dry-run與停止閉環。
- 實際連線容量不足。

## Role separation

RD 建立IaC與plan contract；QA以本計畫定義門檻；QC依saved plan、live readback、logs、HTTP與final plan做獨立事實判定。Billing延遲不得被標為即時PASS。
