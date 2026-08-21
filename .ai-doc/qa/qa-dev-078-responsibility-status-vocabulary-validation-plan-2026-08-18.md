# QA-DEV-078：固定責任稱謂的人類狀態投影驗證計畫

狀態：`Phase 1 Historical Baseline / Phase 2 QA Executed / Full Aggregate QC Passed / Production Release Gated`

日期：2026-08-18  
對應：`DEV-078`、`SPEC-PDM-STATUS-UX-004 §18～§19`、`SPEC-PDM-STATUS-ACTIONABILITY-CAPA-001 §7～§9`；生命週期authority：`DEV-052`、`DEV-053`  
風險：Medium / P1

> **DEV-087 boundary**：本文件保留作activation前責任語彙與回歸歷史。DEV-087啟用後只接受canonical handling固定角色文字，舊human/viewer/responsibility/availability projector與filter必須拆除；其舊case不得作為保留compatibility的理由。新決策與QA-087優先。

## 1. 驗證目標

證明同一entity/version/company不再因觀看者不同而顯示「待你處理／等他人處理」，而是由server輸出可跨截圖溝通的固定責任狀態；同時保留「我的待辦」、exact reviewer、權限及DEV-073 actionability gate，不產生phantom task或擴權。

本計畫驗證的是共享責任與viewer actionability分離，不以全域字串替換或單一帳號截圖視為通過。

## 2. Scope and boundary

範圍內：

- 圖號、料號、圖料root／child、preview card及共用明細的主要status badge／popover。
- `responsibilityStatus`、`viewerActionability`、既有`humanStatus／availabilityScope／viewerStatus`相容欄位。
- stable responsibility filter、`我的待辦／view=mine`、filter-before-limit／cursor fill。
- exact reviewer、owner assignment、role capability、formalization recovery action與private/no-store。
- 1440×900、1024×768、390×844 rendered browser與跨actor成對證據。

範圍外：

- DB/schema/migration/backfill、assignment model、RBAC role、approval/publication command、retry strategy、正式資料與release。
- 移除`viewerStatus`或舊query；本phase只驗證additive compatibility。
- 平行會簽、多個同時主要責任或新增個資可見範圍。
- DEV-048 legacy number-only approval及其他approval domain的publication語意；未證明自動正式化者不得套用RS-08～11。

執行邊界：DEV-078 Phase 1A～1D與Phase 2 P2-A～P2-D均已在本機／隔離runtime完成實作與驗證；production、live data與release不在本計畫授權內。

## 2.1 Execution result — 2026-08-18

- DEV-078 projection：26/26 PASS；focused contract：32/32 PASS（含DEV-073 browser runner、source preflight與isolated source contract）。
- DEV-055 regression：projection 71/71 PASS、contract 13/13 PASS、browser PASS；DEV-073 contract PASS；`npm run typecheck:app` PASS；`npm run build:isolated` PASS。
- DEV-078 browser：`output/qa/dev-078-responsibility-status/20260818144105-13da80cf/`；四個actor、1440／1024／390三個viewport、API additive shape、cross-actor responsibility parity、stable filter、popover／drawer、console／network／overflow與temporary port cleanup均PASS；所有API response維持`private, no-store`。
- DEV-073 browser：`output/qa/dev-073-status-actionability/DEV073-20260818T144307Z-666b556c/`；8 cases PASS。runner先以read-only SQLite preflight確認A0005-M01 canonical與0.2／0.3／0.5 revisions、A0005-P04、drawing number、terminal FFF及A0007 orphan；主資料不足時使用通過檢查的`data/backups/20260818-140227/database/ai-pdm.sqlite`唯讀複製到OS temp，未修改來源資料、未放寬expected，完成後清理。
- Phase 1最終結論：`npm run qc:dev-078`完整聚合PASS；此結論不適用於2026-08-19 Phase 2六狀態語彙，production release仍gated。

## 3. Required role and state fixtures

每組fixture必須記錄entity/version/company、canonical lifecycle、owner/reviewer assignment、active work item、action inventory、actor identity／role／permissions、projection output及response headers。

| ID | Canonical condition | Expected responsibility status | Cross-actor expectation |
|---|---|---|---|
| RS-01 | A0002首版準備、owner=RD-A | `owner / 待負責人處理` | RD-A、RD-B、主管皆同label；只isMine/canAct不同 |
| RS-02 | A0003首版準備、owner=RD-B | `owner / 待負責人處理` | 與RS-01同主label，可見姓名依既有授權 |
| RS-03 | 缺資料且尚未送審 | `owner / 待負責人處理` | 主管同時有edit/review capability也不得顯示review owner |
| RS-04 | active review + 有效request/work item | `review_owner / 待審核負責人處理` | 正式圖面exact reviewer可決策；candidate bundle沿用既有RD主管role queue；submitter／其他人只查看進度 |
| RS-05 | active review中發現缺資料、尚未退回 | `review_owner / 待審核負責人處理` | 不提前切回owner |
| RS-06 | reviewer已退回、owner correction action存在 | `owner / 待負責人處理` | 責任在新projection切回owner |
| RS-07 | active review state但無request/work item | `unknown / 負責人待確認` | 所有actor相同，禁止猜review owner |
| RS-08 | normal auto-finalizing | `system / 系統處理中` | 所有actor canAct=false，無人工primary CTA |
| RS-09 | worker較久但未有failure evidence | `system / 系統處理中` | 不得升為system admin |
| RS-10 | verified formalization failure + recovery action | `system_admin / 待系統管理員處理` | 只有具既有recovery permission者canAct |
| RS-11 | failure evidence存在但無適用recovery action | `unknown / 負責人待確認` | 不得製造系統管理員phantom task |
| RS-12 | `rd_controlled` | `usable`＋`研發可用` | owner存在也不得覆蓋usable |
| RS-13 | `released`且publication evidence完整 | `usable`＋`生產可用` | viewer capability不改label |
| RS-14 | obsolete／cancelled／merged | `terminal`＋既有終止文案 | viewer capability不改label |
| RS-15 | owner/review/system-admin responsibility action全無 | `unknown / 負責人待確認` | history／refresh／navigation不得產生待辦 |

## 4. Acceptance traceability

| ID | Acceptance criterion | Automated evidence | Rendered/manual evidence |
|---|---|---|---|
| QA-078-01 | 同fixture跨RD、RD主管、非負責人actor的`responsibilityStatus` deep-equal | actor matrix contract | 成對截圖文字比對 |
| QA-078-02 | `viewerActionability`可不同但不改第一層badge | DTO/action matrix | popover／CTA對照 |
| QA-078-03 | 第一層主要表面無`待你處理／等他人處理／待他人處理` | source＋rendered text scan | 四工作面截圖 |
| QA-078-04 | RS-01／02均顯示`待負責人處理` | fixture assertion | A0002／A0003截圖 |
| QA-078-05 | active review必須有request/work item才顯示review owner | positive/negative request matrix | review／orphan截圖 |
| QA-078-06 | normal finalizing與verified exception正確分流 | evidence＋action matrix | system／system-admin成對截圖 |
| QA-078-07 | DEV-073 applicable-action invariant無退化 | invariant assertions | locked reason可由focus/touch取得 |
| QA-078-08 | 同帳號同時具edit/review capability仍只有一個stage-based責任 | role matrix | supervisor帳號走查 |
| QA-078-09 | list/detail/root/child/preview對同entity責任一致 | API deep-equality＋DOM hooks | owner／relation drawer成對截圖 |
| QA-078-10 | stable filter與badge共用vocabulary；mine filter另行作用 | filter option／result matrix | filter操作證據 |
| QA-078-11 | stable與mine filter均在limit/cursor前由server執行 | query/cursor contract | 多頁結果抽查 |
| QA-078-12 | 新欄位additive；舊`viewerStatus`與舊query仍可解析 | API shape／compatibility tests | 無需主要UI曝光舊選項 |
| QA-078-13 | response仍為`private, no-store`；401／403／company scope不變 | header／permission tests | restricted actor抽查 |
| QA-078-14 | 實際姓名不擴大既有可見範圍 | cross-company／restricted negative tests | detail／popover抽查 |
| QA-078-15 | 一列／一物件最多一個主要badge，不新增「你可處理」第二badge | DOM count | 紅筆刪除檢查 |
| QA-078-16 | hover／focus／click／Escape可達且不只靠顏色 | accessibility/interaction | keyboard＋touch走查 |
| QA-078-17 | 三viewport無截斷、重疊、overflow或浮層超界 | browser metrics | 各viewport截圖 |
| QA-078-18 | visible／console／network unexpected error為0 | error sweep | rendered surface檢查 |

## 5. API and filter contract checks

1. 同一response item同時具有`humanStatus`、`responsibilityStatus`、`viewerActionability`、`availabilityScope`；相容期`viewerStatus`仍存在。
2. `responsibilityStatus`不能包含目前actor ID、`current_user/other_user`或viewer-relative label。
3. stable values `owner | review_owner | system | system_admin`只依`responsibilityStatus.category`篩選。
4. `view=mine`只收`viewerActionability.isMine=true`且通過DEV-073 responsibility action evidence的項目；正式圖面採exact reviewer，candidate bundle採現有RD主管role queue，不得把所有`canReview`使用者泛化到未授權domain。
5. 舊`needs_action | waiting | ready`不出現在新filter UI；API仍可安全解析，不回raw error或改寫為另一個stable responsibility。
6. invalid query/cursor沿用安全400；permission沿用401／403；projection failure不得回部分舊資料冒充成功。

## 6. UX and rendered-browser checks

- 主畫面只顯示固定責任badge；實際姓名、`你可處理`與disabled reason降層到popover/detail/action control。
- popover在待辦、blocked或exception時呈現目前狀況、處理責任、既有可見承辦人、是否自動完成與恢復方式；usable／terminal不增加固定教學句或逐列CTA。
- badge與filter使用相同詞彙；顏色有icon＋文字補足。
- viewport：1440×900、1024×768、390×844。每個viewport覆蓋list、drawer、status popover、filter、system exception與unknown。
- visible error gate：不得看到`.inline-error`、失敗`[role=alert]`、HTTP 4xx/5xx、`Not Found`、`Internal Server Error`、raw `/api/`或上一筆殘影。

## 7. FMEA and negative gates

| Failure mode | User impact | Priority | Required negative test |
|---|---|---|---|
| 只換label但仍由current actor決定 | 跨帳號截圖仍不一致 | P0 | 同fixture四actor payload＋DOM parity |
| capability反向決定責任角色 | 主管兼權限時狀態跳錯 | P0 | edit+review role matrix |
| active review無work item仍顯示審核待辦 | phantom task | P0 | orphan review fixture |
| normal finalizing誤交系統管理員 | 每次核准都像人工發布 | P1 | heartbeat delay without failure |
| failure無recovery action仍顯示待辦 | 無法處理的phantom task | P0 | failure/action absence pair |
| mine與stable status filter混用 | filter數量與文案失真 | P1 | filter-before-limit matrix |
| 姓名跨scope曝光 | 個資／當責資訊外洩 | P0 | company/restricted actor negative |
| 舊consumer被同輪破壞 | 現有route或deep link失效 | P1 | additive DTO＋legacy query contract |
| UI新增第二個「你可處理」badge | 重新形成多badge競爭 | P1 | DOM badge count／text inventory |

## 8. Evidence required and pass gate

必收證據：

- responsibility resolver與DEV-073 invariant matrix。
- API shape、list/detail parity、stable/mine filter ordering、legacy compatibility、cache及permission報告。
- RS-01～15的跨actor input/output對照；相同fixture需保留責任欄位deep-equality結果。
- A0002／A0003及active review、return、system、system-admin、unknown、usable、terminal的rendered截圖。
- 三viewport DOM／overflow／popover bounds、visible-error、console／network報告。
- source SHA或scoped content hash、runtime入口、provider safety proof與`productionConnected=false / productionWrites=false`。

通過：QA-078-01～18全部有證據，P0/P1=0，跨actor主要文案一致，DEV-073與permission/availability無退化。

未通過：任一主要surface仍用viewer-relative舊詞、同筆跨actor責任不同、無evidence待辦、filter在limit後執行、舊consumer被破壞、個資擴大或runtime-visible error。

未充分驗證：缺跨actor配對、真實rendered browser、三viewport、system exception、orphan review、filter-before-limit或compatibility evidence。

## 9. Stop and handoff

- 測試證明需要新schema、permission、assignment或approval/publication行為時，停止並回Dev PM；不得由QA改expected掩蓋。
- 出現平行多責任或無唯一system recovery owner時，列為產品契約blocker。
- QA只維護案例與判定；QC只驗證不修改產品。使用者實際畫面若與PASS矛盾，舊結果自動reopen。

## 10. RD execution package

### 10.1 Focused scripts and commands

RD新增：

- `scripts/qc-dev-078-responsibility-status-projection.mjs`：RS-01～15、resolver precedence、legacy filter、cross-actor deep-equality與新invariant。
- `scripts/qc-dev-078-responsibility-status-contract.mjs`：required DTO fields、consumer inventory、主要surface舊詞禁止、filter-before-limit、private/no-store與package command composition。
- `scripts/qc-dev-078-responsibility-status-browser.mjs`：隔離DB、free port、四actor、A0002／A0003、三viewport、popover／filter／drawer、console／network／overflow及cleanup evidence。
- `scripts/qc-dev-073-browser-runner.mjs`：read-only historical fixture preflight、isolated source copy、child browser execution與task-owned temp cleanup；不寫入主資料庫。

`package.json`新增`qc:dev-078:projection`、`qc:dev-078:contract`、`qc:dev-078:browser`、`qc:dev-078`。執行順序：

1. `npm run qc:dev-078:projection`
2. `npm run qc:dev-078:contract`
3. `npm run qc:dev-055:projection`
4. `npm run qc:dev-055:contract`
5. `npm run qc:dev-073:contract`
6. `npm run typecheck:app`
7. `npm run qc:dev-078:browser`
8. `npm run qc:dev-055:browser`
9. `npm run qc:dev-073:browser`
10. `npm run build:isolated`
11. `npm run qc:dev-078`作最終聚合；必須包含上述新舊回歸與build，fail-fast且非零exit。

### 10.2 Evidence root and cleanup

- focused browser輸出固定在`output/qa/dev-078-responsibility-status/<runId>/`，至少含manifest、fixture/actor matrix、API payload摘要、DOM assertions、screenshots、console/network events、source hash與runtime cleanup結果。
- browser只可複製既有SQLite到temp root並使用free port；不得寫production/staging資料。
- 結束時停止且只停止本script啟動的process tree，確認其temporary port釋放；未清理runtime不得交付PASS。

### 10.3 Implementation-to-QA gate

- Phase 1A只在projection／DEV-073 invariant PASS後交1B；Phase 1B需API additive/list-detail/filter/cache PASS；Phase 1C需consumer與舊主文案source gate PASS；Phase 1D才執行rendered cross-actor。
- 任一surface缺`responsibilityStatus`、fallback到`viewerStatus.label`、candidate role queue與正式圖面exact reviewer混淆、或system-admin缺failure/recovery evidence，均直接判P0／P1，不得以人工截圖說明降級接受。

## 11. Phase 2 six-state UI vocabulary validation — 2026-08-19

狀態：`QA Executed / Full Aggregate QC Passed / Evidence Collected / Production Release Gated`。

### 11.1 Required matrix

| ID | Data fixture | Expected UI name | Expected canonical description focus |
|---|---|---|---|
| `P2-01` | filter reset, `includeHistory=false` | `全部` | 顯示目前資料，歷史需另行開啟 |
| `P2-02` | `category=owner` | `編輯中` | 建立／補件／修正，由負責人處理 |
| `P2-03` | `category=review_owner` | `審核中` | 等待審核負責人審核 |
| `P2-04` | `category=system` | `審核中` | 系統自動發布，不需人工操作 |
| `P2-05` | `category=system_admin`＋verified recovery | `待確認` | 系統管理員確認並恢復 |
| `P2-06` | `category=unknown` | `待確認` | 責任或有效工作項無法確認 |
| `P2-07` | `category=usable`＋scope unknown/none | `待確認` | 需確認研發版或量產版範圍 |
| `P2-08` | `category=usable`＋scope rd | `研發版可使用` | 不可作為量產依據 |
| `P2-09` | `category=usable`＋scope production | `量產版可使用` | 可作為採購／製造／量產依據 |
| `P2-10` | `category=terminal`或客觀phase terminal | `humanStatus.label`精確歷史結果 | 不在visible status options；neutral/archive結果chip，由包含歷史控制 |

### 11.2 Contract and compatibility checks

1. visible filter options恰為`全部／編輯中／審核中／待確認／研發版可使用／量產版可使用`，順序、標點與字詞完全一致。
2. `editing/reviewing/needs_confirmation/rd_available/production_available`在server端先project、再filter、最後fill limit/cursor；`all`預設不含terminal。sync／async repository都須在SQL `LIMIT`前套用`includeHistory=false`的`Obsolete/Merged`排除，禁止route固定抓100筆後再篩選或造成underfill。
3. 舊`owner/review_owner/system/system_admin/availability_unknown/needs_confirmation/rd/production/history`依SPEC §19.4正規化；`needs_action`只在既有mine-view頁轉`view=mine+all`，其他頁為all；`waiting/ready/invalid→all`。canonical URL只使用`humanStatus`與`history=include|exclude`；不得保留使用者看不見的legacy predicate、空白select或額外badge。
4. source/DOM inventory禁止舊角色狀態與`研發可用／生產可用／可用範圍待確認`出現在主要badge、visible filter、popover title或drawer summary；歷史QC檔與audit內容排除在禁詞掃描外。
5. 相同fixture由RD owner、RD主管reviewer、非負責人、recovery actor查看時，名稱與canonical description deep-equal；actions與`viewerActionability`依既有證據差異化。
6. `system`不得出現人工CTA；`system_admin`只有verified failure＋applicable recovery action時可成為待辦；`unknown`與availability unknown不得誤授權。
7. `我的待辦`與`包含歷史`可分別、同時套用且不改寫工作狀態；五個filter host的初始載入、reload、deep link、canonical `replaceState`與back/forward保持一致。`numbering/search`與legacy parts頁須有「包含歷史」toggle並把`history`傳入list API。
8. projector exact contract：`editing=info/play`、`reviewing=info/clock`、`needs_confirmation=warning/alert`、兩種available=`success/check`、terminal result=`neutral/archive`；primary label、description、tone、icon跨actor deep-equal。
9. fail-closed matrix：null status不render；terminal precedence；null／invalid responsibility、usable+null/none/unknown availability、不合法system basis及缺failure/recovery/nextStep的system_admin都不得產生phantom task，應落到`待確認/unknown`或`待確認/availability`。

### 11.3 Rendered and regression gate

- drawing、part、relation root／child、preview、search、unified drawer與狀態filter都須覆蓋；至少四actor × 1440×900、1024×768、390×844。
- hover、keyboard focus、click/touch、Escape與viewport bounds全部通過；badge icon＋文字共同表意，無截斷、水平溢位、visible／console／network unexpected error。
- 重跑DEV-078 focused projection／contract／browser、DEV-055 projection／contract／browser、DEV-073 contract／browser、DEV-062 relation、DEV-053 UI／real-operation、entity-detail drawer、typecheck與isolated build；新aggregate任一步失敗即非PASS。
- Phase 2 PASS門檻：`P2-01～10`、compatibility 1～9及rendered matrix全部通過，P0/P1=0，task-owned runtime清理完成。Phase 1舊run不得作為Phase 2完成證據。

### 11.3.1 Phase 2 execution result — 2026-08-19

- `npm.cmd run qc:dev-078`完整聚合PASS：DEV-078 projection 42/42、contract 53/53；DEV-055 projection 71/71、contract 13/13、browser；DEV-073 contract與8-case browser；DEV-062 relation；DEV-053 UI 24/24與real-operation 15/15；PDM entity-detail drawer、typecheck與isolated build（124/124 static pages）均PASS。
- DEV-078 browser evidence：`output/qa/dev-078-responsibility-status/20260819041629-90ff3789/`；parts=1、relations=1、drawings=20、actors=4。DEV-073 evidence：`output/qa/dev-073-status-actionability/DEV073-20260819T041838Z-f6a83fac/`；DEV-053 real-operation evidence：`output/playwright/dev053-real-operation/DEV053-20260819-041911-local-isolated/`，15/15、productionConnected=false、productionWrites=false、cleanupStatus=removed。
- `npm.cmd run qc:doc-paths` 23/23、`npm.cmd run qc:dev-task-evidence-sync` 13/13、`npm.cmd run qc:dev-task-completion-audit` 8/8。P0/P1=0，Phase 2 evidence已收集，production release仍gated。

### 11.4 Exact implementation and evidence inventory

- 必改source 17檔：SPEC §19.5.2列出的5 shared、5 client hosts、5 server entrypoints及2 repository query builders。validation-only 4檔不得無理由產生diff。
- 必改test 12檔：DEV-078三支、DEV-055三支、DEV-073兩支、DEV-062 relation一支、DEV-053兩支、entity-detail drawer一支。
- 必改config 1檔：`package.json`只修改既有`qc:dev-078` command DAG，不新增／改名命令。聚合須以`&&`包含`qc:dev-078:projection`、`qc:dev-078:contract`、`qc:dev-055:projection`、`qc:dev-055:contract`、`qc:dev-073:contract`、`qc:dev-062:relation`、`qc:dev-053:ui`、`typecheck:app`、`qc:dev-078:browser`、`qc:dev-055:browser`、`qc:dev-073:browser`、`qc:dev-053:real-operation`、`qc:pdm-entity-detail-drawer`、`build:isolated`。
- static inventory gate：恰有5個visible filter掛載點；9個consumer檔／13個badge掛載點全部只能從shared presentation取得primary label；search page重複availability文字為0。
- legacy-query prevention gate：掃描active source／tests內`humanStatus=`、query parser與matcher的`owner/review_owner/system/system_admin/needs_action/waiting/ready/production/rd/availability_unknown/needs_confirmation/history`；每個命中都須在30檔required-edit inventory或4檔validation-only清冊中有理由。`scripts/qc-dev-062-relation-workbench.mjs`的pagination主案例改用canonical `editing`，另測`waiting→all`且無hidden viewer predicate。
- aggregate coverage gate：測試程式解析`package.json`並斷言`qc:dev-078`包含前述全部命令；僅在文件列出而未進aggregate視為P1。
- final evidence（2026-08-19）：`npm.cmd run qc:dev-078`完整聚合PASS；focused projection 42/42、contract 53/53與§11.3.1列出的parent／browser／build evidence均已收集。Phase 1舊run仍只作歷史基線，不取代Phase 2 evidence。
- slice gate：P2-A projection/query/static inventory → P2-B five server entries＋two repositories → P2-C UI/consumer/typecheck → P2-D rendered aggregate。任何檔案計數漂移、hidden legacy filter、aggregate command漏項、duplicate visible availability、P0/P1 finding或未清理runtime均阻擋handoff。

### 11.5 QA re-audit disposition

- 2026-08-19文件QA原發現4組P1：DEV-062舊query test漏列、aggregate command未涵蓋required regressions、legacy search/parts未定義history URL/API同步、repository未保證history scope位於SQL limit前；均已轉成精確檔案、介面、命令與可證偽gate。
- Phase 2執行後上述gate與rendered matrix均PASS，open P1=`0`；本QA計畫狀態更新為`QA Executed / Full Aggregate QC Passed`，production release仍受既有gate管控。
