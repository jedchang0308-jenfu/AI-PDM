# RD Report - Manufacturing Handoff Page

日期：2026-05-26

## 目標

建立製造/採購可用的唯讀交接頁，讓正式發布資料不再分散在送審清單、檔案清單與 package 下載中，降低拿錯版與漏檔風險。

## 已完成

- 新增 `GET /api/handoff`。
  - 未登入回傳 401。
  - Manager/Admin 可看全部最新 Released 料號。
  - Engineer 只看自己送審範圍。
- API 只列每個 item 的最新 Released submission，避免製造端在舊版中誤選。
- 新增 `/handoff` 頁面。
  - 顯示最新 Released 料號數。
  - 顯示 package 完整率。
  - 可搜尋圖號、料號、品名、材質、變更原因。
  - 每張卡顯示圖號、版次、料號、品名、材質、表面處理、文件類型、變更原因。
  - 顯示 release package 下載連結、package SHA256、檔案清單與檔案 SHA256。
  - 顯示核准者與核准時間。
- Dashboard 與左側導覽加入「製造交接」入口。
- API regression 新增 `HANDOFF-001` 到 `HANDOFF-006`。
- 新增 `GET /api/handoff/export` CSV 匯出。
  - 使用 UTF-8 BOM，方便 Excel 開啟。
  - 內容包含圖號、版次、料號、品名、package URL、package SHA256、檔案 hash、核准紀錄。
- `/handoff` 頁面新增「匯出 CSV」與「列印」按鈕。
- 新增 print CSS，列印時隱藏側邊欄、搜尋與操作按鈕，保留交接內容。
- API regression 延伸到 `HANDOFF-011`，覆蓋 CSV 權限、content type、圖號與 package filename。

## 驗證

- `npm.cmd run lint`：通過。
- `npm.cmd run build`：通過。
- `PDM_BASE_URL=http://127.0.0.1:3010 npm.cmd run qc:api`：106 passed / 0 failed。
- Browser smoke：R&D Manager 登入後開啟 `/handoff`，可看到交接摘要、檔案 hash、package 下載連結、CSV 匯出與列印按鈕。

## 尚未完成

- 尚未做供應商入口或外部唯讀分享。
- 尚未把 release package ZIP 同步到 Google Drive Released folder。
- 若要提供給外部供應商使用，下一步需設計唯讀分享 token、到期時間與下載稽核。
