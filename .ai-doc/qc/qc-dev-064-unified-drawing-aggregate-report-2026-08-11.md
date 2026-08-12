# QC Report：DEV-064 圖號單一資料層與共用明細入口

Status: `PASS / Local Isolated / Production Migration & Release Gated`
Date: 2026-08-11
Owner: QC
Related DEV: `DEV-064`
Related SPEC: `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-AGGREGATE-001-single-data-layer.md`
Related QA: `.ai-doc/qa/qa-dev-064-unified-drawing-aggregate-validation-plan-2026-08-11.md`

## Verdict

PASS。待處理、審核中與研發可用不再是兩個圖號資料物件；同一圖號由 canonical `Drawing + DrawingRevision + DrawingRevisionFile` 承接，狀態轉移前後 Drawing／Revision／File identity 與 row count保持單一。工作台只從 `drawings` 建立 identity row，舊 candidate/formal deep link 可讀且會正規化到 canonical key。

本結論只涵蓋 local isolated SQLite 與 local Next.js/Chromium。PostgreSQL 030 尚未套用 disposable shadow；staging／production migration、live backfill、deploy、release與smoke皆未執行。

## Fact evidence

| Gate | Result | Evidence |
|---|---:|---|
| DEV-064 aggregate | 7/7 PASS | 未取號→取號 ID 不變且取號後不可靜默改號；多圖 workspace各自 stable ID；promotion後1 Drawing／1 Revision／1 File；legacy keys同一 ID；DB immutability/state guards；canonical SQL；SQLite/PostgreSQL artifact |
| DEV-052 lifecycle | 8/8 PASS | create/files/submit、fault rollback、retry formalization、audit與legacy addendum |
| DEV-053 schema/read/http/ui/flow | 64/64 PASS | 9 + 10 + 14 + 24 + 7 |
| DEV-053 real operation | 28/28 PASS | run `DEV053-20260811-061739-local-isolated` |
| DEV-062 compatibility | 14/14 PASS | core 6/6、compat 8/8 |
| DEV-063 vocabulary | 10/10 PASS | 使用者可見詞彙與data rewrite invariants |
| Static gates | PASS | TypeScript、affected ESLint、`git diff --check` |

## State-machine facts

- `preparing -> in_review`、`in_review -> preparing`（撤回）、`in_review -> rd_controlled`、`rd_controlled -> released/superseded`為允許路徑。
- `rd_controlled -> preparing`被 `DRAWING_REVISION_STATE_TRANSITION_DENIED`拒絕。
- 受控版次內容改寫被 `DRAWING_REVISION_CONTROLLED_IMMUTABLE`拒絕。
- 受控版次 file relation新增、改寫或刪除被 `DRAWING_REVISION_FILES_CONTROLLED_IMMUTABLE`拒絕。
- UI 按鈕隱藏不是唯一防線；既有 server permission／row-version／snapshot policy與DB guard同時存在。

## Browser facts

- Viewports：1440×900、1280×720、1024×768、390×844。
- 候選圖號 `Z3053-M01` 從工作台直接開啟圖號明細，不再顯示「無明細／暫停開發」handoff。
- 真實執行建立首版、上傳2D/3D、送審、撤回、重送、核准；核准後同一canonical row顯示研發可用並讀回兩個受控檔案。
- 舊 formal key開啟後，URL zero-write正規化到 `drawing:{canonicalDrawingId}`。
- Unexpected console error = 0、visible error = 0、5xx = 0、production connection/write = false、fixture cleanup = removed。

Evidence directory：`output/playwright/dev053-real-operation/DEV053-20260811-061739-local-isolated/`。

## Residual release gates

1. 取得經批准的 disposable PostgreSQL shadow credential，執行 030 migration與schema/data compare。
2. 正式環境另做 backup、deterministic backfill count、duplicate/foreign-key check、rollback演練。
3. migration、application deploy與feature activation必須同一release plan，避免程式先讀canonical tables但資料庫尚未升級。
4. production smoke需覆蓋候選明細、撤回重送、核准正式化、受控不可變性與舊deep-link。
