# QA Plan：DEV-066 三工作台頂部欄一致化與肌肉記憶

日期：2026-08-11
Related DEV：`DEV-066`
權威規格：`.ai-doc/specs/SPEC-UX-PDM-WORKBENCH-TOPBAR-001-unified-toolbar-muscle-memory.md`

## 1. 驗證目的

確認圖料、圖號、料號三個工作台使用同一頂部欄空間語法：篩選器同列、歷史條件固定左側、顯示模式固定右側、分頁固定結果面板底部，且既有 domain 行為沒有回歸。

## 2. Scope

### In scope

- `src/components/relation-workbench.tsx`
- `src/components/drawing-workbench.tsx`
- `src/components/part-workbench.tsx`
- `src/components/pdm-workbench-pagination.tsx`
- `src/app/globals.css`
- 三條既有工作台 route 的 DOM、keyboard、RWD、分頁與模式切換。

### Out of scope

- API、schema、migration、permission、status、preview resolver、storage key、資料排序與 production/staging。

## 3. 測試矩陣

| ID | 驗證項目 | 方法 | Pass criteria |
|---|---|---|---|
| TB-001 | 三模組 filter row | DOM/static contract | 三模組均存在一個 filter grid，搜尋與所有 filter 在其內；模式切換不在 grid 內 |
| TB-002 | footer 左右固定位置 | DOM + screenshot | history 在 footer leading；view switch 在 footer trailing；三模組 class/順序一致 |
| TB-003 | relation mode parity | focused interaction | 關係樹／矩陣仍可切換，既有 selection/drawer/query 行為不變 |
| TB-004 | preview mode parity | focused interaction | 圖號／料號清單與預覽圖切換遵守 DEV-065 URL/local preference，不新增 request |
| TB-005 | pagination contract | unit/static + interaction | 三模組使用共同 `<nav aria-label="工作台分頁">`；順序與 disabled/loading 一致 |
| TB-006 | single page/no data | browser/static | 無可分頁時不渲染空白 nav；跨頁時 nav 位於結果 panel 底部且靠右 |
| TB-007 | responsive 1440×900 | browser screenshot | filter 單列、footer 左右對齊、無 overflow/overlap/crop |
| TB-008 | responsive 1024×768 | browser screenshot | filter 可分列但 footer 仍左右對齊、控制項可見 |
| TB-009 | responsive 768×1024 | browser screenshot | filter 合理換列、footer 不重疊、模式切換不被推入內容 |
| TB-010 | responsive 390×844 | browser screenshot | filter/footer 垂直堆疊、按鈕可觸控、無水平滾動 |
| TB-011 | keyboard/a11y | keyboard + DOM | focus order 為 filters → history → mode → content/pagination；active/disabled 可辨識 |
| TB-012 | regression boundary | lint/typecheck/request diff | 不改 API/schema/permission/preview resolver；affected lint 無 error；既有 focused tests 維持通過 |

## 4. Evidence 要求

RD 必須提供：

1. 實際修改檔案清單與 `git diff --check` 結果。
2. TB-001～TB-006 的 static/interaction output。
3. 四 viewport 截圖或 browser trace，包含三條 route 的同一組 toolbar 位置。
4. 既有 relation/layout switch、cursor pagination 與 DEV-065 preview contract 的 focused regression 結果。
5. 若 browser 因 managed auth 或環境無法執行，明確標記 `BLOCKED`，不可以 lint/typecheck 代替 real-browser PASS。

## 5. Failure/stop rule

任一模組出現 footer 結構漂移、模式切換回到不同列、分頁 markup 分叉、既有 route 行為改變、RWD overflow、ARIA 缺漏或非預期 request，整體不得宣告 PASS；先退回 RD 修正，再由 QA 重跑受影響案例。

## 6. 完成判定

TB-001～TB-012 全部有 evidence 且無 open P0/P1 UI regression，才可將 DEV-066 標記為本機 UI 交付完成。Production、deploy、merge、PR、release 另行處理。
