# ADR-PDM-BOM-RETIREMENT-001：BOM 模組硬刪除與重建邊界

Status：Accepted / Local implementation complete / Production execution authorized and release-gated
Date：2026-08-24
Owner：Dev PM
Decision source：使用者選擇方案 B，並明確要求「正式環境也刪除」。

## Decision

現有 BOM 模組整體退役，未來若需要 BOM，必須以新任務、新規格、新資料模型重新開發，不沿用現有實作作為相容層。

退役範圍包含：

- 所有 BOM 建立、編輯、匯入、審核、發布、匯出、差異與 Where-used UI/API。
- BOM repositories、adapters、permissions、AI 摘要／風險來源、採購／分享 payload 與導覽入口。
- SQLite baseline 中 12 張 BOM 資料表、`part_numbers.bom_usage_policy` 與舊 `confirm_bom_no_revision` 審核動作。
- PostgreSQL 正式環境中的 13 張 BOM／migration-issue 資料表、同名欄位與相容審核資料。
- 舊 BOM 專用 QC、fixture、runtime smoke 與 dependency `@xyflow/react`。

歷史 migration、QA、QC、報告與規格保留作稽核證據，但一律標示或視為 Superseded，不得作為現行產品、release 或未來重建的 acceptance authority。

## Data deletion and rollback

- SQLite 使用 `scripts/migrate-dev-095-bom-retirement.mjs`；預設 dry-run，live apply 必須同時提供 `--execute` 與 approval token `DEV-095-BOM-HARD-DELETE-APPROVED`。
- PostgreSQL forward migration 為 `db/postgres/047_remove_bom_module.sql`，由既有 migration runner 的單一交易與 checksum history 管理。
- 正式刪除前必須取得可驗證的 Cloud SQL 備份／PITR 證據，並記錄舊 Cloud Run revision、image digest、schema migration manifest 與 restore 路徑。
- 若 rollback，必須先恢復刪除前資料庫，再將流量切回舊 revision；只回滾程式或只還原資料皆不構成完整 rollback。
- migration 後不得為了相容舊 revision 建空表或 view；這會重新引入舊契約並破壞「完全重建」邊界。

## Invariants

刪除不得改變公司、使用者、item、submission、正式圖號／料號、canonical drawing/part/root identity、附件、審核與技轉等非 BOM 資料。SQLite／Cloud SQL 均須驗證：

1. 退役表、欄位、action 與 runtime route 全部不存在。
2. canonical identity count/digest 與非 BOM evidence 在 migration 前後一致。
3. foreign-key check 為零，migration residue 只有已核准的 forward history。
4. 新應用不查詢退役物件；舊 BOM URL 回 404，而不是保留功能關閉頁或相容 API。

## Consequences

- 既有 BOM 資料會從正式 operational database 刪除，只能由刪除前 backup／PITR 復原。
- 舊版應用在資料庫刪除後不可安全承接流量，因此 production promotion 與 DB migration 必須視為同一受控 release window。
- 未來 BOM 重建不得復用舊 table 名稱、API 或 snapshot semantics，除非新 ADR 明確重新採納並完成獨立 migration／QA／release gate。
