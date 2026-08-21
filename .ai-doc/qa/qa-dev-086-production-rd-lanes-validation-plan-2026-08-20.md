# QA-DEV-086：三工作台量產／研發雙 lane 風險導向驗證計畫

Status: `QA Plan Executed / QA-QC PASS (Local Only) / Production Release Gated`
Date: 2026-08-20；CAPA amendment 2026-08-21
Owner: QA（計畫）／Independent QC（事實驗證）
Related DEV: `DEV-086` / `DEV-PDM-WORKBENCH-PRODUCTION-RD-LANES-001`
Related SPEC: `.ai-doc/specs/SPEC-PDM-WORKBENCH-PRODUCTION-RD-LANES-001-dual-latest-projection.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-WORKBENCH-PRODUCTION-RD-LANES-001-dual-lane-authority.md`
Related filter authority: `.ai-doc/specs/SPEC-PDM-WORKBENCH-MULTISELECT-FILTER-001-excel-style-filter-contract.md`

> **DEV-087 boundary**：本文件是activation前現行runtime的歷史回歸證據，不是新target驗收計畫。DEV-087新決策優先；單一RD aggregate／最多雙列等case不得阻擋舊架構拆除。新target只由`QA-087-001..120`驗收；可重用的production不遮蔽、exact artifact與security case列為回歸。

## 1. 目的、風險與證據邊界

本計畫驗證圖號、料號、圖料三個工作台在同一 canonical identity 下，能同時且正確顯示最多一列`量產最新版`與一列`研發最新版`。最高風險不是版面錯位，而是生產人員看不到仍有效的量產依據、誤開研發中檔案，或發布失敗後讀到半完成的新版本。

- Risk：`High / P0 / production-safety`。
- QA 只定義驗證策略、fixture、預期結果與證據要求；不得替 RD 宣稱實作完成。
- QC 必須由未撰寫受測功能的人員／agent，以真實 API、rendered UI、資料 readback 與 network evidence 獨立驗證。
- 本文件目前是重開後的驗證計畫，不把既有focused source/static PASS視為live runtime、完整QA或產品完成證據，也不含migration、release或部署授權。
- 精確runner、fixture builder、SQL assertion、query budget與evidence path已由第6節固定；但現行`qc:dev-086:browser`只有source string assertions，必須依CAPA修正後才能承擔真實browser gate。所有未具相應artifact的結果保持`Not Executed`。

## 2. In Scope / Out of Scope

### In Scope

- `/numbering/drawings`、`/parts`、`/numbering/search` 的 production／RD lane list projection。
- 圖號、料號、圖料根號搜尋與`版別`直接篩選。
- canonical group、stable row key、group pagination、cursor v2、URL restore、selection reconciliation。
- lane-specific detail、preview、download、action、permission、cache 與 projection token。
- Drawing revision package、Part manufacturing baseline、root relation／manufacturing baseline 的 authoritative selection。
- V1 量產 + V2 編輯／審核／退回／發布失敗／發布成功的狀態切換與並行讀取。
- feature flag off／on compatibility、四 viewport、鍵盤、screen-reader name 與 visible-error sweep。

### Out of Scope

- 顯示完整 revision／baseline history、建立 Part Revision、人工指定 production pointer。
- 變更既有 approval decision、master mutation、revision、baseline 或 release command authority。
- production／staging 資料操作、live migration、deploy、release、commit、PR。
- 以 mock DOM、靜態截圖或 client-only fixture 取代 server/API/DB truth。

## 3. Entry Criteria 與角色分離

進入 QA 執行前必須同時滿足：

1. `DEV-086` 已達 `RD Implementation Ready`，exact file／function／route／query／test inventory已封口；RD完成相應phase並提供developer evidence後，QA才執行該gate。
2. 三個 domain 的 lane classifier、group cursor、projection token、permission 與 release boundary 有 focused automated tests。
3. 測試資料位於可清理的隔離環境，company／actor／artifact ownership 可追溯。
4. feature flag 預設關閉；off path 有舊契約 baseline，on path 三工作台同時啟用。
5. QA 與 QC 不使用 production business data；任一清理失敗即停止交付宣告。
6. on-path測試開始前，`/api/numbering/state-flow/status`必須回讀production/RD lanes `requested=true / enabled=true`且兩個dependencies全滿足；否則不得把畫面列為DEV-086功能證據。
7. 雙lane fixture receipt必須證明production reference為Released/effective、RD reference為editing/review且non-terminal；若RD已Released／terminal，fixture直接FAIL並重建，不得從history補列。

角色責任：RD 產出 implementation 與 developer evidence；QA 依本計畫執行風險矩陣；Independent QC 重做關鍵 P0、UI 與資料 readback，不沿用 RD 的 PASS 判定。

## 4. Fixture Matrix

| Fixture | 初始事實 | 必須投影 | 禁止投影／禁止 fallback |
|---|---|---|---|
| D-01 | Drawing V1 major package `Released`，無 active change | V1 production 一列 | 不得虛構 RD 列 |
| D-02 | V1 `Released` + V2 editing | V1 production + V2 RD；V2 顯示目標量產版 V2 | V2 不得取代／下載為 production |
| D-03 | V1 `Released` + V2 review pending | V1 production + V2 RD/送審中 | reviewer state 不得把 V2 變量產 |
| D-04 | V1 `Released` + V2 needs info/correction | V1 production + V2 RD/退回修改 | 不得隱藏 V1 |
| D-05 | V1 `Released` + V2 release failed | V1 production + V2 RD/發布未完成 | 不得 partial switch 或 fallback |
| D-06 | V2 完整原子發布成功 | V2 production；若無 V3 active 則無 RD 列 | V1 不得仍標 production latest |
| D-07 | V2 `Released` + V3 active | V2 production + V3 RD | 不得顯示 V1 top-level history |
| D-08 | 同 drawing 有兩個 active branch／資料衝突 | V1 production + 單一 RD conflict projection | 不得用 updatedAt 猜 branch |
| D-09 | minor revision 已研發受控 | production 仍取最近 Released major；minor 只在 RD | minor 不得成 production |
| P-01 | Part 有 Released manufacturing baseline | Part production lane 指向 exact baseline | 不顯示 Part Revision |
| P-02 | P-01 + Draft baseline／active scoped change | production + RD 各一列 | Draft 不得覆蓋 Released baseline |
| P-03 | legacy Part 無 baseline、但有可證明 released basis | production 顯示 legacy reference kind | 不得偽造 baseline id |
| P-04 | Part 主製造圖不完整／baseline dependency invalid | production fail closed 或明確不可用；RD 呈現事實 | 不得選最高 updatedAt 組合 |
| P-05 | 新 candidate 尚無 formal Part | RD-only candidate group | 不得虛構 production master |
| R-01 | Root 有 Released root baseline | production lane 指向 frozen relation combination | 不得動態拼接最新 children |
| R-02 | R-01 + source-root active workspace | production + RD 各一列 | active overlay 不得蓋掉 production |
| R-03 | legacy root 無 baseline、依賴皆有可證明 released basis | production 顯示 legacy aggregate reference | 不得偽造 baseline id |
| R-04 | source-less candidate | RD-only candidate group | 不得合併到名稱相似 formal root |
| R-05 | relation ambiguous／依賴缺漏 | production 不可用或 fail closed；RD 顯示 blocker | 不得猜第一個 relation |

每組至少覆蓋：RD owner、Production viewer、Manager/Admin、可看列但無 lane detail 權限者、不同 company actor。cross-company 不得回 row、count、option、cursor side channel 或 artifact URL。

## 5. Failure Mode and Effects Analysis

| Failure mode | 影響 | 等級 | 預防／偵測 gate |
|---|---|---:|---|
| global latest 覆蓋 production latest | 生產看不到有效 V1 | P0 | D-02～D-05 API/UI/readback |
| RD artifact 被 production lane 開啟 | 未核准資料進入製造 | P0 | exact reference + signed projection token + negative download |
| release transaction partial switch | 清單、檔案、關係不同步 | P0 | concurrency／rollback／repeatable-read evidence |
| Part 被建立虛構 Revision | material identity 被破壞 | P0 | schema/API/UI negative assertion |
| group 跨頁拆開 | 量產與研發無法對照 | P1 | group cursor boundary matrix |
| lane filter 在 limit 後執行 | 漏列／錯頁／假空白 | P1 | server query/count/cursor assertion |
| permission 只在 client hide | 未授權資料外洩 | P0 | direct API、cross-company、cache evidence |
| legacy record 被 updatedAt 誤分類 | 假 production latest | P0 | legacy fixtures + reference kind assertion |
| 平行 branches 被靜默挑一筆 | RD 誤以為變更唯一 | P1 | conflict fixture + no-guess assertion |
| lane 只靠顏色區分 | 生產誤讀且不符無障礙 | P1 | text/icon/location/a11y evidence |

## 6. Phase Gates

| Gate | 驗證主題 | 可進下一階段條件 |
|---|---|---|
| R0 Activation/fixture | flag status readback、V1 production＋V1.1 non-terminal RD、正常UI/domain command、cleanup ownership | `requested=true / enabled=true`；fixture validity與附件hash receipt全綠 |
| 1A Contract | types、stable keys、group identity、lane query、cursor v2 encode/decode | contract tests 全綠；v1 reset 行為明確 |
| 1B Domain authority | Drawing／Part／Root classifier、legacy mapping、conflict projection | D/P/R focused matrix 全綠；無猜測選版 |
| 1C API/security | list/detail/preview/download、token、permission、cache、query bound | direct negative tests、cross-company 與 exact artifact 全綠 |
| 1D UI | 相鄰雙列、filter、selection、pagination、RWD、keyboard、a11y | 四 viewport 真實 rendered evidence 全綠 |
| 1E Release/concurrency | atomic publish、rollback、flag、off-path compatibility | P0 transition matrix、rollback 與 independent QC 全綠 |
| 1F Completion receipt | QA-086-01～38、evidence class、P0/P1、runtime與cleanup收斂 | 單一manifest無FAIL／BLOCKED／pending；independent QC已簽認 |

不得以 1A～1D 的局部 PASS 宣稱DEV完成或production ready；R0～1F全數完成後仍須走獨立 release gate。

### 6.1 Exact runners and fixture ownership

| Command | Script | QA scope |
|---|---|---|
| `npm run qc:dev-086:contract` | `scripts/qc-dev-086-contract.mjs` | QA-086-01～03、08～12、16、31；types/key/cursor/token/flag/no-schema-delta |
| `npm run qc:dev-086:repository` | `scripts/qc-dev-086-repository.mjs` | D-01～09、P-01～05、R-01～05；legacy/conflict/no-guess |
| `npm run qc:dev-086:api` | `scripts/qc-dev-086-api.mjs` | QA-086-09～22；list/detail/preview、status code、permission、no-store、no-fallback |
| `npm run qc:dev-086:query` | `scripts/qc-dev-086-query-budget.mjs` | QA-086-14、32；hard ceiling、1/20/50 invariance、read zero-write |
| `npm run qc:dev-086:transition` | `scripts/qc-dev-086-transition.mjs` | QA-086-23～28；success/rollback/audit failure/concurrent read/idempotency |
| `npm run qc:dev-086:classifier` | `scripts/qc-dev-086-classifier.mjs` | activation aggregates；`ambiguous/duplicate/unmapped/partial`必須全0 |
| `npm run qc:dev-086:browser` | `scripts/qc-dev-086-browser.mjs` | 目標：QA-086-13～15、17～23、29～31、33～37的真實route與rendered UI。現況只有7個source string／rowgroup assertion，重開RD必須改造或另拆source-contract runner；在產生screenshots、DOM/a11y與network ledger前不得標browser PASS。 |
| `npm run qc:dev-086:regression` | package aggregate | `qc:dev-085:selection`＋`:contract`、DEV-062 core/part/relation/compat、`qc:dev-065-workbench-preview-gallery`、DEV-067 contract/query/preview、`typecheck:app` |
| `npm run qc:dev-086` | package aggregate | 依上列順序全跑；任一FAIL／cleanup failure即非PASS |

`scripts/qc-dev-086-fixtures.mjs`是唯一fixture builder。它建立task-owned isolated SQLite與disposable PostgreSQL company／actors／D-P-R sources，以正常UI／repository／release command建立狀態，禁止直接改production DB、手改lifecycle或用UI測試內的任意fixture injection。每次run必須回`fixture-receipt.json`，列created／cleaned aggregate、production/RD exact references、RD terminal=false、操作方式、重用附件hash與port／process cleanup；清理失敗或RD已terminal即FAIL。

使用者可見的 A0002-like replay必須由UI完成`V1 Released → 建立V1.1 → 編輯或送審`，在雙列 screenshot、DOM與exact reference readback完成前停止；此案例不得繼續核准／發布V1.1，否則只能轉作release-success案例，不能冒充雙lane案例。

### 6.2 Numeric query and write budgets

| Surface | Maximum | Required invariance |
|---|---:|---|
| Drawing list，含lane preview summary | 18 | 1＝20＝50 groups |
| Part list，含lane preview summary | 18 | 1＝20＝50 groups |
| Relation list | 22 | 1＝20＝50 groups |
| Drawing lane detail | 18 | 1＝20 linked Parts |
| Part lane detail | 18 | 1＝20 linked Drawings |
| Relation lane detail | 26 | 1＝20 relation nodes |
| owner baseline bundle resolver | 2 | 1＝20＝50 owners |

list／detail／classifier以spy驗證`execute=0`且沒有business transaction write。只有transition runner可寫isolated fixture DB。不得以調高上限、減少fixture cardinality或關閉preview掩蓋N+1。

## 7. Acceptance Test Matrix

### A. Identity、authority 與 row projection

| ID | 驗證 | 預期 |
|---|---|---|
| QA-086-01 | 同 canonical identity 同時有 production/RD facts | 恰為同一 `groupKey` 下最多兩列，production 在上、RD 在下 |
| QA-086-02 | 只有 production fact | 只顯示 production，不補空 RD 列 |
| QA-086-03 | 只有 active candidate fact | 只顯示 RD，不虛構 production |
| QA-086-04 | Drawing D-01～D-09 | 依 Released major／active change authority 選列，minor 不進 production |
| QA-086-05 | Part P-01～P-05 | Released baseline 優先，legacy kind 誠實，DOM/API/schema 無 Part Revision |
| QA-086-06 | Root R-01～R-05 | Released frozen combination 優先；active source-root change 只進 RD |
| QA-086-07 | 多 active branches | 回單一 conflict RD row 與 blocker，不以時間猜測 |
| QA-086-08 | row key 穩定性 | display code/name/status 改變不改 lane row key；lane 互不共用 key |

### B. 搜尋、篩選、游標與清單一致性

| ID | 驗證 | 預期 |
|---|---|---|
| QA-086-09 | 省略 lane 或以 repeated key 選滿 production/rd | 回 production + RD，並正規化為省略 key；同欄 OR、跨欄與搜尋 AND |
| QA-086-10 | lane=production / lane=rd | 只回指定 lane；groupCount／row count 語意正確 |
| QA-086-11 | `lane=__none__` explicit none | 零筆且不被解讀為 all；不得另造 `none` wire value |
| QA-086-12 | invalid lane/value | HTTP 400、無 partial rows、UI 顯示可恢復錯誤 |
| QA-086-13 | 圖號／料號／根號 exact、partial、case/space normalization | 三工作台皆在 server filter-before-limit 後正確命中 |
| QA-086-14 | groupLimit 邊界 | 同一 group 的兩列不跨頁；一頁 row 數最多為 `2 × groupLimit` |
| QA-086-15 | next/back/URL restore/hard reload | group、filter、selection 可解釋且不重複／漏列 |
| QA-086-16 | v1 cursor 進入 v2 endpoint | 安全 reset 一次，不誤解碼、不跨 actor/company/filter 重用 |

### C. Exact lane handoff 與安全

| ID | 驗證 | 預期 |
|---|---|---|
| QA-086-17 | 從 production row 開 detail/preview/download | 只回 production reference 與 exact artifact |
| QA-086-18 | 從 RD row 開 detail/preview/download | 只回 RD reference 與 exact artifact |
| QA-086-19 | stale／tampered projection token | 409/404/403 等 fail-closed 結果；不得 fallback 另一 lane |
| QA-086-20 | 有 list summary、無 detail/download 權限 actor | summary 依契約可見；受限內容不進 payload/URL/cache |
| QA-086-21 | cross-company actor/cursor/token | 零資料外洩；不得由 count、timing、option 洩漏 identity |
| QA-086-22 | cache headers 與 browser Back | 私有資料 `no-store`；不得顯示前一 actor/company lane |

### D. Release、failure 與 concurrency

| ID | 驗證 | 預期 |
|---|---|---|
| QA-086-23 | V1 production + V2 editing/review/correction | V1 始終 production；V2 始終 RD 並顯示事實狀態 |
| QA-086-24 | V2 release prerequisites 不完整 | release 被拒，V1 不動，V2 顯示 blocker |
| QA-086-25 | V2 release transaction 中途失敗／rollback | 沒有partial production reference／artifact／relation switch |
| QA-086-26 | V2 release 完整成功 | 下一個完整 read 才原子呈現 V2 production；舊 V1 退出 top-level |
| QA-086-27 | release 與 list/detail 並行讀取 | 單一 response/read snapshot 不混用 V1/V2 reference |
| QA-086-28 | 重送同一 release/idempotency | 不產生兩個 production latest 或重複 lane |

### E. UI、相容與非功能

| ID | 驗證 | 預期 |
|---|---|---|
| QA-086-29 | 1440×900、1024×768、768×1024、390×844 | 無裁切、重疊、水平 overflow；mobile 同 group 仍相鄰堆疊 |
| QA-086-30 | keyboard、focus、screen reader、forced colors | lane 由文字＋icon／位置／rowgroup 表達，不只靠顏色 |
| QA-086-31 | feature flag off/on/rollback | off 完全沿用舊 read path；on 三工作台同時採新契約；rollback 無資料轉換依賴 |
| QA-086-32 | query/read-only/performance | list/detail無business write；1/20/50 groups符合第6.2節固定budget且count不成長 |

### F. CAPA re-entry 與完成治理

| ID | 驗證 | 預期 |
|---|---|---|
| QA-086-33 | on-path activation preflight | status API回`requested=true / enabled=true`且dependencies全滿足；否則case FAIL/BLOCKED，不操作功能畫面 |
| QA-086-34 | fixture validity與negative control | 正例為V1 production＋V1.1 non-terminal RD；把V1.1發布後，validator明確拒絕其作為雙lane fixture |
| QA-086-35 | A0002-like UI lifecycle replay | 正常UI完成V1 Released→建立V1.1→editing/review後，清單同群組固定顯示V1量產列與V1.1研發列；截圖前不發布V1.1 |
| QA-086-36 | row→detail／preview／download semantic parity | 兩列的lane label、主要狀態、exact reference與artifact一致；production actor可開V1，沒有跨lane fallback |
| QA-086-37 | three-workbench direct filter replay | 圖號、料號、圖料根號皆可直接篩全部／量產／研發；雙列清楚區分，filter-before-group-pagination不漏列 |
| QA-086-38 | completion receipt negative／positive | 缺flag、valid fixture、rendered artifacts、runtime query、transition、independent QC或cleanup任一項時不得complete；全部具備才允許狀態提升 |

## 8. UI / Visible-error Hard Gate

UI PASS 必須由真實 route、server response 與 rendered DOM 共同成立。每個 viewport 至少保存：

- 完整頁 screenshot、雙列 rowgroup close-up、filter open/selected/empty/error state。
- DOM/accessibility snapshot：lane label、row role/group relationship、accessible name、focus order。
- network ledger：request URL、normalized query、status、response group/row keys、detail/preview/download exact reference。
- console、page error、unhandled rejection 與 unexpected dialog 清單。

以下任一事件立即 FAIL／reopen，不得以「功能大致可用」忽略：

- visible raw error、unexpected inline alert／role=alert、HTTP 4xx/5xx、console error、hydration error。
- 預期 fixture 回空、group 被拆頁、lane 標示缺失、production/RD artifact 對不上。
- 只用顏色區分、鍵盤無法進出 filter、mobile 把兩 lane 分散到不同群組。
- 以 mock、直接 DB/API business write、手改狀態或 fixture injection 代替 UI journey。
- on-path status回讀不是`requested=true / enabled=true`，或用flag off畫面判定DEV-086功能結果。
- 雙lane fixture的RD reference已Released／terminal、production reference不可證明，或以history revision冒充top-level production lane。
- runner只檢查source字串／mock DOM／靜態截圖，卻輸出`browser PASS`。
- 同一列在清單被標為RD、明細被標為production，或任一preview／download開到另一lane reference。

## 9. Evidence Manifest Contract

每次 QA/QC run 的 manifest 至少包含：

- scoped source revision、dirty-boundary hash、feature flag、provider、base URL、開始／結束時間。
- status API完整production/RD lanes readback，至少含`requested`、`enabled`、dependencies與phase；on/off evidence分開。
- fixture IDs、company、actor role、建立與清理結果；敏感值只保留 redacted identifier/hash。
- fixture validity：production/RD exact references、各自lifecycle、`rdTerminal=false`、正常UI/domain command ledger與重用附件content hash。
- test case ID、expected、actual、PASS/FAIL/BLOCKED、artifact path、network/DB readback correlation。
- API payload schema snapshot、group／row key、reference kind/id/revision、projection token hash，不保存 token 原文。
- release transition 前後的 authoritative readback；任何 DB 讀取只做驗證，不得修復資料。

證據root固定`output/qa/dev-086/<run-id>/`，至少含`manifest.json`、`fixture-receipt.json`、`query-budget.json`、`transition-readback.json`、`network-ledger.json`、`console.json`、`screenshots/`與`accessibility/`。不得把其他DEV的browser screenshot、舊cursor test或released-baseline test挪作DEV-086完成證據。

## 10. PASS、BLOCKED 與停止條件

- `QA PASS`：QA-086-01～38 全部 PASS，P0/P1 open=0，fixture 全清理，visible/network/console error=0。
- `Independent QC PASS`：至少重做 QA-086-04～07、14、17～38，並取得獨立 manifest。
- `BLOCKED` 不算 PASS；若阻擋來自缺 fixture／provider／權限／release evidence，維持未完成。
- 發現需要人工 production pointer、新 Part Revision、新 domain data owner、cross-company leakage、不可原子發布、無法唯一判定 legacy production basis、query budget 無法達成或需 production data 才能驗證時，立即停止並回 Dev PM／ADR／release gate。
- 即使本計畫未來全數通過，也不自動授權 migration、staging、production activation、deploy 或 release。

## 11. Current Result

`QA-QC PASS (Local Only / Production Release Gated)`。重開後以隔離 fixture 與 on-path flags 執行 `npm.cmd run qc:dev-086`：contract 5/5、repository 4/4、api 4/4、query-budget 6/6、transition 3/3、classifier 2/2，真實 browser 76/76 PASS。browser manifest `output/qa/dev-086/dev-086-2026-08-21T00-59-40-660Z/manifest.json` 保存三 route（圖號／料號／圖料根號）× desktop/tablet/mobile、版別篩選 URL、rowgroup、a11y、screenshot、network ledger、console/page error 與 cleanup 結果；圖號 A0002-M01 明確回讀`量產最新版／版次 1`與`研發最新版／版次 1.1`。`npm.cmd run typecheck:app`亦 PASS。此結果完成本機 QA/QC 與 CAPA 驗證；production/staging、deploy、merge、PR、release 仍由既有 gate 控制。

CAPA authority：`.ai-doc/qc/qc-dev-086-dual-lane-completion-capa-2026-08-21.md`。
