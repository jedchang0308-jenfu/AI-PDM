# QA Validation Plan: PDM DVT/Release Approval Review UI

Date: 2026-06-01

## 驗證範圍

- `/numbering/approvals` DVT/發行審核頁。
- `GET /api/numbering/approval-batches` 審核批次清單。
- `PATCH /api/numbering/approval-batches/[batchId]` 批次審核、共用意見與個別意見。
- 審核資料回寫 `approval_decisions`、`approval_batch_items`、`approval_batches` 與 DVT approval apply 結果。

## 使用者關鍵流程

- 研發主管登入後進入 DVT/發行審核頁。
- 主管看到同專案批次、送審者、代送審標示、DVT/發行 action 與異常/Override 標示。
- 主管輸入共用意見，對批次 pending 項目一次核准。
- 異常項可輸入個別意見，送出後個別意見覆蓋共用意見。
- 審核後批次與項目狀態更新，DVT promotion 通過後料號轉為 DVT Active。

## FMEA 風險表

| 失效模式 | 可能原因 | 影響 | 偵測方式 | 優先級 | 對策 |
|---|---|---|---|---|---|
| 批次清單沒有顯示 DVT/發行待審 | action/status filter 錯誤 | 主管漏審 | API/UI E2E 種入待審批次後檢查畫面 | 高 | route 預設 scope=dvt_release，QC 覆蓋 |
| 共用意見覆蓋個別意見 | PATCH 未傳或後端未套用 itemComments | 異常項審核紀錄失真 | DB 檢查兩筆 decision comment | 高 | 後端以 item comment 優先 |
| 代送審標示遺失 | payload/user role 未解析 | 主管不知道是管理員代送 | UI 檢查代送審 marker | 中 | review DTO 帶 isProxySubmission/proxyReason |
| 核准後批次 item 不同步 | 單筆 decision 與 batch item 狀態脫鉤 | 待辦殘留 | DB 檢查所有 item_status | 高 | 走 batch PATCH，逐項更新 |
| 行動版表格撐破版面 | 審核資料欄位多 | 主管手機不可用 | 390px viewport overflow check | 中 | table-wrap 與 responsive grid |

## 測試案例

- Manager 登入並載入 `/numbering/approvals`。
- 種入同一專案的 DVT promotion 與 release missing MA confirmation 批次。
- 驗證批次代碼、專案代碼、DVT 料號、Release override 料號可見。
- 驗證代送審與異常/Override 標示可見。
- 輸入共用意見與異常項個別意見後核准選取項目。
- 驗證 PATCH 成功、batch approved、items approved、DVT 料號 Active、decision comment 正確。
- 驗證桌面與手機 viewport 無頁面層水平溢出且無 console error。

## 通過標準

- `qc:pdm-numbering-approval-review-ui` 全數通過。
- `qc:pdm-numbering-core` 包含審核頁 static/API/repository coverage 並通過。
- `tsc`、`lint`、`build` 通過；既有 warning 需標示為非本輪新增。

## 證據收集方式

- 自動化 QC JSON output。
- DB 查詢結果：batch status、item status、decision comment、DVT part status。
- lint/build/tsc 指令結果。
