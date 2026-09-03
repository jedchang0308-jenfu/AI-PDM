# QA Plan：DEV-085 三工作台 Excel 式複選篩選器

日期：2026-08-20  
狀態：`Historical / Superseded by DEV-087 and DEV-090 / Shared Mechanics Retained / No Separate Release Target`
Related DEV：`DEV-085`  
權威規格：`.ai-doc/specs/SPEC-PDM-WORKBENCH-MULTISELECT-FILTER-001-excel-style-filter-contract.md`

> **DEV-087 boundary**：保留popover／複選／URL mechanics回歸；舊狀態選項、query key與semantic filter case降為activation前歷史證據。DEV-087新`layer＋handling`與410 retired-query行為優先，由QA-087驗收；不得要求保留舊filter compatibility。

> **Current disposition (2026-09-03)**：DEV-087／DEV-090 已將三工作臺與 Relation current runtime 收斂到 canonical authority。本計畫的舊 domain adapter、舊 query keys、舊 route 與其獨立分母不再是 current QA target；shared multi-select、repeatable URL、cursor reset、RWD／keyboard mechanics 由 DEV-087 current QA 承接。若舊 `qc:dev-085:*` runner 引用已退役的 `drawing-workbench`、`part-workbench` 或 `relation-workbench`，其結果只能記錄為 superseded，不得復活舊 source 或改寫成 current PASS。

## 1. 驗證目的與證據邊界

驗證圖料、圖號、料號三工作台的12個頂端下拉欄位已改為同一 Excel 式複選契約，而且 UI 勾選、URL、API normalization、repository filter與signed cursor是同一集合語意。

本計畫只驗證本機／disposable資料與真實rendered browser。QA負責案例與判定；RD可新增測試，不能用自述宣告通過；QC依本計畫執行且預設不修改產品碼。Local PASS不代表production release ready。

### 1.1 本輪執行紀錄（2026-08-20）

- `npm.cmd run qc:dev-085:selection`：9/9 PASS；最新證據 `output/qa/dev-085-workbench-multiselect-filter/selection-20260820102202-local/selection-results.json`。
- `npm.cmd run qc:dev-085:query`：11/11 PASS；108 formal identities + 1 candidate 的 disposable SQLite fixture，涵蓋 OR/AND、none、candidate/formal、filter-before-limit、forward/back cursor、cursor invalidation、query budget、zero-write、company scope；最新證據 `output/qa/dev-085-workbench-multiselect-filter/query-20260820102306-local/query-results.json`。
- `npm.cmd run qc:dev-085:contract`：6/6 PASS；最新證據 `output/qa/dev-085-workbench-multiselect-filter/contract-20260820102306-local/contract-results.json`；確認三 route 共用複選元件、12 個 DEV-085 controls、DEV-086 lane extension、history boolean、search input 與 shared sentinel/type。
- focused regressions：DEV-066 12/12、DEV-062 core/Part/Relation PASS、DEV-053 UI 24/24、DEV-078 projection 42/42 + contract 53/53、entity drawer 42/42；affected-file ESLint、`npm.cmd run typecheck:app`、`npm.cmd run build:isolated`、`git diff --check` scoped product files PASS。
- 真實 rendered browser 已完成 3 route × 4 viewport = 12/12 PASS；required labels、無水平 overflow、keyboard Enter/Escape、mixed draft、取消、repeated URL、option search、explicit `__none__`、全選恢復、390×844 safe bounds 均 PASS，visible alert／console error／4xx-5xx 均為 0。證據 `output/qa/dev-085-workbench-multiselect-filter/browser-202608201025-local/browser-results.json`；截圖為 `output/playwright/dev085-{drawing,part,relation}-{desktop,tablet-landscape,tablet-portrait,mobile}.png`。
- 歷史執行未宣告完整 PASS：MSF-016、MSF-018～020、MSF-034～037、MSF-044 的獨立案例與 R06／independent QC manifest 未逐項封口；本文件不再要求補跑，因 current contract 已由 DEV-087／DEV-090 取代。

## 2. Scope、環境與資料需求

### 2.1 Routes

- `/numbering/drawings`
- `/parts`
- `/numbering/search`

### 2.2 In-scope filters

| Route | Fields |
|---|---|
| 圖號 | 工作狀態、系列代號、圖面用途、資料狀態 |
| 料號 | 工作狀態、系列代號、類型、資料狀態 |
| 圖料 | 工作狀態、系列代號、類型、資料狀態 |

### 2.3 Required fixture

Disposable fixture至少包含：

- 101+可排序identity，足以跨兩頁驗證filter-before-limit與before/after cursor。
- 2個以上series、2個以上static type/status值，以及同欄可同時命中的rows。
- candidate與formal各至少2筆；active、reviewing、needs confirmation、RD available、production available與history-only代表資料。
- formal master status含Active、PendingReview、Released、Obsolete；Part item kind與Drawing purpose各至少2值。
- 一個合法無series／缺可選投影的row，用來證明all不靜默漏列；recordStatus some仍依既有契約排除candidate。
- 一個空公司或可控制的empty-options fixture，驗證disabled全選與安靜empty state。

資料只可由disposable seed／既有fixture建立；不得修改production/staging或以direct DB repair製造PASS。

### 2.4 Viewports

- 1440×900
- 1024×768
- 768×1024
- 390×844

## 3. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／建議測試 |
|---|---|---|---|---|---|
| 全部取消被解讀為全部 | 空陣列語意重用 | 使用者以為零筆，系統卻暴露全部資料 | none wire/service/browser case | P0 | explicit mode + `__none__`，零筆 hard gate |
| checkbox已改但URL/API仍單值 | 只換UI component | 清單結果、reload與畫面勾選不一致 | URL/API/readback matrix | P0 | 端到端 repeated query assertion |
| 先limit再filter | client filter或SQL後projection未續掃 | 假空頁、遺漏、分頁錯亂 | 101+ fixture、limit=1 | P0 | scan至limit+1或source exhausted |
| cursor未含canonical集合 | hash仍用scalar或選取順序 | Back/Forward重複、錯頁或400亂跳 | order-invariant/hash mismatch cases | P0 | canonical arrays進filter hash |
| all漏candidate/formal/無值資料 | enum展開或join改變 | 預設清單比改版前少 | pre/post all deep-equal | P0 | all不加predicate，candidate authority不變 |
| 取消仍發request或寫URL | draft直接綁controller state | 清單閃動、操作不可逆 | network/history count | P1 | local draft，only apply commits |
| popover被裁切或scroll owner不明 | toolbar overflow、absolute定位 | 手機／平板無法完成選取 | 四viewport＋scroll screenshot | P1 | body portal/fixed position、內部單一scroll |
| keyboard／AT無法辨識mixed或返回焦點 | 非原生checkbox、缺ARIA | 鍵盤與輔助科技不可用 | DOM/a11y tree、keyboard walk | P1 | native checkbox、mixed、dialog group、focus restore |
| invalid URL變成全查或crash | parser fail-open／component throw | 錯誤資料範圍或頁面不可用 | malformed direct API + browser deep link | P0 | API 400；browser正規化none且可恢復 |
| option search改動draft範圍 | 將visible subset當all | 使用者不知部分選項被排除 | series search + select-all case | P1 | search只影響呈現；全選永遠全actual options |
| visible error被測試／build掩蓋 | 只看非UI evidence | 使用者仍看到4xx/5xx或空白 | visible error/data sanity sweep | P0 | 任一非預期alert／4xx／5xx立即FAIL |

## 4. Test Matrix

### 4.1 Selection、wire與normalization

| ID | Case | Pass criteria | Evidence |
|---|---|---|---|
| MSF-001 | key missing | parse=`all`；serialize省略key | `qc:dev-085:selection` |
| MSF-002 | repeated valid values | 去重、static authority order／dynamic code-unit order；serialize repeated keys | 同上 |
| MSF-003 | none token | 單一`__none__`=parse none；serialize完全相同 | 同上 |
| MSF-004 | legacy scalar | 單一舊值=parse some；`all`／empty=parse all並canonical omission | 同上 |
| MSF-005 | malformed | sentinel mixed／duplicate、unknown static、>50、控制字元、overlength皆invalid | 同上 |
| MSF-006 | hash stability | 同集合不同順序同hash；all、none、不同set不同hash | selection/core runner |
| MSF-007 | client invalid deep link | browser不crash、不查全部；field=`未選取`且URL=`__none__` | browser trace |
| MSF-008 | direct API invalid | HTTP400、code=`workbench_invalid_filter`、無row query | API/query evidence |

### 4.2 Popover interaction

| ID | Case | Steps | Pass criteria |
|---|---|---|---|
| MSF-009 | default all | 新開route，逐一開12欄 | actual options全checked；全選checked；summary=`全部` |
| MSF-010 | partial | 取消一值 | 全選indeterminate；結果尚未request；summary未變 |
| MSF-011 | apply | partial後按`確定` | exactly one URL replace、one list request；summary=`第一值 +N`；page=1/cursor清除 |
| MSF-012 | none | 取消全選後確定 | summary=`未選取`；URL sentinel；rows=0、cursors=null，不呈現load-failed |
| MSF-013 | select all recovery | none開啟、點全選、確定 | summary=`全部`、key省略、rows恢復 |
| MSF-014 | cancel button | 改draft後按`取消` | applied、URL、rows、network count不變；focus回trigger |
| MSF-015 | Escape | 改draft後Escape | 同MSF-014，screen reader可辨識關閉 |
| MSF-016 | outside pointer/focus | 改draft後點／Tab到外部控制 | draft捨棄，焦點留在新target，不被trigger搶回 |
| MSF-017 | option search | series搜尋存在／不存在值 | 只改可見options、零list request；全選仍代表完整actual options |
| MSF-018 | summary order | 依相反順序勾3值 | summary與URL均依canonical order，不依點擊順序 |
| MSF-019 | one popover | 由filter A直接開filter B | A取消、B開啟；沒有兩個可互動dialog |
| MSF-020 | empty options | 開空fixture欄位 | summary=`全部`；全選disabled；顯示`目前沒有可用選項`；無crash |

### 4.3 Server boolean、data與cursor

| ID | Case | Pass criteria | Evidence |
|---|---|---|---|
| MSF-021 | same-field OR | 每domain各選2值，結果=兩個單值結果聯集（依rowKey去重） | disposable service runner |
| MSF-022 | cross-field AND | series + status/type，結果只含同時符合rows | 同上 |
| MSF-023 | all parity | 三domain全選結果與改版前不設限fixture deep-equal | 同上 |
| MSF-024 | candidate/formal authority | all保留有權限candidate+formal；recordStatus some只含formal；無權限actor看不到candidate | 同上 |
| MSF-025 | Drawing purpose/series | M+R與兩series的candidate/formal predicate正確 | 同上 |
| MSF-026 | Part kind/series | 多itemKind與series predicate正確 | 同上 |
| MSF-027 | Relation entity type | part_root單選、part/drawing OR及candidate/formal EXISTS遵守SPEC | 同上 |
| MSF-028 | projected work status OR | limit=1且前方多筆不符合時仍找到後方matching row | 同上 |
| MSF-029 | 101+ forward/backward | 全頁遍歷rowKey無重複、無遺漏；previous恢復前頁canonical order | query manifest |
| MSF-030 | cursor invalidation | apply不同set後舊cursor HTTP400；client只回第一頁一次 | API/browser network |
| MSF-031 | same set reorder | 反向勾選同set不造成cursor/hash改變 | runner |
| MSF-032 | query count | 1值→多值query count不增加；Part<=15、Relation<=18、Drawing baseline+0 | counting client output |
| MSF-033 | company/actor scope | cross-company/actor cursor與資料仍fail closed；無option leakage | service runner |

### 4.4 URL、history與selection

| ID | Case | Pass criteria |
|---|---|---|
| MSF-034 | hard reload | repeated selection、none與summary精確恢復，沒有先查all的flash/request |
| MSF-035 | Back/Forward | filter set、page/cursor、detail與selection依location恢復；不觸發mutation |
| MSF-036 | selected detail reconcile | filter後row仍存在則detail保留；不存在則drawer安全關閉、URL detail移除 |
| MSF-037 | search/history preservation | confirmed multi-select不改文字query、view、history、sort、layout；clear-to-all只移除該key |

### 4.5 Accessibility、RWD與visible-error hard gate

| ID | Case | Pass criteria |
|---|---|---|
| MSF-038 | keyboard | trigger Enter/Space、checkbox Space、Tab順序、Escape與focus return全通過 |
| MSF-039 | semantics | trigger dialog relation、group label、checkbox name/state與mixed可由accessibility tree辨識；顏色非唯一訊號 |
| MSF-040 | 1440×900 | toolbar維持既有單列優先、popover完整、result主視覺不被遮蔽 |
| MSF-041 | 1024×768 | grid可換列，popover向上／下定位正確、無水平overflow |
| MSF-042 | 768×1024 | tablet portrait所有trigger、popover footer與history/mode可操作 |
| MSF-043 | 390×844 | 單欄、popover左右>=12px、內部單一scroll、按鈕／文字不裁切 |
| MSF-044 | Surface Audit | 沒有永久chips、第二toolbar、教學卡、裝飾性card-in-card；popover是必要互動surface |
| MSF-045 | visible error sweep | 三route hard reload與所有case沒有非預期`[role=alert]`、inline error、Not Found、API文字、console error或4xx/5xx |
| MSF-046 | data sanity | 非empty fixture每route有預期source counts；unexpected all-zero／empty立即FAIL |

## 5. Regression Matrix

| ID | Regression | Required result |
|---|---|---|
| MSF-R01 | DEV-066 toolbar/footer/pagination | `qc:dev-066-workbench-topbar` PASS，三route位置與mode不漂移 |
| MSF-R02 | DEV-062 shared core/Part/Relation | core、part、relation focused runners PASS |
| MSF-R03 | DEV-053 Drawing workbench UI/read model | updated focused runner PASS；Drawing status badge/detail不受filter component替換影響 |
| MSF-R04 | DEV-078 six-state projection | projection/contract PASS；五個filterable status詞彙不變 |
| MSF-R05 | entity detail | focused drawer contract PASS；filter後selection/detail reconcile不回歸 |
| MSF-R06 | preview/layout | Drawing/Part list-preview與Relation tree-matrix切換不改query set或新增request |
| MSF-R07 | build quality | `typecheck:app`、affected ESLint、`build:isolated`、`git diff --check` PASS |

## 6. Planned QC Commands

RD完成後，QC依序執行：

```text
npm.cmd run qc:dev-085:selection
npm.cmd run qc:dev-085:query
npm.cmd run qc:dev-085:contract
npm.cmd run qc:dev-062:core
npm.cmd run qc:dev-062:part
npm.cmd run qc:dev-062:relation
npm.cmd run qc:dev-066-workbench-topbar
npm.cmd run qc:dev-078:projection
npm.cmd run qc:dev-053:ui
npm.cmd run qc:pdm-entity-detail-drawer
npm.cmd run typecheck:app
npm.cmd run build:isolated
npx.cmd --yes --package @playwright/cli playwright-cli -s=default run-code --filename scripts/qc-dev-085-browser-code.mjs
```

Aggregate `npm.cmd run qc:dev-085`可包裝上述DEV-085與必要focused regressions，但manifest必須保留每個child command、exit code與log path；不得用aggregate摘要掩蓋child FAIL。Browser case 使用上列 Playwright CLI，需先安全重用或依 lifecycle 規則建立 matching runtime。

Browser runner使用固定本機入口 `npm.cmd run dev:local`或安全重用已存在的matching runtime。若建立temporary runtime，必須記錄project、purpose、port、process tree與cleanup condition，結束時只停止task-owned process tree並確認port釋放。

## 7. Evidence Package

Root：`output/qa/dev-085-workbench-multiselect-filter/<run-id>/`

至少包含：

- `manifest.json`：HEAD、branch、scoped dirty file/content hashes、環境、feature flags、DB provider、commands與判定。
- `selection-results.json`、`query-results.json`、`contract-results.json`。
- `browser-results.json`：每case route、viewport、steps、expected/actual、console/network/visible-error/data counts。
- 三route × 四viewport的closed/open/partial/none代表截圖；至少包含一張series option search與一張mobile upward-position popover。
- 101+ traversal rowKey ledger、cursor/filter hash pass/fail摘要與query counts；不得保存secret或raw HMAC。
- failure時保存第一個有效錯誤、request URL（secret redacted）、response status/body摘要、screenshot、console與server log slice。

## 8. Pass、Fail、Blocked 判定

- `PASS`：MSF-001～046與R01～R07全部有適用證據、P0/P1=0，且真實rendered UI／viewport／interaction evidence齊全。
- `FAIL`：任一零選取查全部、假空頁、重複／遺漏、cursor scope錯誤、visible error、資料異常全零、popover不可操作、RWD overflow或required regression失敗。
- `未充分驗證`：static/unit/typecheck/build通過但缺browser、screenshot、viewport、interaction、network或data sanity evidence。
- `BLOCKED`：無法啟動／登入／取得fixture或browser；必須記錄阻塞點，不得以其他層 evidence替代。

## 9. Failure Return 與完成條件

QC發現FAIL只回報事實與證據，退回RD修正；QA不得因RD自述更新DEV完成狀態。修正後重跑直接失敗case、同層matrix與所有受影響regressions。

只有全部PASS後，才可把`DEV-085`由`◇ 驗證中`改為`✓ 完成`。Production、deploy、merge、PR、release仍需獨立gate；本QA Plan Ready本身不計為產品功能完成。
