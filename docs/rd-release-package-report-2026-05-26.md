# RD Report - Release Package ZIP

日期：2026-05-26

## 目標

讓 Released submission 可以一鍵下載完整正式資料包，減少工程師、製造與採購在資料夾中人工找 PDF/DWG/原始檔與核准資訊的時間。

## 已完成

- 新增 `release_packages` schema，保存 package 檔名、本地路徑、SHA256、檔案大小、manifest 與建立者。
- 核准成功後自動產生 release package ZIP。
- ZIP 內容：
  - `manifest.json`
  - 送審檔案，依 file role 放入 `files/{role}/`
  - 圖號、版次、料號、材質、表面處理、送審原因
  - approval log
  - CAD references
  - 每個檔案的 SHA256、size、Google Drive 狀態
  - release result
- 新增下載 API：`GET /api/submissions/[id]/release-package`。
- Dashboard Released 明細加入 `Release package` 下載卡。
- API regression 補上 release package metadata、未登入拒絕、ZIP 下載、ZIP signature、manifest 內容檢查。

## 驗證

- `npm.cmd run lint`：通過。
- `npm.cmd run build`：通過。
- `npm.cmd run db:init`：通過。
- `PDM_BASE_URL=http://127.0.0.1:3010 npm.cmd run qc:api`：95 passed / 0 failed。
- Browser smoke：R&D Manager 登入後切到 Released，可看到 `Release package` 與 package 下載連結。

## 限制與下一步

- 目前 package 是本地 ZIP；尚未同步成 Google Drive Released folder 裡的一個 package 檔。
- 既有歷史 Released 資料若是在此功能前發布，可能沒有 package，需要另做 backfill。
- 下一步建議做「製造交接頁初版」，直接彙整最新 revision、package、檔案 hash、核准者與發布時間。
