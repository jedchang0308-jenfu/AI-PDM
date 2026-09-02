# DEV-087 三工作臺全生命週期 AI UI-only 操作驗證計畫
Status: `Trusted-Solo UI QA-QC Complete (2026-08-31 post-FFF source revalidation) / FFF Applicability Corrected / Production Release Gated`
<!-- QC-JOURNEY-SUPPLEMENT-2026-08-22T10:05 -->

## 0.0 2026-08-28 fresh UI closure

更新後的current UI roster已由fresh task-owned browser runtimes完成：UI-only child的34個直接生命週期案例與C01～C11全部PASS，Part附件P11～P13、I01～I14及功能增補案例再由同一parent browser capability補齊，最終DEV-087 aggregate為94/94產品案例與`QG-087-UI` PASS。八個UI family在1440×900、1024×768、390×844、320×800完成overflow、keyboard／focus、可見錯誤與readback驗證；headed evidence覆蓋1440×900與390×844，actual screen reader依使用者決策維持選配。

首版／進版FFF的D01～D06與QA-087-187..192均包含fresh owner／reviewer證據；首版只顯示中性「關聯料號」且zero FFF，進版才顯示判定範圍與三軸人工判定。exact run pointer、source fingerprint、console／network、attempt ledger與cleanup receipt由DEV-087 completion receipt統一記錄。production release仍另受gate管制，`part_root`排除範圍未改變。

### 0.0A 2026-08-31 post-FFF source-boundary revalidation closure

The 2026-08-28 UI closure remains historical and immutable. Fresh parent aggregate `DEV087-aggregate-2026-08-30T15-29-47-476Z` passed after source-boundary revalidation. Its capability-browser child `DEV087-product-browser-2026-08-30T15-35-25-538Z` passed the current UI roster with 87 cases and 442 evidence files; `QG-087-UI` passed 32/32 family-viewports, including headed `1440x900` and `390x844`, with no console/network failure and task-owned cleanup complete. The earlier `DEV087-aggregate-2026-08-30T14-15-03-301Z` source-change rejection remains historical fail-closed evidence and was not relabeled.

## 0. 2026-08-25 功能完整性 CAPA 重開

本節取代本文所有`DEV-087 current effective UI scope已完成`或`已證實產品缺口0`的current結論；原51-case與C01～C11結果保留為`Historical Regression Baseline`，不重寫其actual，也不得再單獨支持current completion。母計畫新增`QA-087-187..218`共32案，UI-only子契約負責其中所有rendered UI journey、角色／viewport／a11y／visible error及UI／API／DB／file readback；QA-087-202／206的直接API fail-closed probe由母計畫在isolated fixture執行，本子契約不得用API或DB製造合法業務結果。

重開UI範圍固定為8族：Drawing變更影響／FFF、任務通知中心、Drawing／Part正式作廢、Part四項變體屬性、Drawing歷史exact artifact、Drawing工作檔案管理、矩陣identity導覽、Drawing／Part探索／排序／雙向換頁。`part_root`搜尋明細與動作、root狀態／阻擋原因、root整體新增或作廢影響不在本輪；既有root案例不因本次重開改判，新增證據也不得把root排除範圍記為PASS。

current UI completion要求：新增32案中的UI責任、current 51-case固定名冊`D01..D24 + P01..P13 + I01..I14`與C01～C11取得fresh evidence，並通過`QG-087-UI`。Blocked=0、Not Run=0、P0/P1=0、direct business API/DB writes=0。任一入口不可發現、primary action缺失、畫面只顯示文字而無exact artifact、或UI/API/DB/file/authority不一致，即判產品FAIL。同一開發者可執行UI QC；Independent AT receipt與DEV-097 anti-cheat gate不再是current要求。

### 0.1A 2026-08-27 首版／進版FFF適用性 Human Confirmed 矯正

- UI不得以顯示版號判定FFF。每次owner／review load都以server `changeImpactRequired`為唯一可見狀態來源；`predecessor_revision_id=NULL`的首版為false，非`NULL`進版為true。
- 首版0.1保留「版次與檔案 → 關聯料號 → 智慧辨識」資訊順序；「關聯料號」只用中性文字／relation icon，不使用綠色check、成功色或「受影響」用語。DOM、a11y tree與review snapshot都不得出現`FFF／變更影響`、Form／Fit／Function控制、raw `not_specified`或replacement欄位。
- 進版沿用「版次與檔案 → FFF／變更影響 → 智慧辨識」，先顯示中性「判定範圍」再顯示三軸。三軸初值必須是「請判定」，不得預選相容；任一未判定、必要reason／replacement缺漏或scope stale時不能送審，section內顯示最短錯誤並保留輸入。
- reviewer首版頁維持相同骨架但無FFF；reviewer進版頁顯示exact immutable FFF snapshot。direct URL、reload、Back／Forward、owner／reviewer切換或viewport改變不得讓適用性閃爍、翻轉或短暫出現錯誤section。
- 本矯正重用current `D01..D06`與`QA-087-187..192`，不增加分母。修正前browser／G4截圖只作回歸基線；fresh owner＋reviewer、1440×900／1024×768／390×844／320×800與200% zoom證據完成前，`QG-087-UI`不得PASS。

本文後續2026-08-22段落中的`67/67`、D25～D27、P14～P20、R15～R20及其BLOCKED／PASS結論全部是Historical Execution Record，不是current required denominator；保留原文只為首敗與決策追溯，current runner與completion audit只能讀本節固定的51-case registry及§27～§29新增責任。

## 0.1 Current scope correction：Part 附件入口回歸（2026-08-24）

本節取代本文所有把 `P11–P17` 整段歸入 DEV-088 的舊分流。能力歸屬必須依語意切分，不得再依連續編號整段移列：

- `P11–P13` 是 DEV-087 current required scope：既有 Part 附件即時 authority 必須有可發現、可寫入、可回復的 UI；附件不進 Part work/review snapshot，取消工作不 rollback，reviewer reload 後看 live list 與固定提示。
- `P14–P17` 才是 DEV-088：替代料號建立時的來源附件選擇、snapshot、stale 與正式化沿用。
- 修復前 canonical Part drawer 只投影下載清單，且空清單時整個附件區消失；這是 DEV-087 P1 UI/UX regression，不是 DEV-088 未開發能力。
- 固定入口為 `料號工作台 → 選取料號 → 右側明細「附件」→ 管理附件`；owner 料號編輯頁也連到同一頁 `/parts/{partNumber}/attachments?returnTo=...`。無 `numbering.attachments.manage` 權限者不顯示管理入口；reviewer 維持唯讀 live list。
- 聚焦真實 UI 證據：`output/qa/dev-087/DEV087-PART-ATTACHMENTS-2026-08-24T02-16-49-777Z/manifest.json`，`27/27 PASS`。由 UI 完成無分類控制項、多檔選取、上傳、受控下載、軟刪除、還原、返回原 drawer；owner editor secondary-entry source contract、desktop/tablet/mobile overflow、console、network 與 task-owned port cleanup 全部 PASS。

截至2026-08-24，DEV-087當時effective UI scope是原`48`案加回`P11–P13`，合計`51`案；此結論現為歷史回歸基線並由§0重開註記取代。原48案與新增三案證據不重寫，`P14–P20`仍不宣稱已驗證。

## 20. QC journey 全量重跑與產品缺口分流（2026-08-22 10:56）

先補齊並修正關聯 journey 後，以全新 disposable runtime、無 focus、完整 67-case 分母重跑。證據：`output/qa/dev-087-ui-only-lifecycle/DEV087-ui-only-2026-08-22T10-56-52-112Z/`。

| 指標 | 結果 |
|---|---:|
| D/P/R 分母 | 27 / 20 / 20（合計 67） |
| PASS / BLOCKED / FAIL | 37 / 30 / 0 |
| C01–C11 | 11/11 PASS |
| supplemental J01/J02/J03 | 3/3 PASS |
| lifecycle relation J-R03/J-R04/J-R14 | 3/3 PASS |
| consoleErrors / direct business API-DB mutation | 0 / 0 |
| task-owned runtime | port `61902` 已釋放 |

本輪曾出現的 R03/R04/R14 紅燈均已證實是 QC journey 缺口：R03 移除既有關聯後沒有重新新增，R04 取消工作的非同步競態，R14 移除後又新增相同類型導致資料未變；修正 runner 後 focused 與 full run 均無 FAIL。

### 20.1 剩餘結果不是產品缺口

- 30 個 `BLOCKED` 是 2026-08-22 當時分流：D07/D09/D12/D15 的進版列已無合法可用候選、D13/D14/D16/D17/D21/D22 需要多 context fixture、D25-D27/P18-P20/R16-R20 需要合法 terminal/history UI；當時把 P11-P17 全歸 DEV-088 的判定已由 §0 更正。
- 這些案例沒有 UI/API/DB mismatch、visible error、console error、partial write 或產品 FAIL 證據；不得改判 PASS，也不得誤登為產品 defect。
- `status=FAIL` 是 aggregate 依契約對 BLOCKED fail-closed 的結果；不代表本輪有產品 FAIL。完整 release gate 仍未通過，因 `Blocked > 0`。

### 20.2 產品缺口結論

| 類別 | 目前結論 |
|---|---|
| 已確認產品缺口 | 0 個 open；既有 GAP-PROD-01（工作頁遮罩／Save、terminal preview race）已修正並由後續 journey 回歸通過 |
| 已確認 runner 缺口 | 0 個 open；關聯 dirty 變更、取消清理等待、drawer hydration 均已修正 |
| 真正剩餘缺口 | 此列為 2026-08-22 歷史判定；current correction：P11–P13 已識別為 DEV-087 UI regression 並於 2026-08-24 修復，P14–P17 才是 DEV-088 |

目前判定：`QC journey complete for executable slice / product FAIL=0 / Full release NOT PASS (30 BLOCKED)`。後續只需補合法 UI fixture 或調整 active case scope，不能以 seed、SQL 或 business API 偷補前置。

## 19. QC journey 補強：作廢申請→審核連續路徑（2026-08-22 10:05）

本節補記本輪 QC journey 與產品缺口分類；完整內容以 runner evidence 為準。

Evidence：`output/qa/dev-087-ui-only-lifecycle/DEV087-ui-only-2026-08-22T10-05-20-130Z/`。

- `D18` UI 申請作廢、`D19` reviewer UI 入口、`D20` 唯讀審核決策／readback：均 PASS。
- supplemental `J01/J02/J03`：3/3 PASS；`C01-C11`：11/11 PASS；failures=0、consoleErrors=0；task-owned port `50708` 已釋放。
- D19/D20 原先 BLOCKED 的根因是 runner 未等待 drawer action hydration 與 `POST /void-requests` commit；修正後不是產品缺口。
- focused run 不等於 full release；仍要求 `67/67 PASS`、`Blocked=0`、`NotRun=0`。
- 本段為 2026-08-22 歷史結果；其中 P11-P17 的舊分流已由 §0 更正為 P11-P13 DEV-087、P14-P17 DEV-088，其餘 multi-context／terminal/history 結論不變。
## 最新執行補充（2026-08-22）

執行前先補最小可達的 QC journey，且只使用 rendered UI 觸發 business mutation；API 與 DB 僅作唯讀 readback。三個補充 journey 均需完成建立／進版、進入該 domain 工作頁、取消並返回清單，且保留 screenshot、action、network、UI/API/DB triad 與 cleanup evidence：

| Journey | 預期結果 | 最新結果 |
|---|---|---|
| `J01-drawing-create-cancel` | 圖號量產最新版進版入口可選候選，進入既有圖號編輯頁並可取消 | PASS |
| `J02-part-create-cancel` | 料號正式資料建立修改，進入料號編輯頁並可取消 | PASS |
| `J03-relation-create-cancel` | 正式關聯建立調整，進入圖料關聯編輯頁並可取消 | PASS |

最新全量證據：`DEV087-ui-only-2026-08-22T07-00-51-231Z`。67-case 分母結果為 `PASS=1、BLOCKED=66、FAIL=0`；C01–C11 為 `11/11 PASS`，infrastructure 為 `5/5 PASS`，console／unexpected failure 為 0。補充 journey 不計入 67-case 分母，亦不得用來掩蓋生命週期案例的 BLOCKED。

本輪分類規則：

- 真正產品缺口必須有 rendered UI 可達、前後端 triad 可讀回、且出現可重現的 UI／network／console FAIL。先前 relation 取消後導向不存在 `/numbering/relations` 的 404 已修正為 `/numbering/search`，最新 J03 PASS，因此目前沒有產品級 FAIL。
- `BLOCKED` 只表示缺少合法、可重複的 UI 前置或既有 `Merged/history` row；禁止用 seed、SQL、直接 business API、fixture injection 或縮小分母補造。這些是測試前置／資料能力缺口，不能宣稱 PASS，也不能誤報為產品 FAIL。
- 完整放行仍固定要求 `67/67 PASS + 11/11 gates + Blocked=0 + Not Run=0 + P0/P1=0`；本次尚未達成，DEV-087 維持未放行。

本次 66 個 BLOCKED 的拆分固定為：63 個一般生命週期案例缺少合法 UI 測試前置、3 個 D27／P20／R20 缺少合法 `Merged/history` UI 列；不是 66 個產品錯誤。只有在補足合法 UI 前置後仍出現可重現的 UI／API／DB 不一致，才可升級為產品缺口。

建立日期：2026-08-22  
Owner：QA  
執行者：AI-QA Operator；結案者：獨立 AI-QC  
狀態：`QA-QC Reopened / Function-Completeness CAPA / Previous 51-case PASS Historical / Local Isolated Only`
母計畫：`.ai-doc/qa/qa-dev-087-status-data-rebuild-validation-plan-2026-08-21.md`  
產品權威：`.ai-doc/specs/SPEC-PDM-STATUS-DATA-REBUILD-001-canonical-workbench-state-and-branching.md`  
關聯權威：DEV-077 正式草稿／正式物件作廢；DEV-087 Part 即時附件管理；DEV-088 替代料號附件人工沿用

## 1. 目的與不可妥協的通過定義

本計畫只驗證圖號、料號、圖料根號三個工作臺的新生命週期。AI 必須像一般使用者一樣，透過真實 rendered UI 完成建立、編輯、儲存、送審、退回、核准、取消、進版、分支作廢、正式作廢、查詢與清理；不得由 API、資料庫、seed、fixture、script 或瀏覽器程式注入製造業務結果。

每一個穩定狀態都必須同時通過三層對帳：

```text
AI 的 UI 操作
      │
      ├── UI：使用者實際看見的列、名稱、版次、角色、按鈕與明細
      │
      ├── Backend readback：UI 所使用的 GET API、action descriptor、正式資料
      │
      └── DB readback：canonical state、domain work、branch／claim／review／formal facts

三層 identity、數量、狀態與資料內容完全一致 → 該檢查點才可 PASS
任一層缺證據、不一致、部分寫入或 UI 無法到達 → FAIL／BLOCKED；整體不得 PASS
```

本計畫的完整放行分母為：

- `D01-D27`：圖號 27 條 UI journey。
- `P01-P20`：料號 20 條 UI journey。
- `R01-R20`：圖料根號 20 條 UI journey。
- `C01-C11`：11 個跨三層硬閘；它們是每條適用 journey 的必要斷言，不以重複計數灌水。
- 完整結論只允許 `67/67 journeys PASS + 11/11 common gates PASS + Blocked=0 + Not Run=0 + P0/P1=0`。

DEV-074 的舊 58/58 是 2026-08-15 舊模型的歷史基準，不得當成 DEV-087 新狀態架構的替代證據。

## 2. UI-only 執行邊界

### 2.1 唯一允許的業務操作

- 點擊、鍵盤輸入、選單、checkbox、modal、drawer、表單、真正的 file input／dropzone、登入／登出與 UI 內角色可用功能。
- 切換角色使用彼此隔離的 browser context；登入必須走 UI，不注入 cookie、token、localStorage 或 session。
- reload、Back／Forward、開第二個真實 tab、改 viewport、鍵盤操作與 UI 顯示的重試。
- 測試資料的建立、取消、作廢與可用的清理都走 UI。沒有清理 UI 的已核准資料保留在隔離 company，記為 `retained_by_design`。

### 2.2 只允許唯讀的佐證

- UI 操作完成後讀取 GET API response、network log、console、DOM／accessibility tree、下載檔與 screenshot。
- 以 `SELECT` 或 provider 等價 read-only transaction 查詢 DB；連線必須是 read-only，query 與結果 hash 納入 evidence。
- 讀取上傳檔 SHA-256、size 與檔名；不得直接把檔案 POST 到 endpoint。
- 啟動隔離測試 runtime、選擇啟動前已宣告且不直接寫 business data 的 deterministic fault profile。狀態仍須由後續 UI 動作觸發；不得在案例中途改 DB 或 API response。

### 2.3 明確禁止

- 直接呼叫任何 `POST／PUT／PATCH／DELETE` 業務 API。
- SQL write、seed、repair、fixture injection、狀態搬移、手動補 request／branch／claim／trace。
- `page.evaluate`、React state 修改、hidden control、disabled control bypass、直接改 URL 參數製造未提供的 action。
- 用 source test、unit test、build、HTTP 200、舊 screenshot 或舊 QC 報告代替本輪 UI journey。
- 為了讓案例變綠而重置資料、清除錯誤、覆蓋首次失敗或直接刪除測試資料。

任何 prohibited mutation 一經發現，整個 run 立即 `INVALID / FAIL`，不能只重跑該案例。

## 3. 執行角色與測試資料鏈

| Context | UI 角色 | 驗證責任 |
|---|---|---|
| `CTX-OWNER` | 負責人／具既有 non-owner edit scope 的同公司操作者 | 建立、編輯、取消、送審、進版、申請作廢 |
| `CTX-REVIEW` | 審核負責人 | 在與 owner 同內容的唯讀編輯頁退回修改或核准 |
| `CTX-MFG` | 生產／一般唯讀角色 | 同時看量產與研發 current rows，不得有 mutation action |
| `CTX-OTHER` | 同公司但無該 action permission | 看得到允許的資料，但不能靠 UI 執行未授權動作 |
| `CTX-CROSS` | 其他公司 | 不得讀取或操作目標資料 |
| `CTX-QC` | 獨立 AI-QC | 唯讀稽核 evidence；指定重跑仍須走 UI |

每個 run 從 UI 建立專用 root／drawing／part 測試鏈，名稱加可見 run tag；不得共用前一次 run 的可變資料。若要驗證 `merged` 或故障恢復，但產品沒有合法 UI 可建立該前置，案例必須判 `BLOCKED`，不得用 fixture 補造。

## 4. 三層對帳規則

### 4.1 UI 層

逐穩定檢查點保存清單、drawer／editor、filter 與必要 modal screenshot；記錄可見：

- 圖號／料號／圖料根號、品名。
- Drawing 的 `量產版 N`、每個 open branch latest 的 `研發版 N.n／N`；Part 的 `正式資料／修改中`；Relation 的 `正式關聯／調整中`。
- 清單固定角色文字：空白、`負責人處理`、`審核負責人處理`、`系統處理`、`系統管理員處理`、`受阻`；drawer 遇 `system_admin` 只顯示資訊 `請系統管理員處理`，遇 `blocked` 只顯示一項人類可理解的受阻原因，不提供假的恢復動作。
- server 提供的可用 action；正常無須處理時不顯示多餘狀態。
- UI 不得出現人名式「你／我／他」、raw status、branch/source/predecessor、package、workflow、時間、處理人或 `已取消` current row。

### 4.2 Backend readback

每個檢查點只讀相同 company／identity 的：

- Drawing：`GET /api/numbering/drawings/workbench`、`GET /api/numbering/drawings/workbench/[rowKey]`。
- Part：`GET /api/parts/workbench`、`GET /api/parts/workbench/[rowKey]`。
- Relation：`GET /api/numbering/relations`、`GET /api/numbering/relations/[rowKey]`。
- 審核：`GET /api/pdm/review-requests/[requestId]`。
- 必要的 exact artifact／preview GET 與正式 domain read API。

API 的 `rowKey／groupKey` 只做比對，不得在 UI 顯示。`layer、revisionLabel、handling、actions、rowVersion、detailHref` 必須與畫面及 DB facts 對應；禁止欄位不得出現在 payload。

### 4.3 DB readback

以 read-only query 查驗：

- `canonical_workbench_states`
- `pdm_workbench_aggregates`
- `drawing_rd_branches`
- `drawing_revision_claims`
- `drawing_revision_works`
- `part_change_works`
- `relation_change_works`
- `pdm_work_review_requests`
- `pdm_review_traces`
- 該 provider schema manifest 所列的 Drawing／Part／Relation 正式資料與 attachment／artifact tables

每個 query 必須固定 `queryName、queryHash、provider、company、business identity、transaction read-only receipt`。不得在計畫中猜測未固定的正式 table 名；runner 必須從當次 schema manifest 解析 exact table/query，解析不到即 `BLOCKED`。

### 4.4 一致性等式

1. `UI current row count = API totalRows = DB canonical current row count`。
2. `UI group identity = API group = DB aggregate canonical identity`。
3. `UI layer／版次／角色文字 = API layer／revisionLabel／handling mapping = DB canonical facts`。
4. `UI 可用 action = API actions descriptor`；實際 server permission 結果必須相同。Client 自行推測 action 直接 FAIL。
5. work／review／system 期間正式資料 hash 不變；formalize success 才可一次切換。
6. cancel／void／obsolete 後 current row、work、request、claim／branch count 的增減必須符契約且無 orphan；approved artifact／minimal trace 依規則保留。
7. API／DB 正確但 UI 錯、UI/API 正確但 DB partial、或 UI 看似成功但 reload 後消失，全部 FAIL。

## 5. 共同硬閘矩陣（C01-C11）

| ID | 必驗事項 | 通過標準 |
|---|---|---|
| `C01` | UI action provenance | 每個 mutation request 都有對應可見 UI action、actor、tab、時間與 correlation；direct mutation count=0 |
| `C02` | UI／API／DB identity 與數量 | 每個穩定檢查點符合 §4.4 前三個等式，差一列或一個 identity 即 FAIL |
| `C03` | 原子性 | 成功只產生一組完整 delta；取消、拒絕、stale、無權限與錯誤全部 zero partial write |
| `C04` | 正式資料隔離 | owner／review_owner／system 期間 production/formal hash 不變；核准正式化成功才改一次 |
| `C05` | 人類語意極簡 | 只顯示編號、品名、版本／資料層與角色處理狀態；禁止技術欄位與人名式文案 |
| `C06` | 取消與 terminal | cancel 是 transition，不是 current status；active list／一般 filter 不得出現 `已取消`，terminal 沒有復活 action |
| `C07` | 角色與 action | owner、authorized non-owner、reviewer、manufacturing、無權限同公司與跨公司 UI/action/server 結果一致 |
| `C08` | 搜尋與篩選 | 圖號、料號、圖料根號三個工作臺都逐一驗證搜尋及各自layer／handling filter；filter先於group pagination，只回命中row，不自動補companion，reload/back/forward一致 |
| `C09` | 審核頁同畫面唯讀 | reviewer 看到 owner 相同欄位、元件、值與附件 live 提示；除決策外完全唯讀，只有核准／退回修改 |
| `C10` | UI/UX 與錯誤可見性 | 1440×900、1024×768、768×1024、390×844、200% zoom、鍵盤流程通過；unexpected visible/console/network error=0 |
| `C11` | system／system_admin／blocked | UI核准後由系統自動處理；預宣告fault profile可產生安全重試與受阻畫面。清單顯示固定角色，drawer只顯示`請系統管理員處理`或一項受阻原因且無假恢復action；若沒有UI-triggerable路徑或合法profile，判BLOCKED，不得省略 |

## 6. 圖號生命週期矩陣（D01-D27）

| ID | AI 只能從 UI 執行的路徑 | UI 預期 | Backend／DB 必驗事實 |
|---|---|---|---|
| `D01` | 無量產資料的新圖號建立第一份工作 | 只見`研發版 0.1／負責人處理`與中性「關聯料號」；不見FFF／受影響／replacement | 新branch、0.1 claim、work、canonical RD row同transaction建立；`predecessor=NULL`、`changeImpactRequired=false`、work payload無`changeImpact` |
| `D02` | 第一份 0.1 工作取消 | current row 消失，不顯示已取消 | work/claim/empty branch/RD row 移除，open count 回 0 |
| `D03` | 0.1 編輯、儲存、reload、再進編輯 | exact 0.1資料與檔案仍在原editor；全程無FFF section或raw internal value | 同work row version前進；payload仍無`changeImpact`，正式資料不存在／不變 |
| `D04` | 0.1 送審後 reviewer 退回修改 | reviewer同頁唯讀且無FFF；退回後回`負責人處理`可編輯 | request/snapshot清除、minimal trace +1、work保留、formal不變；FFF assessment／replacement／BOM flag delta=0 |
| `D05` | 修改後重送並核准 0.1 | 先`系統處理`，成功後為idle`研發版 0.1`；owner／reviewer均無FFF | approved claim/artifact保留，work/request清除，production不建立；revision policy無系統代填`changeImpact`，FFF／replacement／BOM effect=0 |
| `D06` | 同branch由0.1進版至0.2，完成FFF後核准 | 0.2 workspace顯示「判定範圍」與初始「請判定」三軸；完成後branch只顯示latest`研發版 0.2` | `predecessor=0.1`、`changeImpactRequired=true`；未判定submit zero-write，完成snapshot／formal evidence一致；0.1進歷史、open count不變 |
| `D07` | 同 branch 由 0.n 選下一量產版 1 並核准 | 核准前顯示研發 target 1，成功後 `量產版 1` | current-base guard 成功；production 原子建立；來源 branch historical、count -1 |
| `D08` | 從量產版 1 建立新 branch 1.1 並核准 | 同組同時見 `量產版 1`與 idle `研發版 1.1` | 新 branch/base/claim；minor 核准不改 production hash |
| `D09` | 從量產版 1 直接選 target 2 並核准 | 核准前仍標 `研發版 2`，成功後才標 `量產版 2` | target 2 claim 在新 branch；正式化後 production 前進且來源 branch關閉 |
| `D10` | 已有 approved latest 的 branch 建下一版後取消 | 回原 idle latest，沒有取消列 | 新 work/unapproved claim 移除；branch與approved latest保留 |
| `D11` | 新 branch 第一份 work 建立後取消 | 該 branch current row 消失並釋放名額 | empty branch/claim/work/state全部移除，open count -1 |
| `D12` | 從 production 建立三個不同 open branches | production + 三列 branch latest 同組可見 | aggregate open count=3；三個 branch/claim 唯一，API/DB/UI 4 rows一致 |
| `D13` | 第四個新 branch | UI 固定提示已有3個分支，原資料不變 | `DRAWING_RD_BRANCH_LIMIT_REACHED`；zero orphan/claim/work/state |
| `D14` | 兩 tab 同時選同一 target revision | 一方成功，一方提示目標已占用並刷新 | 全域唯一 claim；loser zero write且不自動跳號 |
| `D15` | branch A 推進 production，B/C 保持 open | 新 production與B/C latest都可見 | 只A historical/count -1；B/C branch/state/artifact不變 |
| `D16` | stale branch 繼續下一個 RD minor | 仍可選研發下一版 | predecessor沿原 lineage；production不變，branch仍 stale/open |
| `D17` | stale branch 嘗試升量產 | UI 不提供或明確阻擋量產選項 | server current-base guard拒絕；zero claim/work/formal delta |
| `D18` | idle RD 點申請作廢，modal 取消／Escape | 回原 drawer、focus/scroll恢復 | request/trace/branch/state皆 zero write |
| `D19` | idle RD 申請作廢後 reviewer 退回 | branch 回 idle且仍可再申請 | void request/snapshot清除、trace +1、branch仍open/count不變 |
| `D20` | idle RD 申請作廢後 reviewer 核准 | 系統完成後該 RD row 從 current list 移除 | branch historical(latest_rd_voided)、count -1；approved identity/claim/artifact保留 |
| `D21` | 兩 tab 同時進版與申請作廢 | 只允許一條合法路徑成功 | aggregate/branch CAS 保證 exactly one；無 request+work 並存 |
| `D22` | 兩 reviewer tabs 對同 request 分別退回／核准 | 先提交者生效，另一個顯示資料已更新 | single terminal decision；request/work/formal無雙重處理 |
| `D23` | save／submit／approve 快速連點、reload、Back/Forward | 回到唯一穩定結果，不出現重複列 | idempotency receipt回 stable identity；一組 work/request/claim/formal delta |
| `D24` | 搜尋圖號並組合 layer／handling filter，開 current/history exact artifact | 只顯示命中列；歷史開 exact版，不 fallback latest | server filter-before-pagination；row/API/DB count與artifact hash一致 |
| `D25` | 受控正式圖申請作廢，reviewer 退回 | 正式量產列維持可用 | obsolete request有結果；正式及canonical current hash不變 |
| `D26` | 受控正式圖申請作廢，reviewer 核准 | current row移除；只在歷史唯讀可查 | formal terminal與canonical移除原子一致；artifact/trace依authority保留，無restore CTA |
| `D27` | 從 UI 導覽既有 merged/history-only Drawing | 僅唯讀，不得復活、編輯、進版或發布 | terminal record不回 current API/canonical；若無合法UI可產生/取得前置則 BLOCKED |

## 7. 料號生命週期矩陣（P01-P20）

| ID | AI 只能從 UI 執行的路徑 | UI 預期 | Backend／DB 必驗事實 |
|---|---|---|---|
| `P01` | 無正式資料的新料號建立修改工作 | 只見 `修改中／負責人處理`，沒有版本 | 唯一 part work + canonical work row；無 formal row |
| `P02` | 編輯料號欄位、儲存、reload | exact工作值保留；未變更欄位不製造比較噪音 | proposed payload/row version前進；formal仍不存在/不變 |
| `P03` | 首次工作取消 | current工作列移除，不顯示已取消 | work/state移除；編號回收只依既有numbering authority |
| `P04` | 首次工作送審後退回修改 | 回 `負責人處理`且可續編 | request/snapshot清除、trace +1、無formal partial write |
| `P05` | 修改後重送並核准 | 系統完成後只見 `正式資料` | formal建立、work/request移除、canonical work→formal 原子切換 |
| `P06` | 正式料號點建立修改 | 同組同時見 `正式資料`與`修改中` | 最多一份part work；formal hash保持 |
| `P07` | 正式料號修改工作取消 | 修改中列消失，正式資料不變 | work/state移除；formal fields/hash完全不變 |
| `P08` | 正式料號修改送審並核准 | 成功後正式資料更新且只有一列 | formal一次更新、work/request移除、無重複formal row |
| `P09` | 兩 tab／兩操作者同時建立第二份修改 | 導向既有工作或明確阻擋 | singleton guard；DB最多一work，loser zero write |
| `P10` | reviewer 從審核入口開料號編輯頁 | 與owner相同畫面但全唯讀，只見核准／退回修改 | exact snapshot與current live attachment descriptor正確，無edit mutation |
| `P11` | owner工作期間從附件UI新增／刪除附件 | 附件即時變更，修改案內容不被暗改 | live attachment authority更新；part work snapshot不含附件 |
| `P12` | review期間由另一合法UI context維護附件 | reviewer reload後看到live附件與固定提示 | request snapshot/hash不因附件改變；review仍可依法決策 |
| `P13` | 修改工作取消前後比對附件 | 取消只移除修改案；附件維持live結果 | attachment hash/count不rollback；work/state依P07移除 |
| `P14` | 建立替代料號時打開附件選擇 | active direct Part附件預設全選，Drawing類檔案不出現 | candidate API/DB scope exact；snapshot尚未提交前target zero write |
| `P15` | 取消任一／全部來源附件並同submit新增檔 | 同一扁平區、單一提交完成 | target snapshot只含最終選擇+新檔；source不移動、不後續同步 |
| `P16` | 開啟選擇後由UI改變source附件，再提交舊選擇 | 保留使用者選擇/新檔輸入並提示來源已更新 | stale fail closed；target work/binding zero partial write |
| `P17` | 替代料號完成審核正式化 | target正式附件完全等於approved snapshot | target獨立file rows、共享immutable pointer；source hash/count不變 |
| `P18` | 正式料號申請作廢，reviewer 退回 | 正式資料維持current | request結果保留；formal/canonical/attachment不變 |
| `P19` | 正式料號申請作廢，reviewer 核准 | current list移除、歷史唯讀 | exact part scope terminal；同root其他part/drawing不變，無restore action |
| `P20` | 從 UI 導覽既有 merged/history-only Part | 僅唯讀，無版本、修改、復活或發布 | terminal不回current API/canonical；無合法UI前置則 BLOCKED |

## 8. 圖料根號生命週期矩陣（R01-R20）

| ID | AI 只能從 UI 執行的路徑 | UI 預期 | Backend／DB 必驗事實 |
|---|---|---|---|
| `R01` | 無正式關聯的新根號建立調整工作 | 只見 `調整中／負責人處理`，沒有版本 | 唯一relation work + canonical work row；無formal tree |
| `R02` | 編輯直接關聯樹、儲存、reload | exact tree、順序與類型保留 | proposed_tree/hash/row version一致；formal仍不存在/不變 |
| `R03` | 首次調整工作取消 | current工作列移除，不顯示已取消 | work/state移除；根號回收依既有numbering authority |
| `R04` | 首次調整送審後退回修改 | 回 `負責人處理`且可續編 | request/snapshot清除、trace +1、formal tree zero write |
| `R05` | 修改後重送並核准 | 系統完成後只見 `正式關聯` | formal tree建立；work/request移除、canonical原子切換 |
| `R06` | 正式根號點建立調整 | 同組同時見 `正式關聯`與`調整中` | 最多一份relation work；formal tree hash保持 |
| `R07` | 從UI新增圖號／料號直接關聯並儲存 | 調整中顯示exact新增結果 | proposed tree valid；formal tree不提前新增 |
| `R08` | 移除關聯時開確認後取消／Escape | 回原編輯頁，關聯仍在 | removal token未commit；work/formal hashes zero delta |
| `R09` | 確認移除關聯並儲存 | 調整中exact移除；正式關聯仍在 | proposed tree更新，signed removal confirmation可重驗 |
| `R10` | 重排或同時增刪多筆後reload | exact順序/類型/數量一致 | UI tree hash = API snapshot hash = DB proposed_tree_hash |
| `R11` | 正式關聯調整工作取消 | 調整中列消失，正式關聯不變 | work/state移除；formal tree hash不變 |
| `R12` | 正式關聯調整送審並核准 | 成功後正式關聯一次替換 | exact target tree atomic replace；無orphan/duplicate/partial edge |
| `R13` | 兩 tab／兩操作者同時建立第二份調整 | 導向既有工作或明確阻擋 | singleton guard；DB最多一work，loser zero write |
| `R14` | reviewer 從審核入口開關聯編輯頁 | 與owner相同tree但全唯讀，只見核准／退回修改 | exact request snapshot與editor payload一致；無edit action |
| `R15` | 送審後由合法UI動作造成formal base drift，再嘗試核准 | 顯示資料已更新、request留待退回修改 | apply不得覆蓋新formal；review維持pending或契約指定可退回狀態，zero partial tree write |
| `R16` | 已領正式根號、所有子項僅Draft/NeedInfo且零受控引用，從UI直接作廢草稿 | 確認後current移除，無審核捷徑、無restore | exact root scope直接Obsolete；不建立approval；編號不可重用 |
| `R17` | 有受控資料的正式根號申請作廢，reviewer 退回 | 根號與所有current子項維持 | impact snapshot留痕；formal/canonical hashes不變 |
| `R18` | 有受控資料的正式根號申請作廢，reviewer 核准 | root及exact影響current rows移除、歷史唯讀 | root/drawing/part/relation依snapshot原子terminal；無漏項/越界 |
| `R19` | 只作廢一個子圖號或料號 | 根號與未受影響子項仍current | exact child scope更新；root aggregate不被誤作廢 |
| `R20` | 從 UI 導覽既有 merged/history-only root／relation | 僅唯讀，無調整、復活或發布 | terminal不回current API/canonical；無合法UI前置則 BLOCKED |

## 9. 生命週期競合的停止條件

下列情境若產品權威沒有唯一答案，QA 不得自行猜測：

| Gap | 情境 | 執行處理 |
|---|---|---|
| `GAP-UI-01` | 正式 Drawing／Part／root 在 active work、review_owner 或 system 時同時申請 whole-object obsolete | CLOSED：DEV-087 不另造 terminal command；既有 authority 只允許 formal idle 且無 current work/request 時申請，否則 descriptor 隱藏且 server zero-write fail closed。 |
| `GAP-UI-02` | root aggregate obsolete 時，子 Drawing 尚有 open RD branch，或子 Part／Relation 有 active work | CLOSED：root obsolete 不 cascade；任一子項 active/open/controlled dependency 時阻擋，先各自完成後重新產生 exact impact snapshot。 |
| `GAP-UI-03` | `Merged` 沒有現行合法 UI 建立入口 | CLOSED（scope boundary）：Merged 由既有 authority 產生；本計畫只驗證合法 UI 可導覽的既有 history row，禁止 seed／SQL／中途 mutation。若執行資料沒有合法 history row，該 run fixture 不合格，必須改用合法既有資料集，不得把缺資料算 PASS。 |
| `GAP-UI-04` | `system_admin／blocked` 缺 deterministic、啟動前固定且不寫business data的 fault profile | CLOSED（focused）：C11 需在完整 run 再驗；不得改DB status或攔截response冒充 |

所有 gap 已有 authority 或 focused fault profile；這不等於全生命週期已通過。QA 執行前仍須在 run manifest 記錄 gap authority 版本；不得邊測邊改期望。

## 10. AI 執行波次

| Wave | 內容 | 退出條件 |
|---|---|---|
| `W0` | 本機隔離環境、build/schema/provider、read-only DB credential、五角色登入、測試檔 hash、禁止 production 檢查 | mutation target 明確為隔離 company；API/DB readback可用且唯讀 |
| `W1` | C01-C10 smoke；各工作臺從UI建立最小資料鏈 | provenance、triad collector、visible-error sweep先證明會在錯誤時FAIL |
| `W2` | D01-D11 單branch建立、退回、核准、進版、取消 | 0.1→0.2→1與1→1.1/2皆有三層證據 |
| `W3` | D12-D24 多branch、stale、void、race、filter/history | cap、claim、CAS、idempotency、artifact exactness全PASS |
| `W4` | P01-P13 Part正式／修改／即時附件；P14-P17另屬DEV-088替代料號 | DEV-087 formal隔離與live attachment例外全PASS；DEV-088 snapshot不得混入DEV-087分母 |
| `W5` | R01-R15 Relation正式／調整／exact tree／drift | exact tree、singleton、review parity與atomic replace全PASS |
| `W6` | D25-D27、P18-P20、R16-R20 terminal治理 | reject/approve/direct obsolete/history/merged皆有結果；terminal action fail-closed；Blocked=0 |
| `W7` | C11 fault/retry、四viewport、200% zoom、鍵盤、角色、cross-company、cleanup與final reconciliation | 67/67 + 11/11、P0/P1=0、prohibited mutation=0 |

前一 Wave 失敗時停止向下游擴散，保留現場；不得修 DB 後繼續算同一資料鏈 PASS。

## 11. 每條 journey 的證據契約

Evidence root：`output/qa/dev-087-ui-only-lifecycle/<runId>/`

每個 ID 必須有：

- `case.json`：authority commit/schema/provider、actor、viewport、起始 UI 狀態、操作步驟、expected、actual、結果與首次失敗指標。
- `actions.jsonl`：accessible target、pointer／keyboard／file selection、before/after visible state、correlation。
- `screenshots/<caseId>-<checkpoint>-<viewport>.png`：before、confirmation、during system、after、error/blocked。
- `network.jsonl`：UI觸發 mutation與readback GET；標示initiating UI action。不得保存credential、cookie、token或signed URL。
- `api-readback/<checkpoint>.json`：必要欄位及payload hash；敏感值遮罩。
- `db-readback/<checkpoint>.json`：query name/hash、read-only receipt、row count、business identity與result hash。
- `triad-diff/<checkpoint>.json`：UI/API/DB逐欄等式；空 diff 才PASS。
- `visible-error-sweep.json`、`console.jsonl`、`page-errors.jsonl`、`viewport-metrics.json`、`a11y.json`。
- Fail／Blocked：精確重現、最後安全畫面、是否partial write、formal/current hashes、可否安全重試；不可被後續attempt覆蓋。

Run-level 必含 `run-manifest.json`、`authority.json`、`actors.json`、`route-inventory.json`、`schema-manifest.json`、`file-manifest.json`、`coverage.json`、`prohibited-mutation-audit.json`、`defects.md`、`cleanup-ledger.json`、`summary.md`。

## 12. PASS／FAIL／BLOCKED 規則

### 12.1 單一 journey PASS

只有下列全部成立才可 PASS：

1. AI 從可見 UI 起點完成所有操作；每個 business mutation 有 UI provenance。
2. 所有必要穩定檢查點都有 UI、API、DB 三層證據，§4.4 diff 為空。
3. reload、回清單或重新開 drawer 後仍得到相同結果。
4. 預期成功 exactly once；預期拒絕／取消 zero write；沒有 partial state、orphan 或 fallback。
5. visible error、console、pageerror、unexpected 4xx/5xx、資料突然為零、undefined/NaN/raw API error 均為 0。
6. 適用的 role、keyboard、viewport 與 action permission 斷言通過。

### 12.2 判定

- `FAIL`：可執行但任一 UI／API／DB 結果不符、資料 partial、越權、錯誤不可恢復、三層 diff 非空或 evidence 不完整。
- `BLOCKED`：缺合法 UI 起點、角色、檔案、deterministic fault profile、contract決策或只能靠非UI mutation建立前置。
- `NOT_RUN`：未執行。不得以不適用、舊證據、unit test或parent PASS代替。
- `INVALID`：run 曾使用直接 API／DB／fixture／注入 mutation，或偵測到 production target。整包作廢。

### 12.3 整體 PASS

同時滿足才可發布 QA PASS：

- `D=27/27、P=20/20、R=20/20、C=11/11`。
- `Fail=0、Blocked=0、Not Run=0、Invalid=0、open P0/P1=0`。
- 每條 case 的 triad diff 全空；prohibited mutation audit count=0。
- 四 viewport、200% zoom、鍵盤、role/action、visible-error/data-sanity 全部通過。
- cleanup 只有 `cancelled_via_ui／obsoleted_via_ui／removed_via_ui／retained_by_design`。
- 獨立 AI-QC 重驗每個 domain 的 happy/return/cancel/approve/terminal、所有 race/fault/permission 路徑及至少 20% 其餘案例，結果一致。

不得使用通過率平均、部分放行或「UI 正常所以後端推定正常」。任何一個 required case 缺證據，最終只能回報進度與缺口。

## 13. 不在本計畫授權內

- production/staging mutation、正式資料搬移、Cloud SQL migration apply、deploy、release、traffic cutover、DROP／physical GC。
- 真正工程幾何、尺寸、公差、FFF工程判斷正確性；相同附件可驗流程，但須標示 `content_changed=false／hash_reused=true`。
- 惡意token偽造、CSRF/DoS、暴力猜測、timing side-channel或證據偽造紅隊；依使用者決策延後。正常登入、角色、公司隔離、stale、idempotency與資料正確性仍是必測。
- BOM、技轉包、CAD辨識演算法本身；但 Drawing 現有 editor、檔案與智慧辨識入口不得因DEV-087回歸。

## 14. 目前結論

本文件的完整分母已由 runner 實際覆蓋，但尚未通過：最新嚴格 triad run `DEV087-ui-only-2026-08-22T02-17-12-187Z` 產生 67 個 case bundle，結果為 `PASS=1、BLOCKED=66、FAIL=0`，C01–C11 與 infrastructure checks 全部通過。BLOCKED 代表缺少合法 UI 前置，不得視為 PASS；詳細結果記錄於 `.ai-doc/qc/qc-dev-087-ui-only-lifecycle-execution-2026-08-22.md`。

`GAP-UI-01～04` 已由 ADR／SPEC 固定或在 focused scope 關閉；完整 67-case run 已執行但仍必須取得合法 UI 前置鏈，並且 D27/P20/R20 需合法既有 Merged history row，否則以 fixture 不合格停止，不得以 seed 前置、SQL mutation 或縮小分母繼續。

## 15. QC journey 補強更新（2026-08-22 08:09）

本次先處理「驗證器／journey 不足」再判斷產品缺口。所有 business mutation 仍只由 rendered UI 點擊、輸入與表單完成；API／DB 僅作唯讀 readback。

### 15.1 已補強並重跑的 journey

| Journey | 最新結果 | 證據 |
|---|---|---|
| `J01-drawing-create-cancel` | PASS | `output/qa/dev-087-ui-only-lifecycle/DEV087-ui-only-2026-08-22T08-09-59-844Z/journeys/J01-drawing-create-cancel/journey.json` |
| `J02-part-create-cancel` | PASS | 同一 run 的 `journeys/J02-part-create-cancel/journey.json` |
| `J03-relation-create-cancel` | PASS | 同一 run 的 `journeys/J03-relation-create-cancel/journey.json` |
| `J-D04` 圖號送審退回 | PASS | 同一 run 的 `journeys/J-D04/journey.json` |

`J-D04` 曾因 runner 只尋找通用唯讀提示文字而誤判，DOM evidence 已證明圖號審核頁實際顯示「目前為唯讀；欄位、檔案、預覽與智慧辨識位置和編輯者相同。」且 input／textarea 均 disabled；runner 已改為依人類語意 `/目前為唯讀/` 驗證，並保留失敗時的 DOM evidence。

最新 focused run `DEV087-ui-only-2026-08-22T08-09-59-844Z` 的 C01–C11 與 infrastructure 全部 PASS、console errors=0、failures=[]、task-owned port `63776` 已釋放。該 run 只聚焦 `D04`，所以 67-case coverage 仍為 `2 PASS / 65 BLOCKED / 0 FAIL`，不得解讀為完整通過。

### 15.2 已確認的產品缺口與非產品缺口

| 分類 | 判定 | 處置 |
|---|---|---|
| 圖號 workspace 右側操作區被不存在的舊 resizer grid 欄位遮擋 | 真正產品缺口，已修正 | `src/app/globals.css` 改為 canonical 兩欄 grid；D03 Save 的 UI pointer interception 已解除，需在下一次 full run 再確認。 |
| J-D04 唯讀判定失敗 | runner 缺口，非產品缺口，已修正 | 依語意提示與 disabled controls 判定，禁止要求每個 domain 使用同一段提示文案。 |
| 取消／送審後 preview 的已在途 GET 造成 404 server log | 目前屬可解釋的 terminal race，尚未列產品 FAIL | UI 已卸載且 component 會清除 timer；若下一次 full run 仍有使用者可見錯誤、console error 或未停止輪詢，才建立產品 defect；單純已在途 request 不升級。 |
| D06–D27、P06–P20、R06–R20 | QA 前置缺口 | 沒有可由 UI 合法建立且可清理的前置，不得 seed／SQL／business API 補造；維持 BLOCKED。 |
| D27、P20、R20 Merged/history | 資料集缺口 | canonical UI 沒有合法既有列時判 fixture invalid，不縮小分母、不宣稱 PASS。 |

### 15.3 放行閘門

本次補強只把 runner false FAIL 降為 PASS／BLOCKED，沒有改變完整門檻：`D01–D27 + P01–P20 + R01–R20 = 67/67 PASS`、`C01–C11=11/11 PASS`、`Blocked=0`、`Not Run=0`、`P0/P1=0`。在合法 UI 前置鏈補齊並完成新 disposable full run 前，DEV-087 仍不可 release-ready。

## 16. Preview terminal race 修正後確認（2026-08-22 08:20）

`D03` focused journey 在 `DEV087-ui-only-2026-08-22T08-15-41-715Z` 真實重現：取消工作後已在途的 preview GET 回 404 並產生 console error；此為產品穩定性缺口，不是 runner 誤判。已修正 `src/app/api/pdm/drawing-revision-works/[workId]/files/[fileId]/route.ts`：

- preview request 找不到已被 UI 取消的工作檔案時，依已完成的 `dev087:drawing.cancel` receipt 回 `204 No Content`，不暴露任何檔案 bytes。
- 下載請求、未知 workId、非 preview 檔案仍維持 strict `404`。
- 修正不新增 UI 狀態、不保留附件、不改變正式資料，只消除 terminal navigation 的無效錯誤。

全新 disposable run `DEV087-ui-only-2026-08-22T08-20-06-370Z` 重驗結果：`J01/J02/J03 PASS`、`J-D03 PASS`、`C01–C11=11/11 PASS`、`failures=[]`、`consoleErrors=[]`、port `53690` 已釋放。這表示 `GAP-PROD-01` 的兩個穩定性面向（Save pointer interception、cancel preview 404）均已在 focused scope 關閉，仍待完整 67-case run 回歸。
## 17. QC journey 連續路徑修正與重驗（2026-08-22 08:41）

### 17.1 本輪補入的真實 UI journey

- `J01-drawing-create-cancel`、`J02-part-create-cancel`、`J03-relation-create-cancel`：三個工作臺均由清單抽屜進入、建立工作、再由工作頁取消，三條路徑均 PASS。
- `J-D01`：圖號由量產版列透過 UI「進版」建立第一份研發工作，PASS。
- `J-D02`：圖號由 UI「取消本次工作」終止第一份工作並回到清單，PASS。
- `J-D03`：同一連續執行序先完成 D01、D02，再建立研發工作；由 UI 修改標題、儲存、重新載入並驗證值仍在，PASS。

### 17.2 競態根因與修正

工作頁在開發執行環境可能收到重複初始化讀取；舊回應可在使用者輸入後覆蓋 `payload`，使「儲存」重新停用。這是可由 UI 觀察的產品穩定性缺口，不是測試腳本誤判。

- `canonical-drawing-change-workspace.tsx`：每次載入使用序號與 `AbortController`；新請求取消舊請求，過期回應不再寫入畫面狀態。
- 新建工作初始標題為空是合法資料，QC journey 只等待欄位可編輯，不再要求非空來源值。

### 17.3 最新證據與判定

證據根目錄：`output/qa/dev-087-ui-only-lifecycle/DEV087-ui-only-2026-08-22T08-41-03-941Z`。

- D01、D02、D03：3/3 PASS；另有 D24 readback PASS，故本輪總 coverage 為 4/67 PASS；本輪 journey `J01/J02/J03/J-D01/J-D02/J-D03` 全 PASS。
- 共通閘門 `C01-C11`：11/11 PASS；基礎設施：8/8 PASS；`failures=[]`、`consoleErrors=[]`；臨時執行埠 `52283` 已釋放。
- 67-case 總體仍為 `PASS 4 / BLOCKED 63 / FAIL 0 / NotRun 0`，不得宣稱完整生命週期已通過。其餘 BLOCKED 是尚未具備合法 UI 前置資料或尚未補入 journey，不列為產品 FAIL。

### 17.4 產品缺口盤點原則

本輪已確認並修正的產品缺口：工作頁重複載入覆蓋輸入；前次已修正的兩欄工作區點擊遮罩與取消後預覽終止競態，均由本輪無 console error 的連續 journey 重新確認。尚未執行的 D06-D27（D24 為 readback-only）、P01-P20、R01-R20 只能標示「待補 journey／待合法 fixture」，在完成 UI-only journey 前不得判定為「沒有產品缺口」。
## 18. 審核 terminal race 修正後重驗（2026-08-22 08:49）

`J-D04`（送審退回）與 `J-D05`（重送核准）均由 UI 完成，且同一執行序的 review page 預覽在決策後沒有再產生 404／console error。根因是審核決策會正常刪除 pending review request 或正式化工作；仍在途的 preview GET 不應把正常終止當成檔案不存在。

- `src/app/api/pdm/drawing-revision-works/[workId]/files/[fileId]/route.ts`：對具備審核權限且帶 `reviewRequestId` 的 terminal preview 回 `204 No Content`；工作仍存在但 review request 已終止時同樣回 204；不回傳檔案 bytes，下載與未知 work 仍 strict 404。
- 最新 disposable run：`output/qa/dev-087-ui-only-lifecycle/DEV087-ui-only-2026-08-22T08-49-54-823Z`。
- `J01/J02/J03/J-D04/J-D05` 全 PASS；`C01-C11=11/11 PASS`；`failures=[]`、`consoleErrors=[]`；port `61975` 已釋放。

因此目前已執行的 QC journey 沒有可重現產品級 FAIL；未執行的 D06-D27（D24 為 readback-only）、P01-P20、R01-R20 仍維持 BLOCKED，必須先補合法 UI journey／fixture，再進行產品缺口判定。

## 19. D21/D22 審核競合 journey 補強與產品缺口判定（2026-08-22）

### 19.1 Journey contract

- `D21` 必須由兩個 rendered UI context 對同一研發版同時按「作廢」；合法結果恆為一個 `200`、一個 `409`，且只有一個 reviewer request 存在。
- `D22` 必須由兩個 reviewer rendered UI context 開啟同一 request 並同時按「核准」；合法結果恆為一個 `200`、一個 `409 WORKBENCH_REVIEW_REQUEST_STALE`，canonical branch／current list 只能完成一次 terminal transition。
- active request 完成後可刪除工作內容，但為了讓已開啟頁面得到 deterministic stale 結果，後端只保留最小 terminal receipt（request key、company、決策時間）；receipt 不進一般清單、篩選器或 UI。

### 19.2 本輪證據

`DEV087-ui-only-2026-08-22T13-01-59-223Z`：`J-D21=PASS`、`J-D22=PASS`，D22 response observed=`409 / 200`；`C01-C11=11/11 PASS`、infrastructure `7/7 PASS`、supplemental `3/3 PASS`、`consoleErrors=0`、`failures=0`。本輪 readback 保持 67-case 分母，結果 `3 PASS / 64 BLOCKED / 0 FAIL`，因為只執行 D21/D22 的 lifecycle journey，不能當作 full release 結果。

### 19.3 Root-cause triage

| 識別 | 根因 | 判定 | 狀態 |
|---|---|---|---|
| `GAP-PROD-02` | active review request 刪除後，第二 reviewer context 被回 404 而非 stale 409 | 真正產品缺口 | CLOSED；以最小 terminal receipt 修正 |
| `GAP-DATA-01` | branch／stale／多 context 缺少可由 UI 合法取得且可清理的資料起點 | QA fixture／sequence 缺口 | OPEN，不能改判 PASS |
| `GAP-DATA-02` | terminal/history row 在資料集不存在，且沒有合法 UI 建立入口 | QA fixture／scope 缺口 | OPEN，維持 BLOCKED |
| `GAP-SCOPE-01` | 舊分流把 P11-P17 整段歸入 DEV-088 | scope boundary defect | CLOSED 2026-08-24；P11-P13 回歸 DEV-087 並完成 focused PASS，僅 P14-P17 移交 DEV-088 |

在此分類下，BLOCKED 不等於產品 FAIL；但 `NOT PASS` 仍是正式結論，直到完整分母全部以 rendered UI journey 與 UI/API/DB triad 通過。

## 20. 無 focus full regression：D22 FAIL 歸零（2026-08-22 13:20）

最新 run：`DEV087-ui-only-2026-08-22T13-20-00-854Z`。

| 指標 | 結果 |
|---|---:|
| coverage | `40 PASS / 27 BLOCKED / 0 FAIL` |
| D21 / D22 | `PASS / PASS`；D22 response `200 / 409 WORKBENCH_REVIEW_REQUEST_STALE` |
| C01–C11 | `11/11 PASS` |
| supplemental | `J01/J02/J03=3/3 PASS` |
| consoleErrors / unexpected failure | `0 / 0` |

這次 full run 將先前 D22 的 404 產品 FAIL 關閉；route precheck 與 service 均遵守 terminal receipt stale contract。剩餘 27 BLOCKED 的 root cause 只有合法 UI 前置／sequence 不存在、terminal/history fixture 不存在、以及 DEV-088 attachment scope；依本計畫不得 seed、SQL 或直接 business API 補造，亦不得改判產品 PASS。完整放行仍固定為 `67/67 PASS + 11/11 gates + Blocked=0 + NotRun=0 + P0/P1=0`。

## 21. QC journey 後的產品缺口判定規則

本次先補 journey，再判定產品缺口。已關閉的產品缺口固定命名為：

- `GAP-PROD-01A`：Drawing workspace 多餘欄位／preview layer 攔截 Save。
- `GAP-PROD-01B`：取消或審核終止後，在途 preview 讀取造成 404／console error。
- `GAP-PROD-02`：同一 review request 的第二 reviewer context 被誤回 404，未回 stale 409。

該次 full evidence 的 `27 BLOCKED` 原列為「尚未證實」或「範圍／前置缺口」；其中 P11–P13 後續證實是 DEV-087 UI regression 並已於 2026-08-24 修復，P14–P17 才是 DEV-088。D07/D09/D12/D14–D17/R13/R15 的 branch／stale／multi-context fixture，以及 D25–D27/P18–P20/R16–R20 的 terminal/history 前置判定維持不變。

## 22. Fresh UI fixture 證據修訂（2026-08-22 13:37–13:39）

`D07`、`D09`、`D12` 分別以全新 disposable runtime 單獨執行，皆為 `PASS`，且各自 `C01–C11=11/11`、`consoleErrors=0`、UI/API/DB triad 一致。這證明全量 run 中三案的 `NO_LEGAL_UI_ACTION` 是 sequence contamination／fixture 編排問題，不是產品缺口；後續 runner 必須在不使用 seed／SQL／直接 business API 的前提下，為每一案例提供可重置的合法 UI fixture chain。

同樣方式補驗 `D14`、`D16`、`D17`：三案各自 fresh run 均 `PASS`、`C01–C11=11/11`、`consoleErrors=0`、UI/API/DB triad 一致（evidence 分別為 `DEV087-ui-only-2026-08-22T13-41-24-516Z`、`13-41-59-304Z`、`13-42-33-576Z`）。因此 D14/D16/D17 的 full-run BLOCKED 亦是 sequence／fixture 編排缺口。

## 23. Fresh UI fixture journey：D15／R13（2026-08-22 13:47–13:48）

為持續遵守「先補 QC journey，再判定產品缺口」，D15 與 R13 亦各自以全新 disposable runtime、rendered UI mutation、唯讀 API／DB triad 重驗：

| 案例 | evidence | 結果 | 判定 |
|---|---|---|---|
| `D15` | `DEV087-ui-only-2026-08-22T13-48-29-009Z` | PASS | branch 推進量產版 2 後，另一研發 branch 仍可見；UI/API/DB 一致，非產品缺口 |
| `R13` | `DEV087-ui-only-2026-08-22T13-47-03-280Z` | PASS | 同一 target 兩 UI context 得到 `200 / 409`，勝者可取消、敗者 zero-write；非產品缺口 |

R13 同時修正 runner 的 return 控制流與預期 409 error 監控，避免 journey 已完成卻因 runner 封裝失敗。上述 fresh evidence 將 D15/R13 從「尚未證實」更新為「已執行 PASS」；其餘 D07/D09/D12/D14/D16/D17 同樣已由 §22 fresh evidence 證實不是目前可重現的產品 FAIL。完整放行門檻仍不變：`67/67 PASS`、`Blocked=0`、`NotRun=0`、`C01–C11=11/11`、`P0/P1=0`。

## 24. Full regression 後的 P04 分流（2026-08-22 13:50–13:58）

無 focus full regression `DEV087-ui-only-2026-08-22T13-50-24-996Z` 出現 `P04=FAIL`，但根因是 sequential runner 沿用舊 Save locator，workspace 重繪後 locator 指向 disabled button；不是 UI/API/DB triad 的產品不一致。全新 disposable 重跑 `DEV087-ui-only-2026-08-22T13-58-29-380Z` 的 `J-P04=PASS`、`C01–C11=11/11`、`consoleErrors=0`，因此 P04 轉列 runner hydration／sequence 缺口。runner 已改為儲存前重新定位 enabled rendered button；需下一次無 focus full regression 回歸確認。

## 25. QC journey 補齊後的最新全量分流（2026-08-22 14:13–14:18）

先以 focused UI journey 補驗 P05，再執行無 focus full regression：

| evidence | 結果 | 判定 |
|---|---|---|
| `DEV087-ui-only-2026-08-22T14-10-35-764Z` | P05 fresh `PASS`、C01–C11 `11/11`、console `0`、UI/API/DB 一致 | P05 可由合法 UI 完成 |
| `DEV087-ui-only-2026-08-22T14-13-10-742Z` | P04→P05 sequential `PASS/PASS`、C01–C11 `11/11` | 儲存控制項重繪競態屬 runner，已修正 |
| `DEV087-ui-only-2026-08-22T14-13-47-545Z` | `41 PASS / 26 BLOCKED / 0 FAIL`、gates `11/11`、console `0` | 最新 67-case coverage 基準 |

### 真正產品缺口判定

- `GAP-PROD-01A/01B/02` 已由 focused／full 回歸關閉，現在沒有可重現的產品 FAIL。
- `D07/D09/D12/D14/D15/D16/D17/P04/P05/R13` 的 fresh／sequential UI triad 已 PASS；full BLOCKED／先前 P04/P05 FAIL 均為共享 state、fixture 編排或 locator 重繪，不列產品缺口。
- 此列的舊判定已由 §0 取代：`P11–P13` 屬 DEV-087 並已修復／補驗；`P14–P17` 才屬 DEV-088。
- `D25–D27/P18–P20/R16–R20` 與 `R15` 仍是「產品能力／契約缺口候選」：現行 UI 沒有合法 terminal/history 或 deterministic multi-context 起點，因此只能列 `BLOCKED / 尚未證實`，不能改判 PASS，也不能以 seed、SQL 或直接 business API 偽造。

結論：已證實產品缺口 `0`；DEV-087 仍 `NOT PASS`，因放行仍要求 `67/67 PASS + Blocked=0 + NotRun=0 + gates=11/11 + P0/P1=0`。
## 26. DEV-087 scope rebaseline and completed 48-case gate（2026-08-23）

依據本輪產品缺口分析與使用者決策，本期正式驗收範圍改以目前具有合法 rendered-UI 路徑、且契約已定義的 canonical lifecycle 為準：

- Drawing：`D01–D24`（24 cases）
- Part：2026-08-23 原 gate 為 `P01–P10`；2026-08-24 加回 `P11–P13`（current 13 cases）
- Relation：`R01–R14`（14 cases）
- 合計：原 `48 cases`；加回 P11–P13 後 current effective scope 為 `51 cases`，另加共同 gate `C01–C11`（11 gates）

排除項目不是被靜默改判 PASS，而是明確列入後續能力／契約候選：

- `D25–D26`：正式圖號 obsolete 能力候選；`D27`：歷史可達性候選。
- `P11–P13`：DEV-087 Part 即時附件管理，2026-08-24 focused PASS；`P14–P17`：DEV-088 替代料號 attachment scope；`P18–P20`：料號終態／歷史可達性候選。
- `R15`：formal-base drift 契約尚未定義；`R16–R20`：關聯終態／歷史可達性候選。

### 最新 full evidence

最新無 focus disposable run：`DEV087-ui-only-2026-08-22T16-03-21-109Z`，evidence root：`output/qa/dev-087-ui-only-lifecycle/DEV087-ui-only-2026-08-22T16-03-21-109Z/`。

| Gate | 結果 |
|---|---|
| lifecycle coverage | `48/48 PASS`；`Blocked=0`；`NotRun=0`；`FAIL=0` |
| common gates | `C01–C11 = 11/11 PASS` |
| infrastructure | `51/51 PASS` |
| supplemental journeys | `J01/J02/J03 = 3/3 PASS` |
| console / unexpected failure | `consoleErrors=0`；`failures=[]` |
| UI-only mutation audit | direct business API writes `0`；direct DB writes `0`；UI initiated writes only |

本輪 runner 先停止主 runtime，再啟動 `system_admin`／`blocked` fault child，避免共用根目錄 `next-env.d.ts` 造成環境競態；兩個 fault profile 均有獨立 UI/API/DB evidence 並通過。正式資料未被 fault path 改變，task-owned runtime、port 與 disposable fixture 均已清理。

### 放行規則與後續決策

截至2026-08-24，原`48/48`加上P11–P13 focused證據構成當時51-case本地closure；2026-08-25功能完整性盤點後，此段只作歷史基線，current disposition以§0與下列§27為準。不得將`P14–P20`等排除項目解讀為已驗證；禁止以seed、SQL、直接business API或人工改狀態偽造終態／歷史資料。

## 27. 2026-08-25 重開 UI journey 責任矩陣

| Journey family | 對應母計畫 | UI-only 必做路徑與判定 |
|---|---|---|
| `RG-DRAW-CHANGE` | QA-087-187～192 | owner先以首版旅程證明只見中性關聯料號且zero FFF，再由canonical「進版」完成判定範圍、明確FFF三結果、replacement、送審／退回／重送／核准；reviewer首版無FFF、進版只看exact snapshot，畫面不得要求另走平行revision工作臺。 |
| `RG-TASKS` | QA-087-193～197 | UI-only只驗證`/numbering/tasks`入口、頁面與死連結歸零且direct URL 404；194～197的排序、identity、read／handled與empty／failure改由母計畫repository／API證據負責。 |
| `RG-OBSOLETE` | QA-087-198～202 | Drawing／Part由正式UI申請、reviewer拒絕／核准並回到exact object；UI-only負責198～201與202的direct-invalidation入口消失／retired message readback，固定410 API探針由母計畫執行。 |
| `RG-PART-VARIANT` | QA-087-203～206 | owner編輯material／color／surfaceTreatment／variantNote，reviewer唯讀exact snapshot，驗證退回／取消／核准；206直接API拒絕探針由母計畫執行。 |
| `RG-HISTORY` | QA-087-207～208 | 從歷史列開啟所點revision的exact preview與受控下載；缺檔／錯binding／無權限明確fail closed，不能fallback latest。 |
| `RG-WORK-FILES` | QA-087-209～211 | 在current Drawing work完成逐檔下載、非primary誤檔移除、多檔進度／部分失敗／重試；reviewer只讀，送審集合與畫面一致。 |
| `RG-MATRIX-NAV` | QA-087-212～213 | 從Drawing／Part兩側矩陣identity以滑鼠與鍵盤互跳；dirty時呈現儲存／捨棄／留頁選擇，驗證焦點與返回位置。 |
| `RG-DISCOVERY` | QA-087-214～216 | Drawing目的／系列及Part料件類型／系列／材質／顏色搭配搜尋、排序、前後換頁；reload與Back／Forward無漏列、重複或stale覆蓋。 |
| `RG-UI-GATES` | QA-087-217 | 1440×900、1024×768、390×844、320×800、keyboard、a11y、visible error、console/network與資料合理性；其actual artifacts供G4稽核。 |
| `RG-NEGATIVE-COMPLETION` | QA-087-218 | 8族正常journey後逐一驗證入口、primary action、exact artifact或readback缺失會被產品案例捕捉；restore後另開fresh run。此項是功能回歸，不要求DEV-097 mutant／anti-cheat hash。 |

每個family至少保留：fresh-session起點、role、viewport、逐步操作、checkpoint screenshot、UI/API/DB identity與數量、需要時file bytes/hash、console/page/network清單、cleanup與source fingerprint。只看到control、HTTP 200、toast或靜態DOM不構成PASS。

完整通過定義固定為：`新增UI責任全部PASS + current 51-case fresh回歸PASS + C01～C11 PASS + QG-087-UI PASS + Blocked=0 + NotRun=0 + P0/P1=0`。現有browser 91/91、主browser 288/288、Part附件48/48與headed／viewport證據可作回歸基線；契約變更後仍需fresh trusted-solo run，不直接把舊G4改標PASS。

## 28. RD Implementation Ready UI surface contract（2026-08-25）

本節把§27的journey family綁到確定的頁面與互動；產品surface contract已實作，current狀態=`Trusted-Solo UI QA-QC Complete / Current UI Denominator PASS / Production Release Gated`。runner不得以舊頁、API直寫、seed terminal state或靜態DOM取代下列rendered UI；本次current evidence已依此限制fresh執行，但不要求獨立人員或防證據作弊封口。exact parent由不納入source fingerprint的current completion receipt與dev task指向。

### 28.1 Surface ownership

| Family | 起點與owner surface | Primary／secondary action | 明確禁止 |
|---|---|---|---|
| RG-DRAW-CHANGE | 首版由正常建立流程進現有canonical Drawing full-page workspace；後續由`/numbering/drawings` drawer `進版`進同一workspace | 首版只有關聯料號；進版才有判定範圍／FFF／必要replacement。同一workspace唯一primary依dirty/readiness為儲存／送出審核 | 不以版號猜適用性、不在首版渲染或寫入FFF、不預選相容；不開第二個簡化editor、不要求去`/numbering/revisions`、不出現舊submission review buttons。 |
| RG-TASKS | sidebar、dashboard與直接URL | 不提供獨立task center；正式入口與元件不存在，直接URL呈現404 | 不保留隱藏route／redirect／死連結；不刪除仍有caller的task／notification API。 |
| RG-OBSOLETE | Drawing production／Part formal drawer `申請正式作廢` | modal先顯示object dependency impact，填reason後建立formal request；reviewer仍在既有approval UI核准／拒絕 | Drawing RD仍只顯示branch作廢；root沒有按鈕／modal／route；`直接失效`不存在。 |
| RG-PART-VARIANT | `/parts/[id]/workspace?workId=...` | 四個業務欄位與現有Part save／submit；review頁相同layout fully readonly | 不在drawer直接改formal、不顯示六個storage欄位為六項業務輸入、不把附件放進snapshot。 |
| RG-HISTORY | Drawing drawer歷史列 | 點revision在同drawer開exact唯讀子視圖，提供該版preview/download與返回歷史 | 不另開latest detail、不顯示mutation、不fallback current。 |
| RG-WORK-FILES | canonical Drawing full-page workspace檔案區 | 每檔download；non-primary remove；每檔progress/retry；送審仍是唯一流程承諾 | primary無remove；reviewer無upload/remove；單一spinner不得代表多檔結果。 |
| RG-MATRIX-NAV | Drawing／Part drawer relation matrix | identity本身是button/link；dirty時儲存／捨棄／留頁三選一 | 不新增矩陣外重複導航表、不靜默discard、不導向root drawer。 |
| RG-DISCOVERY | Drawing／Part canonical toolbar＋pager | domain multi-select、sort、上一頁／下一頁；URL保存query/filter/cursor/pageIndex | 不恢復已退役status URL、不用`載入更多`append、不先分頁再client filter。 |

### 28.2 Visible vocabulary與layout

- 首版只以exact number＋name顯示compact「關聯料號」；這是context，不是判定結果，因此不用check、成功色或helper paragraph。沒有關聯時顯示中性「目前沒有關聯料號」，不建立空FFF容器。
- 進版FFF三軸初始顯示「請判定」，完成選項為`相容／條件相容／不相容`，wire終態仍是`no_impact／suspected_impact／confirmed_impact`；Form/Fit/Function各一列，不複製舊頁大型說明卡。任一未判定不可送審；條件相容／不相容需人類reason label，不相容才展開replacement，raw `not_specified`不得出現在visible UI或a11y name。
- 進版affected Parts改以「判定範圍」呈現exact number＋name的compact中性list；無候選時顯示「目前沒有直接受影響料號」，不是loading空白。cross-root Part永遠不出現在選項或DOM。
- task center不再形成可見surface；sidebar、dashboard與其他stored action不得顯示或連到`/numbering/tasks`，其後端資料契約由非UI測試驗證。
- obsolete modal只顯示object identity、影響摘要、reason與一個submit；技術fingerprint不進可見UI/DOM/a11y name。stale回應顯示「影響範圍已更新，請重新確認」並重新載入，不能自動重送。
- Part材質／顏色欄位顯示label並保留code供搜尋選取；surface treatment／variant note是nullable text。變更後才在欄位附近顯示原正式值，未改欄位不做雙欄比較。
- history與work file rows固定顯示檔名、角色、大小與終態；hash只在受控evidence，不在一般UI。upload percent需有文字；失敗檔保留並提供retry，成功檔不回退queued。
- domain filters採現有compact multi-select；Drawing為目的／系列，Part為料件類型／系列／材質／顏色。sort是一個明確升冪／降冪控制，pager顯示上一頁／下一頁及可理解的頁次，不顯示cursor token。

### 28.3 Focus、history與dirty behavior

1. drawer action開modal時focus進標題；關閉／失敗回原CTA。成功建立work才navigation，5秒以上顯示進行中並disable repeat。
2. history entry開啟時URL增加`historyRevision`；Back回歷史列表，第二次Back才關drawer；reload仍是exact revision。失敗留在該revision error surface，不跳latest。
3. matrix identity dirty dialog：default focus=`留在本頁`，Escape相同；選儲存後前往必須等server success與readback，失敗回矩陣且焦點在error summary；捨棄需二次明確選擇。
4. cursor pager每次push history；filter／sort變更replace並回第一頁；Back／Forward必須restore filter、page、selection與drawer。stale response不可覆蓋較新的UI intent。
5. mobile 390／320px下toolbar可換行，唯一horizontal overflow owner只允許matrix與必要表格容器；modal、task rows、file progress、history preview不得超出viewport。

### 28.4 UI selectors與proof points

runner使用人類role/name優先，不把CSS class當唯一證據。每個family至少證明：

- formal navigation label與permission visibility；unauthorized直接URL得到server denial。
- primary action accessible name、disabled reason、busy／error／success readback與focus target。
- exact identity在UI、request、DB與file oracle四方相同；history/file再加bytes/hash。
- reload與Back／Forward後控制值、row order、detail identity與terminal state相同。
- expected 409／410在畫面有可理解message；console/page error與unexpected response仍為0。

`part_root`搜尋明細／狀態／作廢影響沒有selector、journey或Blocked項；若任一新surface出現root formal-obsolete CTA，RG-OBSOLETE與aggregate立即FAIL。

### 28.5 UI-only execution order

依`RG-DRAW-CHANGE → RG-TASKS → RG-OBSOLETE → RG-PART-VARIANT → RG-HISTORY → RG-WORK-FILES → RG-MATRIX-NAV → RG-DISCOVERY → RG-UI-GATES（QA-087-217）`執行。每族先跑desktop happy／return/retry，再跑negative與mobile；不得用後一族PASS抵銷前一族P0。所有family完成後執行`QG-087-UI`、`RG-NEGATIVE-COMPLETION / QA-087-218`、current 51-case固定名冊fresh regression與current aggregate。舊G0-A／G4、M03／M07／M09／M10與Independent AT receipt已退役。

## 29. Trusted-solo UI QC contract（2026-08-27）

### 29.1 執行者與邊界

- 同一位開發者可同時擔任RD、QA與QC；不需`independent_qc`角色、另一位人員、收據或交叉簽核。
- 執行時仍只能使用task-owned fixture，不得為測試而改primary database、正式provider或他人runtime。
- 必須從正常導覽／CTA進入；direct URL、API或DB只能建立前置條件或讀回，不得直接建立本案要驗收的成功終態。

### 29.2 Headed viewport matrix

- `drawing_change`、`task_center`、`formal_obsolete`、`part_variant`、`drawing_history`、`work_files`、`matrix_navigation`、`workbench_discovery`每族至少執行1440×900與390×844各一條headed實際流程。
- 1024×768與320×800至少執行geometry、horizontal overflow、modal／drawer boundary與primary CTA可見性自動量測。
- 每族覆蓋與實際功能相關的normal、loading、empty、error、selection／dirty、high-risk、keyboard與focus狀態。

### 29.3 UI hard fail

- 任一可見`.inline-error`、非預期`[role=alert]`、load failed、HTTP 4xx/5xx或route error文字、console/page error、unexpected failed response或預期有資料卻全零，立即FAIL。
- 水平溢出、重疊、文字截斷、按鈕被擠壓、焦點遺失、keyboard無法完成關鍵流程或錯identity導覽立即FAIL。
- build、HTTP 200、DOM存在、a11y tree或單張full-page screenshot不能沖銷上述實際失敗。

### 29.4 Accessibility disposition

- 必驗：accessible name、semantic role、keyboard、focus order／focus style、dialog focus trap／return與不只靠顏色表達狀態。
- 選配：NVDA、JAWS或Windows Narrator的actual操作。沒有actual AT證據不得宣稱已驗證screen-reader conformance，但不阻擋DEV-087 local completion。

### 29.5 證據與判定

- 每條evidence保存source／runtime邊界、route、role、fixture、viewport、操作步驟、actual、screenshot、console／network摘要與cleanup。不要求artifact hash chain、same-parent cardinality或防重用證明。
- `QG-087-UI PASS`：8族的desktop／mobile headed流程全PASS，1024／320量測PASS，visible/console/page/network非預期錯誤=0，Blocked=0，Not Run=0，P0/P1=0。
- 失敗要保留重現步驟、actual、expected與首個有效evidence；修正後使用fresh run重驗該族與受影響回歸。

## 29H. Historical DEV-097 UI evidence integrity contract（2026-08-25，superseded 2026-08-27）

本節以下至§30之前的fixture provenance、full mutation ledger、Independent QC／actual AT、checkpoint hash與G0-A／G4要求只作歷史追溯，不再是current UI completion gate。

### 29H.1 Fixture provenance與可宣稱範圍

每個UI case開始前必須在case manifest固定一種`fixtureOrigin`：

| Origin | 允許用途 | 不得宣稱 |
|---|---|---|
| `ui_created` | 由rendered UI從合法起點完成完整business action chain，可宣稱該chain實際可操作 | 不得在中途以API／SQL／seed補狀態 |
| `repository_seeded_read_only` | 建立history多版、missing artifact、scale或權限等唯讀前置；只驗證registry明列的read/error slice | 不得宣稱建立、送審、核准、正式化、作廢或其他生命周期已由UI完成 |
| `fault_profile` | runtime啟動前選定deterministic failure；後續狀態仍由UI動作觸發 | 不得在case中途改DB、response或client state |

缺`fixtureOrigin`、mutation ledger或allowed-claim list時，case=`INVALID`。同一case不能把seeded terminal state重新標成`ui_created`；若流程需要兩種origin，拆成不同case與evidence，不合併計分。

### 29H.2 UI mutation provenance hard gate

- 每個successful `POST／PUT／PATCH／DELETE`保存觸發它的accessible UI target、browser input event、network initiator、correlation id、server route與DB writer ledger；一個write不得由多個case重複認領。
- 除QA-087-202／206的isolated non-2xx probe外，任何直接API、`page.evaluate` mutation、SQL write、cookie/token/storage注入或沒有UI action correlation的business write，使整run=`INVALID / FAIL`。
- UI操作前已存在的seed rows必須在before ledger；操作後只允許與本case expected相符的delta。reload、Back／Forward與第二tab不能產生未認領write。
- `prohibited-mutation-audit.json`不是執行者自述；由獨立integrity validator對actions、network、server與DB四份ledger做bijection與hash驗證。

### 29H.3 真實viewport、可見畫面與輔助科技

- full-page screenshot只能作補充，不能證明viewport沒有裁切。每個checkpoint另存actual viewport screenshot、`innerWidth/innerHeight/deviceScaleFactor/zoom`、document與每個scroll owner geometry、fixed/sticky bounds及focus target。
- 每個journey family至少由獨立QC在headed可見畫面重驗1440×900與390×844各一條；1024×768、320×800仍全量自動量測。任何可見`role=alert`、load failed、HTTP 4xx/5xx文字、route error或預期有資料卻全零立即FAIL。
- 關鍵dialog、task action、history返回、file retry、matrix dirty guard與pager至少使用一種實際輔助科技驗證；Windows優先NVDA。只有a11y tree或axe結果而無實際輔助科技證據時，QA-087-228只能`Not Verified`。
- screenshot、actions、network、DB readback與geometry必須有同一run/case/checkpoint hash chain；不得以不同時間、commit、role、company或fixture的畫面拼接。

### 29H.4 Same-origin、identity與evidence reuse negatives

- task `actionUrl`逐一測`javascript:`、protocol-relative、encoded external origin、backslash／double-encoding與合法same-origin exact route；拒絕時不能先navigation再返回。
- task、history、file、obsolete route逐一替換cross-company、cross-work、cross-revision、cross-task與不存在identity；必須fail closed且不可透過status、length、timing或UI文案洩漏存在性。
- 每份evidence只能對應registry允許的一個或多個明示assertion；若共用同一checkpoint，manifest需列出共享理由與相同precondition，不得把一條happy path複製成多案PASS。
- 獨立QC不重用RD runner的result判定函式；只讀immutable registry、raw ledgers與artifact hashes後重算結果。

### 29H.5 Gate ownership

| QA case | Stage | UI責任 | Exit |
|---|---|---|---|
| QA-087-221 | G0-A | registry fixture origin／allowed claim／mutation-ledger schema與planted invalid manifest | seeded terminal state不能冒充lifecycle；只證明控制可失敗，不計actual UI PASS |
| QA-087-225 | G4 | actual UI action與network/server/DB write provenance | prohibited mutation=0，四份actual ledger bijection |
| QA-087-227 | G4 | actual actionUrl與opaque identity negatives | same-origin／company／membership fail closed |
| QA-087-228 | G4 | actual headed visible QC、viewport geometry、實際輔助科技、artifact hash chain | 缺任一actual evidence即Not Verified |

G0-A必須先由`qa-integrity --stage preflight`以M03／M07／M09／M10證明上述控制可拒絕違規artifact；這些synthetic results只歸QA-087-224 self-test，不得使225／227／228提早PASS。所有UI family完成後，G4再由`qa-integrity --stage evidence`讀actual raw ledgers與artifact hashes重算225／227／228；G4 PASS後才可進current aggregate。QA主管仍須重新審查本修訂，文件ready或G4 runner結果都不等於QA plan已核准。

### 29H.6 2026-08-26 execution closure撤回

舊`94/94 PASS`、G4 `4/4`與aggregate `20/20`不符合本節actual-evidence契約，current效力撤回：舊UI-only runner只涵蓋48案且排除P11～P13，G4 raw evidence缺完整UI/network/server/DB bijection、320 viewport、每族headed證據與實際輔助科技。2026-08-26 repository `25/25 PASS`與negative `6/6 PASS`只證明其registry claims；current browser capability manifest按固定91案全部輸出NOT_RUN／FAIL，這是正確的fail-closed結果，且不得拿repository／negative結果代替UI journey。只有重新執行rendered journeys並保存同run hash chain後才可恢復225／227／228與aggregate計分。QA主管／Independent QC目前不可簽核完成。

## 30. DEV-090 current inline Relation matrix roster correction（2026-08-26）

### 30.1 Supersession boundary與分母控制

DEV-090已以`Intentional replacement`退役Relation current work／review／workspace／list；本文件§5.3的`R01..R14`只保留為`historical_supporting`，不得執行、不得改寫expected，也不得為了湊原51案而恢復已退役產品能力。current固定51案等量改為`D01..D24 + P01..P13 + I01..I14`，其中`I`代表Inline Relation Matrix；case ID migration為一對一`R01..R14 → I01..I14`、`currentDenominatorDelta=0`。`R15..R20`維持既有historical classification。

本節是§27.2、§27.3、§29與所有較早`D/P/R=51`敘述的後出權威修訂。browser runner必須逐案執行下列current contract；共用checkpoint只在manifest列出相同precondition與共享理由時可共用artifact，不能複製一條happy path成14案PASS。

### 30.2 I01..I14 current case definitions

| ID | Rendered UI journey | API／DB readback與反作弊exit |
|---|---|---|
| I01 | 分別從同root的Drawing與Part清單開drawer；兩邊只顯示一個`關聯矩陣`，無`直接關聯`區塊 | 兩detail的root、formal matrix與canonical hash完全相同 |
| I02 | Drawing production與RD列間切換 | revision／work切換不改matrix authority或內容，不顯示source layer |
| I03 | Part formal與current work列間切換 | 兩列顯示同一root正式矩陣；Relation work/task/review row delta=0 |
| I04 | 點`編輯關聯`在drawer原位進edit mode | 不導航到Relation route；進入edit時API mutation=0、DB hash不變 |
| I05 | 只用鍵盤操作同一cell的空白／製造／參考三態 | 三態名稱可被accessibility tree辨識且不只靠顏色；未儲存前API mutation=0 |
| I06 | 修改一或多格後取消 | draft全部消失並回view mode；links、ETag與receipt均無變化 |
| I07 | dirty時依序嘗試關閉、上下切列與返回 | 每種離開動作均出現unsaved guard；選擇留在原列保留draft且DB write=0 |
| I08 | 儲存一或多格 | 只有一次busy、單一PATCH與單一detail refresh；links與receipt同transaction，成功後回view mode顯示exact結果 |
| I09 | 以受控fault使儲存失敗 | draft保留、焦點移到可見錯誤，UI不混合舊新矩陣；links／receipt零partial write |
| I10 | 搜尋只有root、尚無圖號與料號的identity | `編號搜尋`只顯示最短root事實，不顯示矩陣或edit，也不發出第三個matrix GET |
| I11 | 從blank matrix建立第一筆link | cell可編輯並直接正式生效；task／review新增數=0 |
| I12 | 開啟只有單一axis的root | 不顯示空toolbar、disabled save或其他無效mutation入口 |
| I13 | 從矩陣圖號／料號identity分別前往canonical工作台並返回 | 不命中Relation list／workspace；返回後保留原drawer identity與root |
| I14 | 逐一驗證退役與舊入口路由：sidebar／全站文案、待辦／審核、search intent、owner intent、number-create intent、Relation intent | 圖料工作台visible copy／forbidden caller=0；direct edit不產生task/review；search→`編號搜尋`、owner→Drawing／Part、number-create→既有申請、Relation intent fail closed，無broken query／fallback |

### 30.3 Exit與證據

- 每案必須有rendered UI action、actual viewport、visible-error sweep、API／DB exact readback與artifact hash；I05另需accessibility tree，I08／I11另需UI→network→server→DB mutation bijection，I09／I14另需zero-write negative receipt。
- current browser名冊仍為91案：`D01..D24 + P01..P13 + I01..I14 + C01..C11 + 29 functional browser cases`；沒有縮小分母。
- 任一runner仍回報R01..R14為current PASS、缺任一I案、或同時把R與I計入current分母，均以`CASE_ROSTER_OR_TRACE_INCOMPLETE` fail closed。
