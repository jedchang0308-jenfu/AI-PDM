# QA Plan：DEV-065 圖號／料號 3D 預覽圖模式

Status: `QA Plan Ready / RD Not Started / Production Migration & Release Gated`
Date: 2026-08-11
Owner: QA
Related DEV: `DEV-065`
Related SPEC: `.ai-doc/specs/SPEC-PDM-WORKBENCH-PREVIEW-GALLERY-001-drawing-part-3d-preview-mode.md`
Related ADR: `Not required — bounded compatible extension`

## 1. Objective

驗證 Drawing 與 Part workbench 可在不退化既有清單能力的前提下，切換成 Windows 檔案總管式 3D thumbnail gallery；Drawing 顯示自身最新版 3D，Part 嚴格顯示同根號最小圖號流水號之代表圖最新版 3D，且缺圖、權限、效能與視覺狀態均 fail safe。

使用思考習慣：#批判、#設計思考、#非語言溝通、#可驗證性、#證據基礎

## 2. Pass/fail boundary

- PASS：`PG-001`～`PG-014` 全部有可重現證據，無 waived high-risk case；typecheck、affected lint、focused regression與真實 Chromium 全通過。
- FAIL：來源演算法錯誤、發生任一禁止 fallback、跨公司/未授權可讀、per-row query、清單能力退化、visible error、broken image、重疊/裁切/overflow。
- BLOCKED：測試無法使用 isolated local data/runtime、preview fixture 無法確定 provenance、或需要 production credential/migration。
- 本計畫不授權 QA/QC 修產品、不授權 live migration、正式資料 mutation、deploy/release。

## 3. Acceptance matrix

| ID | Scenario | Expected evidence |
|---|---|---|
| `PG-001` | Drawing/Part 各開啟工作台 | 顯示 `清單／預覽圖` segmented control；外觀與圖料 `關係樹／矩陣` 同一視覺語言，active/focus 不只靠顏色。 |
| `PG-002` | 首訪、有效 URL、已存 preference、無效 storage/query | precedence 為 URL > per-module preference > list；Drawing/Part 各自記憶；無效值回 list，無 hydration error。 |
| `PG-003` | 有搜尋、排序、分頁、selection、drawer 時切換 layout | 不 reload；其他 query、資料、選取與 drawer context保留；`replaceState` 不增加多餘 history。 |
| `PG-004` | Drawing 有多 revision、多 3D | 只取 canonical drawing 最新非 terminal revision 的 active primary `cad_3d` 與 hash-matched real derivative。 |
| `PG-005` | 同 root 有 sequence 1/2/10 與同 sequence tie | Part 永遠取數值最小 sequence；tie 依 natural drawing number、drawing id；卡片顯示 `代表圖`。 |
| `PG-006` | 最小 sequence 無 3D但下一張有；最新 revision 無3D但舊版有；只有2D | 三者皆 `無 3D 預覽`；不得跳下一張、舊版或2D。 |
| `PG-007` | ready/queued/running/delayed/failed/missing/unavailable | state文案、圖示/動態、broken-image fallback正確；不顯示 raw error/hash/storage/asset/permission。 |
| `PG-008` | 長編號、長名稱、各 lifecycle status | 卡片可辨識完整 code/name/status；截斷有 accessible full text；Part代表來源與Drawing revision可讀。 |
| `PG-009` | Mouse/keyboard 操作 gallery | card開既有 detail drawer；Arrow/Home/End/PageUp/PageDown/Enter/Escape/Ctrl/Cmd+C通過；無 write shortcut。 |
| `PG-010` | list size 1/20/50 | preview metadata query為常數；Part總 query <=19、Drawing額外<=4；image request lazy且單次<=6。 |
| `PG-011` | restricted/cross-company/tampered rowKey、stale hash、fake worker、missing bytes | fail closed；不 stream錯誤檔、不洩漏存在性；list除安全違反外以 unavailable降級。 |
| `PG-012` | 1440×900、1024×768、768×1024、390×844 | 無水平 overflow、切換器/卡片/文字不重疊或裁切、模型 `contain`、drawer與底部可達。 |
| `PG-013` | 真實頁面快速切 filter/layout/reload/back-forward | stale response不覆蓋新狀態；console/page/server 5xx、visible error、未處理 rejection皆為0。 |
| `PG-014` | 回到清單並執行既有能力 | filters/sort/pagination/history toggle/status/action/detail/keyboard capability parity；Relation module完全不變。 |

`PG-002` 同時覆蓋 feature flag：`PDM_WORKBENCH_PREVIEW_GALLERY_V1=false` 時switch不存在、`layout=preview`回list、preview metadata query為0、row preview為null、thumbnail route為404；設為true且相依workbench能力齊備時才啟用完整功能。

## 4. Required fixtures

所有 fixture 使用 isolated SQLite/temp repository；manifest 記錄 company、actor、root/drawing/part/revision/file/derivative/job IDs與建立方式。

| Fixture | Required shape |
|---|---|
| `F-DRAW-READY` | 一 drawing，至少兩 revision；最新版有 primary 3D與 real ready PNG。 |
| `F-DRAW-LATEST-MISSING` | 舊版 ready 3D、最新版沒有 3D；expected missing。 |
| `F-ROOT-MIN-MISSING` | 同 root：sequence 1 無3D、sequence 2 ready；Part expected仍指 sequence 1/missing。 |
| `F-ROOT-NATURAL` | sequence 2 與10，證明數值排序；另建同 sequence tie證明 deterministic。 |
| `F-PREVIEW-STATES` | queued、running未逾時、running逾時、failed、stale hash、fake worker、missing bytes。 |
| `F-SECURITY` | 同公司 restricted actor、cross-company actor、tampered rowKey。 |
| `F-LONG-TEXT` | 超長 drawing number、part number/name與多狀態 badge。 |

正式資料庫與既有 `data/ai-pdm.sqlite` 不得作可變 fixture。

## 5. Evidence layers

### 5.1 Static and contract

- `npx.cmd tsc --noEmit --pretty false`。
- affected-file ESLint。
- schema/migration static parity；031 只驗 artifact，不 apply production。
- shared base row snapshot證明 Relation未新增 preview欄位。
- source resolver unit/contract test覆蓋順序、tie、revision、fallback與state mapping。

### 5.2 Repository and HTTP

- Drawing/Part list response preview summary shape，href不含 raw asset/storage資訊。
- stream route auth/company/row/source/hash/generator驗證。
- PNG content type、nosniff、private cache、ETag/304。
- 1/20/50 rows query counter；不得以 mock repository掩蓋 N+1。
- fault injection：metadata projection非安全錯誤降級、permission/integrity fail closed。

### 5.3 Real Chromium

使用 isolated local Next.js與真實 Chromium。主要流程以可見 control、role、label、keyboard操作；API/DB只用於 fixture與negative probe，必須在 evidence標示。

每個 viewport至少保存：

1. Drawing list與preview各一張。
2. Part list與preview各一張，畫面中可見 `代表圖`。
3. ready、missing、pending/failed至少各一例。
4. selected/focus/drawer開啟狀態。
5. DOM width、scrollWidth、viewport width與console/network摘要。

不得只依 screenshot像素判斷來源正確；必須同時比對 list JSON、fixture ID與可見 `代表圖`。

## 6. Regression minimum

- DEV-053 unified Drawing workbench list/detail/URL flow。
- DEV-061 file ownership、primary role、3D content reuse。
- DEV-062 Workbench Core cursor/controller/Part workbench與Relation unchanged。
- DEV-064 canonical Drawing identity、legacy row-key resolution。
- DEV-056 native preview hash/readiness/fake-worker rejection。
- `PdmWorkbenchList` keyboard、filter、history toggle與detail drawer現有測試。

## 7. Accessibility and non-verbal review

人工/AI目視逐項記錄 PASS/FAIL：

- active layout、focus、selected card、preview state互相可分辨且不只靠色彩。
- skeleton/delayed animation在 reduced-motion下停用或簡化。
- screen reader順序與視覺順序一致；每張 card有唯一且完整 accessible name。
- `代表圖` 是持續可見文字，不只藏在 tooltip。
- placeholder仍像可開明細的卡片，不被誤認為 disabled。
- 3D模型不因 `cover` 被裁切，深/淺主題（若現有頁面支援）對比可讀。

## 8. Isolation and cleanup gate

| Gate | Required |
|---|---|
| Runtime | 隨機可用 port、獨立 Next dist、health check通過；不接手未知 3000 process。 |
| Data | temp SQLite/temp repository；`productionConnected=false`、`productionWrites=false`。 |
| Auth | `.invalid` actors；不同 company fixture；不得使用正式 session/credential。 |
| Provenance | run ID、git SHA、dirty state、source manifest SHA-256、feature flags、fixture manifest。 |
| Cleanup | 只刪本輪明確 temp target；`cleanupStatus=removed`，不得遞迴清 workspace/root/home。 |

## 9. QC handoff template

QC 報告至少包含：

- `PG-001`～`PG-014` 每項 PASS/FAIL/BLOCKED、命令與 evidence path。
- source selection table：row → root → chosen drawing sequence/number → chosen revision/file/derivative → visible state。
- 1/20/50 query counts與 image lazy-load network count。
- 4 viewport visual review、overflow數值、a11y keyboard結果。
- security/fake/stale/missing negative probe回應。
- regressions、unexpected console/page/server/visible errors。
- production connection/write、cleanup、known residual risk。

任何 case FAIL 時 DEV-065 不得標記完成；QC 不在驗證階段修 code或改 expected result。

## 10. Release gate

本機 PASS 只代表 DEV-065 local product slice可交付。若後續要求套用 PostgreSQL 031、啟用 staging/production、deploy或release，需另進 deployment release gate，先驗 migration plan/rollback、代表性資料 query plan、cache/security smoke與監控；不得沿用 local PASS推定正式環境已完成。
