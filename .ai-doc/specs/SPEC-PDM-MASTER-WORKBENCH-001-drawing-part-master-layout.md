# SPEC-PDM-MASTER-WORKBENCH-001: 圖料三頁一致化主資料工作台

狀態: Implemented
日期: 2026-06-04
專案: AI_PDM
關聯任務: `DEV-PDM-MASTER-WORKBENCH-001`
文件類型: PM / UX 架構規格

## 1. 文件目的

將「圖料工作台」、「圖號管理」、「料號工作台」三個相鄰入口整理成一致的 PDM 主資料工作台版型。

此文件只定義 UI/UX 與驗證標準，不變更 API、資料庫 schema、權限矩陣或 sidebar 資訊架構。

## 2. 問題定義

目前三頁入口相鄰，但排版邏輯不同：

- 使用者切換頁面時，需要重新判斷搜尋、總表、明細與動作按鈕的位置。
- 「圖料工作台」、「圖號管理」、「料號工作台」都屬於 PDM 主資料入口，但畫面節奏不一致。
- 統計卡、明細區與表格在不同頁面有不同優先級，會削弱總表作為主畫面的肌肉記憶。

目標是讓三頁在視覺結構、操作順序與選取列後的明細位置上高度一致。

## 3. 已定案決策

- 三頁同權重，不將其中任一頁降為輔助頁。
- 桌機採左右工作台版型。
- 左側為總表主畫面。
- 右側為固定明細檢視。
- 手機版改為總表在上、明細在下。
- 總表是第一主視覺，統計與明細不得搶主畫面。

## 4. 目標版型

### 4.1 Topbar

三頁 topbar 結構固定：

- 左側：頁面標題與一句用途說明。
- 右側：重新整理按鈕。
- 高度、間距、標題層級與按鈕位置一致。

### 4.2 Filter Row

三頁篩選列位置與順序固定：

1. 關鍵字
2. 類型或用途
3. 狀態
4. 階段
5. 查詢按鈕

若某頁沒有對應欄位，保留相同位置邏輯，以最接近語意的欄位替代。

### 4.3 Main Area

桌機版：

- 左側：總表 panel，為主要操作區。
- 右側：明細 panel，顯示目前選取列的補充資訊與動作。
- 建議比例約為 `62% / 38%`。

手機版：

- 上方：總表 panel。
- 下方：明細 panel。
- 不允許頁面層水平溢出。

### 4.4 Compact Summary

三頁可顯示摘要數字，但必須採 compact summary：

- 放在篩選列標題區或總表 panel header。
- 不使用大型 stats cards 作為第一主視覺。
- 摘要不得把總表推到第二視覺層。

## 5. 三頁責任邊界

| 頁面 | 總表 | 右側明細 |
|---|---|---|
| 圖料工作台 | 跨主根號、料號、圖號的追溯總表 | 主根號明細、關聯圖號/料號、提醒、audit、MA 影響 |
| 圖號管理 | 圖號總表 | 圖號治理資訊、關聯料號、追溯、MA 影響入口 |
| 料號工作台 | 料號總表 | 料號屬性、關聯圖號、變體、成本資訊 |

三頁差異只允許存在於資料欄位、明細內容與特定動作，不允許版型與操作順序分歧。

## 6. 不納入本次

- 不改 API wire shape。
- 不改資料庫 schema。
- 不改權限矩陣。
- 不改 sidebar 資訊架構。
- 不新增跨頁狀態同步。
- 不重新設計 PDM 編碼規則。

## 7. 驗收標準

- 三頁桌機版皆呈現 `topbar -> filter -> left table / right detail`。
- 三頁手機版皆呈現 `topbar -> filter -> table -> detail`。
- 點選總表列後，右側明細更新。
- 選取列使用一致的高亮樣式。
- 總表為第一主視覺，明細與統計不搶主畫面。
- 未登入、錯誤、載入、空狀態位置一致。
- 三頁無頁面層水平溢出。

## 8. 驗證計畫

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:pdm-numbering-core`
- `npm.cmd run qc:pdm-numbering-search-ui`
- `npm.cmd run qc:part-number-module`
- 新增或更新 UI static / Playwright QC：
  - 驗證三頁存在共用 layout class。
  - 驗證三頁桌機左右工作台。
  - 驗證三頁手機上下排列。
  - 驗證三頁點選列後明細更新。
  - 驗證 `/`、`/numbering/search`、`/numbering/drawings`、`/parts` 回 200。

## 9. 後續 RD 實作預期

RD 實作時應優先建立共用 layout CSS class：

- `pdm-master-workbench`
- `pdm-master-toolbar`
- `pdm-master-grid`
- `pdm-master-table-panel`
- `pdm-master-detail-panel`

三頁應使用上述共用版型，避免各頁繼續以 inline grid 或獨立 workbench class 發散。
