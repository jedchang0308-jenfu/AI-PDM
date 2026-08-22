# DEV-087 三工作臺全生命週期 AI UI-only 操作驗證計畫

建立日期：2026-08-22  
Owner：QA  
執行者：AI-QA Operator；結案者：獨立 AI-QC  
狀態：`QA Plan Ready / Human Confirmed / UI Execution Not Started / Local Isolated Only`  
母計畫：`.ai-doc/qa/qa-dev-087-status-data-rebuild-validation-plan-2026-08-21.md`  
產品權威：`.ai-doc/specs/SPEC-PDM-STATUS-DATA-REBUILD-001-canonical-workbench-state-and-branching.md`  
關聯權威：DEV-077 正式草稿／正式物件作廢；DEV-088 替代料號附件人工沿用

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
| `D01` | 無量產資料的新圖號建立第一份工作 | 只見 `研發版 0.1／負責人處理` | 新 branch、0.1 claim、work、canonical RD row 同 transaction 建立 |
| `D02` | 第一份 0.1 工作取消 | current row 消失，不顯示已取消 | work/claim/empty branch/RD row 移除，open count 回 0 |
| `D03` | 0.1 編輯、儲存、reload、再進編輯 | exact 0.1 資料與檔案仍在原 editor | 同 work row version 前進；正式資料仍不存在／不變 |
| `D04` | 0.1 送審後 reviewer 退回修改 | 回 `負責人處理`，退回後可編輯 | request/snapshot 清除、minimal trace +1、work 保留、formal 不變 |
| `D05` | 修改後重送並核准 0.1 | 先 `系統處理`，成功後為 idle `研發版 0.1` | approved claim/artifact 保留，work/request 清除，production 不建立 |
| `D06` | 同 branch 由 0.1 進版至 0.2 並核准 | branch 只顯示 latest `研發版 0.2` | predecessor=0.1；0.1 進歷史；open count 不變 |
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
| `GAP-UI-01` | 正式 Drawing／Part／root 在 active work、review_owner 或 system 時同時申請 whole-object obsolete | 要求權威先定義優先序；未定義前相關案例 BLOCKED，禁止用「先點到者贏」猜測 |
| `GAP-UI-02` | root aggregate obsolete 時，子 Drawing 尚有 open RD branch，或子 Part／Relation 有 active work | 要求 exact impact/cancel/stale 規則；未定義前 R18 BLOCKED |
| `GAP-UI-03` | `Merged` 沒有現行合法 UI 建立入口 | 只能驗證由合法 UI 既有資料導覽；不可 seed。無資料即 D27/P20/R20 BLOCKED |
| `GAP-UI-04` | `system_admin／blocked` 缺 deterministic、啟動前固定且不寫business data的 fault profile | C11 BLOCKED；不得改DB status或攔截response冒充 |

任一 gap 未關閉，不影響本計畫成為可執行 QA 契約，但會阻止「全生命週期已通過」結論。QA 執行前須在 run manifest 記錄 gap authority 版本；不得邊測邊改期望。

## 10. AI 執行波次

| Wave | 內容 | 退出條件 |
|---|---|---|
| `W0` | 本機隔離環境、build/schema/provider、read-only DB credential、五角色登入、測試檔 hash、禁止 production 檢查 | mutation target 明確為隔離 company；API/DB readback可用且唯讀 |
| `W1` | C01-C10 smoke；各工作臺從UI建立最小資料鏈 | provenance、triad collector、visible-error sweep先證明會在錯誤時FAIL |
| `W2` | D01-D11 單branch建立、退回、核准、進版、取消 | 0.1→0.2→1與1→1.1/2皆有三層證據 |
| `W3` | D12-D24 多branch、stale、void、race、filter/history | cap、claim、CAS、idempotency、artifact exactness全PASS |
| `W4` | P01-P17 Part正式／修改／附件／替代 | formal隔離、live attachment例外、DEV-088 snapshot全PASS |
| `W5` | R01-R15 Relation正式／調整／exact tree／drift | exact tree、singleton、review parity與atomic replace全PASS |
| `W6` | D25-D27、P18-P20、R16-R20 terminal治理 | reject/approve/direct obsolete/history/merged皆有結果；Blocked=0 |
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

本文件只代表計畫完成，尚未執行 67 條 UI journey，尚未產生全生命週期 QA/QC 結論。DEV-087 現有 focused runner PASS、DEV-074 歷史 58/58、DEV-088 focused PASS 都不能替代本計畫。

執行前先關閉 §9 的 contract／fixture gaps；執行時若任何 gap 仍存在，必須如實回報 BLOCKED，不能直接改資料或縮小分母。
