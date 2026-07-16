# DEV-STORAGE-COST-001 Phase 5O - Runtime Storage Access Audit Regression

日期：2026-06-11

任務：`DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan

## 目的

Phase 5N 已證明 audit schema 與 egress parser 在 fixture 中相容。本階段把證據推進到實際 HTTP runtime：`qc:api` 既有的下載、預覽、release package、public share package 流程，必須真的寫入 `StorageAccessed` audit row。

## 開發範圍

- 更新 `scripts/qc-api-test.mjs`，新增 `getStorageAccessAudits(...)` helper。
- 在 authenticated file download / PDF preview 後，驗證 `submission_file` 與 `submission_file_preview` audit rows。
- 在 authenticated release package download 後，驗證 `release_package` audit row。
- 在 public share package download 後，驗證 `public_share_package` audit row。
- 驗證 audit detail 包含 access kind、route、disposition、positive byte count、public share external flag、share id scoping。
- 驗證 audit detail 不輸出 raw URL、raw share token、token hash。
- 更新 `scripts/qc-file-storage-access-audit.mjs`，要求 `qc:api` 保留上述 runtime assertions。

## Runtime 證據

- 因 port 3000 已被另一個本機 process 占用且健康檢查逾時，本輪改在 `http://127.0.0.1:3001` 啟動隔離 dev server。
- `npm.cmd run qc:api` 以 `PDM_BASE_URL=http://127.0.0.1:3001` 執行，結果 406/406 pass。
- `data/ai-pdm.sqlite` 目前的 QC runtime data 已出現四種 `StorageAccessed` row：
  - `submission_file`：1 row
  - `submission_file_preview`：1 row
  - `release_package`：1 row
  - `public_share_package`：1 row

## 邊界

- 沒有呼叫 Supabase connector。
- 沒有建立 Supabase project / branch。
- 沒有套用 DB schema migration。
- 沒有 provider request。
- 沒有刪檔。
- 沒有更新 metadata pointer。
- 本階段不重跑 monthly/governance artifact，避免把 QC 測試資料誤當正式月度治理數據；它只作為 runtime regression evidence。

## 驗證

- `node --check scripts/qc-api-test.mjs`：pass。
- `node --check scripts/qc-file-storage-access-audit.mjs`：pass。
- `npm.cmd run qc:file-storage-access-audit`：31/31 pass。
- `npm.cmd run qc:api`：406/406 pass。
