# QC Report：DEV-062 料號／圖料單頁工作台與 Workbench Core

Status: `Local RD Implemented / Fixed-3000 QA-QC Passed / Release Gated`
Date: 2026-08-10
Owner: QC
Related DEV: `DEV-062`
Related SPEC: `.ai-doc/specs/SPEC-PDM-WORKBENCH-CORE-001-shared-read-and-controller-contract.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-WORKBENCH-CORE-001-shared-mechanics-and-domain-adapters.md`
Related QA: `.ai-doc/qa/qa-dev-062-unified-part-relation-workbench-validation-plan-2026-08-10.md`

## 1. Verdict

DEV-062 本機產品碼、isolated focused QA/QC 與 fixed `127.0.0.1:3000` 使用者可見驗收均通過，P0/P1 未結案缺陷為 0。

- `/parts` 與 `/numbering/search` 在 `PDM_UNIFIED_PART_RELATION_WORKBENCH_V1=true` 時各自只呈現一個工作台，不再顯示「總表／保留號」頁籤。
- Part candidate bundle 與 formal Part 使用同一 server-composed read projection；Relation formal root、source-root overlay 與 source-less candidate 使用同一 root-centric projection。
- 新增的 workbench BFF 只有 GET；既有 workspace、Part owner、approval/publication 與 `POST /api/numbering/relations` mutation authority 未搬移。
- feature flag 預設關閉，且依賴 Number State Flow V1；flag off 時舊頁與新 read route 404 rollback 均通過。
- 未連 staging／production，未寫正式資料，未執行 schema/migration、stage、commit、deploy 或 release。

## 2. 資深架構師差距結論

結論是「足夠優雅且精簡，可進入 release gate」，但不是以一個大型泛型元件把三個 domain 強行合併。

| 原差距 | 實作後 | 判定 |
|---|---|---|
| 三個工作台各自重做 cursor、snapshot、request race、URL、selection | 抽成 `pdm-workbench-contract`、signed cursor、read-only snapshot、`usePdmWorkbenchController` | 已關閉 |
| Part／Relation 複製 Drawing table／keyboard | Part 使用 `PdmWorkbenchList`；Drawing 亦改用同一 list；Relation 保留 domain tree，但共用 controller／keyboard contract | 已關閉 |
| `search/page.tsx` 跨 route import `parts/page.tsx` | `PartDetailPanel` 由 owner component `part-detail-content.tsx` 匯出；page 只保留 route composition | 已關閉 |
| browser 合併 candidate/formal 造成一致性與重複風險 | Part／Relation adapter 在同一 read snapshot 組出 canonical rows | 已關閉 |
| Relation 每個 root 逐筆讀 detail | 以 bounded batch hydration 取代 N+1，維持既有 relation authority | 已關閉 |
| candidate 建立入口依賴 Drawing flag／錯誤 owner route | 改由 DEV-062 umbrella flag 與 surface owner 決定 canonical destination | 已關閉 |
| 讀取正式 Part 明細會間接 POST resolve | manufacturing-baseline resolve 新增 authenticated GET；開 drawer 全程唯讀 | 已關閉 |
| controller 在 React state updater 內改 URL | query ref 先計算狀態，再於 updater 外寫 location；實機 console error 歸零 | 已關閉 |
| filter 後舊 selection/detail 仍可能留在 URL，detail loading 時 Escape 無法取消 | controller 在 authoritative list response 後 reconcile selection；Part/Relation 將 detail loading 納入 Escape contract | 已關閉 |

共用邊界判斷：

- 應共用且已共用：stable row contract、signed cursor、consistent snapshot、URL/history、abort/request sequence、selection reconciliation、pagination、keyboard/focus、list skeleton、drawer shell、human status／availability presentation。
- 不應共用且維持分離：Part 無版次物料身份、Drawing revision、Relation root/tree/matrix、domain CTA 文案、owner mutation payload 與 permission authority。
- 未採用 `UnifiedWorkbench<T>` 或 `module === "parts"` switch，避免把 domain meaning 變成泛型條件。

保留差距只有 release／清理層級：

- `PDM_UNIFIED_PART_RELATION_WORKBENCH_V1` 仍預設 off；staging/production 開旗標、smoke、rollback rehearsal 需另走 release gate。
- flag-off rollback 所需的 legacy owner UI 仍保留在 owner component；旗標穩定上線並完成回滾觀察期後，可另立 P3 移除 retired branch，現在不應提前刪除。
- cold-inclusive dev read p95 為 422 ms，只作診斷；規格 gate 使用 warmed representative BFF p95 38 ms，不能把開發編譯時間冒充產品 SLO。

## 3. 核心契約與 Query Budget

| Surface | Gate | Result |
|---|---:|---:|
| Part list | <=15 | 14 |
| Part candidate detail | <=13 | 11 |
| Part formal detail | <=6 | 6 |
| Relation list | <=18 | 18 |
| Relation root detail | <=10 | 10 |
| Relation candidate detail | <=13 | 11 |

Cursor tamper、filter mismatch、permission fail-closed、stable row identity、zero-write 與 root uniqueness 均通過。Representative fixture 為 60 roots、每 root 3 drawings／5 parts，共 300 Part rows、180 drawings；Part list/candidate/formal 與 Relation list/root/candidate 的 representative query count 分別與小 fixture 完全相同（14/11/6、18/10/11），關閉「只通過上限但仍隨資料量成長」的證據缺口。

## 4. 真實瀏覽器證據

Canonical run：`DEV062-20260810-121012-local-isolated`

- Evidence root：`output/qa/dev-062-unified-part-relation-workbench/DEV062-20260810-121012-local-isolated/`
- Result：aggregate 15/15、contract 40/40、browser 33/33。
- Production connection/write：false / false。
- Warm BFF p95：38 ms，gate <=500 ms。
- Search visible-update p95：125 ms，gate <=800 ms。
- Browser console errors：0；HTTP 5xx：0。
- Business before/after hash：`1e1aca7acc82127eb345de30d8c5181ebe3c88c9710916ca510384a329dc9f01`，一致；observed writes：0；isolated fixture cleanup PASS。
- Viewports：1440×900、1024×768、768×1024、390×844，Part／Relation 共 8 張截圖，全數無 document/main horizontal overflow。
- 實際操作：legacy tab canonicalization、stable deep link、safe `returnTo`、back/forward/reload、1000/500/100ms list race、detail A→B late response、close-before-response、filtered-out selection reconciliation、Arrow/Home/End/PageUp/PageDown/Enter/Escape/Ctrl+C與focus return、reduced-motion、200% zoom、Relation tree/matrix、flag-off rollback。
- 狀態證據：normal、empty、injected 5xx retry（last successful rows保留）、history、blocked與formal drawer均有 rendered screenshot + network/server facts；expected fault不計入unexpected console/5xx。

人工視覺檢查：桌面資訊密度、第一層 identity/status/CTA、手機 filter stack、卡片、按鈕與頁寬均正常；未見裁切、重疊、假 affordance 或技術 ID 外洩。

## 5. Focused Regression Evidence

| Command / suite | Result |
|---|---|
| `qc:dev-062:core` | 6/6 |
| `qc:dev-062:part` | PASS，queries 14/11/6 |
| `qc:dev-062:relation` | PASS，queries 18/10/11 |
| `qc:dev-062:compat` | 8/8 |
| `qc:dev-062:real-operation` | 33/33；canonical evidence contract 40/40 |
| `qc:dev-062` aggregate | 15/15 commands，PASS |
| `qc:dev-053:read-model` | 10/10 |
| `qc:dev-053:ui` | 24/24 |
| `qc:pdm-number-state-flow-phase1d` | transfer 23/23、compat 14/14、HTTP 15/15、UI 8/8 |
| `qc:part-number-module` | 86/86 |
| `qc:pdm-entity-detail-drawer` | 42/42 + search target PASS |
| `qc:pdm-drawing-part-relation-view:isolated` | 93/93；包含 relation POST、audit、tree/matrix、1024/390/1440 |
| `qc:dev-055:projection` / contract / browser | 71/71、13/13、browser PASS |
| `npx tsc --noEmit` | PASS |
| affected-file ESLint | PASS，0 error / 0 warning |
| `build:isolated` | PASS，127 pages generated |

既有 source-coupled QC 已改讀 owner component／shared controller public contract；會寫 numbering fixture 的 relation QC 新增 isolated wrapper，protected runtime guard 維持有效。

## 6. Release Boundary

本報告只支持 `Local RD Implemented / QA-QC Passed`。以下仍未授權且未執行：

- staging／production flag activation。
- live database／正式資料寫入或 migration。
- commit、merge、PR、deploy、production smoke、rollback execution、release。

下一步必須由明確 release 指令進入 deployment release gate；不得以本地 PASS 自動推定 production ready。

## 7. Fixed 3000 QC Reopen、CAPA 與最終結果

使用者截圖顯示固定 3000 仍有「總表／保留號」頁籤，與 isolated run 矛盾，故撤回當時的使用者可見完成判定並重開 QC。

根因鏈：固定本機未要求 `PDM_UNIFIED_PART_RELATION_WORKBENCH_V1=true` → status 回傳 `requested=false/enabled=false` → Part／Relation owner component 依設計退回 Legacy UI → isolated runner 因自行注入 flag=true 而未偵測 fixed-runtime 設定缺口。

CA／PA：

- CA：`.env.development.local` 啟用 DEV-062；以 `npm run dev:local:restart` 重新啟動固定 3000。
- PA：`scripts/start-localhost-3000.ps1` 固定 local profile 開啟 DEV-062，並將 state-flow status 的 workbench enabled 判定納入 `dev:local:check`，防止「站台 200 但產品仍走 Legacy」被判健康。
- QA/QC gate：新增固定登入 Chrome hard reload、舊頁籤 DOM、legacy URL、formal/candidate 同頁、modal、visible alert、overflow、console 與 server log sweep。

Fixed runtime run：`DEV062-FIX-20260810124507-fixed3000`，結果 10/10 PASS。

- `/parts`：heading `料號工作台`；legacy tab／reserved link／visible alert／horizontal overflow均為0；同頁19筆formal、4筆candidate。
- `/numbering/search`：heading `圖料工作台`；legacy tab／reserved link／visible alert／horizontal overflow均為0；19個root rows且formal/candidate訊號同頁。
- 舊Part／Relation `?tab=reserved` 分別正規化為`/parts?view=work`與`/numbering/search?view=work`，未恢復第二頁。
- 「建立保留號」modal開啟1、關閉0，未submit。
- 最終run-window unexpected app console=0；server unexpected error/5xx=0；PowerShell parse=0 error；`dev:local:check`=PASS。
- Focused regression：core 6/6、compat 8/8、Part 14/11/6、Relation 18/10/11、TypeScript PASS。

證據：`output/qa/dev-062-unified-part-relation-workbench/DEV062-FIX-20260810124507-fixed3000/`。Application／production default仍維持off與release gate；只有固定本機開發入口預設啟用。本輪未執行schema、正式資料寫入、stage/commit、deploy或release。

## 8. UI Layout Amendment QC

針對使用者提供的「圖料總表」參考排版，QC 在已登入 Chrome 的固定 `127.0.0.1:3000` 實際頁面執行 hard reload、展開第一筆 root 並截圖。

| Check | Result |
|---|---|
| Route / viewport | `/numbering/search?view=all` / 1920×799 |
| Root header | `QC-SUBMIT`、名稱、狀態徽章與「關聯完整」同一列 |
| Expanded tree | 「圖號」標題 → `D-QC-SUBMIT-MA1` 灰底列 → 「料號」標題 → `P-QC-SUBMIT-001` 膠囊 |
| Legacy UI | `.number-state-tabs=0`、精確「保留號」連結=0 |
| Visual safety | horizontal overflow=false、visible alerts=0 |
| Rendered cardinality | drawing rows=1、part chips=1 |
| Console / server | fixed run window app console=0；server unexpected error／5xx=0 |

判定：**PASS**。截圖：`output/qa/dev-062-unified-part-relation-workbench/DEV062-FIX-20260810124507-fixed3000/screenshots/relation-ui-reference-layout-20260810.png`。本次只改 UI 結構與 CSS，未改 API、schema、資料、權限或 release boundary。

## 9. Redline Text Removal QC

QC 依使用者標示的紅線範圍，在已登入 Chrome 的固定 3000 埠展開 `A0005` 重新驗證：

- 展開樹文字為 `圖號 A0005-M01／料號 A0005-P01、A0005-P02、A0005-P03`。
- 展開樹不再包含 `製造圖`、`個料號` 或 `馬達_JF_2HP_B`；紅線對應的用途／數量／品名已移除。
- 圖號與料號代碼按鈕仍存在；legacy tabs=0、reserved links=0、visible alerts=0、horizontal overflow=false。

判定：**PASS**。Evidence：`output/qa/dev-062-unified-part-relation-workbench/DEV062-FIX-20260810124507-fixed3000/screenshots/relation-redline-removed-20260810.png`。

## 10. Drawing / Part Visual Parity QC

QC 以同一筆 `A0005` 展開資料比對圖號與料號的 computed style：

- 圖號 `A0005-M01` 與料號 `A0005-P01` 均為白底、8px 圓角、30px 最小高度、`4px 8px` 內距、代碼粗體。
- `visualStyleMatch=true`；圖號整列寬度仍保留作為可點擊導覽範圍，料號維持膠囊寬度。
- legacy tabs=0、reserved links=0、visible alerts=0、horizontal overflow=false。

判定：**PASS**。Evidence：`output/qa/dev-062-unified-part-relation-workbench/DEV062-FIX-20260810124507-fixed3000/screenshots/relation-drawing-same-as-part-20260810.png`。

## 11. Drawing Detail Disclosure QC

QC 以已登入 Chrome 開啟固定 `127.0.0.1:3000/numbering/drawings` 的 `A0005-M01` 明細抽屜，hard reload 後檢查實際 DOM、可見畫面與歷史互動：

| Check | Result |
|---|---|
| Non-history disclosure count | 0；「更多」、「附件管理」、「同根料號」、「資料維護」與附件新增／明細／已刪除資料均固定呈現 |
| Remaining disclosure | 3；「歷史版本」本體與 2 個歷史版次明細 |
| History interaction | 開啟 `true`、關閉 `false`；歷史功能保留 |
| Visible state | visible alerts=0；頁面無新增 horizontal overflow |
| Screenshots | 上方、附件管理、下方同根料號／資料維護三張實際 Chrome 截圖 |
| Regression | typecheck PASS；affected ESLint 0 error（globals.css 為既有 ignored warning）；`qc:dev-062:relation` PASS；`dev:local:check` PASS |

判定：**PASS**。本次僅調整圖號明細 UI disclosure 結構與附件面板的顯示 contract，未改 API、schema、資料、權限或歷史版次 authority；未執行 staging／production、commit、deploy 或 release。

## 12. Drawing Detail Redline Simplification QC

QC 依最新紅線在固定 `127.0.0.1:3000` 已登入 Chrome 驗證 `A0005-M01` 正式圖號明細抽屜：

| Check | Result |
|---|---|
| Removed management UI | `更多` 管理卡、關聯／影響、快速查看、參考附件管理與已刪除資料均不存在 |
| Removed card actions | 同根料號不再出現「補成本」／「編輯」或 `已完成 · N 筆`；料號、品名、材質／表面處理／顏色／變體／成本狀態保留 |
| Removed metadata | 資料維護右側「新增圖號、料號與作廢申請」說明移除；三個正式入口保留 |
| Preserved core | 受控檔案、歷史版本、同根料號、資料維護均可見；歷史版本仍可互動 |
| Disclosure invariant | `details=3`，僅 `master-attachment-history` 與 2 個 `master-attachment-history-revision` |
| Browser safety | visible alerts=0；horizontal overflow=false；新一輪 console 無產品錯誤 |
| Regression | typecheck PASS；affected ESLint PASS；`qc:dev-062:relation` PASS；`dev:local:check` PASS |

判定：**PASS**。本輪為 drawing detail UI 精簡，未改 API、schema、資料、權限、歷史版本 authority 或 release boundary；未執行 staging／production、commit、deploy 或 release。

## 13. Drawing Detail Header Layout QC

QC 依最新頂端參考圖，在固定 `127.0.0.1:3000` 已登入 Chrome 驗證 `A0005-M01` 正式圖號明細抽屜：

| Check | Result |
|---|---|
| Header hierarchy | `正式圖號` 小標移除；圖號 `A0005-M01`、品名 `馬達_JF_2HP_B`、狀態 `研發可用` 同一基線 |
| Primary actions | `建立新版次` 與 `關閉圖號明細` 均可見；主要 CTA 位置保留於右側 |
| Responsive contract | 使用既有 `drawing-workbench-inline-header`；不影響其他 drawer，且固定 viewport 無水平溢位 |
| Preserved content | 受控檔案、歷史版本、同根料號、資料維護內容不受影響；歷史 `details=3` |
| Browser safety | visible alerts=0；horizontal overflow=false；header class=`drawing-workbench-inline-header` |
| Regression | typecheck PASS；affected ESLint PASS；`qc:dev-062:relation` PASS；`dev:local:check` PASS |

判定：**PASS**。本輪僅調整正式圖號 drawer header 的可見資訊階層與既有 CSS variant 套用，未改 API、schema、資料、權限或 release boundary；未執行 staging／production、commit、deploy 或 release。
