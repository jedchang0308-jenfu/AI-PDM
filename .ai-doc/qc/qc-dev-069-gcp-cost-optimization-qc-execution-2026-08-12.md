# QC：DEV-069 GCP 成本最佳化驗證執行報告

日期：2026-08-12
角色：QC（獨立事實驗證）
Repo：`C:\VIBE CODING\AI_PDM\.worktrees\AI_PDM\DEV-069`
Branch：`codex/dev-069-cost-optimization`
Baseline evidence commit：`c5c0c85ebc22ecaa10bd2349e6ead577758d440a`
RD fix commit：`d4d1b01a`
執行時間：2026-08-12 20:52～21:34（UTC+8）

## 1. QC 結論

結論：**NOT FINAL PASS／OPERABILITY FAIL**。

- `TOPOLOGY：PASS`：目前 Production／Staging Cloud SQL、Cloud Run、Firebase Hosting canonical entrypoint、ALB／edge inventory、主庫與 Restore 現況均取得 live 證據。
- `STAGING OPERABILITY：FAIL（live revalidation pending）`：本輪 live image 的主要 `/numbering/request` 寫入出現 PostgreSQL `operator does not exist: jsonb ~~ unknown`，且沒有完成嚴格的 update → read。RD 已在目前 branch 修正 JSONB query path，並修正 cancelled drawing projection 佔住 recycled code 的 canonical unique defect；本機回歸已通過，但 current immutable image 尚未回部署 Staging，因此 `QA069-018` 仍不得標 PASS。
- `PRODUCTION OPERABILITY：INCOMPLETE`：Production named-user canary 與 10 分鐘 soak 尚未執行。
- `COST BENEFIT：OUT OF QC SCOPE`：依使用者指示，本輪不執行 Billing T+24／T+48／T+72 acceptance；本報告不判定實際節費。
- Staging 已在驗證後停止；本輪沒有把資料路徑缺陷或缺少 Production canary 誤寫成 `FINAL PASS`。

本報告是本輪 QC 獨立執行結果，不覆寫既有 `.ai-doc/qc/qc-dev-069-gcp-cost-optimization-report-2026-08-12.md`；既有報告中的 PASS 結論須以本報告的阻塞與時間窗限制重新解讀。

## 2. Gate 執行摘要

| Gate | 結果 | 事實與限制 |
|---|---|---|
| G0 | `PASS` | 改用使用者範圍官方 Terraform 1.14.5；雙環境 fmt、backend=false init、validate 均為 0 error／0 warning。無 plan／apply／destroy。focused QC 已 17/17。 |
| G1 | `PARTIAL PASS` | Production live topology、保護設定、Hosting／HTTP boundary 通過；Production named-user canary 與 10 分鐘 soak 尚未執行。 |
| G2 | `FAIL / REVALIDATION OPEN` | 第二次受控循環的 live image 完成 start、fresh migration dry-run、named-user 登入、候選草稿 create／read／cleanup、smoke 與 stop；但 `/numbering/request` 寫入失敗，且嚴格 update → read 未完成。RD source fix 與 local regression 已通過，仍需 current immutable image + migration 033 的新 Staging cycle。終態已回到 STOPPED。 |
| G3 | `PASS` | live edge inventory 無資料列、custom domain DNS 不存在、主庫健康且 Restore 目前清單中不存在；Terraform static revalidation 已通過。 |
| G4 | `PASS WITH ACCEPTED RESIDUAL RISK` | Restore cleanup reconciliation 已完成；使用者已於 2026-08-12 以 Product Owner／Business Approver 身分接受現階段 Zonal residual risk，並保留 owner、RTO／RPO 與 Regional re-entry trigger。 |
| G5 | `OUT OF SCOPE` | 依使用者指示，Billing 不再是本輪 QC acceptance item；不以長期間報表判定節費。 |
| G6 | `PASS FOR EXECUTION RECORD` | QA addendum、QC 判定、PM 決議與去識別 evidence 已同步；缺陷與殘留 release gate 未被隱藏。 |

## 3. 測試結果總表

### G0：身分、靜態契約與 plan safety

| Test ID | 結果 | QC 證據與判定 |
|---|---|---|
| QA069-001 | `PASS WITH CONTEXT` | 工作樹、branch、commit、CLI project context 已讀取；CLI token refresh 在非互動環境失敗，因此 live CLI context 不以 CLI 輸出作唯一證據，改由 Cloud Console live readback 補足。 |
| QA069-002 | `PASS` | 使用 `DEV069_TERRAFORM_EXECUTABLE` 指向本機 Terraform 1.14.5；Production／Staging fmt、backend=false init、validate 均通過，0 error／0 warning；focused QC 17/17。 |
| QA069-003 | `PASS BASELINE / STATIC REVALIDATED` | plan safety／forbidden resource baseline 可讀，雙環境 static validation 已用本機 Terraform 重跑；本輪仍未執行 remote plan、apply 或 destroy。 |
| QA069-004 | `PASS BASELINE` | 既有 DEV-069 plan safety 與 forbidden resource scan baseline 可讀；本輪未進行 apply。 |
| QA069-005 | `PASS` | Cloud Console Production SQL instance list 目前只有 `ai-pdm-prod-postgres`；Staging 目標為 `ai-pdm-stg-postgres`；精確 Restore target 在目前 Production instance list 無資料列。 |

### G1：Production 保護、容量與入口

| Test ID | 結果 | QC 證據與判定 |
|---|---|---|
| QA069-006 | `PASS` | Production Cloud SQL 顯示 automatic backup／PITR enabled；最近 backup operation `2026-08-12 17:44:34–17:46:05` 完成。既有 evidence 另記錄 on-demand backup ID `1786527874220` 成功。 |
| QA069-007 | `PASS` | `ai-pdm-prod-postgres` 為 RUNNABLE、PostgreSQL 17.10、1 vCPU／628.74 MB、Zonal `asia-east1-c`、private IP `10.42.0.2`、public IP disabled、deletion protection enabled。 |
| QA069-008 | `PASS BASELINE` | 既有唯讀 migration runner evidence：target exact、migration count 19、last migration 032、`max_connections=25`；本輪未重跑資料查詢。 |
| QA069-009 | `PASS WITH BASELINE COMPONENT` | Production Cloud Run Ready、min=0、max=2、VPC egress all-traffic、revision metadata 可讀；pool=2 取自既有 readback evidence。 |
| QA069-010 | `PASS BASELINE` | 既有 capacity evidence 為 peak 10、allowed 17、max_connections 25，符合 `10 <= 17 < 25`；本輪未執行新 soak。 |
| QA069-011 | `BLOCKED-NOT-EXECUTED` | 缺核准 named-user／代表性流量與 10 分鐘 soak 證據，不能以 Cloud Run 低請求量代替。 |
| QA069-012 | `PASS` | Production `web.app/login=200`、`/api/auth/mode=200`、unauth `/api/numbering/permissions=401`；瀏覽器可見 AI PDM 登入頁，未見非預期錯誤。 |
| QA069-013 | `BLOCKED-EXTERNAL-CREDENTIAL` | `/numbering/drawings?view=all` 只顯示未登入／無模組權限邊界；未取得核准 named-user，未執行登入後 canary。 |
| QA069-014 | `PASS BASELINE / CURRENT LOG QUERY LIMITED` | 既有 QC evidence 記錄 recent Cloud Run ERROR count 0，Staging 停庫後 proxy `invalidState` 與停庫時間關聯；本輪未取得新的 Logging JSON export。 |

### G2：Staging 完整發布驗證循環

| Test ID | 結果 | QC 證據與判定 |
|---|---|---|
| QA069-015 | `PASS` | Staging `ai-pdm-stg-postgres` 顯示已停止、`STOPPED / NEVER`、1 vCPU／628.74 MB、Zonal `asia-east1-c`、private IP `10.4.0.3`、public IP disabled；Staging Cloud Run min=0、max=2。 |
| QA069-016 | `PASS WITH UI-ONLY VARIANCE` | 第二次 Cloud Console 受控啟動 operation `21:11:50→21:19:16` 完成並取得 RUNNABLE readback；第一次循環 `20:32:12→20:40:17` 亦成功。本輪使用 UI confirmation 而非 SQL-only saved-plan verifier，保留 scope variance。 |
| QA069-017 | `PASS WITH BASELINE LEDGER` | Staging 啟動後新執行 `ai-pdm-stg-migration-runner-t448h`，`21:21:40→21:22:00`、1/1 task success；job contract 為 `scripts/run-dev-046-cloudsql-migrations.mjs --dry-run`，未執行 apply。migration ledger／checksum 採既有已核對 baseline，本輪 dry-run 不另寫入 ledger。 |
| QA069-018 | `FAIL / LOCAL FIX PASS / LIVE REVALIDATION OPEN` | 原 live fixture `DEV069 QC 暫存 20260812-212700` 仍記錄 `operator does not exist: jsonb ~~ unknown`，後續搜尋 0 筆，沒有正式資料 residue；替代候選草稿 create／read／void cleanup 通過。RD 已修正 JSONB path 與 cancelled drawing canonical unique namespace；local state-flow runtime 8/8、HTTP 21/21、JSONB regression 3/3，但尚未以 current immutable image 和 migration 033 重新執行 live create → read → update → read → cleanup，因此本項仍 FAIL。 |
| QA069-019 | `PASS` | 正確 Staging site `https://jenfu-ai-pdm-stg-361825.web.app/login=200`、`/api/auth/mode=200`、unauth permissions=401；錯誤 alias `https://jenfu-ai-pdm-stg.web.app` 404，已從驗證契約排除。 |
| QA069-020 | `PASS WITH UI-ONLY VARIANCE` | 第二次 Cloud Console 受控停止 operation `21:33:06→21:34:09` 完成，頁面顯示 `已停止 ai-pdm-stg-postgres`、activation policy `NEVER`；第一次循環 `20:48:10→20:49:14` 亦成功。 |
| QA069-021 | `PARTIAL PASS / SOAK INCOMPLETE` | 第二次停庫後正確 Hosting `/login=200`、`/api/auth/mode=200`、unauth permissions=401，且 Cloud SQL 最終 STOPPED；尚未完成完整 post-stop shrink／log soak，不能把本項標完整 PASS。 |

### G3：Edge、DNS、Restore 與 state convergence

| Test ID | 結果 | QC 證據與判定 |
|---|---|---|
| QA069-022 | `PASS` | Production／Staging Load Balancer high-level inventory 無資料列；advanced forwarding rules、target proxy、backend services、backend buckets、target pools 均無資料。既有 live inventory 另記錄 8 類資源各為 0。 |
| QA069-023 | `PASS BASELINE / STATIC REVALIDATED` | 既有 DEV-069 final targeted plan 為 No changes、edge state address count 0；本輪雙環境 static validation 已改用本機 Terraform 通過。 |
| QA069-024 | `PASS-DEFERRED` | `Resolve-DnsName pdm.jenfu.com.tw` 與 `pdm-stg.jenfu.com.tw` 均為 DNS name does not exist；因此沒有把 custom domain 宣稱為 ready。 |
| QA069-025 | `PASS CURRENT LIVE` | 同一 live inspection 期間 Production SQL instance list 僅有主庫；主庫 RUNNABLE 且 protection 完整，Restore target 未出現在目前 instance list。 |
| QA069-026 | `PASS-DEFERRED` | Production／Staging 正確 project `web.app` 為可用 canonical entrypoint；Cloud Run service URL 可讀；custom domain 仍是 deferred，未宣稱 external ALB ready。 |

### G4：復原與 Zonal residual risk

| Test ID | 結果 | QC 證據與判定 |
|---|---|---|
| QA069-027 | `PASS` | Restore cleanup reconciliation 已建立：歷史 recovery／hash／backup chain 與 current absent readback 已串接；current Production instance list 只有主庫。 |
| QA069-028 | `PASS WITH ACCEPTED RESIDUAL RISK` | 已補 operational policy：Release Owner、GCP/IaC Operator、QA/QC、Business Approver；acknowledgement ≤60m、RPO ≤1h、RTO ≤4 support hours，並定義 Regional re-entry triggers。使用者已於 2026-08-12 明確接受現階段 Zonal residual risk；任一 trigger 成立即重評 Regional HA。 |

### G5：Billing（本輪移出 QC scope）

依使用者指示，QA069-029～QA069-031 不再作為本輪 QC acceptance item。這些案例未被判 PASS 或 FAIL；若日後需要財務／PM 成本事實驗證，另開 monitoring task，不回填本輪 QC。

| Test ID | 結果 | 說明 |
|---|---|---|
| QA069-029～031 | `OUT OF SCOPE` | 本輪 QC 不執行 Billing 觀察與節費判定。 |

## 4. 回歸測試結果

以下命令已執行且通過：

- `npm.cmd run qc:dev-032-production-iac-package`：23/23
- `npm.cmd run qc:dev-032-production-target-contract`：13/13
- `npm.cmd run qc:dev-046-firebase-hosting-entrypoint`：11/11
- `npm.cmd run qc:dev-046-phase1a`：16/16
- `npm.cmd run qc:dev-046-phase2a`：20/20
- `npm.cmd run qc:pdm-number-state-flow-runtime`：8/8（含 cancelled canonical history reuse）
- `npm.cmd run qc:pdm-number-state-flow-http`：21/21
- `npm.cmd run qc:dev-064-unified-drawing-aggregate`：7/7
- `npm.cmd run qc:dev-069-jsonb-like-regression`：3/3
- `git diff --check`：exit 0（僅有既有 line-ending warning）

`npm.cmd run qc:dev-069-gcp-cost-optimization`：17/17 passed。Terraform static validation 改用本機官方 Terraform 1.14.5，未依賴 Docker。
`npm.cmd run typecheck`、`npm.cmd run build`、`npm.cmd run dev-032:cloudsql-migration-package` 均 exit 0；migration package 仍為 proposal-only，未執行 live apply。
Staging package contract revalidation：`DEV046-CLOUDSQL-MIG-001～009` passed；`MIG-010` fail-closed，因目前 worktree 沒有 live migration/runtime evidence。原本檢查已同步修正為現行 Cloud SQL authority README 契約，未放寬 live gate。

## 5. 已知阻塞、風險與後續驗證條件

1. **Staging live revalidation**：原 `/numbering/request` JSONB defect 與 cancelled drawing canonical unique defect 已在 source 修正；但 current Staging image 尚未更新，仍需以 immutable image + migration 033 重新執行 create → read → update → read → cleanup；完成前 G2 維持 FAIL。
2. **Production operability**：補 Production 核准 named-user positive／negative canary 與 10 分鐘 soak；不可用 unauth 200／401 取代。
3. **Evidence variance**：補 post-stop shrink／log soak；若 release gate 要求 saved-plan provider evidence，另補 SQL-only verifier。本輪 UI operation readback 已保留但不等同 saved plan。
4. **Zonal monitoring**：風險已接受，不再是簽核 blocker；任一 Regional re-entry trigger 成立時必須停止擴量並重評 HA。
5. **Billing scope**：本輪已移除，不列為 QC blocker；若日後恢復需求，另開 PM／Finance monitoring task。

## 6. 變更邊界

- QC 未執行 Terraform apply、Terraform destroy、ALB delete 或 Production 業務資料寫入。
- Staging 啟動／停止、migration dry-run 與 disposable candidate write 屬 QA 計畫允許的受控循環。正式料號申請失敗且搜尋確認 0 筆；候選草稿已 void，active residue 為 0，保留 audit tombstone／7 天 cooling period。
- 本輪 live QC 未修改 Terraform code、GCP IAM／Secret／VPC／Firebase 設定；RD source fix 只在 branch 完成，尚未部署到 Staging。
- 本輪 RD source 變更已在 branch 完成並通過 local QC；未對 Production 寫入，也未執行 Staging migration apply 或 web deploy。
- 證據未記錄 token、cookie、Authorization header、Secret 或可辨識登入帳號；以 staging principal ID 表示 named-user。

## 7. 證據索引

- QA 計畫：`.ai-doc/qa/qa-dev-069-gcp-cost-optimization-validation-plan-2026-08-12.md`
- Terraform validate report：`output/dev-069-iac-terraform-validate/report.json`、`report.md`
- 既有 DEV-069 baseline QC：`.ai-doc/qc/qc-dev-069-gcp-cost-optimization-report-2026-08-12.md`
- Restore reconciliation：`.ai-doc/reports/pm/pm-dev-032-production-principal-restore-reconciliation-2026-07-16.md`
- Restore runbook：`.ai-doc/runbooks/runbook-dev-032-production-canary-restore-reconciliation-2026-07-15.md`
- Cost topology spec：`.ai-doc/specs/SPEC-PDM-GCP-COST-OPTIMIZATION-001-prelaunch-runtime-topology.md`
- PM resolution：`.ai-doc/reports/pm/pm-dev-069-cost-optimization-resolution-2026-08-12.md`
- 本輪 Staging smoke／operation／Terraform evidence：`output/qc/dev-069/20260812-1219-utc/`
- 本輪 authenticated cycle 摘要：`output/qc/dev-069/20260812-1219-utc/staging-authenticated-cycle.txt`
- Live targets：Production／Staging Cloud SQL、Production／Staging Cloud Run、Production／Staging Firebase Hosting、Production／Staging Load Balancing inventory；Billing 本輪不屬 QC acceptance。
