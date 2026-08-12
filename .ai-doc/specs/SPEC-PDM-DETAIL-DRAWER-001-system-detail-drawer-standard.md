# SPEC-PDM-DETAIL-DRAWER-001：全系統右側明細 Drawer 一致化

狀態：實作中；2026-07-09 已對齊 approval platform legacy redirect 例外
關聯任務：`DEV-PDM-DETAIL-DRAWER-001`  
建立日期：2026-06-06

## 問題定義

目前圖號模組的清單頁設計已形成理想模板：清單為主畫面、點選列後以右側 drawer 顯示明細、背景不使用深色遮罩、可快速切換其他列、`Escape` 或點擊非 drawer 區域可關閉，且 drawer 寬度可拖拉並記憶。

其他頁面仍存在固定右欄或清單旁明細區，導致使用者在不同模組切換時需要重新判斷明細位置、關閉方式、可否繼續瀏覽清單與是否能調整寬度。此差異會降低肌肉記憶，也會讓清單頁主視覺被明細區壓縮。

## 範圍

本 spec 只處理「點選清單列後出現，用於查看該列資料明細的右側明細欄」。

納入本次：

- 首頁 / 工作台的圖面送審明細。
- `/numbering/reports` 的月報明細。
- 已採用圖號模組 drawer 行為的 `/numbering/search`、`/numbering/drawings`、`/parts` 作為模板與驗證基準。
- `/parts?tab=drafts`、`/numbering/drawings?tab=reserved`、`/numbering/search?tab=reserved` 共用的保留號明細。

不納入本次：

- 全域左側 sidebar。
- BOM 工作台左側搜尋 / 樹狀面板。
- BOM 工作台節點屬性面板。
- BOM 審核頁固定 decision panel。
- `/numbering/approvals` 的舊審核批次明細 host；自 `DEV-PDM-APPROVAL-PLATFORM-001` Phase 1C-B 起，此路由是 legacy redirect，canonical reviewer surface 為 `/approvals` 審核工作台。它使用 workbench detail panel contract，不再要求在 legacy route 內掛 `PdmDetailDrawer`。
- 編輯器、設定頁或高風險操作流程中必須常駐的工具面板。

## 已定案決策

- 清單或總表是主畫面，明細不得長期占用主視覺。
- 點選列後以右側 drawer / side panel 顯示明細。
- drawer 不使用深色遮罩；底頁保持可讀，降低快速翻閱時的視覺疲勞。
- drawer 開啟後仍可直接點選其他列切換明細。
- drawer 是非 modal 的 `complementary` surface，不使用 `aria-modal`、focus trap 或 body lock；確認／刪除等 dialog 仍維持 modal。
- drawer 標頭只保留一個 inline `X` 關閉控制，不另設浮動關閉、上一筆或下一筆按鈕。
- `Escape` 可關閉 drawer。
- 點擊非 drawer 且非清單列的位置可關閉 drawer。
- drawer 寬度可拖拉調整並記憶上次寬度。
- 手機版不強制左右 drawer；可改為覆蓋式全寬 drawer 或上下堆疊，但不得造成水平 overflow。
- 清單頁同步安全查閱快捷鍵，不啟用資料異動快捷鍵。

## 共用 UI 行為

### Drawer

- 使用共用樣式或元件，維持與圖號模組一致的視覺語言。
- 右側浮出，背景不加深色遮罩。
- drawer 與底頁要有明確邊界，例如陰影、邊線、較高 z-index、固定寬度。
- drawer 內部可捲動，底頁清單仍可閱讀。
- 關閉控制固定在共用 drawer 標頭，且同一 drawer 只出現一個 `X`。

### 寬度拖拉

- drawer 左側提供拖拉把手。
- 最小寬度需保證主要欄位可讀。
- 最大寬度不得完全壓掉清單主畫面。
- 使用 localStorage 記憶每一類 drawer 的上次寬度。
- 視窗縮小時需重新 clamp 到可視範圍內。

### 關閉互動

- `Escape` 關閉目前 drawer。
- 點擊 drawer 外部且不是清單列時關閉 drawer。
- 點擊清單列時不先關閉再重開，應直接切換 drawer 內容。
- 焦點在 input、textarea、select、contenteditable 或確認流程內時，不攔截清單快捷鍵。

### 清單快捷鍵

採用 `ui-design-principles` 的安全快捷鍵模板：

- `ArrowUp / ArrowDown`：上一筆 / 下一筆。
- `Enter`：開啟目前選取列明細。
- `Escape`：關閉右側明細、popover 或暫時狀態。
- `PageUp / PageDown`：清單翻頁。
- `Home / End`：移到清單第一筆 / 最後一筆。
- `Ctrl+C`：若沒有文字反白，複製目前選取列的主識別值。

不覆蓋瀏覽器原生快捷鍵：

- `Ctrl+F`
- `Ctrl+R / F5`
- `Ctrl+S`
- `Ctrl+N`
- `Ctrl+A`

不做全域預設的資料異動快捷鍵：

- `Delete`
- `F2`
- `Ctrl+S`
- `Ctrl+Z / Ctrl+Y`
- `Ctrl+Enter`

## 驗收條件

- 納入範圍的明細欄皆改為圖號模組同款 drawer 行為。
- drawer 開啟時，清單仍是主畫面且可快速切換列。
- drawer 不使用深色遮罩。
- drawer 寬度可拖拉，重新整理後保留上次寬度。
- `Escape` 與點擊外部可關閉 drawer。
- 清單安全快捷鍵在焦點未進入輸入欄位時可用。
- 輸入欄位、下拉欄位與文字反白時不攔截快捷鍵。
- desktop / laptop / mobile 無水平 overflow、重疊、裁切或按鈕被擠壓。
- 固定工具面板與高風險 decision panel 不因本次任務被誤改。

## 測試計畫

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:pdm-master-workbench-layout`
- `npm.cmd run qc:dashboard-detail-priority`
- `npm.cmd run qc:pdm-system-detail-drawer-ui`
- `npm.cmd run qc:pdm-approval-platform`
- `npm.cmd run qc:pdm-numbering-import-center-ui`
- `npm.cmd run qc:pdm-numbering-report-center-ui`
- `npm.cmd run qc:pdm-number-state-flow-ui`
- `npm.cmd run qc:pdm-number-state-flow-phase1c-ui`
- 新增或更新 UI QC，驗證：
  - 指定頁面存在共用 drawer 行為。
  - `/numbering/approvals` legacy route redirect 到 `/approvals`，且 `/approvals` 提供審核工作台明細 panel、相容訊息與篩選 deep link。
  - drawer 開啟 / 關閉 / 切換列。
  - drawer width drag 與 localStorage 記憶。
  - 無暗幕、無水平 overflow。
  - 快捷鍵不覆蓋輸入欄位與瀏覽器原生行為。

## Assumptions

- 本任務不修改 DB schema、API contract、權限矩陣或 sidebar 資訊架構。
- 圖號模組既有設計為全系統清單頁 drawer 模板。
- BOM 工作台與 BOM 審核頁的固定工具面板屬於不同 UI 型態，後續若要改需另開 spec。
