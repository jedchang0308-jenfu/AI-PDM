# QC Fact Report - BOM Workbench UI

Task: `DEV-BOM-WORKBENCH-001`
Validation plan: `.ai-doc/qa/qa-bom-workbench-ui-validation-plan-2026-06-01.md`

## 驗證結論
通過。BOM 工作台 UI 已有獨立頁面與導航入口，並以 Playwright 驗證工程師可建立 CAD Draft、拖入子件、編輯數量、調整樹狀階層/排序、Undo/Redo、儲存、複製 Draft、設 Active、比較 Draft 與送主管審核。

## 執行項目
| 項目 | 結果 | 證據 |
|---|---|---|
| BOM Workbench UI E2E | Pass | `npm.cmd run qc:bom-workbench-ui` 35/35 passed |
| BOM foundation regression | Pass | `PDM_BASE_URL=http://127.0.0.1:3130 npm.cmd run qc:bom-workbench-foundation` 27/27 passed |
| TypeScript | Pass | `cmd /c node_modules\.bin\tsc.cmd --noEmit` |
| Lint | Pass | `npm.cmd run lint` |
| Numbering sidebar regression | Pass | `npm.cmd run qc:pdm-numbering-core` 234/234 passed |
| Production build | Pass | `cmd /c npm.cmd run build` |

## 實際結果
- `/bom/workbench` production route 已列入 build route list。
- Sidebar 顯示 `BOM 工作台` 並連到 `/bom/workbench`。
- UI E2E 建立測試 parent/child submission，點 `CAD Draft` 後 BOM 樹顯示 CAD reference 子件。
- 搜尋結果可拖入 BOM 樹，新增子件後可把數量改為 `3`。
- 新增虛擬群組後，Undo 可移除、Redo 可還原。
- 群組上移與子件縮排操作可執行；儲存後 PATCH 回應證明 child `parent_line_id` 指向群組，且 child `quantity` 為 `3`。
- 複製 Draft、設 Active Draft、比較 Draft 與送主管審核皆由 UI 操作成功。
- Desktop 1440px 與 mobile 390px 皆無 page-level horizontal overflow；desktop 無 console error。

## 問題與阻塞
- Build 仍出現既有 Turbopack dynamic path tracing warnings，來源在 `src/lib/config.ts`、`src/lib/llm-usage.ts`、`next.config.mjs`，本次 BOM UI 沒有新增該警告。
- 主管審核差異頁仍未完成；目前僅完成工程師工作台內的 Draft compare，不等同正式主管審核頁。
