# QA Plan：DEV-065 圖號／料號預覽圖模式

Status: `DEV-112 Local RD Implemented / QA-QC Complete 24/24 / RD Tech Lead Corrections Closed / Existing DEV-065 Evidence Retained / Full Multi-provider QA Not in Scope / Production Release Gated`
Date: 2026-08-11
Last reviewed: 2026-09-01
Owner: QA
Related DEV: `DEV-065`, `DEV-112`
Related SPEC: `.ai-doc/specs/SPEC-PDM-WORKBENCH-PREVIEW-GALLERY-001-drawing-part-3d-preview-mode.md`
Related ADR: `Phase 1 Not required / .ai-doc/decisions/ADR-PDM-PART-PREVIEW-AUTHORITY-001-part-setting-and-shared-projection.md`

> Current authority notice：本文件§0T／§0S是DEV-112三種顯示模式的current execution plan／target QA contract，已由同一candidate執行完成；§0.1～0.6是DEV-087 canonical Drawing gallery Phase 1既有QA authority與PASS evidence；§0.7是Part Phase 2既有QA authority。DEV-112的SQLite、browser與focused engineering gates已通過；本輪未執行PostgreSQL shadow，因此provider parity不在本DEV scope，不能延伸宣告full multi-provider QA PASS。任何DEV-065／066歷史PASS都不得計入`TVM-001..024`。下方Historical marker後的`PG-001`～`PG-014`只保留舊Drawing／Part architecture evidence，不得作current expected、PASS或completion denominator。

## 0T. DEV-112 executable QA／targeted QC plan（2026-09-01／Executed）

Status：`Local RD Implemented / RD Tech Lead Corrections Closed / QA-QC Complete / TVM 24/24 PASS / P0-P1=0 / Production Release Gated`。

### 0T.1 Runner registry 與固定分母

| Runner／package command | Ownership | Required output |
|---|---|---|
| `scripts/qc-dev-112-three-view-modes-contract.mjs`／`npm.cmd run qc:dev-112:contract` | RD self-check | `contract-manifest.json`；唯一layout type、三值normalize、missing／invalid URL resolver分支、storage key、DOM禁則、shared wrapper per-href failure owner、current-page media bound、single poller、no-touch/API/schema source assertions。Supporting checks用`DEV112-C01..`，不得複製TVM ID。 |
| `scripts/qc-dev-112-three-view-modes-browser.mjs`／`npm.cmd run qc:dev-112:browser` | QA + targeted QC | `browser-manifest.json`；唯一current denominator=`TVM-001..024`，每ID恰一個final result，可有多個observation。兩route、三mode、四viewport、fixture/network/keyboard/failure均由此runner實際操作。 |
| `scripts/qc-dev-112-three-view-modes-aggregate.mjs`／`npm.cmd run qc:dev-112:aggregate` | QC gate | 讀同一candidate最新contract/browser receipts，執行DEV-065 contract、`typecheck:app`與isolated build並保存stdout/exit code；輸出`aggregate-manifest.json`。缺ID、重複final、fingerprint不一致、P0/P1、primary drift或cleanup缺口即exit 1。 |
| package orchestrator／`npm.cmd run qc:dev-112:all` | RD handoff | 僅依序執行`:contract → :browser → :aggregate`，任一步非0立即停止；不得吞錯或以較舊manifest補件。 |

`package.json`登錄固定為：

```json
"qc:dev-112:contract": "node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-dev-112-three-view-modes-contract.mjs",
"qc:dev-112:browser": "node scripts/qc-dev-112-three-view-modes-browser.mjs",
"qc:dev-112:aggregate": "node scripts/qc-dev-112-three-view-modes-aggregate.mjs",
"qc:dev-112:all": "npm run qc:dev-112:contract && npm run qc:dev-112:browser && npm run qc:dev-112:aggregate"
```

本次 aggregate 實際固定執行並留receipt的 engineering/regression commands：

```powershell
npm.cmd run qc:dev-065:contract
npm.cmd run typecheck:app
npm.cmd run build:isolated
```

DEV-065 browser、DEV-105／DEV-087 contract、DEV-062 Relation與受影響檔案lint仍保留為既有回歸資產，未在本次 aggregate 重跑，不能在本次 receipt 中誤寫成已執行。

`qc-dev-065-canonical-preview-gallery.mjs`在DEV-112實作時同步更新三模式selector、runtime declaration、primary before/after invariant與cleanup receipt，
只做DEV-065 exact source/gallery regression；其case不能計入TVM。`qc-dev-066-workbench-topbar.mjs`的舊placement expected不執行也不改寫；
replacement由TVM-001/002、unaffected filter/pagination/Relation由TVM-017及`qc:dev-062:relation`證明。

### 0T.2 Task-owned fixture 與 mutation ledger

1. Browser runner先read-only snapshot `data/ai-pdm.sqlite`的完整檔案hash、schema、root／Part／Drawing canonical identities、master counts、
   root-reference orphan、migration-residue inventory與`PRAGMA foreign_key_check`。任一source invariant不成立即BLOCKED；不得先seed再宣稱source有效。
2. 只有source通過才複製到`%TEMP%/ai-pdm-dev112-<run-id>/data`與同層task-owned repository；所有DB／file mutation只限此副本，
   並逐筆寫`fixture-ledger.json`的SQL intent、before/after row identity、affected count與cleanup condition。
3. Stable identities：`A0005-M01` ready Drawing與`A0005-P01` ready Part驗證exact source parity；沿用DEV-105 isolated pattern，以
   `A0002`建立pending→ready、`A0006`建立delayed／failed／missing-path狀態。若目前source snapshot不含exact identity或hash變化，runner須BLOCKED，
   不得臨時換code後仍沿用expected。
4. capability-off使用第二個task-owned runtime／port並明示關閉preview flag；invalid map／HTTP／non-image／decode error可在同一isolated candidate
   透過route interception注入，但fixture row key、source href與預期failure family必須寫manifest，不能mock成功畫面。
5. source invariant通過後，isolated副本須依現行schema seed task-owned第二公司fixture：company=`dev112-company-b`、
   asset=`dev112-preview-asset-b`、binding=`dev112-preview-binding-b`、context=`dev112-preview-context-b`，bytes只寫task-owned repository；
   actor固定為quick-login後的`user-admin-local-quick`／`company-jenfu`。Runner先以已登入context取得一個合法company-jenfu protected preview href，
   再實際送出：(a)新browser context、無cookie GET該href，expected=401或403；(b)該actor GET company-B exact asset／binding／context href，
   expected=403或404；(c)分別tamper `fileAssetId`、`bindingId`、`contextId`的GET，expected=403或404。三類response body均不得含受保護bytes、
   raw asset／binding／context authority、storage path或hash；request URL、actor/company、status、response byte count與redaction sweep逐筆寫
   `browser-manifest.json.securityProbes`及`fixture-ledger.json`。不得用source assertion、interception或泛稱permission denied代替實際request。
6. Runtime宣告至少含project=`AI_PDM`、purpose=`DEV-112 browser QA`、chosen free port、owning process tree、cleanup condition、
   `PDM_DATA_DIR`、`PDM_REPOSITORY_DIR`、`PDM_NEXT_DIST_DIR`及mutation scope。環境固定沿用DEV-105安全基線：
   `PDM_AUTH_MODE=local`、`PDM_DB_PROVIDER=sqlite`、`PDM_LOCAL_FULL_FUNCTION_VALIDATION=true`、
   `PDM_ENABLE_LOCAL_QUICK_LOGIN=true`、`PDM_PRODUCTION_SLICE_MODE=""`、`PDM_POSTGRES_URL=""`、`DATABASE_URL=""`，
   並明示Drawing／Part canonical workbench與preview flags。不得連3000、不得停止所有node、不得清未知port。
7. finally必須關browser、停止兩個verified process trees、確認ports released、刪task runtime project／fixture；再重算primary invariant。
   schema、canonical identity、root reference、migration residue或FK狀態漂移、FK非0或cleanup未完成，一律FAIL，即使24個UI assertion都通過。
   完整檔案hash仍記錄作provenance；若同機既有runtime寫入非canonical audit/session pages，不以該雜訊取代上述logical invariant gate。

### 0T.3 Browser execution matrix 與 case ownership

- Viewports固定`1440×900`、`1024×768`、`768×1024`、`390×844`；每個viewport實際開Drawing與Part。
- 每個route依序驗`文字清單 → 3D 清單 → 預覽圖 → 文字清單`，記錄URL、activeElement、scroll、row keys/order/count、selected key、
  drawer identity、table headers、media requests與list request count。Mode switch前後不得以reload清狀態。
- `TVM-001..006`：兩route DOM／labels／group／URL-storage-capability／same-row receipts；localStorage分別測valid、invalid、throwing stub，
  並以「URL missing＋stored preference」與「invalid URL＋stored preference」證明resolver分支不同。
- `TVM-007..010`：request classification、文字清單zero-image、current cursor-page ready count與首次media request上限、inline thumbnail cell geometry、
  A0005 source/media/drawer parity；202／409 retry不可混入首次request上限。
- `TVM-011..015`：文字清單無media、文字清單不新增media request、Part shared image-bearing poll、non-ready placeholder、terminal text stop。
- `TVM-016..020`：selection／drawer focus、filter、radiogroup keyboard、accessible labels與security三類實際protected file-read。
- `TVM-021..024`：non-image failure、reduced-motion/no page errors、laptop/tablet與mobile final screenshot sweep；Drawing／Part × 三mode各至少一張完整畫面。
- Request分類固定`identity-list`、`preview-image-initial`、`preview-image-retry-202-409`、`protected-file-negative`、`detail`、`other`；
  文字清單任何preview image request、mode-only switch新增identity request，或image-bearing mode首次media request超過current cursor page ready row count即FAIL。
  Poll evidence需含timer interval、visibility、max concurrent list request與terminal stop，不接受只讀source code。

### 0T.4 Evidence schema、candidate freeze 與判定

Evidence root固定`output/qa/dev-112-three-view-modes/<run-id>/`：

```text
contract-manifest.json
browser-manifest.json
aggregate-manifest.json
fixture-ledger.json
network.json
console.json
geometry.json
data-sanity.json
screenshots/<route>/<viewport>/<mode>.png
logs/<gate>.log
```

三個manifest共同欄位至少含`devId/runId/gitSha/branch/dirtyFileSha256/nextVersion/nodeVersion/playwrightVersion/flags/sourceInvariant/
fixtureInvariant/runtimeDeclaration/caseResults/p0Count/p1Count/cleanup/passed`。Browser另含route、viewport、row/source/request/timer/focus receipts、
`securityProbes`（probeType／actor／company／redactedUrl／status／responseByteCount／rawAuthorityLeakCount）；
aggregate另含source manifest path+hash、24個final result、每個engineering command及exit code。不同git SHA或任一relevant dirty hash不同不得aggregate。

PASS仍是24/24、P0/P1=0、已執行的regression/engineering gate=0、primary logical invariant unchanged、cleanup complete；BLOCKED只可用於缺source fixture、
auth或必要外部能力且必須保留觀察證據。QA完成後由targeted QC重看TVM-001/005/008/010/013/015/016/018/020/024及aggregate；
QC不得修產品。本輪 receipts 已完成，故本文件不再維持`0/24 Executed`。

## 0S. DEV-112 三種顯示模式 QA Contract（2026-09-01／已執行／PASS）

### 0S.1 Objective、risk 與驗證邊界

驗證 `/numbering/drawings` 與 `/parts` 以同一結果資料提供 `文字清單／3D 清單／預覽圖`三種互斥模式，控制位置不再與
建立動作或filter混排；3D清單只在編號儲存格加入縮圖，文字清單不下載圖片，三模式保留 exact row／preview／drawer authority。
Risk=`Medium`：改變兩個主要頁面的資訊層級、URL/persistence、render branch與foreground polling，但不改schema、資料mutation、
permission、preview source或API route。

- PASS：`TVM-001..024`固定24案全部PASS；本次 aggregate 登錄的DEV-065 contract、`typecheck:app`與isolated build通過；
  P0/P1=0；候選版本、資料、runtime、port與cleanup可對帳。未重跑的DEV-066／087／105與affected lint只作既有回歸資產，不併入本次PASS宣告。
- FAIL：三模式 rows/context不一致、控制層級混雜、文字清單發出image request、thumbnail成為第二動作／新欄位、雙poller／N+1、
  preview source或權限退化、visible error、鍵盤／ARIA缺口或任一指定viewport overflow／overlap／crop。
- BLOCKED：無法建立isolated data/runtime與可辨識preview fixture、無法登入實際UI、來源/row key/hash provenance不可證明，或必須接觸
  production資料／credential／migration。Blocked不得推定PASS或用static scan代替browser evidence。
- QA/QC不得修產品、改expected、刪案例、寫primary資料、接手未知runtime或重用不同candidate的舊截圖。

使用思考習慣：#差距分析、#可驗證性、#風險意識、#當責

### 0S.2 Fixed acceptance matrix

| ID | Scenario | Required evidence / expected |
|---|---|---|
| `TVM-001` | Drawing頁控制層級 | Page header只有名稱與既有建立動作；filter只含資料範圍；結果上緣獨立顯示`顯示方式`與三選項，沒有3D toggle或空白footer。 |
| `TVM-002` | Part頁控制層級 | 與Drawing使用相同標籤、順序、group semantics與result-region位置；domain filter／建立動作仍各自正確。 |
| `TVM-003` | 首訪與互斥語意 | 預設`文字清單`；`文字清單／3D 清單／預覽圖`同時只選一項，selected state不只靠顏色。 |
| `TVM-004` | URL／preference相容 | `layout` key missing＋stored `list_3d`／`preview`時使用該模組storage；raw URL為三個valid值時URL優先；invalid raw＋stored `list_3d`／`preview`時resolver／React state／URL都必須為`list`且不得讀回stored值。兩模組各自記憶，storage throw回`list`，replaceState保留其他query且不污染history。 |
| `TVM-005` | Preview capability absent／flag off | 只顯示文字清單；顯示方式整組、divider與空白占位均不存在；URL安全正規化且無fabricated missing map。 |
| `TVM-006` | 三模式資料同一性 | 同一fixture在三模式的rowKey、順序、count、code、name、version/layer、handling完全相同；不合併Drawing branch或Part row。 |
| `TVM-007` | 純模式切換network | 切換不重新抓identity list/detail、不改cursor hash；image-bearing mode首次protected-media request不得超過current cursor page ready row count（page `limit<=100`），202／409 retry另計；non-ready item不得建立media request。 |
| `TVM-008` | 3D清單 media bound | 3D清單只為current cursor page ready rows建立protected-media；unique URL數不超過ready row count，raw dev duplicate request另記 observation。 |
| `TVM-009` | 3D清單結構 | 沿用table且縮圖只在編號儲存格；無新欄、巢狀button或額外tab stop；桌面/平板約84×63、手機約62×47（相較原尺寸放大約30%）、約4:3 contain不裁切。Current Phase不要求或聲稱viewport lazy。 |
| `TVM-010` | Ready source parity | Drawing／Part各以既有exact source呈現；3D清單與預覽圖mediaHref、source label及drawer source四方對帳，禁止錯revision／branch／Part fallback。 |
| `TVM-011` | 文字清單無media | 文字清單不渲染thumbnail／image，無media request與image-bearing timer。 |
| `TVM-012` | 文字清單 request quietness | 從image-bearing mode切回文字清單不新增media request，並停止poll。 |
| `TVM-013` | Part shared image-bearing poll | Part的3D清單與預覽圖沿用同一timer/request guard，無per-row poll。 |
| `TVM-014` | 非ready placeholder | pending/delayed/missing/failed/unavailable保留row與drawer；3D清單顯示低噪音占位，不洩漏raw error/hash/storage/job。 |
| `TVM-015` | Terminal text stop | 切到文字清單、terminal或unmount後timer停止，不再產生background refresh。 |
| `TVM-016` | Selection／drawer／focus／scroll | 三模式互切保留selected exact row與已開drawer；關閉drawer回目前mode合理目標；無focus loss、scroll jump或不存在table target。 |
| `TVM-017` | Filter／sort／page／race | 搜尋、複選filter、排序、cursor/page及快速request race沿用canonical行為；每次成功snapshot以目前頁exact row set原子替換groups與preview map，stale response不可覆蓋。 |
| `TVM-018` | Mode group keyboard | `顯示方式`有radio/segmented group name；Tab進組一次，方向鍵移動，Space/Enter選取；切換不搶結果焦點。 |
| `TVM-019` | Row/card keyboard、screen reader、motion | 既有table/gallery keyboard與copy/drawer行為不退化；縮圖不是額外焦點；accessible name含preview state；reduced-motion無旋轉/pulse。 |
| `TVM-020` | 安全、資料與可見錯誤 sweep | Runner實際執行三類protected file-read：(1)無cookie GET合法href=401/403；(2)`user-admin-local-quick`／`company-jenfu`讀task-owned company-B exact asset/binding/context=403/404；(3)逐一tamper fileAssetId/bindingId/contextId=403/404。各response受保護byte count=0、raw authority/storage path/hash leak=0；DOM/console無hydration error、5xx或broken-image icon，畫面資料與fixture一致。 |
| `TVM-021` | non-image media failure | 注入非圖片受保護回應後，exact item卸載broken media並顯示unavailable placeholder，無page error。 |
| `TVM-022` | reduced-motion／error sweep | `prefers-reduced-motion`下無旋轉／pulse；console與page errors為0。 |
| `TVM-023` | laptop／tablet screenshots | 1440×900與1024×768 Drawing／Part三模式畫面可對帳；無overflow、overlap、crop、錯欄或雙scroll。 |
| `TVM-024` | mobile screenshots | 768×1024與390×844畫面可對帳；控制可觸控且不截字，約62×47縮圖不擠掉編號。 |

### 0S.3 FMEA 與不可接受失效

| Failure mode | Effect | Detection | Required prevention / disposition |
|---|---|---|---|
| 三模式各自維護資料或selection | 切換後看見不同物件、錯開drawer | TVM-006/016/017 row-key readback | 單一canonical list state與callbacks；任一不一致=P0 FAIL |
| 文字清單仍建立image/poll request | 無意義流量、worker壓力與畫面抖動 | TVM-007/008 network+timer trace | image-bearing mode gating；任一image request=P1 FAIL |
| 3D清單與gallery各自poll | 重複查詢、race、stale覆蓋 | TVM-011..013 in-flight/timer evidence | 共用DEV-105 request guard；雙timer或stale commit=P1 FAIL |
| 縮圖另成欄位／按鈕 | 比較骨架破裂、鍵盤多一焦點 | TVM-009/018/019 DOM+keyboard | 同一編號cell、row-owned action；額外interactive descendant=P1 FAIL |
| preview source被重新計算 | 顯示錯revision／branch／Part | TVM-010 fixture/map/file-read對帳 | 只消費既有safe projection；任何fallback=P0 FAIL |
| capability off仍顯示空控制 | 使用者選到無作用模式 | TVM-005 DOM/URL/network | 整組不渲染並回文字清單；半套UI=P1 FAIL |
| invalid URL又套用stored偏好 | 深連結正規化結果與實際模式分歧 | TVM-004 resolver／URL／state receipt | 只有URL key missing可讀storage；invalid raw必回list，分歧=P1 FAIL |
| non-image／decode error留下broken media | 使用者看見破圖且gallery／inline行為不一致 | TVM-015 DOM、error event與screenshot | shared wrapper擁有per-href failure並卸載media；任一broken icon=P1 FAIL |
| protected file-read只做mock或source assertion | 權限退化未被真實驗證 | TVM-020 request／status／byte／redaction receipt | 固定actor與company-B fixture送三類實際GET；缺任一probe=P1 evidence FAIL |
| 窄版控制或縮圖溢位 | 模式不可選、編號不可讀 | TVM-023/024 screenshot+geometry | 整組換行、縮圖維持約62×47且不擠掉編號；page overflow=P1 FAIL |

### 0S.4 Evidence layers、candidate freeze 與執行責任

1. Contract layer：三模式enum、missing／invalid URL resolver分支、capability gate、same-row projection、shared wrapper failure owner、
   current cursor-page media bound、single poller與DOM禁則的focused assertions。
2. Interaction layer：兩route以mouse、touch與keyboard切換；對帳filters/page/selection/drawer/focus/scroll/network及ready/nonready狀態。
3. Browser layer：固定四viewport、Drawing/Part × 三模式；保留screenshot、DOM摘要、console、request/response family、geometry與data-sanity receipt。
4. Regression layer：DEV-065 exact source/map/file-read、DEV-105 convergence、DEV-066 pagination/filter shell、DEV-087 row/drawer與受影響build/typecheck/lint。
5. Candidate freeze：所有TVM evidence必須記錄同一git/dirty fingerprint、flags、Node/Next版本、fixture manifest與來源歸屬；不同版本不可拼成PASS。

若需啟動runtime，必須依專案規則先記錄project、purpose、port、process tree、cleanup condition、`PDM_DATA_DIR`與
`PDM_REPOSITORY_DIR` mutation scope，使用task-owned isolated資料／repository；完成後只停止該tree並證明port released。Build前後須證明
primary SQLite schema、canonical root/Part/Drawing identities、migration residue與`PRAGMA foreign_key_check`不變。

Exact runners、commands、fixture keys、file/hunk manifest與估工已由本文件§0T及SPEC §0T註冊；DEV-112已完成RD實作，
並由同一candidate完成TVM-001..024、contract與aggregate evidence。結果只代表本機QA-QC完成；production仍受獨立release gate管制。

### 0S.5 Current execution receipt（2026-09-01）

- Contract receipt：`output/qa/dev-112-three-view-modes/DEV112-contract-2026-09-01T04-20-45-784Z/contract-manifest.json`，C01～C16=`16/16 PASS`。
- Browser receipt：`output/qa/dev-112-three-view-modes/DEV112-2026-09-01T04-20-52-452Z/browser-manifest.json`，TVM=`24/24 PASS`、P0/P1=`0/0`，
  Drawing／Part × 三模式 × 四 viewport 截圖=`24`；security no-cookie=`401`、跨公司／tampered=`404`，受保護 bytes與raw authority leak=`0`。
- Aggregate receipt：`output/qa/dev-112-three-view-modes/DEV112-aggregate-2026-09-01T04-22-28-720Z/aggregate-manifest.json`，contract/browser candidate fingerprint match、
  DEV-065 contract、`typecheck:app`、`build:isolated`、primary／fixture／cleanup gates均`PASS`；`productionConnection=false`、`productionWrites=false`。
- 本次未執行PostgreSQL shadow；這不阻擋DEV-112本機三模式交付，但不得把本結果延伸為full multi-provider PASS。

## 0. Phase 1 Canonical Drawing QA Plan 與 Phase 2 Direction

### 0.1 Objective、risk 與 pass boundary

驗證同一批canonical Drawing rows可在清單／預覽圖間切換，且每張卡片只顯示該opaque row的exact revision 3D；list metadata為same-snapshot bounded bulk read，bytes只走single canonical file-read。風險等級=`Medium`：跨contract/repository/client/CSS與browser flow，但不改schema、資料、permission、mutation或release。

- PASS：`CPG-001`～`CPG-024`全部PASS；required focused/parent regression、typecheck、affected lint與isolated build通過；P0/P1=0；runtime/data/port cleanup完整。
- FAIL：錯revision／跨branch借圖、map與rows不等、per-row query、old route/flag成為current caller、未授權檔案可讀、stale response覆蓋、list/drawer退化、visible error、不可存取或viewport缺陷。
- BLOCKED：isolated canonical fixture/runtime無法建立、provenance或file hash不可證明、或工作必須碰production/remote migration/credential。Blocked不得推定PASS。
- QA/QC不得修產品、改expected、寫primary`data/ai-pdm.sqlite`或接手未知runtime。

使用思考習慣：#差距分析、#可驗證性、#當責

### 0.2 Current acceptance matrix

| ID | Scenario | Required evidence / expected |
|---|---|---|
| `CPG-001` | Drawing list DTO | `preview3dByRowKey`存在且key set與本頁所有rowKey完全相等；Part/Relation省略；retired/banned fields仍為0。 |
| `CPG-002` | A0002-M01 production 1＋RD 1.1 | 保留兩張不同`cw_<UUID>`卡；各自layer/revision、context、binding及derivative exact，不合併、不借圖。 |
| `CPG-003` | Disposable one production＋three RD branches | 四row/card順序與list一致；每個exact revision source對帳可重現。 |
| `CPG-004` | 同revision多3D binding | role=`cad_3d`優先，其次3D extension；同層`is_primary DESC, sort_order, binding.id`；list與drawer同source。 |
| `CPG-005` | Exact revision無3D、另一revision有ready 3D | 目標row=`missing`；禁止global latest、production/RD互借、舊版或2D fallback。 |
| `CPG-006` | queued/running/fresh、stale heartbeat、failed/skipped/cancelled、無source | 分別為pending、delayed、failed、missing；文案符合SPEC且card仍可開。 |
| `CPG-007` | stale hash、fake generator/version、source無hash、無usable derivative/job | `unavailable`；mediaHref=null；不洩漏hash/storage/job/raw error。 |
| `CPG-008` | Ready summary href | 只指`/api/pdm/file-assets/{id}`；production=`drawing_revision`、RD=`candidate_revision`；exact contextId/binding/reviewRequestId/derivative。 |
| `CPG-009` | Unauthenticated、page permission denied、cross-company、wrong context/binding/revision/review scope/derivative | 依existing contract fail closed；無bytes、無存在性洩漏、無fallback。 |
| `CPG-010` | 0/1/20/50 rows及1/2/4 rows per group | Drawing list statements`<=12`且row/group count delta=0；preview最多2個bulk statements；無per-row/revision/file query。 |
| `CPG-011` | List mode network | 不呼叫detail或old preview child route；gallery切換不refetch list；ready images才lazy callcanonical file-read。 |
| `CPG-012` | 舊env flag false/true與legacy source scan | Current Drawing gallery行為不受舊flag影響；current import/runtime/network caller對old helper/route/token/status/lane為0。 |
| `CPG-013` | 首訪、valid URL、valid storage、URL＋storage衝突、invalid/disabled storage | URL > storage > list；key=`pdm-canonical-drawing-layout-v1`；錯值回list且無hydration/visible error。 |
| `CPG-014` | 切換list↔preview | `replaceState`不增加history；query/layer/handling/detail及selected row/drawer保留；row序列/count完全相同。 |
| `CPG-015` | Load more | 新groups維持server order，preview map按new rowKey merge；duplicate/missing/extra key被contract guard拒絕而不錯配。 |
| `CPG-016` | 快速搜尋／filter／refresh race | 舊request被abort或sequence丟棄；只有latest response更新groups/totals/cursor/token/map；無unhandled rejection。 |
| `CPG-017` | Mouse/touch/card image error | Card單一入口開exact drawer；image 202/204/404/409/5xx/decode error只降級該card，不影響row/drawer。 |
| `CPG-018` | Keyboard gallery | Arrow四向、Home/End、PageUp/Down、Enter/Space、Escape、Ctrl/Cmd+C及roving tabindex通過；drawer開啟時Arrow切exact row。 |
| `CPG-019` | Focus、screen reader、reduced motion | Focus可見且關drawer回current region；accessible name無internal IDs；state不只靠顏色；reduced motion不失去訊號。 |
| `CPG-020` | Quietness/card content | 只顯示3D、code、name、layerLabel、nonempty handlingLabel與必要placeholder；無helper、成功badge、下載/mutation、重複revision或框中框。 |
| `CPG-021` | Loading、empty、list/API error | 就地loading；empty只有`沒有符合條件的資料`；preview state gap不拖垮其他row；DB/list error沿existing alert。 |
| `CPG-022` | 1440×900、1024×768、768×1024、390×844 | 主要物件可讀、4:3 contain、無page overflow/重疊/裁切/雙scroll/drawer遮擋；窄版不壓成不可讀小卡。 |
| `CPG-023` | Parent regressions | DEV-087 contract/repository/browser/file-read、canonical drawer、Part／Relation current flow與retired vocabulary均維持PASS。 |
| `CPG-024` | Delivery boundary | schema/migration/data/permission/worker/mutation無diff；productionConnected/Writes=false；manifest/source hashes/cleanup/port released完整。 |

### 0.3 Required fixtures

全部fixture在task-owned temp SQLite/repository或approved disposable provider建立；primary`data/ai-pdm.sqlite`只讀。Manifest記錄company/actor、canonical state/row、drawing/revision/binding/asset/derivative/job IDs、content hash與建立方式，但公開UI evidence須遮蔽internal IDs。

| Fixture | Shape |
|---|---|
| `C-A0002-EXACT` | 現有read-only A0002-M01 production 1＋RD 1.1，兩者有real ready thumbnail；作current exact-row baseline。 |
| `C-MULTI-RD` | 一Drawing group：1 production＋3 open RD，各有不同exact revision/file/derivative。 |
| `C-EXACT-MISSING` | 目標revision無3D；同drawing另一revision有ready 3D。 |
| `C-SOURCE-ORDER` | 同revision含primary/secondary cad_3d、3D extension與2D，證明deterministic selection。 |
| `C-STATES` | ready、queued、running fresh/stale、failed、skipped、cancelled、missing、stale hash、fake、no hash、no job。 |
| `C-BULK-1/20/50` | 不同row counts及1/2/4 rows per group，資料量變化不改statement count。 |
| `C-SECURITY` | unauthenticated、same-company view、wrong reviewer、cross-company、wrong context/binding/revision/derivative。 |
| `C-LONG-CONTENT` | 長code/name及nonempty handling，驗證card可讀、accessible name及viewport。 |

### 0.4 Evidence layers 與 commands

Static/contract/repository：

- `npm.cmd run qc:dev-065:contract`
- `npm.cmd run typecheck:app`
- affected-file ESLint；不得以全域ignore掩蓋新error。
- Query instrumentation重用async provider counter及existing read-snapshot pattern；不得只數source字串或mock away DB calls。

Real browser：

- `npm.cmd run qc:dev-065:browser`
- Reuse `scripts/qc-next-app-runner.mjs`。啟動前記錄project/purpose/port/process tree/cleanup condition；使用random port、isolated Next dist、temp DB/repository與`.invalid`actors；finally只停止task-owned tree並確認port released。
- 每viewport保存list、preview、selected/focus、drawer、ready/missing/pending/error，並記DOM width/scrollWidth、URL/storage、API rowKey、network/console/page/server errors。
- Screenshot不能單獨證明source；必須以list JSON＋fixture manifest＋file-read request三方對帳。

Parent regression／build：

- `npm.cmd run qc:dev-087:contract`
- `npm.cmd run qc:dev-087:repository`
- `npm.cmd run qc:dev-087:file-read-retirement`
- `npm.cmd run qc:pdm-entity-detail-drawer`
- `npm.cmd run qc:dev-087`
- `npm.cmd run build:isolated`
- `git diff --check`

### 0.5 QC handoff、stop與release boundary

QC report至少列出`CPG-001`～`024`逐項result/evidence、exact row source table、query counts、four viewport/a11y、security probes、old-current-caller scan、parent regression、source/dirtiness manifest與cleanup。任何FAIL、Blocked或Not verified不得寫PASS；QC不改產品或expected。

Stop：需要new schema/index/cache/API/file authority/permission/worker、per-row query、Part/Relation/interactive3D、production/remote target，或無法隔離dirty same-hunk時回RD/PM。Local PASS只代表DEV-065 local product slice；deploy/release另進deployment release gate。

### 0.6 2026-08-23 Execution Result

- CPG focused contract：`npm.cmd run qc:dev-065:contract`，`CPG-001`～`CPG-024`=`24/24 PASS`。
- Authenticated isolated browser：`npm.cmd run qc:dev-065:browser`=`35/35 PASS`，涵蓋 1440×900、1024×768、390×844；驗證 Drawing list／gallery parity、exact `preview3dByRowKey` key set、card drawer、roving focus、URL／localStorage、responsive overflow、console/page error，以及 Part／Relation 不顯示模式切換。
- Parent regression：`qc:dev-087:contract` 31/31、`qc:dev-087:repository` 29/29、`qc:dev-087:commands` 39/39、`qc:dev-087:file-read-retirement` 193/193、latest canonical workbench browser 118/118；typecheck、受影響檔 ESLint、isolated build 與 `git diff --check` 均通過。
- Legacy runner disposition：`qc:pdm-entity-detail-drawer` 仍綁定已刪除的舊 `src/lib/pdm-entity-detail.ts`，無法啟動；該 runner 不納入 current CPG PASS denominator，current canonical drawer 已由本計畫 browser 與 DEV-087 browser 覆蓋。不得為通過舊 runner 而恢復退役 source。
- Cleanup／boundary：本輪只使用 task-owned isolated runtime／暫存資料；port 已釋放、暫存目錄已移除，未寫入 primary data、production 或 remote target，未執行 migration／deploy／release。後續如需正式環境，另進 deployment release gate。

### 0.7 Phase 2 Part QA execution contract（Local execution complete；PostgreSQL blocked）

Status: `Expected Fixed / Product + Runners Implemented / SQLite + Browser PASS / PostgreSQL Shadow BLOCKED / Full QA Not PASS`

本節對應SPEC §0.16與`ADR-PDM-PART-PREVIEW-AUTHORITY-001`。資料、command、delete/recovery、image、permission、component、runner／fixture／provider preflight與evidence manifest均已固定並實作；QA不得改expected來迎合實作。2026-08-24已完成local SQLite、Chromium與focused regression execution；PostgreSQL shadow因必要環境變數缺漏而safe BLOCKED，不得以其他provider PASS代替。

主要品質風險：

- Source truth：Part被錯綁root-min、reference Drawing、terminal／較舊RD branch、2D或最近附件，或在production ready已存在時仍顯示RD，造成看似有圖但語意錯誤。
- Override truth：custom pointer、asset與UI label不一致；custom損壞時silent fallback，讓使用者誤判仍在看人工指定圖片。
- Atomicity：upload／replace／reset／generic delete／response loss產生dangling pointer、雙active override、orphan visible asset或原來源遺失。
- Authority：custom image被誤當CAD／Drawing file／審核證據，或跨company、wrong Part、wrong binding／asset仍可讀寫。
- Performance/UI：Part list新增per-card query/endpoint，或Drawing/Part preference互相污染、same Part跨surface顯示不一致；為Part複製gallery/media、把custom塞成Drawing slot，或以entityType／大量boolean props形成不可測的巨型component。

正式QA matrix固定覆蓋：

| Area | Fixed contract expected |
|---|---|
| Auto source | 無override只取direct unique`primary_manufacturing` Drawing；production ready優先，否則取latest active RD ready。多RD分支仍必須顯示一張且deterministic；不得跨Drawing、terminal RD、2D或附件fallback。 |
| Custom source | PNG／JPEG正常上傳；`<=10 MiB`、decoded `64..8192`、MIME/extension/magic/decode一致、orientation與metadata正規化；source label、reload persistence及same Part跨formal/work/history一致。 |
| Reset／replace | Explicit reset、replace success/failure、upload/storage/DB failure與response loss均有idempotent receipt/readback，舊有效來源在commit前不消失。 |
| Active delete | generic delete命中active custom固定409 `PART_PREVIEW_ACTIVE_ASSET`；reset／replace後才可由一般附件policy刪除。不得接受silent reset、dangling pointer或silent auto fallback。 |
| Permission/security | Viewer唯讀、authorized same-company owner正向、unauthorized/cross-company/wrong Part/tampered asset/hash/MIME spoof/oversize fail closed，DTO/DOM/log不洩漏authority。 |
| Identity/read parity | List/gallery/detail同source；同Part共享override，不同Part/company/root不互借；filter/sort/page/load-more/selection/drawer parity。 |
| Performance | 0／1／20／50 rows及多group query count constant、無N+1/per-card preview endpoint；images lazy且bytes只走canonical file-read。 |
| Component convergence | Drawing／Part gallery由同一entity-neutral navigation/card shell輸出；gallery與Part drawer使用同一safe projection；protected media、placeholder/error/retry只有一套renderer。Source scan不得出現Part-only gallery/media copy或list/detail雙resolver。 |
| Part drawer UX | 只有一個主要`料號預覽`；auto/custom與gallery一致，最小保留source label及`查看主要製造圖`。不得常駐第二個相同3D board；若contract依真實任務補回2D，須獨立標`主要製造圖`。 |
| UX/a11y | `自訂圖片`、`量產預覽 {drawingCode} · {revision}`與`研發預覽 {drawingCode} · {revision}`可辨識；無primary link與linked-no-usable-3D文案不同；custom unavailable不silent fallback；shared panel/media在single/tabs/grid及mouse/keyboard/focus/screen reader、四viewport下無overflow/遮擋。 |
| Regression | Phase 1 `CPG-001`～`CPG-024`、DEV-087 Part drawer、Part附件新增／刪除／replacement flow、file-read與permission authority不退化。 |
| Delivery boundary | Migration只在disposable SQLite/PostgreSQL shadow驗證；rollback、source/dirtiness manifest、productionConnected/Writes=false及task-owned runtime cleanup完整。 |

#### 0.7.1 Exact isolated fixtures

`scripts/qc-dev-065-part-preview.mjs`每次建立task-owned temp SQLite、repository與manifest；禁止複製或修改`data/ai-pdm.sqlite`。Stable fixture keys與用途如下：

| Fixture key | Required state |
|---|---|
| `auto_ready` | direct unique primary manufacturing Drawing＋canonical production exact 3D ready；即使RD較新仍選production。 |
| `auto_rd_ready` / `auto_multi_rd_ready` | production無ready；單一／多個active RD ready時顯示一張，依最新3D／revision更新時間與stable ID deterministic選擇。 |
| `auto_production_promoted` | 起初顯示RD ready；同Drawing新增production ready後，不改Part setting即自動改顯示production。 |
| `auto_no_primary` / `auto_multiple_primary` | 0筆／defensive >1筆primary，均不fallback。Multiple以pure resolver synthetic row contract測試，不關閉或繞過DB constraint。 |
| `auto_linked_no_usable_3d` / `auto_pending` / `auto_failed` | direct link存在但production／active RD均無ready時，保留最佳候選state與Drawing identity；文案不得誤稱「尚未連結」。 |
| `custom_png` / `custom_jpeg_exif` | 合法64..8192 image；JPEG含orientation/metadata以驗normalize與strip。 |
| `custom_missing_object` / `custom_hash_mismatch` / `custom_deleted_tamper` | setting仍custom但media不可讀，read保持unavailable、不回auto。 |
| `image_negative_matrix` | wrong extension/MIME/magic、truncated、SVG/GIF/WebP/APNG、63px、8193px、input/output >10 MiB、decompression-bomb boundary。 |
| `replace_faults` | storage、DB insert、setting update、audit、receipt complete各fault point。 |
| `response_loss` / `concurrent_same_key` / `stale_version` | terminal replay、同key同payload、同key不同payload、雙client競態。 |
| `active_delete` | active custom generic soft-delete 409；reset/replace後可刪；restore不reactivate。 |
| `surface_parity` | 同Part formal/work/history rows及list/gallery/detail。 |
| `cross_scope` | second company/root/Part、wrong asset binding與viewer actor。 |
| `query_0_1_20_50` | 0/1/20/50 visible rows與多group，source mix固定且可重跑。 |

Manifest記錄company/actor/Part/Drawing/revision/setting/asset/job fixture IDs與hash，但public screenshot／DOM不得出現raw IDs/hash。現有本機3個Part的read-only sample只能證明路徑存在，不能取代fixture或production代表性證據。

#### 0.7.2 Runner、fault injection 與 query instrumentation

| Runner | Owns | Acceptance |
|---|---|---|
| existing `scripts/qc-dev-065-canonical-preview-contract.mjs` | neutral DTO、Drawing exact resolver、old token/current caller scan、feature dependency | `PPC-001..002,013,016..018`＋`CPG-*` regression |
| new `scripts/qc-dev-065-part-preview.mjs` | SQLite schema, image matrix, service/routes, receipt/version, active delete, resolver/query, security | `PPC-001..012,016,018` |
| new `scripts/qc-dev-065-part-preview-postgres.mjs` | safe shadow target preflight、046 first/re-run、constraints/triggers、serializable concurrency、query count | `PPC-005..012,018` provider parity |
| existing `scripts/qc-dev-065-canonical-preview-gallery.mjs` | Drawing＋Part gallery/drawer, source control, keyboard/a11y, flag off/on, four viewports | `PPC-011,013..018` |

Fault injection只由test dependency注入，不在production env暴露開關：`after_normalize`、`after_storage_put`、`before_asset_insert`、`after_asset_insert`、`after_setting_upsert`、`before_audit`、`before_receipt_complete`、`after_commit_before_response`、`compensation_delete_failed`。每點都驗old source、setting row/version、asset visibility、receipt/audit count與storage reconciliation結果；不得只比HTTP status。

Repository／service query instrumentation包住`AsyncDatabaseClient`並記錄normalized statement family、count與transaction boundary。Part listdelta `<=4`、total `<=14`，detail total `<=14`；0/1/20/50與multi-group count相等。Browser不得每卡呼叫preview endpoint；network sweep只允許list/detail與lazy canonical file-read。

Acceptance ID mapping：`PPC-001..002` auto source；`003..004` custom validation/unavailable；`005..008` replace/reset/delete/atomic recovery；`009..010` permission與identity；`011..012` read/query parity；`013..015` component/drawer/UX；`016` security disclosure；`017` regression；`018` feature-off rollback。QA implementation不得合併掉高風險negative case。

#### 0.7.3 Exact commands 與 executable gate

```powershell
npm.cmd run qc:dev-065:contract
npm.cmd run qc:dev-065:part-preview
npm.cmd run qc:dev-065:postgres
npm.cmd run qc:dev-065:browser
npm.cmd run qc:master-attachments
npm.cmd run qc:dev-087:contract
npm.cmd run qc:dev-087:repository
npm.cmd run qc:dev-087:commands
npm.cmd run qc:dev-087:file-read-retirement
npm.cmd run typecheck:app
npm.cmd run build
git diff --check
```

`qc:dev-065:postgres`只接受explicit `PDM_POSTGRES_SHADOW_URL`，preflight必須拒絕known production host/database、要求empty/disposable schema並記錄`productionConnected=false`、`productionWrites=false`；缺shadow是BLOCKED，不可跳過後宣稱完整PASS。Affected ESLint清單由SPEC §0.16.15 exact TS/TSX manifest產生並附於run evidence。

Browser沿用`qc-next-app-runner.mjs`，記錄project/purpose/random port/process tree/cleanup condition，使用isolated Next dist、temp data/repository與`.invalid`actors；1440×900、1024×768、768×1024、390×844均以真實click/keyboard/file chooser驗證。最後只停止task-owned tree並確認port released。

#### 0.7.4 Pass boundary 與 evidence manifest

- PASS：`PPC-001..018`全PASS；SQLite＋PostgreSQL、CPG、DEV-087、master attachment/replacement、typecheck、affected lint、build、diff均PASS；P0/P1=0；cleanup完整。
- FAIL：任一source fallback錯誤、custom失效silent auto、舊來源在commit前消失、receipt非exactly-once、active asset可被soft-delete、reserved category可由generic upload寫入、跨scope讀寫、query超cap、兩套media/gallery/resolver、raw authority洩漏或feature-off仍有Part mutation/read。
- BLOCKED：safe PostgreSQL shadow、target storage adapter、isolated auth/runtime或dirty same-hunk無法建立；Blocked不得改expected、刪案例或推定PASS。

Manifest最低欄位：run ID、git SHA、dirty file SHA-256與source attribution、Node/Next/sharp版本、flags、DB/storage provider、migration first/re-run、fixture manifest hash、PPC/CPG result、query counts、fault point、HTTP/DB/audit/receipt/storage readback、screenshots、DOM/console/network、P0/P1、productionConnected/Writes、process/port cleanup。Screenshot不能單獨證明來源；list JSON、fixture manifest、DB pointer與file-read request必須四方對帳。

QA contract與local execution已完成；完整QA的剩餘gate只有在safe disposable PostgreSQL shadow執行既有provider runner並PASS。任何production migration、capability activation、deploy或release仍不在本計畫授權。

#### 0.7.5 2026-08-24 local execution result

| Evidence | Result | Scope / disposition |
|---|---|---|
| `qc:dev-065:contract` | `28/28 PASS` | Neutral DTO、source scan、feature dependency、CPG／PPC static contract。 |
| `qc:dev-065:part-preview` | `30/30 PASS` | SQLite schema/re-run/guards、image matrix、service/receipt/version/fault recovery、active delete、resolver/security/query。 |
| `qc:dev-065:browser` | `112 checks PASS` | A0005 Drawing＋Part四viewport、active RD ready來源、upload/reload/reset/delete、401/400/409、shared components、flag-on/off、no overflow／page errors。 |
| Query evidence | `PASS` | list statements 0/1/20/50 rows=`2/7/7/7`；detail=`13`；list transactions=`1`。 |
| Feature off | `PASS` | Part switch/map absent、mutation 404；Drawing preview preserved。 |
| DEV-087 regressions | `31/29/30/193 PASS` | contract/repository/commands/file-read retirement；latest file-read evidence port `57417` released。 |
| DEV-088 regressions | `40/29/15 PASS` | replacement contract/repository/HTTP；HTTP port `57414` released。 |
| Typecheck/lint/diff/build | `PASS with standard-build disposition` | typecheck、22 affected TS/TSX ESLint、diff check、isolated build `126/126` PASS；standard build因非本任務port 3000 runtime被安全阻擋。 |
| PostgreSQL provider | `BLOCKED` | `PDM_POSTGRES_SHADOW_URL`／`POSTGRES_SHADOW_URL`未設定；runner未接觸DB，`productionWrites=false`。 |
| Master attachment aggregate | `NON-ATTRIBUTABLE BASELINE FAIL` | 失敗期待位於DEV-065前已dirty的Drawing attachment route；Part active-delete、generic reserved POST、file-read與replacement direct evidence均PASS。 |

PPC coverage：`001..004`由source/image矩陣覆蓋；`005..008`由atomic set／replace／reset／delete／fault／receipt覆蓋；`009..010`由same-company、permission與identity覆蓋；`011..016`由resolver/query/shared UI/drawer/a11y/security覆蓋；`017`由DEV-087／088與build regressions覆蓋；`018`由feature-off runtime覆蓋。SQLite／browser層PPC沒有open P0/P1；PostgreSQL對應`PPC-005..012,018`保持BLOCKED而非PASS。

四張current screenshot位於`output/qa/dev-065-canonical-preview/desktop.png`、`laptop.png`、`tablet.png`、`mobile.png`；feature-on port `64346`與feature-off port `58568`均釋放，兩個task-owned Next dist與temp DB/repository均已移除。四viewport均明確斷言A0005-P01=`ready / 研發預覽 / A0005-M01 / 0.1`。完整版本、hash、dirty attribution與release boundary見`.ai-doc/qc/qc-dev-065-part-preview-local-execution-2026-08-24.md`。

---

## Historical Legacy-Architecture QA Baseline（2026-08-11）

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
