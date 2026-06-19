# DEV-STORAGE-COST-001 Phase 5N - Storage Access Audit QC Gate

日期：2026-06-11

任務：`DEV-STORAGE-COST-001` Supabase PDM file storage cost-control development plan

## 目的

本階段補上 storage access audit 的專門 QC gate。目的不是製造正式 `StorageAccessed` row，而是確認 route instrumentation、audit detail schema、egress governance parser 三者真的相容，避免未來只有靜態字串檢查通過，月報卻無法正確彙總下載成本風險。

## 開發範圍

- 新增 `scripts/qc-file-storage-access-audit.mjs`。
- 新增 `qc:file-storage-access-audit` npm script。
- QC 檢查 `src/lib/storage-access-audit.ts` 是否固定寫入 `StorageAccessed`、`storageAccess=true`、四種 access kind、provider、storage key、route、TTL policy，並禁止把 `input.access.url` 寫進 audit detail。
- QC 檢查 authenticated file download / PDF preview、release package download、public share package download route 都在建立 access contract 後呼叫 `auditStorageAccess(...)`。
- QC 以隔離 SQLite fixture 建立四種 `StorageAccessed` row，並呼叫正式 `buildStorageEgressReport(...)`，驗證 `submission_file`、`submission_file_preview`、`release_package`、`public_share_package` 都能被治理報表分類與加總。
- QC 驗證 signed URL 只保留 mode / TTL / provider metadata，不輸出 raw signed URL、raw share token、token hash。

## 風險控制

- 這是 fixture-only QC，不寫入 `data/ai-pdm.sqlite` 的正式 audit rows。
- 目前本機 runtime DB 仍是 0 筆真實 `StorageAccessed`，因此 governance gate 維持 `observation_required` 是正確結果。
- 沒有呼叫 Supabase connector，沒有建立 project / branch，沒有套用 SQL，沒有 provider request，沒有刪檔，沒有更新 metadata pointer。

## 驗證

- `node --check scripts/qc-file-storage-access-audit.mjs`：pass。
- `npm.cmd run qc:file-storage-access-audit`：28/28 pass。

## 後續

下一個務實切片應該是建立「可接受的 runtime smoke / field run」來產生真實 `StorageAccessed` row，讓 governance gate 能從 `observation_required` 進入基於真實下載/預覽行為的 stable / review / control 判斷。
