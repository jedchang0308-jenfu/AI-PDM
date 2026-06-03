# QA 驗證計畫：PDM 圖料號自動化核心資料模型與占號服務

日期：2026-06-01
對應任務：`DEV-PDM-NUMBERING-001`
對應規格：`.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md`

## 驗證範圍

本輪驗證只覆蓋第一個可交付切片：

- 圖料號核心資料表。
- 唯一性與主要 MA 圖約束。
- 內建規則版本、審核模板、內建角色。
- 交易式占號 repository 的存在與基本防呆。
- TypeScript、lint、build 不被破壞。

不覆蓋：

- 圖料號申請 UI。
- DVT 晉升 UI。
- 審核矩陣 UI。
- MA 圖作廢完整流程。
- staging 匯入實際畫面。
- Supabase Storage 檔案轉移。

## 使用者關鍵流程

- RD 建立新料件時，系統可分配主根號、料號與可選圖號。
- 系統不可產生重複主根號、料號或圖號。
- 一個料號不可同時掛多張主要 MA 圖。
- OT 圖必須保留用途描述防呆。
- 萬用料號必須保留使用理由防呆。

## FMEA 風險

| 失效模式 | 影響 | 偵測方式 | 對策 |
|---|---|---|---|
| 主根號重複 | 圖料號追溯錯亂 | schema unique constraint 測試 | `part_roots.root_code` 唯一 |
| 料號重複 | BOM/採購引用錯誤 | schema unique constraint 測試 | `part_numbers.part_number` 唯一 |
| 圖號重複 | 製造依據錯誤 | schema unique constraint 測試 | `drawing_numbers.drawing_number` 唯一 |
| 一料號多主要 MA 圖 | 發包/製造無法判斷依據 | partial unique index 測試 | `primary_manufacturing` 每料號唯一 |
| repository 未使用 transaction | 併發占號風險 | 靜態檢查 | repository 必須使用 DB transaction |
| 防呆未實作 | OT/萬用料號資料不完整 | 靜態檢查 | repository 必須有錯誤碼 |
| TypeScript 匯出錯誤 | build 失敗 | `tsc --noEmit` / build | 修正型別與匯出 |

## 測試案例

- `NUM-SCHEMA`：所有核心表存在。
- `NUM-SCHEMA`：預設 numbering rule、rule templates、roles 已 seed。
- `NUM-CONSTRAINT`：重複 root code 被拒絕。
- `NUM-CONSTRAINT`：重複 part number 被拒絕。
- `NUM-CONSTRAINT`：重複 drawing number 被拒絕。
- `NUM-CONSTRAINT`：同一料號第二張 primary MA link 被拒絕。
- `NUM-REPO`：repository 匯出 `createNumberingRecord`。
- `NUM-REPO`：repository 使用 transaction。
- `NUM-REPO`：repository 具備 OT purpose 與 universal reason 防呆。
- `NUM-QC`：package script 暴露 `qc:pdm-numbering-core`。
- TypeScript：`tsc --noEmit` 通過。
- Lint：`npm.cmd run lint` 通過。
- Build：`npm.cmd run build` 通過。

## 通過標準

- 針對性 QC 測試全部通過。
- TypeScript 檢查通過。
- lint 通過。
- build 通過。
- 若 build 僅有既有 warning，需確認與本輪變更無直接關係。

## 證據收集

- `npm.cmd run qc:pdm-numbering-core` 輸出。
- `cmd /c node_modules\\.bin\\tsc.cmd --noEmit` 結果。
- `npm.cmd run lint` 結果。
- `npm.cmd run build` 結果。
- 變更檔案清單。
