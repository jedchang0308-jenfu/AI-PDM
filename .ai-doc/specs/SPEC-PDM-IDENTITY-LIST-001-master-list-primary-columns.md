# SPEC-PDM-IDENTITY-LIST-001: 圖料三頁主識別清單 UI/UX 優化

狀態：Spec Created
日期：2026-06-04
專案：AI_PDM
關聯任務：`DEV-PDM-IDENTITY-LIST-001`
延伸自：`SPEC-PDM-MASTER-WORKBENCH-001`
文件類型：PM / UX 設計規格

## 1. 文件目的

本規格定義「圖料工作台 / 圖號管理 / 料號工作台」三個 PDM 主資料清單的資訊權重調整。
既有 `DEV-PDM-MASTER-WORKBENCH-001` 已完成三頁版型一致化，本任務延伸該成果，將重點從「工作台版型一致」推進到「清單主識別欄位一致」。

目標是讓 RD 在切換三頁時優先掃描 `圖號 / 品名 / 料號`，而不是被狀態、成本、用途、動作等次要資訊分散注意力。

## 2. 問題定義

目前三頁已共用 topbar、filter、左側總表與右側固定明細，但清單欄位仍偏平均分配：

- 圖料工作台以 `類型 / 代碼 / 名稱 / 主根號 / 狀態 / 階段 / 關聯 / 提示` 呈現，工程識別資訊被拆散。
- 圖號管理將用途、主根、狀態、關聯料號、提醒、動作都放進同一列，圖號本身沒有取得足夠主視覺寬度。
- 料號工作台清單缺少明確品名欄，材質、成本與圖號分走主畫面注意力。

RD 的主要判斷不是先看狀態或成本，而是先確認「這是哪一張圖、哪個品名、哪個料號」。因此三頁清單應建立一致的主識別欄位邏輯。

## 3. 已定案決策

- 三頁清單表頭統一為 `圖號 / 品名 / 料號 / 其他`。
- `品名` 為最大彈性欄，吃掉主要剩餘寬度。
- `圖號` 與 `料號` 以內容容納寬度為主，使用 nowrap 顯示。
- 狀態、階段、用途、成本、提醒、關聯數量降級為 compact badge、icon hint 或右側明細內容。
- 圖號管理清單不保留大型動作欄；追溯與 MA 影響分析入口放在右側固定明細。
- 手機版改為卡片式堆疊：`圖號 -> 品名 -> 料號 -> 其他 chips`，不得產生頁面層水平溢出。

## 4. 三頁資料映射

| 頁面 | 圖號欄 | 品名欄 | 料號欄 | 其他欄 |
|---|---|---|---|---|
| 圖料工作台 `/numbering/search` | `drawingNumber ?? primaryDrawingNumber` | `displayName`，root / drawing row 可用 `coreName` 補足 | `partNumber` 或料號數量摘要 | 類型、狀態、階段、提醒、關聯摘要 |
| 圖號管理 `/numbering/drawings` | `drawingNumber` | `coreName` | `linkedPartNumbers` compact chips | MA/OT、狀態、階段、提醒 |
| 料號工作台 `/parts` | `primaryDrawingNumber` | `partName` | `partNumber` | 材質/顏色、成本摘要、狀態或成本待審提示 |

圖號管理的品名採 `coreName`，不展開多個關聯料號品名，避免清單變成多列或資訊過載。

## 5. UI 架構

### 5.1 共用 identity table

三頁清單應共用 identity-first table class：

- `pdm-identity-table`
- `pdm-identity-code`
- `pdm-identity-name`
- `pdm-identity-meta`
- `pdm-meta-strip`

### 5.2 欄寬規則

- `圖號`：內容自適應，容納常見圖號長度，不主動換行。
- `品名`：主要欄位，允許最多 2 行顯示，超出以視覺截斷或行高限制處理。
- `料號`：內容自適應，容納常見料號長度，多筆料號以 chip wrap 呈現。
- `其他`：固定窄欄，不得重新塞入大段文字或大型按鈕。

### 5.3 次要資訊降級規則

以下資訊不得與 `圖號 / 品名 / 料號` 同等視覺權重：

- 狀態
- 階段
- 用途
- 主根號
- 標準成本
- 材質 / 顏色
- 提醒數
- 關聯數量
- 追溯 / MA 影響分析動作

這些資訊可以放在 `其他` 欄的 compact chips、icon hint，或移到右側明細。

## 6. API / Type 邊界

- 不改 DB schema。
- 不改權限矩陣。
- 不改 sidebar 資訊架構。
- 不改三頁工作台主版型。
- 允許 backward-compatible API 擴充：`NumberingSearchResultRecord` 可新增 `coreName`，讓圖料工作台中的 root / drawing row 能正確呈現品名。
- `/api/numbering/drawings` 與 `/api/parts` 已有足夠欄位，原則上不需變更 API。

## 7. 驗收標準

- 三頁清單表頭順序皆為 `圖號 / 品名 / 料號 / 其他`。
- 桌機版主識別三欄合計寬度 >= 清單可視寬度 70%。
- `其他` 欄寬 <= 清單可視寬度 22%。
- 點選清單列後右側明細仍正確更新。
- 手機版為卡片式堆疊，且無 page-level horizontal overflow。
- 圖號管理清單移除動作欄後，右側明細仍提供圖料追溯與 MA 影響分析入口。
- 次要資訊不得重新變成大段說明或大型獨立欄位。

## 8. 測試計畫

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:pdm-master-workbench-layout`
- `npm.cmd run qc:pdm-numbering-search-ui`
- `npm.cmd run qc:part-number-module`
- 新增或擴充 UI QC：
  - 驗證三頁存在 identity table class。
  - 驗證三頁表頭順序。
  - 驗證桌機欄寬比例。
  - 驗證手機無水平溢出。
  - 驗證圖號管理移除清單動作欄後，右側明細仍有追溯與 MA 影響分析入口。

## 9. 不納入本次

- 不重開 `DEV-PDM-MASTER-WORKBENCH-001`。
- 不改 API 行為與資料治理規則。
- 不改圖號 / 料號 / 主根號命名規則。
- 不調整審核矩陣、BOM 關聯或成本審核流程。
- 不執行 UI 開發；本輪僅建立 PM 專案文件與 DEV task。
