# SPEC-PDM-RECOGNITION-COMMON-VALUE-EXCEPTIONS-001 — 智慧辨識共用值、料號例外與 Part Work 移交

- Status：`RD Implemented Locally / Human Confirmed / Full QC Passed 60/60 / Production Release Gated`
- Date：2026-08-31
- Owner：Dev PM
- Related DEV：`DEV-110 / DEV-PDM-RECOGNITION-COMMON-VALUE-EXCEPTIONS-001`
- Current runtime predecessor：`DEV-107 / DEV-PDM-RECOGNITION-INLINE-FORMALIZATION-001`
- Local downstream dependency：`DEV-108 / DEV-PDM-PART-NUMBER-EXCEL-MATRIX-WORKSPACE-001`（local implementation、SQLite／PostgreSQL／Chromium與integration evidence已納入DEV-110 aggregate）
- Related ADR：`.ai-doc/decisions/ADR-PDM-DRAWING-RECOGNITION-PART-WORK-HANDOFF-001-common-projection-and-atomic-draft-transfer.md`
- Related QA：`.ai-doc/qa/qa-dev-110-recognition-common-value-part-work-handoff-validation-plan-2026-08-31.md`
- Visual baseline：`output/design/drawing-recognition-common-value-with-sources-ui-v2.png`、`output/design/drawing-recognition-common-value-with-sources-panel-v2.png`

## 1. Authority And Contract Precedence

本文件是 DEV-110 Current Phase 的產品、資料流與跨模組行為權威。使用者已確認：智慧辨識上游預設所有關聯料號使用同一值，只有辨識或人工判斷出現差異時才顯示例外；圖面一般區域的資料可作為全料號共用證據，料號／資料對照表則以exact Part列形成例外；來源資訊採漸進揭露；確認後不直接修改正式 Part 主檔，而是移交到各 exact Part 的既有工作，再由 DEV-108 編輯與送審。

Spec Impact Preflight：`Intentional replacement + compatible preservation`。

- DEV-110 已完成固定60-case QA/QC；DEV-107 的`確認寫入 PDM`、direct master synchronization與38/38本機證據仍保留為legacy baseline。是否啟用新流程仍須走獨立runtime／release gate。
- DEV-110 activation 後，本文件有意取代 DEV-107 canonical panel 的 flat candidate presentation、全域owner阻擋、direct master formalization及`確認寫入 PDM`主要動作。
- DEV-107 的 immutable source／observation／candidate evidence、purpose／evidence-origin lineage、single command receipt、exact source revalidation、append-only event、idempotency、permission及submitted snapshot選擇規則繼續有效。
- DEV-108 的 exact per-Part work、autosave、Part review request／snapshot、非原子逐Part submit及matrix authority繼續有效；本文件只新增一個 bounded recognition-specific draft handoff，不建立通用root writer或combined review。

## 2. Problem, Outcome And UX Intent

同一張Drawing關聯多個Parts時，多數辨識值相同。若一開始複製成N份表單，使用者必須在大量重複內容中找少數差異；若上游直接寫正式主檔，下游Part工作與送審又形成另一套操作邏輯。

目標結果：

1. 正常狀態只核對一份共用值。
2. 只有實際per-Part差異、來源衝突或既有Part work衝突才展開例外。
3. 使用者可在原欄位內新增、修改、移除特定Part override。
4. 一次主要動作把完整決策原子地展開到既有per-Part works；失敗時零Part work mutation。
5. 成功後由DEV-108接手逐料號續編與送審，上游不追蹤或控制下游審核決策。

UX Intent：

- 使用者／任務：Drawing工作擁有者在送審前核對辨識結果，並把Part屬性意圖安全移交給Part工作。
- 主物件／主焦點：當前欄位的共用值；例外只在必要時成為第二層。
- 預設刪除：N份重複料號表單、普通欄位重複來源badge、用途教學、impact modal、批次／單筆切換、第二個送審CTA與常駐成功卡。
- 保留舉證：`套用到 N 個料號`避免誤判範圍；`N 個來源`提供稽核入口；`N 個例外`揭露實際差異；existing-work conflict阻止靜默覆寫。
- 非語言修復：以共用欄位、inline disclosure、鄰近來源文字、focus與原位錯誤表達，不以框中框或說明區補救。
- 風險：錯料號、source／relation drift、靜默清空、覆寫既有work、部分寫入、預覽閃動及窄版遮擋必須由server gate與真實UI evidence驗證。

## 3. Current Phase Scope

### In Scope

- exact eligible Part scope與bounded target summary。
- common value、recognition-generated exception、manual override、恢復共用值與existing-work conflict resolution。
- collapsed source inventory、same-value evidence collapse、conflicting evidence disclosure、PDF定位與file-property metadata。
- supported recognition fields到既有`PartChangePayload`的merge。
- one-gesture atomic handoff到new／existing exact Part works。
- append-only recognition synchronization event、submitted recognition snapshot及DEV-108安全導覽。
- normal、loading、empty、blocked、conflict、error、synchronized、amendment、responsive與accessible states。

### Out Of Scope

- root-level共用屬性、Part Number Revision、root template、後續新增Part自動繼承。
- direct master Part／Drawing metadata write、第二套Part writer、cell/root PATCH、combined review或combined approval。
- 新OCR／CAD parser、表格結構重建、料號縮寫／模糊比對、辨識模型、PDF geometry生成、BOM／附件內容修改。Current Phase只允許在既有candidate／observation上做下述嚴格evidence owner resolution。
- DEV-108矩陣本體實作或改成common-value editor。
- production migration、activation、deploy、release、rollback或production smoke。

## 4. Canonical Definitions And Ownership

| Term | Contract |
|---|---|
| Eligible Part | server由current Drawing、exact Drawing-Part formal relation、same company、same canonical Part Root及current formal Part policy投影出的exact Part。不得由part number字串、檔名、client root code或candidate owner增加、移除或猜測target。 |
| Common value | 本次recognition review session中的UI／decision projection；不是persisted root default或master authority。 |
| Override | exact `(partId, fieldKey)`對共用值的替代意圖，可來自辨識差異、人工個別設定或existing-work conflict resolution。 |
| Effective value | `effective(part, field) = override(part, field) ?? common(field)`。 |
| Evidence applicability | `overall`代表圖面一般區域或明確共用列，適用全部eligible Parts；`per_part`代表料號／資料對照表或其他可解析exact Part identity的資料，只適用該Part；`unresolved`不得取得write authority。適用範圍由evidence語意與exact owner決定，不由值出現次數推導。 |
| Evidence owner resolution | 只在已由formal relation建立的eligible Part集合內解析。candidate owner僅在linked adapter原始結果可證明`proposedOwnerId`就是該eligible Part ID，或完整canonical `anchorPartNumber／configurationName`與該Part一對一相等時採用；單看persisted `proposed_owner_id`或`proposedOwnerResolution=resolved`不足。否則該欄位同一筆PDF／OCR observation raw text必須以token boundary唯一包含一個eligible Part的完整canonical part number，才可解析為該Part。既有resolver的unanchored／suffix結果、縮寫、substring、fuzzy、filename、多重命中、non-eligible命中或owner不一致一律為`unresolved`。此解析只能決定evidence適用對象，不能擴張eligible target集合。 |
| Synchronization event | 既有`drawing_recognition_formalization_events`的DEV-110 logical v2用途；證明session決策已移交至Part work，而非證明Part master已正式更新。 |
| Downstream owner | handoff成功後，每個Part work及其review request／snapshot由既有Part domain與DEV-108負責；Drawing recognition不成為審核decision owner。 |

Eligible target規則：

1. 順序固定為canonical Part natural order；fingerprint包含Drawing／root、ordered relation IDs、ordered exact Part IDs、record state與formal/work row versions。
2. 只包含current formal Parts；Obsolete／Merged／cancelled/tombstone、candidate、跨公司、無正式關聯及foreign-root資料排除或以integrity blocker處理。
3. target上限固定100。讀到101筆即fail closed，不回partial scope、不允許部分帶入。
4. 本次確認後新增的relation／Part不自動承接舊common value；source或relation fingerprint改變後必須重新載入並重新核對。
5. evidence raw text中的料號只能對already-eligible exact Part做one-to-one owner resolution；不得因此建立relation、補Part、接受跨root／跨公司target或把`P03`猜成`A0006-P03`。

## 5. Common Value, Override And Explicit Absence Contract

1. 每個supported field預設只顯示一個common control。系統以canonical normalized value比較；同值多來源與display label差異不得製造假例外。
2. 圖面一般區域或明確共用列產生的`overall` evidence可自動成為common，適用全部eligible Parts，不要求每個Part重複出現同一證據。料號／資料對照表中具verified exact Part owner provenance，或依Evidence owner resolution在同一欄位observation唯一命中完整canonical part number的值，只形成該Part override；resolver優先於legacy adapter的泛用`overall`標記，persisted owner ID本身不構成verified provenance。
3. 沒有`overall` evidence時，不得以unique mode、majority或任一per-Part值自動推導common。表格若明確提供`其他／共用／預設`列，可正規化為overall；否則未被per-Part列涵蓋的Parts保持unresolved／missing，不產生patch，直到使用者明確輸入或確認common。
4. 有兩個以上effective normalized values時，該欄位顯示`N 個例外`並展開exact Part rows；其他欄位維持單一共用值。
5. `個別設定`在原欄位內選擇尚未override的eligible Part並建立一列，不開modal、不新增全域模式。manual common／override是explicit user intent，不以field source candidate存在為前提。
6. 修改common只影響沒有override的Parts；override保持。`恢復共用值`刪除override，不複製common成另一份長期資料。
7. 未辨識、空字串、來源缺少、低信心、scope unresolved或unsupported不代表clear。沒有explicit intent的欄位不進handoff patch。
8. UI decision intent固定為`value | clear | not_applicable`：
   - `value`使用canonical trimmed value；
   - `clear`對nullable Part payload欄位寫`null`；
   - `not_applicable`沿用既有fixed-field representation`無`，並在event保留原始intent；不得把missing evidence轉成`無`。
9. material／color若只有辨識label而沒有exact canonical code，handoff更新label並把舊code清為`null`；不得留下不相符的code＋label pair。
10. Current Phase transferable field registry只包含既有writer已支援的`material`、`color`、`surface_finish | surface_treatment`與`variant_note`。其他candidate可顯示為evidence／readonly，但不得因UI存在而形成未授權Part write。

### 5.1 一圖多料號對照表判讀例

同一張圖面可能同時包含「圖面一般區域」與「料號／資料對照表」；兩者不是同一個適用範圍。判定以證據所在語意區域與exact owner為準：

| 圖面證據 | 例 | 投影結果 |
|---|---|---|
| 圖面一般區域／明確共用列 | 一般註記寫`表面處理：鍍鋅` | `surface_treatment=鍍鋅`成為overall common，適用所有eligible Parts。 |
| 料號／資料對照表的完整料號列 | `A0006-P01→SUS304`、`A0006-P02→SUS304`、`A0006-P03→SUS301` | 三列都是`material`的per-Part override；P01/P02同值也不可因為出現兩次而升格為common，P03只套用SUS301。 |
| 對照表未列出的Part | 同一表只列P01～P03，eligible集合另有P04/P05 | P04/P05的`material`保持unset／missing，不以P01/P02的多數值補入。 |
| 無法安全判定表格邊界或料號owner | 只有`P03`縮寫、合併儲存格、多個eligible料號同時命中 | 該證據為unresolved／zero patch；由使用者以common或`個別設定`明確處理。 |

因此，「不在對照表的資訊」只有在辨識來源明確標示為圖面overall／共用列時才適用全部料號；不能僅依座標、值的出現次數或legacy `overall`旗標猜測。Current Phase不新增表格結構解析器，無法安全解析時維持待確認。

## 6. Source And Preview Presentation Contract

1. Panel header只顯示一個`N 個來源`入口；展開後以source file／type／status列出，不在每個普通欄位重複`PDF圖面`／`檔案屬性`badge。
2. 相同normalized value且applicability相同的多來源折疊成一份evidence summary。圖面一般區域與料號對照表即使值相同仍保留不同scope lineage；只有source values衝突、per-Part例外或人工個別設定展開時，才在值旁以muted inline text顯示來源。
3. 欄位focus可選取primary locatable evidence，但只有evidence target真的改變時才能更新preview selection；不得先清空再重掛PDF canvas或image，避免閃動。
4. `PDF圖面`只在有canonical page／geometry時可定位。定位維持目前zoom、scroll與選取上下文，除非geometry要求最小必要調整。
5. `檔案屬性`、無geometry CAD metadata或filename evidence只開啟metadata detail；不得改preview page、zoom、scroll或製造假的定位動畫。
6. 無座標提示若需要出現在preview，置於preview內容正中央並使用可讀尺寸；提示不能遮住主要控制，且reduced-motion下不使用閃爍或縮放動畫。
7. 來源按需層關閉後焦點回到原control；keyboard與screen reader可取得source type、filename與是否可定位。

## 7. UI Entry And Interaction Contract

| Contract item | Rule |
|---|---|
| Actor | current Drawing work的合法owner／non-owner editor，且具recognition review、formalize及所有target Parts既有create/update能力；合法viewer只讀。 |
| Entry | canonical Drawing workspace既有`智慧辨識`分頁；不得導向legacy standalone review page。 |
| Header | `智慧辨識`、derived status、`套用到 N 個料號`與`N 個來源`。來源與Part清單均按需展開。 |
| Body | stable field order；common control為主，exception rows／source conflict／work conflict只按需展開。 |
| Primary action | 有work delta時為`帶入 N 個料號工作`，N只計new／updated works；全部已一致時為`確認資料已一致`。兩者是同一handoff command。 |
| Destination | 成功後開啟DEV-108 exact Part matrix，source Part優先為natural order第一個有work delta的Part；無delta時使用第一個eligible Part。`returnTo`安全返回原Drawing workspace。 |
| Downstream status | 上游authority只到`待核對 → 待帶入 → 已帶入料號工作`；`待送審 → 審核中`由DEV-108／Part work顯示。上游可提供導覽，不複製下游主要CTA或決策狀態。 |

載入使用panel-local skeleton；empty只顯示`目前沒有可帶入的關聯料號`與適用的relation recovery入口；錯誤保留common／override draft並在受影響欄位或action row顯示最短原因／恢復。正常成功只以狀態與destination變化回饋，不建立toast wall或常駐成功卡。

## 8. Read Projection And Logical API Contract

### 8.1 Session projection

既有session GET additive投影：

- `applicationScope`：`rootId`、ordered eligible Parts、`eligiblePartCount`、`relationScopeFingerprint`與100-limit state。
- `commonFields[]`：`fieldKey／label／intent／value／origin=recognition_overall|manual|unset`、`sourceSummary／locatableEvidence`、`exceptionCount`與ordered `exceptions[]`。
- exception：`partId／partNumber／intent／value／origin=recognition_per_part|manual|work_conflict`、必要source applicability／summary與conflict state。
- `handoffControl`：`state=not_ready|ready|blocked|synchronized|locked`、`workMutationCount／unchangedCount`、blockers、current synchronization event與safe destination。
- `meta`：由session GET簽發actor／company／build-bound canonical workbench contract token與correlation ID；response維持`private, no-store`。token是handoff POST的必要authority guard，無法簽發時維持fail closed。

Client不得把application scope、permission、source fingerprint、relation fingerprint、work conflict或transferable field registry當authority。

### 8.2 Handoff command

Canonical logical route：

`POST /api/numbering/recognition-sessions/{sessionId}/handoff`

Request：

```json
{
  "expectedRowVersion": 7,
  "expectedSourceSetFingerprint": "...",
  "expectedRelationScopeFingerprint": "...",
  "commonValues": [{ "fieldKey": "material", "intent": "value", "value": "SUS304" }],
  "overrides": [{ "partId": "...", "fieldKey": "material", "intent": "value", "value": "SUS301", "conflictResolution": null }]
}
```

- Header必須帶stable `Idempotency-Key`與既有server-issued command contract token。
- server canonicalize common／override draft並計算`draftHash`；client不得傳target work ID、owner、permission、before value或evidence link作authority。
- same key＋same draft hash replay相同結果；same key＋different draft回409。
- 成功response：`{ session, handoff:{ eventId, eligiblePartCount, workMutationCount, unchangedCount, destination, targets[] } }`。target最小shape為`partId／partNumber／result=created|updated|already_current|already_in_work／workId?／rowVersion?`。
- 409／422 response回safe typed blocker與fresh correlation ID，不回raw SQL、stack、cross-company identity或未授權work payload。

## 9. Part Work Merge And Conflict Contract

對每一eligible Part，server從current formal payload與可合法編輯的active work投影effective base，僅patch transferable fields：

1. 無active work且至少一個target field形成delta：以既有Part work create invariant建立actor-owned work，再合併辨識值。
2. 無active work且所有target fields已等於formal：不建立no-op work，event記`already_current`。
3. 有owner-handling且actor可編輯的active work：保留所有非recognition fields與未被本draft指定的fields，只合併本次明確target fields。
4. active work target field等於formal或已等於handoff值時可安全merge／no-op。target field已被work改成第三個值時，投影`work_conflict`且handoff blocked，直到使用者在該exception明確選：
   - `保留料號工作值`：override改用current work value，本次不覆寫；
   - `使用辨識值`：授權只覆寫該field，event記錄explicit conflict resolution。
5. work為review_owner／system／blocked／terminal、actor不可編輯、work/state identity不一致或同Part duplicate work時，整體blocked；不得跳過該Part或只帶入其他Parts。
6. pre-existing work不因handoff後payload等於formal而自動cancel。只有本transaction新建且merge後仍no delta的暫時work可在transaction內不落地。

## 10. Transaction, Locking And Idempotency

Handoff是recognition-specific bounded atomic orchestrator，不是一般root batch writer。單一transaction必須完成：

1. auth／permission／company／Drawing lifecycle與contract token驗證；
2. exact current source set與source fingerprint重算；
3. recognition lineage／session、rowVersion與draft validation；
4. formal Drawing-Part relation／root／ordered Part scope與relation fingerprint重算；
5. sorted Part formal states、active work states與works lock；
6. all-target conflict／permission／lifecycle preflight；
7. common＋overrides展開成exact per-Part handoff snapshot；既有candidate／observation保持來源證據，manual override與conflict resolution由schema-v2 event保存，不把一對多override硬塞回single-owner candidate row；
8. 使用同一Part work repository invariants建立／更新works；
9. append-only synchronization event／allowed links與session terminal update。

任一target失敗、stale、conflict、permission不足或fault injection，整筆rollback：Part work、state、event、links、session status、receipt與outbox全部零部分寫入。DEV-110不寫candidate／decision overlay。PostgreSQL使用serializable transaction與`FOR UPDATE`；SQLite mutation使用top-level `BEGIN IMMEDIATE`。

全域lock order固定：

`Drawing aggregate/work → current source set → recognition lineage/session → formal relation/root → sorted Part formal state → sorted Part work state/work`

每個Part依exact ID排序；不得由client順序、畫面focus或candidate順序決定lock。Outer idempotent command與append-only event是completion authority；不得以按鈕notice或資料剛好相同冒充handoff已完成。

## 11. Synchronization Event And Compatibility

Current Phase不新增schema／migration／table／permission。沿用物理表，但logical payload version升級：

- `drawing_recognition_formalization_events.result_json`新事件固定`schemaVersion=2`、`destination="part_work"`、eligible/work/no-op counts、ordered target Part IDs與safe destination refs。
- legacy event沒有destination或`schemaVersion=1`時解讀為`destination="direct_master"`，保持immutable historical evidence。
- 新event的`applied_changes_json`保存common展開後的exact per-Part intents、`origin=recognition_overall|recognition_per_part|manual|work_conflict`與conflict resolutions；不宣稱Part master已更新。
- delta／existing-work targets只有在該field存在source candidate時，才以`drawing_recognition_formalization_links.target_type="part_work"`連到work ID；new work欄位使用既有allowed `change_kind="create"`、existing work欄位使用`update`、explicit N/A使用`not_applicable`。manual-only common／override仍由event完整稽核，但因physical `candidate_id NOT NULL`不得建立synthetic candidate或假evidence link。物理constraint只允許`create | update | not_applicable | evidence`，因此manual-only、zero-delta／already-in-work target可以沒有link；它們存在`applied_changes_json`、`result_json.targets[]`與`target_fingerprints_json`。zero-delta event合法地擁有0筆links。
- session成功後仍使用physical status`formalized`與formalized actor/time，產品copy只顯示`已帶入料號工作`或`資料已一致`。在DEV-110語境，`formalized`代表recognition decision已同步完成，不代表Part review已核准。

DEV-110 canonical handoff不得寫`pdm_part_attribute_values`、`part_numbers`、`part_variant_attributes`、drawing metadata、controlled notes或engineering evidence master。DEV-107舊direct-master events／rows保留，不backfill、不重寫、不偽裝成Part work handoff。

## 12. Permission, Lifecycle And Submission Ownership

- Session read沿用`numbering.recognition.review`；handoff沿用`numbering.recognition.formalize`，並對每個target重驗既有Part work create／update能力與non-owner edit scope。不新增`recognition.handoff` permission。
- Drawing已submitted／reviewing時panel readonly；returned owner flow可由existing evidence-origin amendment重開。Approved／Released沿用既有Drawing revision／post-release change流程。
- Handoff完成即解除DEV-110 recognition pending gate。Drawing submit transaction仍重驗exact source fingerprint、relation fingerprint與latest synchronized event；沒有accepted intended candidates時recognition維持optional。
- Part work之後的edit／submit／return／approve由DEV-108及existing Part domain獨立治理，不回寫recognition common／override，也不成為Drawing submit／review decision gate。
- Drawing submitted package必須封存exact recognition session、sync event、`destination`、source／relation／target fingerprints與handoff摘要；它不是Part review snapshot，Drawing reviewer不得由該package核准Part changes。新package使用destination-aware recognition projection v2；既有v1 package與legacy event保持可讀且解讀為`direct_master`，不得重寫歷史snapshot。

## 13. Failure And Recovery Contract

| Failure | Required result／recovery |
|---|---|
| source／relation／target drift | 409、zero write、保留local draft，fresh reload後重新核對；不得套用舊Part集合。 |
| existing work field conflict | 該欄位展開exact Part與work value；選`保留料號工作值`或`使用辨識值`後才可重試。 |
| review／permission／integrity blocker | 整體zero write；顯示最多三個可行原因＋總數，提供exact Part workspace或權限恢復入口。 |
| validation／unsupported field | 原欄位顯示最短錯誤；unsupported保留readonly evidence，不進payload。 |
| transaction fault at target k | 全部rollback，UI不得顯示部分成功；同key修復後可安全重試。 |
| response lost after commit | 先GET session／event；已存在schema v2 event即顯示synchronized，不生成新key或duplicate work。 |
| PDF locatable evidence missing | 保留欄位與metadata，preview不移動、不閃動；不得偽造定位。 |
| downstream work later changed | upstream event保持歷史handoff事實；由DEV-108顯示current work state，上游不自動覆寫或重開。 |

任何visible `.inline-error`、`role=alert`中的raw 4xx／5xx、Internal Server Error、預期有eligible Parts卻全零，或handoff失敗後draft消失，都是QC hard fail。

## 14. Acceptance Contract

1. 5個eligible Parts全部相同時，每欄只有一個common value，沒有5份重複內容或普通source badge。
2. 料號／資料對照表同一材質observation以完整`A0006-P03`唯一命中時，只材質列顯示`1個例外`；common修改不覆蓋P03 override。若只出現`P03`、一次命中多個eligible Parts或owner不一致，必須保持unresolved／待人工確認且zero patch。
3. 人工`個別設定`可新增／編輯／恢復exact Part override，effective projection與server expansion一致。
4. missing evidence零clear；explicit clear與not-applicable能區分並在event追溯。
5. same-value多來源折疊；source conflict展開且未解時handoff blocked。
6. PDF evidence定位正確且focus切換不閃；file property只顯示metadata且preview geometry不變。
7. server忽略client target list推斷，依current formal relation重建≤100 exact Parts；101或scope drift fail closed。
8. safe new／existing work merge保留非target fields；work target conflict必須explicit resolution。
9. 任一target fault、permission或lifecycle blocker使所有Part works、event與session零部分寫入。
10. same idempotency key replay不duplicate work／event；same key different draft拒絕。
11. zero-delta確認不建立no-op work，但建立schema v2 synchronization event；positive handoff只寫work draft，不寫Part master。
12. 成功後DEV-108從normal destination載入exact works／values並可安全返回Drawing；Part submit仍是N個independent requests。
13. Drawing submitted package封存recognition handoff摘要但不取得Part decision authority；Part work後續變更不回寫upstream。
14. 1536×1024、1440×900、1024×768與390×844無page-level overflow、重疊、截斷、雙重scroll或sticky footer遮擋；主要流程可由鍵盤完成且reduced motion不失去狀態。
15. DEV-107 current local implementation在activation前仍可使用；DEV-110切換後canonical panel不呼direct-master commit/formalize路徑，legacy evidence不被改寫。

完整planned QA cases與evidence layer位於配對QA文件；build／lint／static contract不能取代real browser、API／DB readback與fault injection。

## 15. FMEA

| Failure mode | User impact | Detection | Priority | Required control |
|---|---|---|---:|---|
| client自行決定target scope | 值帶入錯料號 | relation drift／negative API | P0 | server exact relation projection＋fingerprint |
| legacy suffix／unanchored owner或表格縮寫／多重命中被當成exact | 例外套到錯料號或被錯當common | exact-owner provenance＋exact／abbreviated／ambiguous observation matrix | P0 | adapter exact ID／full anchor provenance或formal eligible-set內完整canonical token唯一比對；其他unresolved／zero patch |
| common覆蓋人工override | 特定料號值遺失 | common edit interaction case | P0 | `override ?? common` pure projection＋server expansion |
| 覆寫existing work edit | 使用者既有工作遺失 | work/formal/plan三值fixture | P0 | conflict disclosure＋explicit resolution |
| 第k個Part失敗留下部分work | 下游真假不明 | transaction fault injection | P0 | one atomic transaction＋receipt/event |
| missing被當clear | 正式資料將來被誤刪 | missing/clear/N-A matrix | P0 | explicit intent enum；missing zero patch |
| source/relation drift仍提交 | 舊證據套到新範圍 | concurrent replacement test | P0 | locked fresh fingerprint revalidation |
| file property觸發假定位 | preview閃動／錯位 | geometry measurement＋video/screenshot | P1 | nonlocatable no preview mutation |
| UI仍顯示N份來源／值 | 差異不可見、核對慢 | quietness audit | P1 | common-first＋progressive disclosure |
| sync event被誤解為Part核准 | Drawing reviewer越權 | package/UI copy audit | P0 | destination discriminator＋separate Part review |
| 101 Parts被部分載入 | 部分資料被錯當全部 | bound fixture | P0 | 101 fail closed |

## 16. Current Phase RD Handoff

| Slice | Product／technical boundary | Exit evidence direction |
|---|---|---|
| 110-A Projection contract | common／override／source／eligible scope、100 bound、conflict projection | pure contract＋read projection＋security cases |
| 110-B Atomic handoff | server expansion、Part work merge、event/link、lock／idempotency／rollback | SQLite＋PostgreSQL fault／race／readback |
| 110-C Panel UX | quiet field rows、exceptions、source disclosure、preview behavior、state／error／a11y | authenticated real browser＋network／geometry evidence |
| 110-D Downstream integration | DEV-108 destination、safe return、Drawing submit snapshot與authority split | end-to-end browser＋API／DB snapshot readback |
| 110-E Convergence／QC | DEV-107／108 regressions、no direct master、no schema／permission drift、visible-error sweep | fixed case manifest＋engineering gates＋cleanup |

依賴：DEV-107 evidence-origin lineage與append-only event、existing PartChangePayload／Part work repository、formal Drawing-Part relation、DEV-108 matrix read／edit contract、DEV-101 immutable review package。DEV-110 aggregate已以current source重驗exact route／work contract與dirty ownership，並完成SQLite／PostgreSQL／Chromium／integration provider evidence；變更仍未commit，runtime activation與release保持獨立gate。

## 17. Stop Conditions And Evidence Required

以下任一發生即停止RD設計／實作並回Dev PM：

- 需要root-level persisted default、new Part master writer、new permission、combined review、Part Number Revision或後加Part自動繼承。
- 無法以existing tables的schema v2 JSON discriminator區分legacy direct-master event與new Part-work event。
- 無法共用Part work repository validation而必須直接繞過rowVersion、handling、permission或audit。
- 無法在100 Parts內完成bounded sorted locking，或PostgreSQL／SQLite無法維持all-or-nothing。
- 需要DEV-108把matrix改成第二個common-value editor，或需要Drawing reviewer核准Part work。
- source／relation drift只能由client偵測、response loss會duplicate、或existing work conflict必須靜默覆寫。
- 產品要求自動理解`P03`縮寫、跨多行表格、合併儲存格或一列套多個Parts，且無法以完整canonical token one-to-one resolver安全處理；此時必須另立structured table parser／模型範圍與QA，不得擴張Current Phase heuristic。

Required evidence：contract/pure projection、SQLite與disposable PostgreSQL transaction／race／fault、API permission／drift、authenticated real Chromium正常入口與四viewport、PDF／metadata preview measurement、DEV-107／108／101 targeted regression、primary/source invariants及task-owned runtime cleanup。以上證據已由`npm run qc:dev-110:aggregate`完成固定60/60 PASS；正式啟用、資料修復與release仍受獨立gate管制。

## 18. Execution Boundary And Future Capsule

Current execution boundary：`RD Implemented Locally / Full QC Passed 60/60`。DEV-110 的 common-first projection、strict owner resolver、server handoff route、atomic service、Part-work destination-aware snapshot consumer、panel、SQLite／PostgreSQL／real Chromium／integration runners與finalizer均已落地並通過。production、feature activation、migration、資料修復與 release 仍必須走獨立 gate。

Future Phase Capsule — root template：只有使用者另行要求後續新增Part自動承接預設，且能明確決定template owner、effective time、precedence、歷史回填、撤銷與audit時重新進入。不得從DEV-110 session common value自行推導或偷偷持久化。

## 19. Spec Governance Result

- Cross-spec result：`Intentional replacement + compatible preservation`，無`Unresolved conflict`。
- ADR：已建立並接受target architecture；local implementation與固定60/60 aggregate已完成，runtime cutover仍待獨立release gate。
- Schema／migration：Current Phase `none`；沿用existing JSON／text extensibility，legacy rows immutable。
- Human decision gaps：0。
- RD Contract與RD Implementation P0/P1 planning gaps：0；scope-aware evidence、manual intent、destination-aware consumer、exact file、query／lock、runner、fixture／fault、依賴與估工已封口。產品本機實作與固定60/60 QC均完成。

## 20. Repository Assessment And Exact File Boundary

Assessment baseline：branch=`持續優化2`、HEAD=`91de270c3a644dfbcbee49ed255b3c18e13df9dd`、2026-08-31 working tree。Next.js 16.3 local guides已核對`Route Handlers`與`Server／Client Components`；POST handoff維持App Router `route.ts`／Node runtime，互動panel維持Client Component，server access、transaction與repository不得進client bundle。

### 20.1 Add

| File | Single responsibility |
|---|---|
| `src/lib/drawing-recognition-part-work-handoff-contract.ts` | client-safe DTO、transferable field registry、intent parser、normalization、verified exact-owner provenance／canonical-token resolver、common／override projector、canonical draft hash與safe response types。 |
| `src/lib/drawing-recognition-part-work-access.ts` | server-only recognition action＋Part create／update capability＋non-owner scope adapter；不得新增permission。 |
| `src/lib/drawing-recognition-part-work-handoff.ts` | `handoffDrawingRecognitionToPartWorks` command、canonical contract verification、platform receipt／outbox與safe error translation。 |
| `src/lib/repositories/drawing-recognition-part-work-handoff-async-repository.ts` | formal-only eligible scope、projection basis、all-target preflight、v2 event／link／session mutation；不得寫Part master。 |
| `src/app/api/numbering/recognition-sessions/[sessionId]/handoff/route.ts` | Node POST route、bounded body parse、headers、access、typed response。 |
| `src/components/drawing-recognition-workspace-panel.module.css` | DEV-110 quiet common／exception／source／responsive styles；不再擴張global selector。 |
| `scripts/qc-dev-110-contract.mjs` | C01..C08。 |
| `scripts/qc-dev-110-repository.mjs` | SQLite R01..R16。 |
| `scripts/qc-dev-110-postgres.mjs` | disposable PostgreSQL P01..P08，含provider、lock、race、drift、fault與FK evidence。 |
| `scripts/qc-dev-110-browser-real.mjs` | authenticated real Chromium B01..B16，含正常入口、四viewport、source evidence與destination navigation。 |
| `scripts/qc-dev-110-integration.mjs` | DEV-108／101／107 integration I01..I08，含Part-work destination與API readback。 |
| `scripts/qc-dev-110-aggregate.mjs` | 編排C/R/P/B/I與typecheck、affected lint、isolated build、primary invariant及cleanup，固定60 denominator。 |

### 20.2 Modify

| File | Allowed change |
|---|---|
| `src/app/api/numbering/recognition-sessions/[sessionId]/route.ts` | 在同一read snapshot加入application scope／handoff projection與canonical contract token；維持`private, no-store`。 |
| `src/lib/drawing-recognition.ts` | read snapshot composition與handoff service export；legacy commit／formalize function保留。 |
| `src/lib/repositories/drawing-recognition-async-repository.ts` | refactor `getProjection`接受已授權session、以formal-only rich scope取代DEV-110 read中的formal＋draft owner union；existing worker／legacy methods行為不改。 |
| `src/lib/repositories/part-change-work-async-repository.ts` | additive `lockBatch`／`applyLockedBatch` primitive，集中沿用payload normalization、rowVersion、handling、work/state雙寫；existing `create/update`契約不改。 |
| `src/components/drawing-recognition-workspace-panel.tsx` | canonical UI切到common-first、stable request key、new handoff、source disclosure、exceptions、conflict及destination。 |
| `src/components/canonical-drawing-change-workspace.tsx` | 只加evidence identity equality guard與metadata no-preview-mutation；Drawing其餘流程no-touch。 |
| `src/lib/drawing-recognition-review-projection.ts` | additive v2 destination-aware completion DTO／type guard；v1 historical shape維持可讀。 |
| `src/lib/drawing-recognition-review-snapshot.ts` | batch hydrate exact sync event／destination／handoff summary與fingerprints；既有immutable package資料不重寫。 |
| `src/lib/pdm-review-package.ts` | Drawing submit重驗v2 sync event／source／relation fingerprint，writer封存handoff摘要，parser／guard相容legacy v1 direct-master。 |
| `package.json` | 只加`qc:dev-110:{contract,repository,postgres,browser,integration,aggregate}`與`qc:dev-110` scripts；dependency=0。 |

Exact product／runner inventory：`Add=12 / Modify=10 / Delete=0`。文件同步不計入產品file inventory。

### 20.3 Delete／No-touch

- Delete：0。既有`commit`、`formalize`、`write-impact` routes與DEV-107 runner保留做legacy／regression，不由canonical panel呼叫。
- No-touch：全部`db/postgres/*.sql`、`src/lib/db.ts`、`platform-command-service.ts`、`platform-command-context.ts`、`pdm-workbench-authority-control.ts`、`drawing-recognition-contract.ts`、`drawing-recognition-part-owner.ts` legacy resolver、`part-change-work.ts`、Part create route、DEV-108 matrix page／component／service／repository、DEV-101 review UI／approval authority與既有immutable package rows、`src/app/globals.css`、Part master writer。DEV-110在new handoff projector隔離嚴格owner policy，不改舊resolver以免改變DEV-107／metadata ingestion；DEV-101的shared projection／snapshot／package code只允許上述destination-aware additive相容修改。
- Shared overlap：`part-change-work.ts`、Part create route與Part repository目前working tree已含DEV-108 optional `initialPayload`變更。DEV-110只擁有Part repository的additive batch primitive；110-0必須先rebase／重讀差異，不得覆寫或重做DEV-108的create契約。

## 21. Frozen Projection And Command Algorithm

### 21.1 Read projection

1. `getDrawingRecognitionProjection`先完成actor/company session scope。`queued／extracting`只回existing processing shell，不投影Part scope／work payload／handoff token，避免2.5秒poll在SQLite反覆進入`BEGIN IMMEDIATE`；進入reviewable／terminal狀態後才在`withPdmWorkbenchReadSnapshot`內把同一session row傳入rich projection，禁止以另一snapshot重讀session。
2. source／candidate／observation／adapter沿用DEV-107 evidence；eligible scope改由current Drawing的`formal_drawing_number_id → drawing_part_links → part_numbers`取得，只接受same company、same `part_root_id`、current formal policy。讀`LIMIT 101`，101即整體blocked。
3. rich scope同時投影formal payload／formal state及active work／work state；未授權read只回capability／blocker，不回他人work payload。UI Part順序用canonical natural order，所有mutation lock順序另以exact Part ID排序。
4. field projector只接受`material`、`color`、`surface_finish | surface_treatment`、`variant_note`。先解析evidence owner：只有linked adapter原始結果明確提供同一eligible Part ID，或完整canonical anchor／configuration與該Part一對一相等，candidate owner才是verified exact provenance；persisted `proposed_owner_id`、`proposedOwnerResolution=resolved`、legacy suffix或unanchored resolution本身不得形成override。其餘只在該欄位同一PDF／OCR observation raw text以token boundary比對server已投影的完整canonical part number，恰好唯一命中一個eligible Part才形成該Part override。`P03`縮寫、substring／fuzzy、filename、多重或non-eligible命中、candidate owner與text不一致均為unresolved。完成此步後，owner-null且明確`applicability_scope=overall`的canonical candidate才可成為recognition common；resolver不得新增eligible targets。沒有overall時common保持`unset`，不得以unique mode／majority推導；同一scope多值、same owner多值或unresolved applicability／source conflict一律blocked。
5. explicit Part candidate與common不同才成recognition override；manual common／override只存在local draft與event snapshot，允許在沒有field source candidate時形成explicit intent。readonly／unsupported evidence不得變成target patch；manual-only change不得建立synthetic candidate或formalization link。
6. existing work使用formal／work／planned三方比較：`work==formal`可套planned，`work==planned`為already-in-work，第三值為explicit conflict。projection是advisory；POST必須全部重算。
7. GET簽發15分鐘canonical workbench contract。token過期時client保留draft與同一logical idempotency key，fresh GET後重試；不得清空使用者輸入。

### 21.2 Handoff command

1. route只接受≤64 KiB JSON、positive `expectedRowVersion`、exact GET fingerprints、最多4 common fields、最多400 `(part,field)` overrides；拒絕duplicate tuple、unknown field、unknown intent、空`value`、client workId／owner／target list等authority欄位。
2. canonicalize intent後計算`draftHash`；material／color `value`只寫label並清code，`clear`寫label/code=`null`，`not_applicable`寫label=`無`／code=`null`；surface／variant依intent寫string、`null`或`無`。missing不產生patch。
3. access先要求`numbering.recognition.formalize`，再求值既有`numbering.workspace.create/update`與non-owner scope。若plan含new work但無create，或含existing mutation但無update／edit scope，整筆403／409且zero write。
4. outer command固定`drawing_recognition.part_work_handoff.v2`，idempotency payload=`sessionId + expectedRowVersion + sourceFingerprint + relationFingerprint + draftHash`；same key same payload replay，same key different payload映射409。
5. transaction依22節鎖序重算所有authority與basis，先完成全target preflight，再呼叫Part repository `applyLockedBatch`。不得呼叫`PartChangeWorkService`，避免在outer transaction內建立第二個獨立receipt。
6. zero delta不建立work；created／updated work各雙寫work＋state。non-target fields保持，pre-existing work不因zero delta被cancel。
7. 寫一筆schema-v2 event；每個exact intent都進`applied_changes_json`。只有具source candidate的positive field才建立link，且只使用物理constraint允許的kind、最多25 links一批；manual-only／no-op／already-in-work不建立假link。
8. 最後把session更新為physical `formalized`。任一步驟／fault失敗由outer transaction rollback work、state、event、links、session與receipt／outbox。
9. response loss時client先GET；若same session已有v2 event且draftHash相符即收斂，否則以原body／key replay。不可因timeout產生新key。

### 21.3 Result and destination

- `created | updated`計入`workMutationCount`；`already_current | already_in_work`計入`unchangedCount`。
- positive action copy=`帶入 N 個料號工作`；zero delta=`確認資料已一致`。event成功後copy只能是`已帶入料號工作`／`資料已一致`，不得顯示`已寫入PDM`。
- destination固定`/parts/{sourcePartId}/workspace?workId={sourceWorkId}&returnTo={encodedDrawingWorkspace}`；source為natural order第一個mutated Part，zero delta為第一個eligible Part。`returnTo`只接受same-origin allowlisted Drawing workspace path。
- DEV-108 current local route可用時，I01..I04必須以相同source revision、task-owned fixture與normal destination執行；若110-0發現route／contract不可用或dirty overlap無法安全整合，I01..I04維持Not Run、aggregate不得complete，不得建立臨時第二matrix或mock冒充下游。

## 22. Query, Lock And Performance Budget

### 22.1 GET budget

- reviewable／terminal rich projection在同一repeatable read snapshot的domain SELECT固定≤7：scoped session、sources、candidates、observations、adapter results、formal rich Part scope `LIMIT 101`、current v2 event。另允許1個canonical authority-control query；permission/company guard queries獨立計數且不得隨Part數成長。`queued／extracting`processing shell固定≤3個domain SELECT且不開Part/work rich snapshot。
- initial projection不得讀附件bytes或逐Part query；100 Parts response body上限750 KiB。若實作需要第8個domain SELECT、N+1或新index／migration，命中stop condition先回Dev PM。

### 22.2 Handoff budget

- 每次serializable attempt固定preflight domain statements≤8：authority、Drawing lifecycle/work、current source basis＋adapter readiness、session／lineage／existing event、candidate basis、formal relation/root scope、sorted formal Part/state batch、sorted active work/state batch。
- `M=created+updated≤100`、`L=changed field links≤4M`。Part writer每個mutation最多2個statements，event 1、session 1、links每25筆一批，故domain上限為`10 + 2M + ceil(L/25)`，最壞`226`。
- current platform mapping／receipt／single outbox正常first attempt固定8 statements，故transaction per-attempt總上限`234`；pure replay path≤5。permission guard不在transaction且不得隨target數成長。PostgreSQL serialization retry最多沿用existing 3 attempts，但每attempt均需保留相同上限與idempotent結果。
- 禁止existing create／update primitive內再做N次read-lock；batch primitive必須一次鎖完再依sorted Part ID雙寫。禁止client order、natural display order或focused candidate影響lock order。

### 22.3 Lock and timing gate

`canonical authority read → Drawing aggregate/work → current source snapshot → recognition lineage/session → formal relation/root → sorted Part rows/formal states → sorted Part works/work states → event/session`。

PostgreSQL outer transaction=`SERIALIZABLE`＋relevant `FOR UPDATE`；source集合在同一serializable snapshot重算，不能literal lock的append-only／heterogeneous來源靠serialization conflict fail closed。SQLite handoff mutation沿用top-level `BEGIN IMMEDIATE`；processing poll不得取得write-reserved transaction，reviewable rich GET必須保持短交易並以worker-write latency gate證明不飢餓。100-Part clean fixture在disposable PostgreSQL每次transaction lock-hold必須<5s、end-to-end<8s；20次雙tab race不得deadlock／partial effect，若超標不得藉放寬100上限或statement timeout掩蓋。

## 23. Permission, Error And Compatibility Matrix

| Condition | HTTP／code family | Mutation |
|---|---|---|
| viewer／company mismatch／缺Part capability | 403 safe permission error | zero |
| token expired／authority changed | 409 `WORKBENCH_CONTRACT_EXPIRED` | zero；fresh GET保留draft |
| rowVersion／source／relation／formal/work fingerprint drift | 409 typed stale | zero；reload |
| 101 targets／unsupported field／invalid explicit intent | 422 typed validation／scope limit | zero |
| third-value work conflict | 409 typed conflict＋safe exact Part summary | zero，直到explicit resolution |
| review-owner／system／blocked／duplicate work | 409 typed work blocker | zero |
| same key different payload | 409 idempotency mismatch | zero |
| transaction／provider fault | 503 retryable safe envelope | rollback，無raw SQL／stack |

Legacy DEV-107 direct-master event immutable；missing `schemaVersion`／destination仍投影`direct_master`。canonical DEV-110 UI network不得呼叫legacy commit／formalize／write-impact。`drawing_recognition_formalization_events.session_id UNIQUE`表示一個session只能有一個completion event；要重新編輯走既有amendment successor，不能覆寫event。

## 24. RD Slices, Dependencies And Estimate

| Slice | Exact work | Exit gate | Estimate |
|---|---|---|---:|
| 110-0 Boundary freeze | rebase dirty overlap、確認DEV-108 `initialPayload`與canonical Part route contract、重算hash／no-touch | 無unresolved overlap；shared primitive存在 | 1.0–1.5 pd |
| 110-A Projection | pure contract、formal-only scope、verified owner provenance／canonical-token resolver、snapshot GET、token、query instrumentation | C01..C08＋R01..R04 | 3.0–4.0 pd |
| 110-B Atomic handoff | access、route、command、batch Part primitive、event/link、rollback／race | R05..R16＋P01..P08 | 5.0–7.0 pd |
| 110-C Panel UX | common／exceptions／source、stable evidence、responsive／a11y、idempotent controller | B01..B16 | 3.5–5.0 pd |
| 110-D Downstream／snapshot | DEV-108 destination、safe return、Drawing submit／review summary、legacy cutover | I01..I08 | 2.0–3.0 pd |
| 110-E Convergence | aggregate、regressions、typecheck／lint／isolated build、evidence／cleanup | G01..G04與60/60 | 2.5–3.5 pd |

Total=`17.0–24.0 person-days`，含SQLite／PostgreSQL／real browser與shared Part batch primitive；不含DEV-108 matrix本體、production migration／deploy／release。A與pure C可先進行；B開始前必須完成110-0；D與Local Complete gate必須以110-0確認的DEV-108 exact route、相同source revision及provider evidence執行。

## 25. Dirty Boundary And Kickoff Guard

Current source存在其他DEV未提交變更，以下hash只是assessment fingerprint，不是可覆寫的clean baseline：

| File | 2026-08-31 SHA-256 | Status／rule |
|---|---|---|
| `drawing-recognition-workspace-panel.tsx` | `dc45ea2db6777fa6d12fbba9083d6faab3ec9f9f93c2f179f6f99aa2d23b5df4` | modified；DEV-110需整合，不可整檔替換。 |
| `canonical-drawing-change-workspace.tsx` | `829593ff6d5e005bda6189f2a2b4b4c3689095ea2137abe5600306f0ca7b9a16` | modified；只允許evidence guard小範圍變更。 |
| `drawing-recognition.ts` | `4736bfc962b1f25d8678f3d0c7ed5fdca27242a7d2439337db64dab98d670480` | modified；保留DEV-107功能。 |
| `drawing-recognition-async-repository.ts` | `c5761b92ca970272d2ab31b09b0789dc7caecc092c3f340175e0872635f8ea7d` | modified；不得回退amendment／source fixes。 |
| `part-change-work-async-repository.ts` | `c653772a5e5734ea1cdc7b1944cd51ba616c638cae08df57a01e4060110d8a47` | modified；含shared DEV-108 initial payload，先rebase。 |
| `drawing-recognition-review-projection.ts` | `253a90e80edd8c077a4616249b758c6cf9b2b915f66921529cef864d63687d78` | modified；只允許v2 completion DTO與v1相容解析。 |
| `drawing-recognition-review-snapshot.ts` | `fb8e22711444fe8b344f1f37a22938e83fc485acf9f608c54e9f7bdadf9849b7` | modified；保留DEV-107 exact formalized leaf選擇，只加event hydration。 |
| `pdm-review-package.ts` | `00072cc60243ce5654f3ddfd6c49677ad576f7d0e983ba868c418b0ecc7555e8` | modified；保留DEV-101 immutable package／authority，只加destination-aware writer／parser／guard。 |
| session GET route | `9ab6ea2bfbd456c9c8f66e2d1feb6fefe533f5d306bdb410d76650e26009cdbb` | clean at assessment。 |
| `package.json` | `9af1180e28790075ed3c593ea8069e75c1bbeefe69771cc05aa60b0c9bc6492e` | modified by other DEV scripts；只增DEV-110 keys。 |

此外`part-change-work.ts`與Part create route為modified、DEV-108 matrix contract／repository／component為untracked；它們全部是DEV-110 no-touch integration dependency。110-0必須重新執行`git status --short`、`git diff -- <target>`、SHA ledger與Spec Impact Preflight；若變更owner不明或無法保留，停止並請使用者協調，不得reset／checkout／整檔覆寫。

## 26. RD Implementation Readiness Result

- Architecture：accepted且repository assessment可落地；scope-aware evidence取代統計mode，linked adapter exact-owner provenance與existing observation完整canonical token one-to-one resolver已凍結，legacy suffix／unanchored與模糊／縮寫一律fail closed；manual intent不依賴candidate、destination-aware review consumer與物理link constraint均已封口，schema／migration仍為0。
- Exact files／algorithms／API／permission／query／lock／provider／runner／fixture／fault／estimate／dirty guard：complete。
- Human gaps：0；P0/P1 planning gaps：0。
- QA execution：`npm run qc:dev-110:aggregate` 產生固定60/60 PASS：C01..C08、R01..R16、P01..P08、B01..B16、I01..I08與G01..G04，並完成typecheck、affected lint、isolated build、primary SQLite invariants與task-owned cleanup。DEV-107 38/38只能作legacy baseline，不能借給DEV-110。
- Dispatch：`RD Implemented Locally / Full QC Passed 60/60`。後續僅剩獨立runtime activation／production release gate，不在本DEV內執行。
