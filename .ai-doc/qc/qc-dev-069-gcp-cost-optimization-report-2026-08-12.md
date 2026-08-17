# QC：DEV-069 GCP 成本最佳化與 Live Execution 報告

日期：2026-08-12

結論：PASS（核心實作與live release）／OBSERVATION PENDING（Billing 24～72h）

## Executed change

- Staging saved plan：`0 add / 2 change / 11 destroy / 0 replace`；只含 Cloud Run、Cloud SQL與edge allowlist。套用後完成migration dry-run，再以SQL-only plan切回停止狀態。
- Production runtime saved plan：`0 add / 1 change / 0 destroy`；先收斂Cloud Run max/pool。
- Production cost saved plan：`0 add / 1 change / 11 destroy / 0 replace`；SQL為in-place update，edge為完整chain刪除。
- Staging final drift修正：只把Cloud SQL proxy `startup_cpu_boost false -> true`恢復成IaC明示值；`0 add / 1 change / 0 destroy`。
- Restore：精確刪除 `ai-pdm-prod-restore-20260716a`。

## Production evidence

- SQL：`ai-pdm-prod-postgres`、`RUNNABLE`、PostgreSQL 17、`db-f1-micro`、`ZONAL`、`ALWAYS`。
- Data protection：backup enabled、PITR enabled、public IPv4 disabled、deletion protection enabled。
- Pre-change backup：ID `1786527874220`、ON_DEMAND、`SUCCESSFUL`，09:44:34Z～09:46:05Z。
- Cloud Run：Ready=True、revision `ai-pdm-prod-00017-bhw`、max=2、pool=2；既有immutable application image digest保持。
- Hosting smoke：`/login=200`、`/api/auth/mode=200`、unauth `/api/numbering/permissions=401`。
- Recent Cloud Run ERROR count：0。
- 唯讀SQL execution：`ai-pdm-prod-migration-runner-9ghmj` successful；`max_connections=25`、migration count=19、last migration=`032`。
- Capacity：`10 <= 17`，PASS。
- Final targeted Terraform plan：`No changes`、exit 0。

## Staging evidence

- 驗證窗口SQL：成功由停止狀態啟動為`RUNNABLE`；Micro／Zonal／private-IP-only、backup／PITR保留。
- Migration dry-run：execution `ai-pdm-stg-migration-runner-r6gbx`，Completed=True。
- Hosting smoke：`/login=200`、`/api/auth/mode=200`、unauth permissions=401。
- 停止終態：`ai-pdm-stg-postgres`、`STOPPED`、`db-f1-micro`、`ZONAL`、`NEVER`。
- Cloud Run：Ready=True、revision `ai-pdm-stg-00015-tim`、max=2、pool=2；既有immutable application image digest保持。
- 停庫後一筆proxy `invalidState` cert refresh為預期訊息，沒有對應HTTP request／status，smoke無5xx。
- Final targeted Terraform plan：`No changes`、exit 0。

## Edge and restore evidence

Production／Staging下列live count各為0：forwarding rules、HTTP proxy、HTTPS proxy、URL maps、managed SSL cert、backend services、edge IP、serverless NEG。兩個remote Terraform state的DEV-069 edge address count亦為0。

Restore刪除前readback：STOPPED、PostgreSQL 17、Micro、Zonal、NEVER、private-only、deletion protection=false。Cloud SQL回報delete done，後續readback為`DEV069_RESTORE_ABSENT`。2026-07-16 reconciliation與hash equality文件保留。

## Local regression evidence

- DEV-069 focused QC：17/17。
- Production／Staging Terraform static validate：0 error／0 warning。
- DEV-032 production IaC：23/23；production target：13/13。
- DEV-046 Firebase Hosting：11/11；Phase 1A：16/16；Phase 2A：20/20。

## Residual observations

- Billing SKU停計與月化run-rate需等待24～72小時；目前只可宣稱預估月省NT$3,749、年化NT$44,988，不可宣稱發票已下降。
- Staging full non-target refresh另見既有migration job metadata與Identity Platform authorized-domain drift；本DEV未套用，因不屬成本變更且saved-plan allowlist禁止夾帶。
- Production仍需由DEV-032完成產品層authenticated Level 4與named-user canary；這不影響本DEV的runtime topology與成本資源收斂結論。
