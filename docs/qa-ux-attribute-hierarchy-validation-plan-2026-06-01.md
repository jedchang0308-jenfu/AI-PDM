# QA Validation Plan: DEV-UX-005 全系統 UI 屬性視覺層級一致化

日期：2026-06-01

## 驗證範圍

- Dashboard：送審列表、明細 header、系統診斷、試作分支與檔案資訊。
- Upload：檔案列、PDM 屬性、AI/OCR 候選欄位、送審成功訊息。
- Handoff：發布卡片、發布包、檔案、核准紀錄。
- Public Share：唯讀分享 hero、中繼資料、發布包、檔案、BOM 與核准紀錄。
- 不驗證 API/schema 行為變更；此任務不得新增高成本首次載入 API。

## 使用者關鍵流程

1. 管理者在 Dashboard 快速掃描圖號、料號、版次、狀態、檔案與更新時間。
2. 管理者開啟圖面明細後，可區分一般 metadata 與系統診斷值，例如 submission ID、SHA256、local path、Drive ID。
3. RD 在 Upload 選檔後，可分辨檔案格式、用途、大小與候選欄位來源。
4. 製造/採購在 Handoff 或 Public Share 下載發布包時，可看到主識別、metadata、狀態 badge 與完整性 SHA。
5. 行動版 390px 與桌面 1440px 均不應出現水平 overflow 或文字重疊。

## FMEA 風險表

| 失效模式 | 可能原因 | 影響 | 偵測方式 | 優先級 | 對策 |
| --- | --- | --- | --- | --- | --- |
| metadata 與診斷值仍以一般 small 串接 | 未套用共用 class | 使用者難以分辨操作資訊與追溯資訊 | 靜態檢查 `<small>SHA256` 與 UI DOM | P1 | SHA/path/ID 改用 `.diagnostic-value` |
| CSS 選擇器覆蓋巢狀 metadata | `.detail-row span` 類型選擇器太廣 | badge/value 顏色與層級失真 | 靜態檢查 direct child selector | P1 | 改為 `.detail-row > span` |
| 表格掃描效率差 | 圖號、版次、檔案狀態皆為普通文字 | Dashboard 高頻操作負擔增加 | Playwright 檢查 row 內 identity/badge | P1 | 圖號用 identity，版次/檔案用 badge |
| 行動版長檔名或 SHA 撐破畫面 | 未限制 max-width / wrap | 100% 縮放出現水平捲動 | Playwright scrollWidth 檢查 | P1 | metadata/diagnostic 設 max-width 與 overflow-wrap |
| 視覺調整誤動流程 | 為 UI 修改 API 或 schema | 回歸風險擴大 | git diff 與 QC route flow | P1 | 僅改 TSX/CSS/QC 文件與腳本 |

## 測試案例

| ID | 測試項目 | 步驟 | 通過標準 |
| --- | --- | --- | --- |
| UX-HIER-001 | 靜態視覺語彙 | 檢查 CSS/TSX source | identity、metadata badge、metadata pair、diagnostic primitive 都存在 |
| UX-HIER-002 | Dashboard row | 建立並發布測試送審，開啟 Dashboard | row 內圖號為 `.identity-primary`，版次/檔案為 `.metadata-badge` |
| UX-HIER-003 | Dashboard diagnostics | 開啟同一筆明細的系統診斷 | 至少 3 個 `.diagnostic-value` 可呈現 ID/SHA/path 類資訊 |
| UX-HIER-004 | Upload mobile | 390px 開 `/upload` 並選檔 | 檔案格式 badge、大小/用途 metadata pair 顯示且無水平 overflow |
| UX-HIER-005 | Handoff desktop | 發布後開 `/handoff` | 主識別、metadata badge、發布包 SHA diagnostic 顯示 |
| UX-HIER-006 | Public Share mobile | 建立唯讀分享並開 `/share/{token}` | hero metadata、SHA diagnostic 顯示且無水平 overflow |
| UX-HIER-007 | 建置回歸 | 執行 lint、build | 無 lint/build error |

## 通過標準

- `npm.cmd run qc:ux-attribute-hierarchy` 通過。
- `npm.cmd run lint` 通過。
- `npm.cmd run build` 通過。
- Dashboard / upload / handoff / share 在測試 viewport 無水平 overflow。
- 不新增 API/schema，不引入首次明細載入高成本 API。

## 證據收集方式

- 保存 QC JSON output 至本報告對應的 QC 文件。
- build output 需記錄既有 warning 與是否有新增 error。
- 若失敗，收集頁面、viewport、locator、console error 與重現步驟。
