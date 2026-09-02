# QA Plan：DEV-066 三工作台頂部欄一致化與肌肉記憶

日期：2026-08-11；amended 2026-08-21、2026-09-01
Related DEV：`DEV-066`、`DEV-112`
權威規格：`.ai-doc/specs/SPEC-UX-PDM-WORKBENCH-TOPBAR-001-unified-toolbar-muscle-memory.md`

## 0. DEV-112 Drawing／Part placement regression amendment（已執行／PASS）

Status：`Local RD Implemented / RD Tech Lead Corrections Closed / QA-QC Complete 24/24 / Production Release Gated`。

DEV-112 對 Drawing／Part 有意取代本文件 `TB-002`、`TB-004`、`TB-007..011`中「view switch在toolbar footer trailing」與
「清單／預覽圖」的expected；新的固定分母是 DEV-065 QA §0S `TVM-001..024`。TB歷史13案仍保留DEV-066 provenance，
不能直接改標為DEV-112 PASS。

DEV-112 regression boundary固定如下：

- Drawing／Part page header只保留名稱與建立動作，filter只管理資料範圍；`顯示方式`在結果區上緣，三選項固定為
  `文字清單／3D 清單／預覽圖`。驗證歸屬`TVM-001..005`。
- Relation的`關係樹／矩陣`位置與行為不改；若DEV-112使Relation switch、selection、drawer或query退化，整體FAIL。
- 三工作台filter mechanics、history-control removal與pagination markup/order/location不改；既有`TB-001/003/005/006/013`
  作受影響回歸，必須在同一candidate重跑，不能只引用歷史13/13。
- 四viewport不再要求Drawing／Part與Relation的mode switch「相同右側位置」；改驗相同定義是否在正確任務區域：
  Relation mode仍屬relation toolbar，Drawing／Part presentation mode屬result display bar。
- Keyboard focus order改為filters → result display mode → result content → pagination；header建立動作仍依DOM自然順序可達，
  切換mode不得搶走result focus或新增thumbnail tab stop。

本 amendment已由DEV-112 preview SPEC §0T與QA §0T補成可執行的repository contract，並由同一candidate完成TVM-001..024驗證；
完整pass/fail、candidate freeze與evidence仍以DEV-112 QA §0T／§0S為準。`scripts/qc-dev-066-workbench-topbar.mjs`保留DEV-066歷史
placement expected，不因DEV-112改寫或直接當current gate；Drawing／Part replacement由`TVM-001/002/017/018`，Relation未受影響由
`npm.cmd run qc:dev-062:relation`及DEV-112 browser receipt驗證。這不授權deploy或release。

## 1. 驗證目的

確認圖料、圖號、料號三個工作台使用同一頂部欄空間語法：篩選器同列、三個工作台均不顯示 inline history 控制、顯示模式固定右側、分頁固定結果面板底部；沒有模式切換時不留下空白 footer，既有 domain 行為沒有回歸。

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
| TB-002 | footer 右側固定位置 | DOM + screenshot | 三模組均不渲染 history；可用 view switch 在 footer trailing；三模組 class/順序一致 |
| TB-003 | relation mode parity | focused interaction | 關係樹／矩陣仍可切換，既有 selection/drawer/query 行為不變 |
| TB-004 | preview mode parity | focused interaction | 圖號／料號清單與預覽圖切換遵守 DEV-065 URL/local preference，不新增 request |
| TB-005 | pagination contract | unit/static + interaction | 三模組使用共同 `<nav aria-label="工作台分頁">`；順序與 disabled/loading 一致 |
| TB-006 | single page/no data | browser/static | 無可分頁時不渲染空白 nav；跨頁時 nav 位於結果 panel 底部且靠右 |
| TB-007 | responsive 1440×900 | browser screenshot | filter 單列、footer 左右對齊、無 overflow/overlap/crop |
| TB-008 | responsive 1024×768 | browser screenshot | filter 可分列但 footer 仍左右對齊、控制項可見 |
| TB-009 | responsive 768×1024 | browser screenshot | filter 合理換列、footer 不重疊、模式切換不被推入內容 |
| TB-010 | responsive 390×844 | browser screenshot | filter/footer 垂直堆疊、按鈕可觸控、無水平滾動 |
| TB-011 | keyboard/a11y | keyboard + DOM | focus order 為 filters → mode → content/pagination；三模組不存在的 history control 不進 Tab 順序 |
| TB-012 | regression boundary | lint/typecheck/request diff | 不改 API/schema/permission/preview resolver；affected lint 無 error；既有 focused tests 維持通過 |
| TB-013 | workbench history control removal | DOM/static + deep-link smoke | `/numbering/search`、`/numbering/drawings`、`/parts` 均不渲染 `drawing-workbench-history-toggle`；無 mode switch 時不渲染空白 footer；`history=include` 與 history-only detail 仍可讀取 |

## 4. Evidence 要求

RD 必須提供：

1. 實際修改檔案清單與 `git diff --check` 結果。
2. TB-001～TB-006、TB-013 的 static/interaction output。
3. 四 viewport 截圖或 browser trace，包含三條 route 的同一組 toolbar 位置。
4. 既有 relation/layout switch、cursor pagination 與 DEV-065 preview contract 的 focused regression 結果。
5. 若 browser 因 managed auth 或環境無法執行，明確標記 `BLOCKED`，不可以 lint/typecheck 代替 real-browser PASS。

## 5. Failure/stop rule

任一模組出現 footer 結構漂移、模式切換回到不同列、分頁 markup 分叉、既有 route 行為改變、RWD overflow、ARIA 缺漏或非預期 request，整體不得宣告 PASS；先退回 RD 修正，再由 QA 重跑受影響案例。

## 6. 完成判定

TB-001～TB-013 全部有 evidence 且無 open P0/P1 UI regression，才可將 DEV-066 標記為本機 UI 交付完成。Production、deploy、merge、PR、release 另行處理。
