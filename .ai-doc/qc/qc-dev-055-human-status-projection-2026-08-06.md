# QC-DEV-055：人類狀態投影

狀態：`Local RD / QA-QC Passed / Production Release Gated`

日期：2026-08-07

對應：`DEV-055`、`SPEC-PDM-STATUS-UX-004`、`QA-PDM-HUMAN-STATUS-PROJECTION`

執行邊界：隔離本機資料與 source-only contract；未修改正式資料、未執行 schema/migration、deploy、release、commit 或 PR。

## 1. 執行結果

| Gate | 指令 | 結果 |
|---|---|---:|
| Projection / actor / availability matrix | `npm run qc:dev-055:projection` | PASS 45/45 |
| API/UI/cache contract | `npm run qc:dev-055:contract` | PASS 13/13 |
| Browser smoke | `npm run qc:dev-055:browser` | PASS；parts 5、relations 3、drawings 5；三欄桌面／平板／手機證據 `output/playwright/dev-055-human-status/44938e0b-b22c-4031-bc06-f090c82461af/` |
| TypeScript | `npm run typecheck` | PASS |
| Scoped lint | `npx eslint <DEV-055 affected files>` | PASS |
| Shared drawer regression | `npm run qc:pdm-entity-detail-drawer` | PASS 15/15 |
| Part module regression | `npm run qc:part-number-module` | PASS 86/86 |
| Status vocabulary regression | `npm run qc:pdm-status-ui-vocabulary` | PASS 87/87 |
| Status scope regression | `npm run qc:pdm-status-scope-coverage` | PASS 83/83 |

## 2. 覆蓋內容

- part：主圖失效、缺製造圖、待修正、待審核、準備中、已發布、已作廢。
- drawing：可送審、待審核、已取消、已發布。
- relation：缺製造圖、資料衝突、關聯完整、已作廢。
- viewer responsibility：current owner/reviewer、other user、system job、role capability、assignee missing permission、usable 與 terminal。
- availability scope：研發受控→`研發可用`；正式發布且依賴完整→`生產可用`；發布衝突或主要製造圖未發布→`可用範圍待確認`／fail closed。
- filter：`all`、`needs_action`、`waiting`、`system`、`usable`、`history` 與 response limit 前 viewer 篩選；drawing workbench 另保留既有 cursor scan/filter 行為。
- UI：三個清單顯示單一主要狀態；料號與圖料抽屜使用共用 overlay shell；不再顯示「草稿確認」；料號抽屜不再有浮動上下鍵/X 控制；drawer header 保留單一 inline X 與主要狀態。
- 圖號總表：只保留`圖號／品名／工作狀態`三欄，DOM 不含`data-label="下一步"`；點列仍可開啟抽屜操作。

## 3. Browser 證據

瀏覽器 smoke 在 disposable SQLite 上啟動隔離 Next app，從現有本機資料複製 fixture（不回寫原始 `data/ai-pdm.sqlite`），以 Admin demo session 登入，驗證：

1. `/parts`、`/numbering/search`、`/numbering/drawings` 可載入。
2. 三頁均有「工作狀態」篩選。
3. API list rows 均同時含客觀 `humanStatus` 與登入者專屬 `viewerStatus`，並回傳 `Cache-Control: private, no-store`。
4. 料號 drawer 顯示主要狀態、單一 inline close，且無 `.pdm-detail-drawer-floating-actions`。
5. 圖料 drawer 可由明確 entity button 開啟並保留 inline close。
6. 三頁可見文字不含「草稿確認」。

## 4. Two-layer viewer status follow-up (2026-08-07)

- 清單第一層統一為 `待你處理／等他人處理／系統處理中／可使用／已結束`；細分客觀狀態不再與主狀態並列。
- drawing 使用 owner/reviewer exact evidence；part/relation 尚無個人 assignment，使用 role capability 表示共享佇列，不宣稱唯一負責人。
- current user 是 assignee 但缺權限時仍顯示「待你處理」，`canAct=false` 並在第二層指出權限阻擋。
- 由同一個共用 Badge 說明層提供目前狀況、處理責任、自動完成與下一步；支援滑過、聚焦、點擊固定說明，`Escape` 只關閉說明不關閉抽屜。
- Browser smoke 已增加 viewer DTO、private cache、compact vocabulary、hover/focus/Escape 驗證；最新隔離執行：`output/playwright/dev-055-human-status/44938e0b-b22c-4031-bc06-f090c82461af/`，PASS。

## 5. Availability scope follow-up (2026-08-07)

- `availabilityScope` 與 `humanStatus`、`viewerStatus` 分離；只有第一層為 usable 時改寫 badge 文案，不新增第二個狀態 badge。
- 料號的 `生產可用` 必須同時具備料號與主要製造圖的正式發布證據；資料不足或衝突時不樂觀推論。
- Browser 最新三 viewport 截圖已確認同一共用 badge 可顯示 `研發可用` 與 `生產可用`，等待／處理中的列仍顯示 viewer responsibility，不被 scope 文案覆蓋。

## 5. 未執行項目與 release gate

`qc:pdm-drawing-part-relation-view` 依 repository runtime guard 拒絕直接使用受保護的 `data/ai-pdm.sqlite`；本輪另嘗試 disposable SQLite + isolated Next runtime，但啟動未在 180 秒內完成，故未把該 mutation suite 誤記為 PASS。DEV-055 browser 已覆蓋 relations read/drawer/viewport；正式 release 前仍需在可啟動的 disposable DB 重跑既有關聯操作 suite，並補固定 viewport 截圖／overflow evidence。

Production migration、正式資料回填、deploy、release、commit 與 PR 均不在本 DEV-055 execution boundary。
