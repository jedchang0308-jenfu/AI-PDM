# QA 驗證計畫：PDM 圖料號申請精靈

日期：2026-06-01
任務：DEV-PDM-NUMBERING-001
範圍：`/numbering/request`、`/api/numbering/records`、`part_numbers.custom_specification`

## 驗證範圍

- [x] 圖料號申請精靈可由 RD 建立草稿主根號、料號，並可選擇同步建立圖號。
- [x] 支援外購、自製、發包、共用件、客製尺寸五種料件類型。
- [x] 客製尺寸必須填寫規格欄位，並保存到料號主檔。
- [x] 共用件或手動勾選共用料號時必須填寫共用理由，後端直接呼叫也要套用同一規則。
- [x] 允許先建立料號、不建立 CAD/圖號，符合「需先領號才能填 CAD」的實務限制。
- [x] 可在建立前執行查重預檢；高相似資料只提醒，不阻擋。
- [x] MA 圖可同步建立並連結到料號；OT 圖必須填寫用途描述。
- [x] 桌面與手機 viewport 均不得有頁面層水平溢出或 console error。

## 使用者關鍵流程

- [x] RD 輸入核心名稱與品名，選擇料件類型、階段與是否同步建立圖號。
- [x] RD 對疑似重複資料執行查重，看到 warning 後仍可依判斷建立草稿號碼。
- [x] RD 建立客製尺寸料號時，系統強制輸入尺寸或規格。
- [x] RD 建立共用件時，系統強制輸入共用理由。
- [x] RD 可先領料號，後續再補 CAD 與圖號。
- [x] RD 可在同一畫面看到建立結果：主根號、料號、圖號或未建立圖號提示。

## FMEA 風險表

| 失效模式 | 原因 | 影響 | 偵測方式 | 對策 |
|---|---|---|---|---|
| 共用件未填理由仍可建立 | UI 有擋但 API 直接呼叫未正規化 | 後續審核與追溯缺少判斷依據 | core static check 檢查 route/repository | 後端將 `itemKind=shared` 視為共用料號並要求理由 |
| 客製尺寸規格未保存 | schema 或 mapper 未帶欄位 | 總表查詢無法區分客製尺寸 | DB 查詢 `custom_specification` | schema、repository、UI 結果卡同步欄位 |
| 先料號後圖號被錯誤阻擋 | 建立流程強制檢查 CAD/圖號 | RD 無法先領號填入 CAD | E2E 取消同步圖號後建立 | `drawingRequested=false` 時只建立料號 |
| 查重提醒誤擋草稿建立 | warning 被當作 blocker | RD 領號效率下降 | E2E seed 高相似資料後建立 | 查重只顯示 warning，不阻擋建立 |
| 手機版表單溢出 | 表單欄位或結果卡寬度不穩定 | 現場使用不便 | Playwright 390px `scrollWidth` | 使用 responsive grid 與固定互動尺寸 |

## 測試案例

- [x] `tsc --noEmit`：驗證新增 route、repository 型別與頁面型別。
- [x] `qc:pdm-numbering-core`：驗證 schema、repository、route、UI static check 與 package script。
- [x] `qc:pdm-numbering-request-ui`：以 Admin 登入，桌面建立客製尺寸且不建立圖號，手機建立自製件與 MA 圖。
- [x] `lint`：驗證沒有新增 lint error。
- [x] `build`：驗證 `/numbering/request` 與 `/api/numbering/records` 可被 production build 納入。

## 通過標準

- [x] 型別檢查通過。
- [x] 核心 QC 全數通過。
- [x] 申請精靈 UI E2E 全數通過。
- [x] 客製尺寸料號的 `custom_specification` 寫入 DB。
- [x] 取消同步圖號時 DB 的 drawing count 為 0。
- [x] 同步 MA 圖時 DB 的 drawing count 為 1。
- [x] 桌面與手機無 console error、無頁面層水平溢出。

## 證據收集方式

- [x] 保留 QC 指令輸出摘要於 `.ai-doc/qc/qc-pdm-numbering-request-ui-validation-report-2026-06-01.md`。
- [x] 將通過狀態與測試數量寫回 `.ai-doc/dev_task.md`。
- [x] E2E 測試資料以 `QC ...` 前綴建立，測試結束後清理。
