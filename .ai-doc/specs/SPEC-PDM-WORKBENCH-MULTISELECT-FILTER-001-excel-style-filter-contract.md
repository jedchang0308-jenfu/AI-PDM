# SPEC-PDM-WORKBENCH-MULTISELECT-FILTER-001：三工作台 Excel 式複選篩選器

版本：1.0  
日期：2026-08-20  
狀態：`RD Implemented / Selection+Query+Browser Focused Evidence / QA-QC In Progress / Local Only / Production Release Gated`  
Related DEV：`DEV-085`  
父任務：`DEV-066`；關聯：`DEV-062`、`DEV-078`  
Related ADR：`.ai-doc/decisions/ADR-PDM-WORKBENCH-CORE-001-shared-mechanics-and-domain-adapters.md`  
QA：`.ai-doc/qa/qa-dev-085-workbench-multiselect-filter-validation-plan-2026-08-20.md`

> **2026-08-22 DEV-087 target supersession**：複選popover、URL repeatable-value mechanics、cursor reset、RWD與keyboard行為可保留；三工作臺的舊工作狀態／資料狀態／版本列選項、query key與semantic adapter由DEV-087新`layer＋handling`契約取代。舊query在activation後固定回410失效，不silent translate；舊filter code能拆即在同一DEV拆除，不保留雙軌相容。

## 0. 決策摘要與規格影響

Spec Impact：`Intentional follow-up + compatible preservation`。

- 本規格有意擴充 `DEV-066` 原本不改 filter semantics／URL／API 的邊界；`DEV-066` 的 topbar 位置、footer、模式切換、分頁與 RWD 契約繼續有效，既有 evidence 不作為 `DEV-085` 完成證據。
- 延續 `DEV-062`／`ADR-PDM-WORKBENCH-CORE-001` 的 shared mechanics + domain adapters。共用層只擁有選取狀態、URL wire、popover、cursor reset 與 request mechanics；圖料、圖號、料號仍擁有自己的選項、標籤、SQL 欄位、projection 與權限。
- `DEV-078` 的六個第一層工作狀態詞彙不變；本規格只把五個可篩選狀態由單選改成多值 OR。
- ADR 判定：`ADR not needed`。核心架構方向已由既有 ADR 決定；repeated query 與明確 none token 是可逆的局部 wire extension，沒有新增資料 owner、狀態機、權限或外部公開 API。

## 1. 目標、使用者與成功結果

使用者在圖料、圖號、料號工作台比較多個狀態、系列或類型時，不應反覆切換單選條件。成功結果是：三個工作台的頂端下拉篩選器都能用熟悉的 Excel 勾選方式建立集合，使用者能直接看出全選、部分選取與零選取，且查詢、URL、分頁與返回結果完全一致。

### 1.1 UX Intent

- 使用者與情境：PDM 使用者在資料密集清單中搜尋、比較及查閱多個狀態或分類。
- 主要工作物件：既有清單／關係樹／矩陣／預覽圖；篩選器只縮小集合，不搶走結果區主視覺。
- 熟悉 pattern：Excel 欄位篩選的 checkbox list、`（全選）`、`確定`、`取消`。
- 最可能誤解：把全部取消誤當成全部、勾選草稿立刻刷新、同欄與跨欄的布林語意不明、popover 超出 viewport。
- 安全預設：首次與重設後為全選；零選取明確顯示`未選取`並得到零筆，不用隱藏技術語意替使用者猜測。
- 可見資訊：欄位標籤、收合摘要、checkbox list 與必要的 option search；不新增永久 chips、教學卡或工程說明。

## 2. Human Decision Brief

1. 圖料、圖號、料號三個工作台上端的所有下拉式篩選器改為可複選；文字搜尋框維持文字搜尋，`包含歷史`維持布林核取方塊。
2. 開啟時所有實際選項預設勾選，`（全選）`同步勾選；只選部分時 `（全選）`為 indeterminate；全部取消時是零值、零筆結果，絕不代表全部。
3. popover 內的勾選是草稿；按`確定`才套用。`取消`、Escape、點擊外部或鍵盤焦點離開整個 popover 都捨棄草稿。
4. 同一欄位的多個值採 OR，不同欄位之間採 AND。

Rejected：

- 不採「未選任何值＝全部」。
- 不採勾一下就立即 request／刷新清單。
- 不以永久 filter chips、第二層 toolbar 或三套 domain-specific popover 顯示選取結果。
- 不把`包含歷史`或文字搜尋改成複選。

## 3. Scope 與 Out of Scope

### 3.1 In scope

| 工作台 | Route | API list projection | 改為複選的 query keys |
|---|---|---|---|
| 圖號 | `/numbering/drawings` | `GET /api/numbering/drawings/workbench` | `humanStatus`、`seriesCode`、`purposeCode`、`recordStatus` |
| 料號 | `/parts` | `GET /api/parts/workbench` | `humanStatus`、`seriesCode`、`itemKind`、`recordStatus` |
| 圖料 | `/numbering/search` | `GET /api/numbering/relations?projection=workbench_v1` | `humanStatus`、`seriesCode`、`entityType`、`recordStatus` |

共用範圍：popover mechanics、explicit selection type、URL parse/write、canonical order、filter hash、cursor reset、server-side OR/AND、zero-result、keyboard、focus、RWD 與 evidence。

### 3.2 Explicit preservation

- `query`、`view`、`stage`、`history`、`sortDirection`、`layout`、`detail`、`cursor`、`page/pageIndex` 的既有用途與權威不變。
- `stage` 雖仍接受 legacy deep link，但不是目前頂端可見下拉欄位，本 DEV 不把它新增到 UI 或改為複選。
- 圖料的`關係樹／矩陣`、圖號／料號的`清單／預覽圖`、drawer、selection、sorting 與分頁位置不變。
- permission、company scope、candidate/formal visibility、status projection、preview resolver、mutation API 與 no-store cache policy不變。

### 3.3 Out of scope

- `/approvals`、舊版 numbering search projection、明細內嵌清單與其他頁面的篩選器。
- 狀態詞彙、生命週期、資料歸屬、permission、排序規則、schema、index、migration、資料回填或修復。
- 新 feature flag、第三方元件庫、server action、POST/PATCH/PUT/DELETE、production/staging、deploy、merge、PR 或 release。

## 4. Current Architecture Impact

目前三個 workbench 的 scalar pipeline 是：

```text
Client QueryState
→ URLSearchParams 單值
→ normalize*WorkbenchQuery
→ *WorkbenchService.filterHash
→ *WorkbenchAsyncRepository identity query／projection scan
→ signed cursor + list response
```

本 DEV 將每個 in-scope scalar 改成 explicit selection，但不改資料來源與 row projector：

```text
PdmWorkbenchFilterSelection
→ repeated query／__none__
→ shared normalization + domain allowlist
→ canonical selection in filter hash
→ domain SQL IN + existing projection scan
→ cursor-safe page
```

這是 client、URL、API、repository 與 cursor 的端到端變更，不得只替換 JSX `<select>`。

## 5. Shared Selection 與 URL Wire Contract

### 5.1 Type contract

`src/lib/pdm-workbench-contract.ts` 新增 client/server 共用型別：

```ts
export type PdmWorkbenchFilterSelection<T extends string = string> =
  | { mode: "all" }
  | { mode: "none" }
  | { mode: "some"; values: T[] };
```

不可用空陣列同時代表 all 與 none；`mode` 是唯一語意來源。`some.values` 必須至少一值、去重、canonical order，且不得含 reserved token。

### 5.2 Shared normalization helper

新增 `src/lib/pdm-workbench-filter-selection.ts`，此檔必須 client-safe：不得 import Node API、DB、route、repository、permission 或 domain component。它負責：

- `PDM_WORKBENCH_FILTER_NONE_TOKEN = "__none__"`。
- parse missing／legacy／repeated query。
- trim、長度限制、去重、static allowlist、canonical order 與 serialization。
- `selectionHashValue`、`selectionMatches`、`isAll/isNone/isSome` 等純函式。
- 產生可由三個 domain error response 映射的 `PdmWorkbenchFilterSelectionError`，code 固定 `workbench_invalid_filter`、status 400。

不得在 helper 內決定 Drawing／Part／Relation 欄位、標籤、SQL column 或 business semantics。

### 5.3 Canonical URL representation

| Selection | Canonical query |
|---|---|
| all | 完全省略該 key |
| none | 單一 `{key}=__none__` |
| some | 同一 key 重複出現一次／值，例如 `humanStatus=editing&humanStatus=reviewing` |

Compatibility：

- 舊單值連結，例如 `recordStatus=Active`，解讀為 `some(["Active"])`。
- 舊 `humanStatus=all`、`entityType=all`、空字串或只有空白，解讀為 all，並在 client canonicalization 後省略。
- sentinel 與其他值混用、sentinel 重複、static unknown value、超過 50 個值、單值超過既有欄位長度或含控制字元，direct API 以 400 fail closed。
- Browser client 初始讀取若遇到 invalid static query，將該欄安全正規化為 none、寫回 `__none__`、顯示`未選取`；不得 crash、改成 all 或進入 retry loop。

Canonical order：static enum 依 authority option order；dynamic `seriesCode` 依 JavaScript code-unit ascending。選取順序不影響 URL、filter hash 或結果順序。

### 5.4 Domain option authority

| Key | Actual options authority | Label authority |
|---|---|---|
| `humanStatus` | `editing/reviewing/needs_confirmation/rd_available/production_available` | `WORK_STATUS_LABELS` |
| `seriesCode` | list response `filters.seriesCodeOptions` | 原始 series code |
| `purposeCode` | `ACTIVE_DRAWING_PURPOSE_CODES` | `displayDrawingPurposeLabel` |
| `recordStatus` | 既有 workbench record-status allowlist | `formatStatusForUser(..., "masterRecord")` |
| `itemKind` | 既有 Part workbench item-kind allowlist | 保留既有可見 label，不在本 DEV 翻譯或改名 |
| `entityType` | `part_root/part_number/drawing_number` | `圖料根號/料號/圖號` |

`all`不是 actual option，不進 `some.values`。動態 series 在 mode=all 時自動包含新增選項；some 不因 option list 更新自行擴張。

## 6. Excel-style Popover Contract

### 6.1 Shared component

新增 `src/components/pdm-workbench-multi-select-filter.tsx`：

```ts
type PdmWorkbenchFilterOption<T extends string> = {
  value: T;
  label: string;
};

type PdmWorkbenchMultiSelectFilterProps<T extends string> = {
  label: string;
  value: PdmWorkbenchFilterSelection<T>;
  options: readonly PdmWorkbenchFilterOption<T>[];
  onApply: (value: PdmWorkbenchFilterSelection<T>) => void;
  searchable?: boolean;
  disabled?: boolean;
};
```

元件是獨立 Client Component，使用既有 portal/fixed-position pattern；popover 不得被 toolbar/panel overflow 裁切。三個 domain 只提供 options、label 與 `onApply`，不得 fork component。

### 6.2 Trigger 與 summary

- 欄位標籤維持在 trigger 上方，trigger 使用 button，不把 button 包在 `<label>`。
- trigger 必須有 `aria-haspopup="dialog"`、`aria-expanded`、`aria-controls`、可見 focus。
- all：`全部`；none：`未選取`；some 一值：該 label；some 多值：canonical 第一個 label + `+N`。
- 不新增永久 chips、選取數 summary row 或 helper card。

### 6.3 Draft、全選與 apply

1. 開啟時複製 applied selection 為 local draft；開啟本身不 request。
2. all 時所有 actual options checked；none 時全部 unchecked；some 只勾 selected values。
3. `（全選）`：all/全部實際值皆選取時 checked；部分選取時 indeterminate；none 時 unchecked。點擊 checked／indeterminate 的全選會切到 none；點擊 unchecked 會切到 all。
4. 個別 option toggle 只更新 draft。選滿所有 actual options時正規化為 all；取消最後一值時正規化為 none；其餘為 some。
5. `確定`只呼叫一次 `onApply`；consumer 只呼叫一次 controller `setQuery`，因此 location replace、cursor/page reset 與 list request各一次。
6. `取消`、Escape、outside pointerdown 或 focus 移出 trigger+popover 全域時，捨棄 draft且不呼叫 `onApply`。Escape／按鈕取消後焦點回 trigger；outside pointer/focus 不搶走使用者的新焦點。

### 6.4 Option search

- `seriesCode` 設 `searchable=true`；其他欄位預設 false。
- option search 只縮小可見選項，不改 draft、不進 URL、不觸發 list request。
- `（全選）`永遠代表全部 actual options，不因 option search 只作用於可見子集。
- 搜尋無結果顯示安靜的`沒有符合的選項`；不把工作台結果 empty state 放進 popover。

### 6.5 Keyboard、focus、viewport

- trigger：Enter／Space 開啟；popover 開啟後焦點到 `（全選）`。
- native checkbox 以 Space 切換；Tab 順序為全選 → option search（若有）→ options → 取消 → 確定；Escape 取消。
- popover `role="dialog" aria-modal="false"`，內部 checkbox group有可辨識 label；indeterminate 同步 DOM property 與 `aria-checked="mixed"`語意。
- fixed portal 位置在 resize、任何 ancestor scroll 時重算；優先向下，空間不足向上；寬度 260–360px，最大高度受 viewport 控制，options body是唯一內部 scroll owner。
- 390px viewport 保留至少 12px 邊距，不得水平 overflow、裁切 footer 或遮住無法恢復的操作。

## 7. Client QueryState 與 History Contract

三個 component 的 in-scope query fields 改為 `PdmWorkbenchFilterSelection<T>`，initial state一律 `{ mode: "all" }`。`query`、history、view、sort、layout與detail保持既有型別。

- `read*Location` 使用 shared parser；`write*Location` 使用 shared serializer與 `append`，不得再用 scalar `get/set`。
- initial canonicalization、hard reload、Back／Forward 取得同一 explicit selection。
- 每次 confirmed filter change使用既有 controller `setQuery`：abort／latest-response guard保留，cursor history清空、pageIndex=0、URL cursor/page移除。
- popover draft變動不呼叫 controller，不寫 history，不清 selection/detail。
- confirmed filter後，如果 selected row不在新 rows，沿用 controller既有 reconciliation關閉 stale detail；若仍存在可保留。

## 8. Server Normalization、Boolean Semantics 與 Repository Contract

### 8.1 Boolean semantics

- 同一 selection 的 values採 OR。
- 不同 query keys、文字 query、view、history與其他既有條件採 AND。
- all不增加 predicate；none直接得到空 rows；some加入 domain predicate。
- `humanStatus`仍在 server projector後比對，但改為 matches-any；repository scan必須繼續到取得 `limit + 1`符合列或 source exhausted，不能先 limit 再 client filter。

### 8.2 SQL binding

- `seriesCode`、`purposeCode`、`recordStatus`、`itemKind`、`entityType` 的 some values在 identity SQL使用 named placeholders展開 `IN (...)`／等價 EXISTS OR；禁止把 raw query值串進 SQL。
- selected value數量不得增加 query count或產生 per-value/per-row query。
- none在進入 identity/hydration前 short-circuit；仍可讀取目前公司 `seriesCodeOptions`，response envelope保持可操作。
- all的 rows與本 DEV 前對應不設限結果 deep-equal，包含同權限下的 candidate/formal/history規則，不得因 enum list展開而漏資料。

### 8.3 Domain-specific rules

- Drawing `purposeCode some`：`canonical.purpose_code IN (...)`；series符合 candidate part或同 root formal part任一值；recordStatus some只比對 formal master status。
- Part `itemKind some`：candidate draft part或formal part任一值；series同理；recordStatus some沿用舊 scalar行為，只包含formal rows。
- Relation `entityType some`：各值保持舊 predicate並以 OR 合併。`part_root`代表root container本身，因此只選`part_root`仍匹配全部root containers；取消`part_root`後可用 part/drawing values縮小為含對應 child的 roots。candidate與formal使用各自既有 EXISTS authority。
- `recordStatus.mode === "all"`時，candidate visibility仍只由permission/history/view決定；recordStatus some不把 candidate lifecycle冒充 master record status。

### 8.4 Filter hash 與 cursor

`pdmWorkbenchFilterHash` 的 `filters` value type擴充為 canonical `readonly string[]`；每個 selection進hash前轉為：all=`"*"`、none=`"!"`、some=`canonical values[]`。Domain namespace、companyId、actorId、query、view、history與sort仍在hash。

- 相同集合不同勾選順序得到相同 hash／cursor identity。
- 集合、mode或其他既有 filter改變後，舊 cursor必須以400 `workbench_invalid_cursor`失效；client只回第一頁一次，不得 retry loop。
- cursor仍 opaque、signed、server-only驗證；不把 filter payload或HMAC回給client。

### 8.5 Error and recovery

- direct API malformed selection：400 `workbench_invalid_filter`，retryable=false，訊息要求重新選擇篩選條件；不得查全部。
- browser invalid URL：client安全正規化為 none與 canonical URL，使用者可在原欄位選`（全選）`恢復。
- network/5xx：沿用 controller保留最後成功rows與`重新載入`；不得把失敗畫面當零結果。
- option list為空：trigger仍顯示`全部`；`（全選）`disabled，popover顯示`目前沒有可用選項`。使用者明確套用 none後才顯示`未選取`。

## 9. Data、Permission、Migration 與 Runtime

- Schema/data model：無變更。
- Migration/backfill/index：無。
- Permission/company scope：無變更；route仍先做auth/company/permission，再讀option與rows。
- Mutation/transaction：無新增寫入；GET read snapshot契約維持。
- Cache：三條list API維持`private, no-store`或既有no-store headers。
- Environment/feature flag/build/runtime：無新增env或flag；Next.js 16.3.0下popover為既有Client Component樹內的最小`use client`邊界，route handlers繼續使用Web Request/Response。
- Release Feasibility Note：不影響hosting、artifact、schema或runtime topology；`RD Implementation Ready`不代表可deploy，production release仍走既有gate。

## 10. Exact Implementation Boundary

### Phase 1A — shared selection與UI primitive

Add：

- `src/lib/pdm-workbench-filter-selection.ts`
- `src/components/pdm-workbench-multi-select-filter.tsx`

Modify：

- `src/lib/pdm-workbench-contract.ts`
- `src/lib/pdm-workbench-cursor.ts`
- `src/lib/work-status-presentation.ts`
- `src/app/globals.css`

Exit：pure selection tests、component static contract、typecheck通過；core檔不得出現domain switch/import。

### Phase 1B — three client adapters

Modify：

- `src/components/drawing-workbench.tsx`
- `src/components/part-workbench.tsx`
- `src/components/relation-workbench.tsx`

Exit：三工作台不再以 `<select>`渲染四個in-scope filters；URL round-trip、apply/cancel、pagination reset與既有toolbar DOM contract通過。

### Phase 1C — server/domain adapters

Modify：

- `src/lib/drawing-workbench.ts`
- `src/lib/part-workbench.ts`
- `src/lib/relation-workbench.ts`
- `src/lib/repositories/drawing-workbench-async-repository.ts`
- `src/lib/repositories/part-workbench-async-repository.ts`
- `src/lib/repositories/relation-workbench-async-repository.ts`

No planned route change：

- `src/app/api/numbering/drawings/workbench/route.ts`
- `src/app/api/parts/workbench/route.ts`
- `src/app/api/numbering/relations/route.ts`

若 normalization不能由既有service/error mapper承接而必須改route，只允許三條GET branch的filter error mapping；不得碰legacy projection或任何mutation branch。

Exit：OR/AND、all/none/some、candidate/formal、before/after cursor、101+ filter-before-limit與query-count gate通過。

### Phase 1D — tests、evidence與文件收斂

Add：

- `scripts/qc-dev-085-selection.mjs`
- `scripts/qc-dev-085-query.mjs`
- `scripts/qc-dev-085-contract.mjs`
- `scripts/qc-dev-085-browser-code.mjs`

Modify：

- `scripts/qc-dev-053-drawing-workbench-ui.mjs`
- `scripts/qc-pdm-entity-detail-drawer.mjs`
- `package.json`
- `.ai-doc/dev_task.md`
- `.ai-doc/documentation_map.md`
- `.ai-doc/specs/SPEC-UX-PDM-WORKBENCH-TOPBAR-001-unified-toolbar-muscle-memory.md`
- `.ai-doc/specs/SPEC-PDM-WORKBENCH-CORE-001-shared-read-and-controller-contract.md`
- `.ai-doc/qa/qa-dev-085-workbench-multiselect-filter-validation-plan-2026-08-20.md`

Planned commands：`npm.cmd run qc:dev-085:selection`、`npm.cmd run qc:dev-085:query`、`npm.cmd run qc:dev-085:contract`；browser 使用 `npx.cmd --yes --package @playwright/cli playwright-cli -s=default run-code --filename scripts/qc-dev-085-browser-code.mjs`；aggregate `qc:dev-085` 可由 QA/QC 依 runtime lifecycle 封裝。

## 11. Acceptance Criteria

1. 三工作台12個in-scope欄位全部使用同一複選元件；search/history/stage/view/sort/layout保持原契約。
2. all、partial/indeterminate、none三態與checked options一致；零選取顯示`未選取`並回零筆。
3. `確定` exactly-once套用；取消、Escape、outside pointer/focus皆零request、零URL改變並捨棄draft。
4. 同欄OR、跨欄AND；全選與舊不設限deep-equal，candidate/formal/無值合法資料不靜默遺漏。
5. repeated URL、legacy scalar、hard reload、Back/Forward、canonical order與invalid URL recovery通過。
6. filter set變更清cursor/page；same set different order不改hash；舊cursor對新set fail closed後只回第一頁一次。
7. server在final limit/cursor page形成前完成SQL/projection filter；101+資料無假空頁、重複或遺漏。
8. keyboard、screen-reader semantics、focus return、popover scroll owner與12px viewport safe margin通過。
9. 三route × 1440×900、1024×768、768×1024、390×844無overflow、overlap、crop或不可操作控制項。
10. visible error sweep、console、unexpected request／4xx／5xx為0；測試fixture有資料時不得以全零或empty state通過。
11. DEV-053、062、066、078與entity-detail focused regressions、typecheck、affected lint、isolated build通過。

## 12. QA/QC Evidence 與 Query Gate

- Pure/wire：none token、legacy、dedupe、canonical order、limits、invalid/mixed。
- Disposable SQLite service/repository：每domain all/some/none、OR/AND、candidate/formal、101+ traversal、forward/backward cursor與filter-hash invalidation。
- Query count：selected value由1增至多值不得增加query count；Part list保持`<=15`、Relation list保持`<=18`；Drawing記錄現行baseline並要求多值相對baseline `+0` queries；無per-row/per-value query。
- Browser：三route、十二欄、四viewport、mouse/keyboard、apply/cancel、URL/reload/back-forward、零選取、空option與visible-error/data-sanity sweep。
- Evidence root：`output/qa/dev-085-workbench-multiselect-filter/<run-id>/`；manifest記錄route、viewport、case、screenshot、console、network、source HEAD與scoped dirty hash。Evidence不自動等於production readiness。

## 13. RD Start / Stop Contract

RD 1A → 1B → 1C → 1D 已在本機完成；selection 9/9、disposable query 11/11、contract 6/6、三 route × 四 viewport browser 12/12 與 focused regressions 已有 evidence；目前交接給 QA/QC 依同一邊界補齊剩餘 interaction/history/surface 個案與 independent QC manifest，無新增 P0/P1 readiness blocker。

立即停止並回 Dev PM：

- 需要改 schema、資料、permission、status vocabulary/lifecycle、sort authority、preview、mutation API、legacy relation projection或approval workbench。
- shared helper/component需要知道 Drawing／Part／Relation domain欄位、SQL column或render branch。
- 無法在既有 bounded scan/query budgets內完成filter-before-limit，或企圖改成client fetch-all/filter。
- 需要新增第三方UI套件、環境變數、feature flag、production/staging、migration、deploy、merge、PR或release。

本文件已完成本機 RD 實作：shared selection/UI、三個 client adapter、server/repository filter、cursor hash、disposable query/cursor、四 viewport browser 與 focused regression evidence 已落地；MSF 剩餘 interaction/history/surface 個案與 independent QC 仍由 QA/QC 接續，故不得視為產品交付或 production release ready。
