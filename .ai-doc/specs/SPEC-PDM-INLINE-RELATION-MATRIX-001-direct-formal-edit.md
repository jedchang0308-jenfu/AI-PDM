# SPEC-PDM-INLINE-RELATION-MATRIX-001：抽屜關聯矩陣直接編輯與正式關聯單一權威

Status: `RD Implementation Complete / Human Confirmed / Local QA-QC Complete / Production Release Gated`; `DEV-113-E Part Maintenance Direct Edit Local RD Implemented / RD Tech Lead Corrections Closed / P0-P1 Planning Gap 0 / Human Confirmed / Full QA-QC Passed 28/28 / Production Release Gated`
Date: 2026-08-23; amended 2026-09-01
Owner: Dev PM
DEV: `DEV-090` / `DEV-PDM-RELATION-WORKBENCH-REPLACEMENT-001`
Risk: High / P1
ADR: `.ai-doc/decisions/ADR-PDM-RELATION-EDITING-001-direct-formal-authority.md`
QA: `.ai-doc/qa/qa-dev-090-inline-relation-matrix-validation-plan-2026-08-23.md`

## 2026-09-01 DEV-113 Part-side placement amendment

Baseline Status：`Local RD Implemented / RD Tech Lead Corrections Closed / Human Confirmed / Historical QA-QC 28/28 / Production Release Gated`。本節原始placement完成紀錄保留為修正前基線；Part maintenance的目前activation契約由下列DEV-113-E治理。DEV-090的正式關聯authority、API、transaction、ETag、idempotency、permission、audit與立即生效語意全部保留。

### DEV-113-E Part maintenance immediate activation（Local RD Implemented）

Status：`Local RD Implemented / RD Tech Lead Corrections Closed / P0-P1 Planning Gap 0 / Human Confirmed / Full QA-QC Passed 28/28 / Prior 28/28 Baseline Retained / Production Release Gated / P1 / Medium`。

Implementation／QC receipt：`output/qa/dev-113/aggregate/report.json` G01～G04 PASS；browser `output/qa/dev-113/browser-real/DEV113-2026-09-01T13-27-51-231Z/report.json` B01～B12 12/12 PASS（1440×900、1024×768、390×844）。C01～C08、R01～R04及DEV-090／096／099／108 parent regression均PASS；same-key response-loss、409／412 stale recovery、Drawing explicit activation、附件lazy-load競態與單一零件BOM空狀態導向均有逐案證據。`productionWrites=false`，primary snapshot before/after相同，task-owned runtime／fixture／port／dist已清理；PostgreSQL／production migration／deploy／activation／release仍gated。

Spec Impact：`Intentional replacement + compatible preservation`。

1. `/parts/[partId]/workspace?tab=maintenance`已是明確維護context；exact active Part work的server row action只有`key="edit"`可解鎖relation manage，parent再傳`mode="manage"`。`create_change／review／cancel_work／request_obsolete`全部fail closed；Part workspace不顯示`編輯關聯`，進頁本身仍是zero mutation。
2. Shared presenter固定提供`activationMode?: "explicit" | "immediate"`且default=`explicit`。Part maintenance唯一使用`immediate`；Drawing drawer維持default explicit及`編輯關聯`，本SPEC §5.1～5.3的drawer view/edit規則仍治理Drawing。
3. Immediate不等於autosave：cell change先保存在browser draft，只有`儲存關聯`可呼叫既有single formal PATCH；`取消`只丟棄draft。Normal dirty dock只有save/cancel，save／cancel後Part maintenance仍保持edit-ready。
4. Shared component以`rootId + matrixEtag + stable-sorted changes`形成logical command fingerprint，第一次save配置一個UUID。network／timeout／5xx後鎖定payload並以同key同payload顯示`重試確認儲存結果`；success receipt後若GET readback失敗，只能`重新載入已儲存結果`，不得再次PATCH。
5. Dirty cell須有非色彩唯一標記與accessible state。Stale 409／412保留draft、禁用舊ETag save並顯示單一`放棄草稿並載入最新資料`；使用者執行後由Part parent optional reload callback取得最新matrix／ETag並留在edit-ready。其他definitive 4xx依zero-write terminal處理；離頁／切tab沿用DEV-113 dirty guard。
6. Permission仍由server row action descriptor決定；無exact `edit` action、root或完整axes時fail closed為readonly，不顯示disabled假入口。Part parent不得以`edit_relation_matrix`、client role或workId存在自行解鎖，也不得複製第二套relation state/save邏輯。
7. `上傳圖片`、分類、附件上傳與BOM是各domain command，不屬relation activation gate；不納入本次移除。
8. Exact `9 modify + 0 add + 0 delete` code/runner boundary、SHA ledger、slices與fixed 28案完成門檻以entity-detail主SPEC的DEV-113-E節及DEV-113 QA為權威；B01～B12已各自產生named record與artifact，current aggregate=`28/28 PASS`。BOM空狀態僅補原因文案與maintenance tab導向，不改assembly-only eligibility或BOM writer。

ADR：`No New ADR`。既有`.ai-doc/decisions/ADR-PDM-RELATION-EDITING-001-direct-formal-authority.md`繼續治理single formal writer；若需要autosave、新writer、permission、schema或讓Drawing也改為immediate，立即停止重做Spec Impact／ADR。

### DEV-113-A～D placement baseline（historical）

Spec Impact：`Intentional replacement planned + compatible preservation`。

1. DEV-113原始target state中，Part drawer改為readonly-data／zero inline-data mutation，不再於drawer內進入relation matrix edit mode；Part側relation editor移至`/parts/[partId]/workspace`的`即時維護`頁籤。其後activation由上列113-E改為edit-ready，不再保留第二層`編輯關聯`。
2. Drawing drawer不在DEV-113範圍，仍沿用本SPEC現行placement與行為。
3. Part workspace內的relation matrix仍讀寫同一root-level `drawing_part_links` formal authority，明確`儲存`後立即生效，不建立Relation work、review request或第二份current projection。
4. 本SPEC §5.1～5.3、§13、§16、§18中「Drawing／Part drawer」的共同placement敘述，在DEV-113完成實作及targeted QA/QC後，對Part側改由本amendment與`SPEC-PDM-ENTITY-DETAIL-DRAWER-001`的DEV-113節治理；Drawing側及所有非placement規則維持原文有效。
5. Repository assessment確認不需改本SPEC writer：Part workspace會以matrix response新增的exact `sourceRowKey`惰性讀取既有canonical detail，再把同一`CanonicalRelationMatrixProjection／contractToken`交給shared `canonical-relation-matrix-section.tsx`與既有matrix PATCH。Part drawer只傳`editable=false`，Drawing drawer仍傳現行editable capability。
6. Relation仍是root-wide authority，不因workspace entry是exact Part而縮成單列；UI固定標示`{rootCode} 全根號圖料關聯`。其他preview／classification／attachment／BOM才是exact source Part scope。
7. DEV-113 exact implementation boundary、dirty SHA、演算法與固定28案QA位於entity-detail主SPEC與`.ai-doc/qa/qa-dev-113-part-workbench-single-edit-entry-validation-plan-2026-09-01.md`。Part drawer與workspace placement的修正前基線曾完成28/28；113-E直接編輯尚未執行QA，正式provider／migration／release仍維持gated。

ADR：`No New ADR`。既有`.ai-doc/decisions/ADR-PDM-RELATION-EDITING-001-direct-formal-authority.md`繼續是single formal writer決策權威；若後續設計要求改writer、合併Part review transaction、新permission或新schema，立即停止並重做ADR判定。

## 1. 目標與成功結果

當圖號與料號抽屜已能顯示同一圖料根號的完整關聯矩陣時，取消重複的圖料工作台、Relation工作資料與Relation審核流程。使用者在圖號或料號抽屜內直接編輯矩陣，明確按下`儲存`後立即更新正式關聯。

成功結果：

- 人類只看到`關聯矩陣`與`空白／製造／參考`，不再看到`正式關聯／調整中／負責人處理／審核負責人處理`。
- 圖號與料號抽屜讀寫同一root-level Relation authority，沒有兩套projection或兩份可寫資料。
- 一次儲存是一個原子transaction；成功時全部生效，失敗時全部不生效。
- 不建立Relation work、review request、review snapshot、approval task或async formalization。
- 圖料工作台退役後，圖號、料號與圖料根號仍可被搜尋；空根號仍可達。
- 現有Drawing與Part的版本、修改、審核、附件及處理狀態流程完全不受影響。

## 2. Spec Impact 與權威邊界

分類：`Intentional replacement`。

本SPEC在DEV-090 activation後有意取代：

- DEV-087中Relation formal/work雙列、`relation_change_works`、Relation submit/review/formalize、Relation handling與Relation工作臺filter契約。
- DEV-089中由Relation list row開啟Relation drawer查看矩陣、Relation drawer作為矩陣owner surface的契約。
- DEV-090 Brief中「矩陣唯讀後導向專用Relation editor/reviewer」的早期方向。

繼續保留：

- `drawing_part_links`是正式圖號－料號關聯唯一storage；formal authority repository是唯一runtime read/write authority。
- `CanonicalRelationMatrixProjection`的圖號欄、料號列、空白／製造／參考語意。
- same-company、same-root、identity、pair與主要製造圖唯一性檢查。
- Drawing／Part既有work、review、file、preview、history與permission契約。
- DEV-087已完成的歷史Relation review trace與approved snapshot作唯讀domain evidence，不再驅動current UI或command。

DEV-090本機實作、資料驗證與Relation retirement gate已通過；現行本機runtime採canonical-only direct matrix。正式Cloud SQL migration、provider parity、正式切換與release仍維持gated，不能以本機證據代替正式資料零遺失證據。

文件內部權威固定如下：第1～16節是產品行為、資料與驗收的normative contract；第17～22節只把相同契約綁定到目前repository、path、phase與command。後段不得自行創造不同產品規則；任何修改若影響兩層，必須在同一變更中同步，禁止以重複段落形成第二份權威。

## 3. Human Decision Brief

### 採用

- 圖號與料號抽屜內直接編輯關聯矩陣。
- 明確進入編輯模式，一次`儲存`後立即更新正式資料；不送審。
- 圖料工作台、Relation work、Relation review與專用Relation workspace退役。
- 基本登入、公司邊界、既有update permission、資料完整性與並行保護仍保留。

### 不採用

- 保留第三個圖料工作台作日常瀏覽。
- 矩陣唯讀後另開Relation調整頁。
- 每格變更立即autosave。
- 先存調整中再由另一角色審核。
- 刪除Relation domain或把關聯資料複製到Drawing／Part資料表。
- 為本功能新增細分角色、作弊偵測、雙寫或永久相容層。

## 4. UX Intent

- 任務／結果：使用者在查看圖號或料號明細時，直接確認及修正該根號完整圖料關聯；一次儲存後正式資料一致。
- 主物件／主焦點：完整關聯矩陣；view mode只有矩陣，edit mode只有矩陣與單一主要動作`儲存`。
- 預設刪除：圖料工作台、直接關聯區、Relation資料層標籤、處理狀態、work/review CTA、helper card、統計badge、技術ID、audit、來源與第二層workspace。
- 保留舉證：`編輯關聯`用於避免檢視時誤觸；`儲存／取消`用於建立明確commit boundary；三態名稱用於避免只靠色彩或不可發現的循環點擊。
- 非語言修復：view/edit以控制狀態、cell affordance與就地dirty狀態區分；不以常駐說明文字補救。
- 風險與驗證：stale version、重複提交、主製造圖衝突、跨root、transaction failure、窄版horizontal overflow、drawer keyboard navigation與screen reader。

## 5. 人類 UI 與互動契約

### 5.1 Drawer placement

- Drawing與Part detail presentation固定以`關聯矩陣`取代既有`直接關聯`段落。
- Drawing production、Drawing RD、Part formal與Part work列都顯示該entity所屬root的同一份目前正式矩陣；關聯不隨Drawing revision或Part work分支。
- 一個drawer只顯示一次矩陣；不得同時顯示直接關聯清單、正式／調整中兩張矩陣或第二個關聯摘要。
- Matrix在drawer內是唯一水平overflow owner；不得讓整頁與drawer同時產生水平捲動。

### 5.2 View mode

- 預設唯讀，cell只顯示空白、`製造`或`參考`。
- 有server action descriptor時顯示一個`編輯關聯`；沒有合法action時矩陣維持唯讀且不顯示disabled假入口。
- 圖號／料號identity可導向各自canonical工作台並保留安全`returnTo`；不導向已退役圖料工作台。
- 正常狀態不顯示`已儲存`、資料來源、版本token、最後編輯者或操作教學。

### 5.3 Edit mode

- `編輯關聯`只在目前drawer內切換edit mode，不開新頁、不開modal、不建立server work row。
- 每格是明確三態輸入：`空白`、`製造`、`參考`；不得以不可見循環點擊或顏色作唯一操作／狀態訊號。
- 只能編輯server投影出的same-root圖號與料號交叉cell。axis identity歸屬由編號生命週期管理，矩陣不能新增、移動或改號。
- cell變更只存在browser memory；在按下`儲存`前不得呼叫mutation API。
- action dock只保留primary `儲存`與secondary `取消`。無dirty change時`儲存`不可提交；`取消`丟棄全部browser draft並回view mode。
- edit mode切換drawer row、關閉drawer、返回或重新整理時若有dirty change，使用既有unsaved-change guard；不得靜默遺失或自動套用。

### 5.4 Save result

- `儲存`是使用者對本次直接正式變更的唯一commit確認，不再增加審核或第二次確認。
- 成功收到server compact receipt後，以`cache:"no-store"`重抓Drawing／Part exact detail，再用回傳的exact matrix原子取代本地資料、離開edit mode並恢復cell／action focus；成功訊號短暫且不得建立常駐panel。
- 失敗時保留browser draft與edit mode，就地顯示一項人類可理解錯誤並將focus移到錯誤；不得部分刷新成混合資料。
- stale conflict不得自動merge或覆蓋。使用者重新載入最新矩陣後再重做變更。

### 5.5 Empty and partial roots

- 全域編號搜尋必須找得到只有root、無Drawing、無Part或完全沒有子項的空根號。
- root有Drawing與Part但沒有link時顯示全空白矩陣，可直接建立第一個cell關聯。
- root只有單一axis或完全沒有axis時顯示最短事實`目前沒有可建立關聯的圖號與料號`，不顯示空toolbar或disabled儲存。
- 建立Drawing／Part或調整其root identity仍走既有編號流程，不在本矩陣擴張。

## 6. Domain 與資料契約

### 6.1 Single authority

- `drawing_part_links`繼續保存正式link；一個pair在新target state最多一列，`link_type`只允許`primary_manufacturing|reference`。
- 單一資料表不足以稱為單一權威；所有會新增、改型或刪除正式link的runtime flow，必須經同一`RelationFormalAuthorityRepository`與同一root lock protocol。禁止其他repository、service、migration後日常runtime或raw SQL直接寫`drawing_part_links`。
- authority提供可在既有transaction內呼叫、不得自行巢狀開transaction的typed primitives：`lockRootInClient`、`readCanonicalMatrixInClient`、`applyMatrixChangesInClient`、`replaceRootLinksInClient`、`upsertPairInClient`與必要的root-delete helper。直接矩陣、編號建立／進版、替代料號、主圖恢復與其他正式化流程都只能組合這些primitives。
- 寫入鎖定順序固定為root authority row → Drawing IDs字典序 → Part IDs字典序 → link pairs字典序。SQLite使用同一`BEGIN IMMEDIATE` write serialization；PostgreSQL以root `FOR UPDATE`及相同排序鎖定，避免不同flow互鎖或繞過stale檢查。
- 一個Part最多一個`primary_manufacturing` link；reference不限數量，但同pair不得同時是primary與reference。
- Drawing與Part的`part_root_id`必須等於request root；company也必須完全一致。
- 不新增`part_roots.relation_row_version`或第二套current-state欄位。optimistic concurrency使用由root、兩軸identity／狀態與正式links canonical serialization計算的strong `matrixEtag`；它是transport token，不進一般UI。
- `matrixEtag`必須包含`companyId`、`rootId`、root status、依穩定順序排列的Drawing／Part ID、number、record status及link pair／type。相同內容在SQLite與PostgreSQL必須得到相同SHA-256；任一axis、狀態或link改變都自然使舊token失效，因此既有／未來正式writer不需維護額外counter。
- `drawing_part_links`新增資料庫級`UNIQUE(drawing_number_id, part_number_id)`；既有每Part一張primary partial unique index保留。migration在建立pair unique前必須先證明dual-type pair=`0`，不得自動選一列保留。
- API／domain enum固定為`manufacturing_basis|reference`，storage enum固定為`primary_manufacturing|reference`。只有formal authority repository可匯出並使用`toStoredLinkType`／`fromStoredLinkType`做一對一mapping；其他module不得出現inline ternary或把DB enum暴露到DTO／UI。

### 6.2 New writes

新流程不得建立：

- `relation_change_works`
- `canonical_workbench_states.entity_type='relation'`的work/current UI row
- `pdm_work_review_requests`的Relation request
- Relation review snapshot、approval inbox item或numbering task
- 新的`relation_approved_change_snapshots`

每次成功直接儲存只使用既有通用command receipt／audit infrastructure留下最小操作證據：event identity、company、root、actor、timestamp、request hash與result version。它不保存第二份current tree、不進一般UI，也不得成為rollback或read authority。

### 6.3 Historical evidence

- DEV-090 activation前已完成的Relation minimal review trace與approved before/after snapshot是歷史domain evidence，唯讀保留並與current path隔離。
- 新直接編輯不新增review count、approval time或approved snapshot。
- 歷史資料保留不構成legacy fallback；runtime、projection與mutation不得讀它來決定目前矩陣。

## 7. Read Projection Contract

`CanonicalRelationMatrixProjection`調整為只代表目前正式root資料：

```ts
type CanonicalRelationMatrixProjection = {
  rootId: string;          // transport only，不顯示
  rootCode: string;
  matrixEtag: string;      // strong concurrency token，不顯示
  drawings: Array<{ id: string; number: string }>;
  parts: Array<{ id: string; number: string }>;
  cells: Array<{
    drawingNumberId: string;
    partNumberId: string;
    relationType: "manufacturing_basis" | "reference";
  }>;
  actions: Array<{ key: "edit_relation_matrix"; label: "編輯關聯" }>;
};
```

- 移除`sourceLayer:"formal"|"work"`；新target沒有work matrix。
- Drawing與Part detail discriminated union各增加`relationMatrix`，不得由client使用`directRelations`重新組裝。
- matrix identity與cells由同一bounded repository projection產生；Drawing／Part adapter只傳入company/root/actor context。
- list endpoint不載入矩陣；只有exact drawer detail載入，避免清單N+1。
- root、drawing、part排序使用既有number comparator與stable ID tie-breaker；兩個drawer看到相同root／`matrixEtag`時payload hash必須相同。

## 8. Direct Mutation API

### 8.1 Route

`PATCH /api/pdm/relations/[rootId]/matrix`

必要headers：

- authenticated session與company context
- `If-Match: "<matrixEtag>"`
- `Idempotency-Key: <opaque key>`
- `X-PDM-Workbench-Contract: <server contract token>`

Request只傳changed cells，不回送完整matrix：

```ts
type UpdateRelationMatrixRequest = {
  changes: Array<{
    drawingNumberId: string;
    partNumberId: string;
    relationType: "manufacturing_basis" | "reference" | null;
  }>;
};
```

規則：

- `null`代表清除該pair關聯；同request的pair不可重複。
- empty changes固定422；單次上限為目前矩陣`drawings.length × parts.length`，且全域hard cap為2,500個changed pairs。超過目前cell數或2,500固定413，不允許client拆成多次自動提交以規避atomicity。
- server不得接受root code、number text、actor、company、label、handling、source layer或完整raw tree作權威輸入。
- success固定回`{data:{rootId,changedCount,matrixEtag},meta:{correlationId}}`。command receipt只保存這份compact stable result；前端成功後以`cache:"no-store"`重抓目前detail，避免把完整矩陣複製進receipt。

### 8.2 Server validation

依序驗證：

1. session、company、page-neutral relation read entitlement、既有`numbering.workspace.update` permission與server action descriptor。
2. contract token、idempotency scope與strong `If-Match`格式。
3. root存在且same company，未處於obsolete／merged或既有whole-object terminal restriction。
4. 全部Drawing／Part存在、same company、same root且非terminal不可用identity。
5. 每個pair最多一個target state；套用整批changes後每個Part最多一張主要製造圖。
6. 既有BOM、released artifact或其他受控依賴guard若禁止移除／改派，整批拒絕；不得因取消審核而繞過domain invariant。
7. changed result與目前值完全相同時回成功no-op、`matrixEtag`不變且不新增receipt／audit noise。

## 9. Transaction、Concurrency 與 Failure Contract

一個save transaction：

1. 以SQLite `BEGIN IMMEDIATE`或PostgreSQL `SERIALIZABLE` transaction進入command，並由formal authority依固定lock order鎖exact `part_roots` authority row與必要identity／pair；其他正式writer使用完全相同的root-first protocol。
2. 在transaction內重讀完整canonical matrix並重算strong ETag；與`If-Match`不一致回409且零write。
3. bounded batch讀取全部target identities、目前受影響links與primary-per-part集合。
4. 驗證套用後完整invariant。
5. 對changed pairs先刪除pair既有link，再只為非null target插入一列；所有SQL在同一transaction。
6. 有實質變更時寫最小command receipt，重讀commit candidate、計算result `matrixEtag`後一併commit；前端再由detail讀目前exact matrix。

規則：

- transaction、constraint、permission、company、stale或dependency guard失敗時，links／receipt全部不變。
- 相同idempotency key＋相同normalized request重送回同一stable result；同key不同payload回`IDEMPOTENCY_KEY_REUSED`。
- 兩個Drawing／Part drawer同時編輯同root時，只允許第一個符合version的save成功；第二個固定stale，不做last-write-wins。
- request timeout後client以相同idempotency key重送，取得同一compact receipt後重抓detail，不得生成第二次effect。
- 不提供自動merge、autosave retry、background formalization、manual approval retry或假rollback UI。

## 10. 權限與安全邊界

- Read沿用Drawing／Part exact entity policy；matrix route的actor resolver不得綁死`numbering.search`頁面。authenticated actor只要具`numbering.drawings.view`或`numbering.search`其中一個source read entitlement，再通過same-company exact root/entity read check，即可取得頁面中立的matrix read context。
- Edit不新增細分角色；固定要求`numbering.workspace.update`及same-company exact root/entity read，server descriptor才可顯示`編輯關聯`。本矩陣不屬Drawing draft，禁止額外要求`numbering.draft.update`，也不使用owner／non-owner身分產生另一套關聯權限。
- anonymous固定401；cross-company與不可見entity固定404/403且不得洩漏存在性。
- 本期依使用者要求不建立反作弊、惡意payload側通道偵測或雙人覆核；正常auth、company、permission、input validation、concurrency與transaction integrity仍是必要穩定性邊界。
- audit、actor ID、version、internal root ID、request hash與correlation ID不進一般UI文字、tooltip或accessible name。

## 11. Search 與入口取代

- 側邊導覽移除`圖料工作台`，保留`圖號工作台`、`料號工作台`、`我的待辦`與`審核工作台`。
- `/numbering/search`保留但產品名稱固定為`編號搜尋`，不得再渲染`CanonicalPdmWorkbench entityType="relation"`；它是最小identity search result surface，不擁有矩陣、drawer、編輯、formal/work列、filter或keyboard owner。
- 全域編號搜尋支援root code、drawing number、part number與名稱；root result即使沒有Drawing／Part也必須出現。
- root result只提供root identity與既有Drawing／Part owner入口；空root只顯示最短事實，不提供矩陣或edit。矩陣read/edit只存在Drawing／Part drawer，且不新增root matrix GET route。
- caller分流固定為：合法查詢caller保留`/numbering/search`但文案改為`編號搜尋／查詢編號`；已知Drawing／Part owner的返回連結改到相應canonical工作台；`tab=reserved`等編號建立意圖改到既有編號申請／建立route；Relation detail/work/review owner intent不得靜默降級為搜尋，必須改寫到canonical owner或fail closed。
- 我的待辦與審核工作台不產生或顯示DEV-090 activation後的新Relation工作；歷史已完成審核仍只在後端稽核證據中保留。

## 12. Retirement 與資料切換

### 12.1 Activation preconditions

DEV-090 activation前固定要求：

- `active_relation_work=0`
- `pending_relation_review=0`
- `relation_apply_failed=0`
- 同pair同時primary＋reference的`ambiguous_pair=0`
- 每個Part多重primary=`0`
- source/target root、link、PK/FK、company與內容hash reconciliation=`100%`
- `unresolved=0`

不得自動核准、套用或捨棄任何尚未核准的Relation work。正式環境若存在active work，維持舊流程並阻止DEV-090 cutover，直到使用者透過當時合法UI完成或取消；本機開發fixture可依既有本機資料清理授權移除。

### 12.2 ETag 與 target schema migration

- 不搬移Relation formal canonical row version，也不建立target counter；converter只在source snapshot與target schema上各自重算canonical matrix hash，兩者必須逐root相同。
- PostgreSQL target migration固定為`db/postgres/043_inline_relation_matrix.sql`；SQLite target schema由`db/schema.sql`的DEV-090 marker定義，既有本機DB由`scripts/migrate-dev-090-inline-relation-matrix.mjs`在單一transaction重建受影響shared tables。
- 043在同一transaction先檢查active Relation work／review／apply_failed、dual-type pair、multi-primary及orphan；任一非0即`RAISE EXCEPTION`，不得先刪後查。
- target建立`UNIQUE(drawing_number_id, part_number_id)`，保留primary-per-Part partial unique；移除Relation current rows／aggregates、`relation_change_works`與shared current-table中的Relation request／layer允許值。`pdm_review_traces.entity_type='relation'`、`relation_approved_change_snapshots`與既有`platform_command_receipts`歷史列保持原值與唯讀／append-only保護。
- Relation formal canonical row只在root、formal link及hash reconciliation完成後移除；completed approved snapshots與minimal review traces不得遺漏或被current code讀取。
- 已套用的041／042 migration檔不可修改；DEV-090只用043 forward migration，並更新`db/postgres/README.md`的order、re-run與rollback說明。

### 12.3 Caller retirement

替代入口與資料gate通過後移除：

- sidebar `圖料工作台`
- Relation list/detail route與`CanonicalPdmWorkbench entityType="relation"`
- Relation formal/work filter與layer option
- Relation create/edit/submit/cancel workspace route及ownerHref
- Relation review descriptor、approval adapter、task adapter與async formalization caller
- `relation_change_works` current-state repository/service/projector與無歷史讀取責任的schema
- legacy fallback、410 compatibility route與worker/script caller

Retirement scanner須涵蓋runtime、navigation、API、repository、worker、script、test fixture與文件中的active caller allowlist；注入任一舊caller時必須FAIL。歷史evidence名稱或migration reader不得被誤算為current caller。

`/numbering/search`本身可保留，但retirement gate必須區分「合法編號搜尋」與「已退役圖料工作台語意」。可見`圖料工作台／回圖料工作台／查圖料`、`entityType="relation"`、Relation ownerHref及Relation list/detail/workspace intent一律為forbidden；search query只允許新search contract明列的`query`、entity type、sort與limit，舊`detail=root:*`、`root=`、`history=include`、layer/work/review query不得留作隱性相容。

Activation完成後，DEV-087／089及其父SPEC內Relation formal/work/review/workbench的active條款必須改標`Historical / Superseded by DEV-090`或移入archive；`documentation_map.md`與`cold-start.md`只可把DEV-090 SPEC／ADR／QA列為current Relation authority。不得長期只靠future amendment banner讓新舊兩套契約同時看似active。

## 13. Error Contract

| Code | HTTP | 人類結果 | Partial write |
|---|---:|---|---|
| `RELATION_MATRIX_VERSION_CONFLICT` | 409 | `關聯已更新，請重新載入後再編輯` | 禁止 |
| `RELATION_MATRIX_PAIR_DUPLICATED` | 422 | `同一圖號與料號只能有一種關聯` | 禁止 |
| `RELATION_MATRIX_PRIMARY_CONFLICT` | 409 | `同一料號只能有一張主要製造圖` | 禁止 |
| `RELATION_MATRIX_ROOT_MISMATCH` | 422/404 | `圖號或料號不屬於此圖料根號` | 禁止 |
| `RELATION_MATRIX_DEPENDENCY_BLOCKED` | 409 | 顯示一項可理解的受控依賴原因 | 禁止 |
| `RELATION_MATRIX_CHANGE_LIMIT` | 413 | `單次變更過多，請縮小範圍` | 禁止 |
| `RELATION_MATRIX_CONTRACT_EXPIRED` | 409 | `資料已更新，請重新載入` | 禁止 |
| `IDEMPOTENCY_KEY_REUSED` | 422 | `本次操作未執行` | 禁止 |
| unauthorized／cross-company | 401／403／404 | 無權限或不存在 | 禁止 |

所有error envelope固定含safe message與server-generated correlation ID；不得回raw SQL、stack、internal actor或hidden status。

## 14. 效能、RWD 與 Accessibility

- Drawing／Part list statement count不得因矩陣增加；matrix只在exact detail載入。
- Drawing detail與Part detail各允許最多增加2個fixed statements，且statement count不得隨drawing／part／cell數成長；禁止逐cell query。
- save使用bounded identity/link reads與batch delete/insert；statement count不得隨changed cell逐筆成長。
- 50×50（2,500 cell）先使用原生semantic table與單一bounded wrapper，不因推測引入virtualization dependency。Focused browser gate固定量測：開啟矩陣至可互動p95≤500ms、cell操作回饋p95≤100ms、view/edit切換p95≤300ms，且無>200ms long task；只有原生table任一gate失敗時才實作內部row／column windowing，並維持headers、sticky axis、focus、keyboard與screen-reader語意，不得改成資訊不等價卡片。
- drawer寬度偏好、上下鍵切列、Escape、focus restore與既有list selection繼續有效；edit mode有dirty change時不得被快捷鍵靜默切走。
- table、row/column header、cell accessible name、edit control、error live region與visible focus完整；狀態不得只靠顏色。
- desktop與窄版只由matrix wrapper水平捲動；sticky action dock不得遮住最後一列或鍵盤焦點。

## 15. Acceptance 與 Evidence Gate

1. Drawing與Part drawer對同一root／`matrixEtag`回傳及顯示相同matrix hash。
2. `直接關聯`、Relation layer/status/work/review資訊在新UI為0。
3. edit mode三態可用滑鼠與鍵盤完成；取消、關閉dirty guard與error recovery符合契約。
4. 儲存後不經review立即更新`drawing_part_links`與兩種drawer；task／approval新增數皆為0。
5. stale、雙擊、response loss、constraint與fault injection皆為exactly-once或零write，無partial matrix；內容回到相同target時ETag可相同，因目前可觀察authority亦相同。
6. primary-per-part、pair唯一、same-root/company、terminal identity與dependency guard前後端一致。
7. root-only可由`編號搜尋`辨識但不擁有矩陣；單axis、空matrix、一般matrix及50×50矩陣在Drawing／Part drawer可讀、可操作且無N+1。
8. Drawing／Part既有版本、work、review、preview、history、附件、上下鍵與drawer寬度沒有回歸。
9. SQLite與PostgreSQL schema、canonical hash、repository、transaction、constraint與projection parity通過。
10. activation reconciliation 100%、unresolved=0、active Relation work/review/apply_failed=0，歷史evidence筆數與hash一致。
11. Relation workspace/list/review/task/ownerHref/runtime writer caller=0、可見`圖料工作台`文案=0、orphan root/work=0；全部保留`/numbering/search` caller均有明確合法分類，negative injection使retirement gate失敗。
12. 兩輪fresh browser session的UI、API與DB一致，console error、network 5xx與cache dependency為0。

證據分層：本機focused contract／SQLite repository／mutation／migration dry-run／retirement negative-injection／authenticated Chromium drawer journey均已通過，詳見QA-DEV-090與`output/qa/dev-090-browser/evidence.json`；正式PostgreSQL provider parity、正式migration reconciliation、兩輪production-like fresh session與release smoke尚未執行，因此本SPEC只宣稱Local QA-QC Complete，不宣稱Production Ready。

## 16. Scope、Out of Scope 與執行邊界

### Current scope

- Drawing／Part drawer matrix read/edit。
- direct formal mutation、concurrency、idempotency、validation與minimal receipt。
- root search與empty-root可達性。
- Relation workbench/work/review/workspace retirement與資料切換gate。

### Out of scope

- Drawing、Part或BOM lifecycle變更。
- 修改Drawing／Part所屬root、建立編號或改號。
- 公開分享、BOM export、辨識worker內部讀取。
- 新角色／權限平台、反作弊、完整關聯歷史UI、undo／restore產品。
- 本輪production migration、deploy、release或正式資料操作。

### Execution boundary

本文件已達`RD Implementation Complete / Local QA-QC Complete / Production Release Gated`。090-A～090-E已在本機完成產品code、API、SQLite migration runner、退役掃描與focused evidence；沒有執行正式資料庫遷移、production data delete、provider cutover、stage／commit／merge／PR、deploy或release。後續只可依第17～22節在獲授權的隔離PostgreSQL restore target完成provider parity與zero-loss rehearsal；正式Cloud SQL migration、cutover與release仍須另取得明確授權。

## 17. Actual Repository Impact

以下為2026-08-23依commit `c759a7bb`與目前dirty worktree盤點後的實作邊界。RD不得以同名新頁或第二套repository迴避這份清單。

### 17.1 新增

| Path | Responsibility |
|---|---|
| `src/lib/repositories/relation-formal-authority-async-repository.ts` | 唯一formal matrix read／hash／lock／write authority；提供in-transaction typed primitives與domain/storage enum mapping |
| `src/lib/pdm-relation-matrix.ts` | direct command service、page-neutral actor resolution、permission、contract token、idempotency、error mapping |
| `src/app/api/pdm/relations/[rootId]/matrix/route.ts` | Next App Router `PATCH` BFF；`runtime="nodejs"`、native `Request`、async params、private no-store |
| `src/components/relation-matrix-section.tsx` | Drawer view/edit state、browser draft、dirty guard、PATCH及detail refresh協調 |
| `src/components/numbering-global-search.tsx` | `/numbering/search`的最小root／Drawing／Part搜尋結果，不擁有Relation workbench |
| `db/postgres/043_inline_relation_matrix.sql` | pair唯一約束、Relation current schema retirement與fail-closed preflight |
| `scripts/migrate-dev-090-inline-relation-matrix.mjs` | SQLite／PostgreSQL provider-aware inventory、canonical hash reconciliation與本機SQLite transaction migration；production不可由此script apply |
| `scripts/qc-dev-090-{contract,repository,mutation,migration,retirement,browser,aggregate}.mjs` | focused evidence runner；aggregate只彙總可重現證據 |

### 17.2 修改

| Path | Exact change |
|---|---|
| `db/schema.sql` | 新增DEV-090 target marker；pair unique；移除Relation current work／state／review允許值，保留historical trace／snapshot |
| `db/postgres/README.md` | 043 order、041/042不可改、rehearsal、rollback與production authorization boundary |
| `src/lib/db.ts` | `ensureDev090InlineRelationMatrixSchema` marker／column-table rebuild入口；不得在未通過preflight時自動清除active work |
| `src/lib/pdm-canonical-workbench-contract.ts` | `WorkbenchEntityType`縮為Drawing／Part；matrix加入rootId／matrixEtag／action；Drawing／Part typed presentation各直接含matrix；移除Relation presentation、sourceLayer、directRelations與Relation layer |
| `src/lib/pdm-canonical-workbench.ts` | Drawing由`drawings.part_root_id`、Part由`part_numbers.part_root_id`呼叫同一matrix repository；刪除client-facing direct relation與formal/work分流 |
| `src/lib/repositories/pdm-canonical-workbench-async-repository.ts` | 移除Relation domain SQL、layer map、work join與list/detail caller；Drawing／Part list budget不變 |
| `src/lib/repositories/numbering-async-repository.ts` | `create/add/link/maintain/main_drawing_restore/root delete`等formal link mutation改呼叫formal authority in-client primitives；移除本檔raw link DML constants與私有writer |
| `src/lib/repositories/number-state-flow-async-repository.ts` | 編號正式化／promotion建立links時先取得同一root lock並呼叫formal authority，不直接INSERT |
| `src/lib/pdm-change-control-domain.ts` | 替代料號連回來源Drawing時使用formal authority；不得直接INSERT link |
| `src/lib/repositories/numbering-repository.ts` | sync legacy formal link writer需先證明runtime caller=0後刪除；若仍有caller，該flow必須移到async authority，禁止維持第二套sync SQL writer |
| `src/lib/pdm-canonical-workbench-state.ts` | 移除Relation create/edit/review action與ownerHref；只保留Drawing／Part lifecycle |
| `src/lib/pdm-canonical-command.ts` | 抽出明確`runCanonicalIdempotentCommand(commandName)`；既有DEV-087 wrapper維持Drawing／Part相容，DEV-090 receipt使用`pdm.relation_matrix.update.v1` |
| `src/lib/pdm-workbench-authority-control.ts` | schema hash升為`dev090-v1`並與043切換一致；旧hash不得在target app下放mutation token |
| `src/lib/repositories/pdm-work-review-async-repository.ts` | active request kind／entity type移除Relation；historical `pdm_review_traces`型別另行保留Relation |
| `src/app/api/pdm/review-requests/[requestId]/route.ts` | 移除Relation readonly review projection分支 |
| `src/app/api/pdm/review-requests/[requestId]/decisions/route.ts` | 移除`RelationChangeWorkService` import與decision dispatch |
| `src/components/canonical-pdm-workbench.tsx` | DOMAIN_CONFIG只保留Drawing／Part；drawer用`RelationMatrixSection`取代直接關聯；dirty時close、pointer-outside、上下鍵、Escape及row click統一經discard guard |
| `src/components/relation-matrix-table.tsx` | typed ID-based cell map、view/edit三態control、row/column header與accessible name；不持有server authority或fetch |
| `src/components/canonical-change-workspace.tsx` | generic workspace只保留Part；移除Relation endpoint、builder、copy與type branch；Drawing獨立editor不變 |
| `src/app/numbering/search/page.tsx` | 改渲染`NumberingGlobalSearch`；使用既有`GET /api/numbering/search`，不再渲染canonical Relation workbench |
| `src/components/sidebar-nav.tsx` | 移除`圖料工作台`nav item；`/numbering/search`仍可作受控搜尋／legacy returnTo落點但不在routine nav |
| `src/app/upload/page.tsx`、`src/app/submissions/[id]/page.tsx`、`src/app/numbering/reports/page.tsx`、`src/app/handoff/page.tsx`、`src/app/bom/workbench/page.tsx`、`src/app/numbering/impact/page.tsx`、`src/app/production-slice-blocked/page.tsx` | 逐一分類search、owner return與number-create intent；改route及可見文案，禁止殘留圖料工作台語意 |
| `src/components/clean-home-workbench.tsx`、`src/components/dashboard.tsx`、`src/components/dashboard/layout-parts.tsx`、`src/components/lifecycle-ux.tsx`、`src/components/number-state-legacy-route.tsx`、`src/components/transfer-package-workbench.tsx` | 同上；舊query只可轉成明確canonical intent，不得泛用fallback |
| `src/lib/drawing-submission-workbench.ts`、`src/lib/status-scope-display.ts`、`src/lib/transfer-packages.ts`、`src/lib/repositories/submission-status-async-repository.ts`、`src/lib/repositories/numbering-async-repository.ts` | recovery/action href與owner module文案改為Drawing／Part owner或編號搜尋；移除Relation owner query |
| `src/app/globals.css` | Matrix edit/focus/dirty/error/action樣式與單一overflow owner；刪除只服務Relation list/workspace的樣式須經caller確認 |
| `package.json` | 新增`qc:dev-090:*`、aggregate與migration dry-run scripts |
| `scripts/qc-dev-087-{contract,repository,browser,retirement,ui-only}.mjs` | 把DEV-090 activation後仍適用的Drawing／Part／historical evidence regression改成新期待；不得保留Relation current allowlist |
| `scripts/qc-dev-083-{contract,mutation,browser}.mjs`及其他retirement inventory列出的舊Relation current tests | 分類為改寫成direct matrix regression或刪除；不可讓obsolete期待阻擋新contract |

### 17.3 刪除

| Path | Deletion condition |
|---|---|
| `src/app/api/numbering/relations/route.ts`、`src/app/api/numbering/relations/[rowKey]/route.ts` | global search及兩drawer replacement tests已PASS |
| `src/app/numbering/relations/[rootId]/workspace/page.tsx` | active work/review/apply_failed=0且新matrix direct edit PASS |
| `src/app/api/pdm/relations/[rootId]/change-works/route.ts` | 同上；同層新`matrix/route.ts`保留 |
| `src/app/api/pdm/relation-change-works/[workId]/**` | 同上 |
| `src/lib/relation-change-work.ts` | review dispatch與全部runtime imports=0 |
| `src/lib/repositories/relation-change-work-async-repository.ts` | formal read/write已收斂到formal authority，historical snapshot無current runtime reader需求 |

不得刪除`drawing_part_links`、`pdm_review_traces`、`relation_approved_change_snapshots`、Drawing／Part review流程、`GET /api/numbering/search`或canonical file-read／preview路徑。

## 18. Target API、Hash 與 Repository Implementation

### 18.1 Route implementation

`PATCH /api/pdm/relations/[rootId]/matrix`依本專案Next版本採`route.ts`與`{params: Promise<{rootId:string}>}`。PATCH不快取；所有success/error加`Cache-Control: private, no-store`。route只負責：

1. 新增page-neutral `resolveRelationMatrixActor`：驗證authenticated與company，接受`numbering.drawings.view`或`numbering.search`任一read entitlement，再做exact root/entity read；edit另須`numbering.workspace.update`。禁止以`resolveDev087RouteActor(request,"numbering.search")`把Drawing drawer使用者錯誤綁到search permission。
2. 解析JSON、`If-Match`、`Idempotency-Key`、`X-PDM-Workbench-Contract`；不得把actor/company/root從body當權威。
3. 呼叫`PdmRelationMatrixService.update`並回固定envelope；所有domain error由canonical safe envelope輸出。

`GET`不另建matrix endpoint；Drawing／Part exact detail已是唯一一般read contract，避免第三個read authority。

### 18.2 Canonical hash

repository輸出以下canonical object後使用既有stable-key JSON算法與SHA-256：

```ts
{
  schemaVersion: 1,
  companyId,
  root: { id, recordStatus },
  drawings: [{ id, number, recordStatus }], // number comparator + id
  parts: [{ id, number, recordStatus }],    // number comparator + id
  links: [{ drawingNumberId, partNumberId, linkType }] // ids + type
}
```

API傳輸值為lowercase 64-hex；HTTP header保留引號。weak ETag、row counter、timestamp或provider-specific JSON排序禁止使用。相同現況由A→B→A回復後可得到相同ETag，因可觀察formal authority亦相同；稽核次數由command receipts承接，不由ETag承接。

### 18.3 Batch strategy

- JS先拒絕empty、超過目前矩陣cell數、>2,500、pair重複與非法domain type，再產生每個非null target的server UUID。
- SQLite以單一JSON parameter配合`json_each/json_extract`；PostgreSQL以單一JSON parameter配合`jsonb_to_recordset(CAST(:changesJson AS jsonb))`。不得展開1000個named parameters，也不得逐cell SQL loop。
- request／projection只使用`manufacturing_basis|reference`；formal authority內唯一mapping轉成`primary_manufacturing|reference`。任何authority外storage enum mapping都使contract gate FAIL。
- validation query一次取得request identities與狀態；一次取得受影響links／primary集合。terminal identity可清除既有link，但不得新增／改成非null關聯。
- mutation先以JSON set批次刪除changed pairs，再批次insert非null target；資料庫pair unique與primary partial unique是最後防線。constraint error須映射為固定domain code，transaction rollback。
- `platform_command_receipts`只保存compact response、request hash、effect key、actor與correlation；不保存整張矩陣、不建立outbox event或approval。

## 19. Migration、Preflight 與 Recovery Implementation

### 19.1 Provider-aware converter modes

`scripts/migrate-dev-090-inline-relation-matrix.mjs`固定支援：

```text
--provider sqlite --database <absolute-path> --dry-run
--provider sqlite --database <absolute-path> --apply-local --confirm-local-dev-090
--provider postgres --connection-env PDM_POSTGRES_URL --dry-run
```

- SQLite apply只允許經`path.resolve`確認位於本workspace、provider metadata為SQLite且目標不是目錄／symlink逃逸的本機DB；不得接受production字樣、Cloud SQL或未解析路徑。
- PostgreSQL模式由provider-aware converter執行inventory／reconciliation；`--mode=rehearsal --apply`只接受隔離還原環境旗標，`--mode=cutover --apply`另需正式授權旗標。正式DDL仍只能由經授權Cloud SQL migration package執行043，converter不得繞過production gate。
- dry-run產生逐root source/target canonical hash、formal links PK/FK/company/root、active work/review/apply_failed、ambiguous pair、multi-primary、historical trace/snapshot count/hash與unresolved manifest。

### 19.2 SQLite apply order

在單一`BEGIN IMMEDIATE`：重驗preflight→重建shared current tables為target CHECK→刪除derived Relation states／aggregates→drop `relation_change_works`→建立pair unique→更新authority schema hash→重算全部formal hash→commit。任一fault rollback，不建立資料庫備份副本；這符合既有本機資料可清理決策，但canonical links及historical evidence hash必須不變。

### 19.3 PostgreSQL 043 order

在official runner transaction：advisory migration lock→`DO` fail-closed inventory→刪除derived Relation state／aggregate→drop active Relation review allowances與`relation_change_works`→建立pair unique→更新authority schema hash→SQL reconciliation assertion。043不修改041／042 checksum，不刪historical evidence，不碰file assets／bytes。

### 19.4 Failure recovery

- Migration尚未commit：SQLite／PostgreSQL transaction rollback後source schema與hash不變。
- Migration已commit但新app smoke未通過：流量仍凍結；正式環境依DEV-087／release gate用RPO=0切換前備份回復DB與舊app，禁止只回滾app連上已移除Relation table的target schema。
- 新app已開流量：不得用舊app或legacy route作fallback；只允許forward fix。若formal link integrity受損，立即停止Relation mutation、保留read、啟動incident／restore決策。
- local focused failure：刪除isolated fixture DB與task-owned runtime；不得重置`data/ai-pdm.sqlite`或停止未知`node.exe`。

## 20. Phase Execution Plan

| Phase | Implement | Required gate before next phase |
|---|---|---|
| 090-A Contract／repository | contract type、canonical hash、formal authority/service/route、現有formal writer convergence、043與converter草案；只跑isolated provider tests | 全部runtime writer共用root lock／in-client primitives，sync legacy writer caller=0；contract、hash parity、valid/no-op/stale/idempotency/fault tests PASS；不套主DB |
| 090-B Drawer UI | Drawing／Part detail projection、MatrixSection/Table、dirty guard、RWD/a11y CSS | component/browser fixture PASS；Drawing／Part list query delta=0；舊Relation mutation仍不得與新direct mutation同時對共享DB開放 |
| 090-C Cutover／retirement | 編號搜尋、全域caller／文案分流、sidebar、review dispatch、workspace/API/service/repository刪除；isolated SQLite apply 043-equivalent target | preflight全0、source/target formal＋historical hash 100%、writer=0、forbidden caller／文案=0、保留search caller全分類、negative injection FAIL-as-expected |
| 090-D Focused QA/QC | SQLite＋PostgreSQL、真實Chromium兩輪fresh session、regression、typecheck、lint、isolated build | `qc:dev-090` aggregate全PASS且P0/P1=0 |
| 090-E Handoff | 文件與evidence同步、將舊Relation active條款標為historical/superseded、documentation map／cold-start收斂、dirty-boundary盤點 | current Relation文件authority只剩DEV-090；僅可回報Local RD/QA/QC結果，production migration／release保持gated |

不得把090-A／B的雙路徑中間態當可交付版本；若任一phase暫停，必須在DEV-090記錄目前schema、可達mutation route、未完成刪除清單與恢復點。

## 21. Verification Commands 與 Evidence Paths

RD完成對應scripts後固定執行：

```powershell
npm.cmd run qc:dev-090:contract
npm.cmd run qc:dev-090:repository
npm.cmd run qc:dev-090:mutation
npm.cmd run qc:dev-090:migration
npm.cmd run qc:dev-090:retirement
npm.cmd run qc:dev-090:browser
npm.cmd run typecheck:app
npm.cmd run lint
npm.cmd run build:isolated
npm.cmd run qc:dev-090
```

- aggregate manifest：`output/qa/dev-090/<run-id>/manifest.json`
- provider parity：`output/qa/dev-090/<run-id>/provider-parity.json`
- migration reconciliation：`output/qa/dev-090/<run-id>/migration-reconciliation.json`
- caller inventory／negative injection：`output/qa/dev-090/<run-id>/retirement.json`
- browser evidence：`output/qa/dev-090/<run-id>/browser/`，含兩輪fresh-session screenshot、trace、network、console及UI/API/DB manifest。

aggregate只讀取本次run-id內證據；缺檔、舊run、skip、blocked、非零process exit、P0/P1或productionConnected=true一律FAIL。focused PASS不能自行改為production delivered。

## 22. Readiness Closure

截至本文件版次：

- 人類決策：已關閉；direct formal edit、no review、retire Relation workbench均已確認。
- API／DTO／hash／transaction／provider差異：已具體化。
- schema／migration number／zero-loss／rollback：已具體化。
- formal write authority／root lock order／enum mapping、page-neutral permission、2,500格atomic limit、全域caller分流與repo add／modify／delete、phase、test commands：已具體化。
- P0／P1 contract gaps：`0`。
- RD執行：本機Phase 090-A～090-E已完成；下一合法動作是取得正式切換授權後，在隔離PostgreSQL rehearsal完成provider-aware migration與zero-loss gate，不是直接production cutover或release。
