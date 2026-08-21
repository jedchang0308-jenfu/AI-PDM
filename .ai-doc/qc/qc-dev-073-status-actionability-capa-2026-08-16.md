# QC-DEV-073 修復後最終驗證報告

日期：2026-08-16  
結果：`PASS / Local RD-QA-QC Complete / Production Release Gated`  
範圍：A0005-M01、共通圖號生命週期／工作項／關聯投影、DEV-070 legacy owner 回歸  
資料安全：本輪未寫入主資料庫；瀏覽器驗證使用一次性 SQLite 副本，未執行 production／staging migration、deploy 或 release。

## 1. RD 修復內容

1. `src/lib/repositories/drawing-workbench-async-repository.ts`
   - 不再排除 `lifecycle_state IS NULL` 的最新正式封裝。
   - 由共通 effective lifecycle projector 判斷終結 FFF 證據。
   - 先以版次排序、同版次再以更新時間與封裝 ID 決定目前有效來源，避免舊退回封裝遮蔽最新合法封裝。
2. `src/lib/pdm-entity-detail.ts`
   - 正式圖號明細只採 active candidate；已發布 workspace 的殘留候選關聯不再覆蓋正式關聯。
   - 審核 owner drawer 使用完整根號關聯範圍，畫面與 Relation projection 保持一致。
3. `src/lib/repositories/numbering-async-repository.ts`
   - FFF 待處理摘要排除已取消、已作廢、已被取代或已解決的 submission。
4. 跨頁 UI 回歸測試
   - 補上「圖號工作台 → A0005 明細 → 待辦中心 → 審核中心」真實 rendered-browser 路徑。
   - DEV-070 legacy owner 斷言改用現行 typed `execution.href` 契約，並驗證精確 requestId 與 enabled CTA。

## 2. 驗收結果

| 驗證項目 | 結果 | 證據／重點 |
|---|---|---|
| DEV-073 status/actionability contract | PASS | CAPA-001～012 |
| DEV-070 legacy owner | PASS | `A0048-M03 / rev 0.2`、6 筆根號關聯、exact package、審核動作綁定 exact requestId |
| DEV-070 contract/query/navigation | PASS | shared list、query budget、safe return |
| DEV-070 PostgreSQL | SKIP（受控） | 未設定 `PDM_POSTGRES_URL`；static parity guard PASS，未宣稱 runtime parity |
| DEV-075 current work item | PASS | A0005-M01 rev0.10 records與active inbox/history投影一致 |
| DEV-073 real browser | PASS | 8 cases；desktop 1440×900、tablet 1024×768、mobile 390×844、跨頁案例、orphan recovery、active inbox |
| DEV-070 real browser | PASS | approval workbench、shared owner drawer、核准／退回／補件、返回圖號工作台、console／5xx gate |
| TypeScript | PASS | `npm run typecheck:app` |
| Isolated production build | PASS | `npm run build:isolated`，127 routes完成產生 |

## 3. A0005-M01 最終 UI 事實

- 圖號工作台：顯示「研發可用」，不再顯示「待你處理」。
- 統一明細：目前版次 `0.10`，顯示 `A0005-P01`、`A0005-P02`、`A0005-P03`、`A0005-P04`。
- 明細操作：可看到合法的建立新版次／查看歷史／返回等動作；沒有 phantom review CTA。
- 圖號待辦：A0005-M01 不在 `status=open` 待辦中。
- 審核中心：A0005-M01 不在 active approval inbox；歷史 FFF 仍可追溯，但不被當成目前待處理工作。
- UI sweep：visible error、console/page error、非預期 API 4xx/5xx、瀏覽器 mutation 均為 0。

## 4. 證據位置

- DEV-073 browser：`output/qa/dev-073-status-actionability/DEV073-20260816T125206Z-dc0ca99b/`
- DEV-070 browser：`output/playwright/dev-070-approval-workbench/approval-workbench.png`
- 既有 CAPA 歷史報告：`.ai-doc/qc/qc-dev-073-status-actionability-capa-2026-08-14.md`

## 5. 結論與限制

本輪指定的 RD 修復、A0005 跨頁一致性、DEV-070 legacy owner、DEV-073 actionability 與最後一次全套本機驗證均通過，P0/P1=0。

本報告只代表 local QC；正式資料修復、PostgreSQL runtime parity、production migration、deploy、release仍須另走 release gate。
