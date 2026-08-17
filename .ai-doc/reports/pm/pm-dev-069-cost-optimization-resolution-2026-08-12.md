# PM 決策收斂：DEV-069 成本最佳化殘留項目

日期：2026-08-12
範圍：DEV-069 GCP 成本最佳化
依據：QC 執行報告、Cloud Console live readback、既有 DEV-032 continuity／RTO 決策

## 1. 決策摘要

| 項目 | 本輪決策 | 狀態 |
|---|---|---|
| Staging Cloud SQL | 平時保持 `STOPPED / NEVER`；只有發布驗證窗口才啟動，驗證完成後必須停止 | 本輪完整受控窗口已執行，current STOPPED；資料路徑缺陷另列 release blocker |
| Restore target | 不再刪除；目前 live 已不存在，將歷史 retained 記錄與 current absent readback 串成 cleanup reconciliation | 已收斂為 current absent |
| Production／Staging edge | Production 使用 `https://jenfu-ai-pdm-prod.web.app`；Staging 使用 `https://jenfu-ai-pdm-stg-361825.web.app`；不重建 ALB；custom domain 明確 deferred | 已關閉誤宣稱風險 |
| Production Zonal | 現階段接受 Zonal posture，保留角色、RTO／RPO 與 Regional re-entry trigger | 使用者已於 2026-08-12 明確接受 residual risk |
| Billing | 依使用者指示，從本輪 QC acceptance gate 移除；不把成本效益標為 PASS，也不再阻塞本輪 topology QC | 已移出本輪 QC scope |
| Terraform executor | 改用本機官方 Terraform 1.14.5，不依賴 Docker Desktop | static validation 17/17 |

## 2. Staging 啟停政策

### 2.1 正常狀態

- `ai-pdm-stg-postgres`：`STOPPED / NEVER`。
- Cloud Run：`min=0`，保持可部署但不常駐資料庫。
- 沒有發布驗證、migration 或 smoke 時，不得為了方便長時間開啟。

### 2.2 驗證窗口

順序固定為：

1. 啟動 Cloud SQL，等待 live state 為 `RUNNABLE`。
2. 確認 private IP、backup/PITR、tier 與 Zonal posture 未漂移。
3. 執行 migration dry-run、Hosting／API smoke；若具備核准帳號，再執行 disposable write-read-cleanup。
4. 保存 operation、HTTP、migration 與 cleanup evidence。
5. 停止 Cloud SQL，確認回到 `STOPPED / NEVER`。

本次先完成第一輪 Cloud Console 啟停與入口 smoke：啟動 operation `20:32:12→20:40:17`，停止 operation `20:48:10→20:49:14`。為補齊 named-user 與 migration 證據，第二輪依同一政策執行：

1. 啟動 operation `21:11:50→21:19:16` 完成，取得 RUNNABLE readback。
2. 新執行 migration dry-run `ai-pdm-stg-migration-runner-t448h`，`21:21:40→21:22:00`、1/1 task success，未執行 migration apply。
3. 核准企業 named-user（principal `stg-pdm-admin-001`）登入成功，角色 readback 為系統管理員。
4. 主要 `/numbering/request` 建立 fixture 時出現 `operator does not exist: jsonb ~~ unknown`；搜尋結果為 0，沒有正式料號、圖號或 root residue。
5. 替代候選草稿 `QC-DEV069-20260812-212700` 成功 create／read（v1、Draft）後刪除；active list 為 0。刪除實作為 void，保留 audit tombstone 與 7 天 recycle cooling period。
6. 停止 operation `21:33:06→21:34:09` 完成，最終頁面顯示 instance 已停止、activation policy `NEVER`；停庫後 Hosting／auth mode 仍為 200，unauth permissions 為 401。

因此「驗證窗口結束後立即停庫」已落實；但主要資料建立缺陷與缺少 update → read 使完整 Staging release gate 維持 FAIL，修正後需再驗證。

## 3. Restore cleanup reconciliation

### 3.1 證據鏈

- 歷史 restore reconciliation：recovery point `1784162806569` 成功，isolated target 與 source counts matched，numbering SHA-256 為 `81f983...c1f57`。
- 歷史文件曾記錄 isolated restore target retained as evidence；這是當時的安全姿態，不代表目前 instance 仍存在。
- 2026-08-12 Cloud Console Production SQL instance list 目前只有 `ai-pdm-prod-postgres`。
- `ai-pdm-prod-restore-20260716a` 未出現在 current live instance list；Production 主庫仍 RUNNABLE 且 backup/PITR/deletion protection 保留。

### 3.2 判定

`Restore current state = ABSENT`。本輪不再執行 delete，避免對不存在 target 重複操作。歷史 retained 與 current absent 的差異已由本文件釐清：前者是歷史 evidence posture，後者是目前 live cleanup 結果。

## 4. Zonal residual risk operational policy

### 4.0 風險接受決議

> AI-PDM 現階段採 Cloud SQL Zonal 架構，以降低固定基礎設施成本。已知 Zonal 不具跨可用區自動容錯能力；現階段因使用規模及業務關鍵性仍低，接受此風險。當達到既定 Regional re-entry trigger 時，重新評估升級 Regional HA。

- 決策日期：2026-08-12。
- 決策來源：本輪使用者明確指示，視為 Product Owner／Business Approver 對現階段 residual risk 的核准。
- 適用邊界：目前低使用規模、低業務關鍵性階段；不代表已具備跨可用區 HA 或跨區 DR。
- 失效條件：任一 4.3 trigger 成立時，本風險接受自動進入重新評估，不得以本決議繼續擴張流量。

### 4.1 角色與授權

| 責任 | 角色 | 權限邊界 |
|---|---|---|
| Incident owner | Production Release Owner（DEV-032） | 宣布 incident、停止發布、對外溝通、決定 rollback／升回 Regional |
| Technical executor | 核准的 GCP／IaC Operator | 只依 saved plan 與 rollback runbook 執行 Cloud SQL／Cloud Run 變更 |
| Data／recovery verifier | QA／QC | 驗證 backup、PITR、restore chain、資料與入口；不直接決定是否升規 |
| Business approver | Product Owner／Release Approver | 核准正式放量與 Regional re-entry |

### 4.2 服務目標

- Critical incident acknowledgement：`≤ 60 分鐘`，延續既有 HD-8-2 all-hours policy。
- RPO：`≤ 1 wall-clock hour`，延續既有 HD-7-3 policy。
- RTO：支援時段 `≤ 4 support hours`；非支援時段先完成 critical acknowledgement，再依 incident escalation roster 處理。
- 這些是目前 operational target，不宣稱同一 `asia-east1` 外的 full-region DR 已具備。

### 4.3 Regional re-entry trigger

任一條件成立，即停止發布並由 Release Owner 啟動 Regional re-entry decision：

1. Cloud SQL zone-level unavailability 已確認，或連續兩次受控 restart／recovery 失敗。
2. 觀察到 connection error／timeout 或主要入口 5xx，且 5 分鐘內無法恢復。
3. 依目前恢復進度預估將超過 `60 分鐘 acknowledgement` 或 `4 support hours RTO`。
4. 發生資料完整性、PITR、backup 或 security boundary 異常。

決策順序：先停止新發布與流量擴張；再依核准 rollback path 恢復 last-known-good revision／資料庫姿態；若判定為 availability 而非單純 capacity 問題，使用 Regional saved plan re-entry；完成後由 QA／QC 執行入口、資料與 protection readback。未完成 post-incident review 與 Release Approver 核准前，不回到低成本 Zonal 常態。

## 5. Canonical edge 與 custom domain

- Production／Staging external ALB chain live inventory：0。
- `pdm.jenfu.com.tw`、`pdm-stg.jenfu.com.tw` 目前 DNS 不存在。
- Production canonical：`https://jenfu-ai-pdm-prod.web.app`。
- Staging canonical：`https://jenfu-ai-pdm-stg-361825.web.app`；此 site 的既有 live release rewrite 至 `ai-pdm-stg`，HTTP `/login=200`、`/api/auth/mode=200`、unauth permissions=401。
- `https://jenfu-ai-pdm-stg.web.app` 是錯誤 alias，會回 Firebase `Site Not Found` 404；不得再作為驗證 URL。
- 本輪不重建 ALB、不新增 DNS、不新增 TLS／edge 費用。
- custom domain 是 deferred scope；若未來要啟用，必須另開 change／QA gate，重新驗證 DNS、TLS、Firebase Auth domain、rewrite、session issuer 與 rollback。

## 6. QC scope 變更

依使用者指示，Billing T+24／T+48／T+72 不再是本輪 QC acceptance item。這代表：

- 本輪 QC 不判定實際月省、ROI 或帳單下降。
- 不把 Billing 缺資料標成 FAIL，也不把估算月省標成 PASS。
- 若日後需要財務事實驗證，應另建立 PM／Finance monitoring task，不回填本輪 QC 結論。

## 7. Terraform 非 Docker 執行證據

- 安裝方式：使用者範圍官方 HashiCorp Terraform 1.14.5。
- 執行器：`DEV069_TERRAFORM_EXECUTABLE` 指向本機 `terraform.exe`。
- 命令：`npm.cmd run dev-069:iac-terraform-validate`。
- 結果：Production／Staging `fmt-check`、`init -backend=false`、`validate -json` 全部通過，`0 error / 0 warning`。
- 安全邊界：`planExecuted=false`、`applyExecuted=false`、`destroyExecuted=false`；沒有連 remote backend。
- focused QC：`npm.cmd run qc:dev-069-gcp-cost-optimization`，`17/17 passed`。

## 8. 尚未宣稱完成的項目

- Staging migration dry-run、named-user 登入、候選草稿 create／read／cleanup 與停庫均已完成；原 live `/numbering/request` PostgreSQL JSONB operator 缺陷已在目前 branch 修正並通過本機回歸，但尚未部署新 immutable artifact 回 Staging，嚴格 live update → read 仍未驗證，不能宣稱完整發布驗證通過。
- Production named-user positive／negative canary 與 10 分鐘 soak 尚未執行。
- Staging post-stop shrink／log soak，以及 release gate 若要求的 saved-plan provider readback，仍需補證。
- Zonal residual risk 已由使用者於 2026-08-12 明確接受；仍須依 4.3 triggers 持續判斷是否升回 Regional HA。

## 9. RD 修正與 local QC revalidation

### 9.1 根因

原始 Staging 錯誤 `operator does not exist: jsonb ~~ unknown` 與目前 source 的直接 JSONB `LIKE` 不一致；source scan 確認 live image 落後於已包含 `CAST(... AS TEXT) LIKE ...` 修正的 branch。另在本機回歸中發現第二個可重現缺陷：取消 workspace 後，immutable `drawings` projection 仍保留 provisional `drawing_number`，但資料表的 unconditional unique key 會阻擋回收候選號碼被新 reservation 重用。

### 9.2 實作

- 保留 cancelled drawing history 的 immutable `drawing_number`，不清除或改寫歷史值。
- `drawings(company_id, drawing_number)` 改為僅對 `lifecycle_state <> 'cancelled'` 建立 partial unique index。
- 新增 PostgreSQL `db/postgres/033_allow_recycled_candidate_drawing_codes.sql`；SQLite bootstrap／backfill 同步使用同一規則。
- 新增 canonical reuse regression：cancelled history 與新的 `drawing_preparation` projection 可同時保留相同 provisional code，且 reservation ID 仍不同。

### 9.3 證據

- `qc:pdm-number-state-flow-runtime`：8/8。
- `qc:pdm-number-state-flow-http`：21/21。
- `qc:dev-064-unified-drawing-aggregate`：7/7。
- `qc:dev-069-jsonb-like-regression`：3/3。
- `qc:dev-069-gcp-cost-optimization`：17/17。
- `typecheck`、`build`：exit 0。
- `dev-032:cloudsql-migration-package`：candidate schema files 31，proposal-only，未執行 live migration。
- `qc:dev-046-cloudsql-migration-package`：MIG-001～009 passed；MIG-010 fail-closed，因 live migration/runtime evidence 尚未存在；已修正 README authority contract 檢查，未繞過 live gate。
