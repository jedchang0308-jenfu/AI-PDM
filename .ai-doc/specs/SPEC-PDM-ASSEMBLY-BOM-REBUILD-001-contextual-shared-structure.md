# SPEC-PDM-ASSEMBLY-BOM-REBUILD-001：組立件情境式共用 BOM 重建

狀態：RD Implementation Ready / Human Confirmed / Local Implementation Eligible / RD Not Started / Production Release Gated

DEV：`DEV-096`

父 DEV：`DEV-095`

風險：High（跨主資料、BOM ownership、review／release、where-used與provider migration）

Decision：

- `.ai-doc/decisions/ADR-PDM-ASSEMBLY-MASTER-ENTRY-001-canonical-workbenches-only.md`
- `.ai-doc/decisions/ADR-PDM-BOM-STRUCTURE-SHARING-001-variant-part-applicability.md`
- `.ai-doc/decisions/ADR-PDM-MATERIAL-IDENTITY-REVISION-001-part-number-vs-controlled-definition-revision.md`

Validation：`.ai-doc/qa/qa-dev-096-assembly-shared-bom-rd-contract-validation-plan-2026-08-24.md`

## 1. 目的與成功結果

在不恢復 `/bom/new`、組立件首頁或其他專用入口的前提下，從現行統一建號與料號工作臺建立組立件 BOM。顏色或其他非結構性變體使用同一個 BOM Definition／Revision／Released Snapshot，並透過明確適用料號與 Parent-to-Child對應，讓每個 Parent都能投影成唯一、可製造的 BOM。

Current Phase成功時：

- 新建號可明確選擇`單一零件／組立件`，組立件必定同時建立 Part與主要製造圖 M。
- 只有組立件的料號抽屜出現一個 server-derived BOM action。
- 同 root顏色變體可複選，共用一份 BOM，不複製結構。
- Child複選只代表一個邏輯位置的變體候選，不新增 line、不倍增 quantity。
- Draft可以保留未完成映射；送審與發行前，每個 Parent投影必須完全確定。
- 現有 generic BOM editor、review／release、diff、where-used與export改讀同一 shared authority。

## 2. Human Decision Brief

### 2.1 已確認

1. 組立件不新增頂層入口；沿用現行`統一建立編號`及 canonical Drawing／Part identities。
2. BOM action只屬明確的組立件；單一零件不可見`建立 BOM`或`開啟 BOM`。
3. `.SLDASM`屬 exact Drawing Revision 的`cad_3d`檔案；Parent Part由產品 context決定，不由檔名猜測。
4. reference filename使用圖料根號時只產生 root候選；不得自動建 Part、任選 Part或直接寫 BOM。
5. Parent與Child候選都必須可複選。顏色差異不建立多份 BOM；多選Child不代表多 line或多倍 quantity。
6. CAD提取只可產生結構建議與 diff；人類確認後的 canonical command才可寫 Draft。

### 2.2 Current Phase 收斂決策

1. `structure_type`的 canonical authority是 Part Number，不是 Drawing、檔案、root或 BOM是否存在。
2. Current Phase合法組立件固定為`item_kind=manufactured`、`structure_type=assembly`且具有 primary manufacturing Drawing M。`purchased + assembly`列為產品re-entry，不在本期猜測其R圖／供應商BOM語意。
3. 建立／開啟 BOM的 owner surface固定為`料號工作臺抽屜`。Drawing抽屜只保留Drawing檔案與關聯矩陣；使用者須先選到 exact Part，避免同一Drawing連多個顏色Part時出現隱含Parent。
4. 共用結構具有 stable `BOM Definition` identity；BOM Revision屬於Definition，適用Parent集合與變體映射按Draft／Released Snapshot凍結。
5. Current Phase允許初建時複選Parent，也允許在下一個新BOM Revision加入同root Parent；已Released後移除Parent、跨root共用及detach／fork執行列為Future Phase。
6. Release不接受可任選的interchangeable candidate set。每個Parent／邏輯位置必須解析成唯一Child；採購替代料治理不由本期變體映射取代。

### 2.3 已否決

- 恢復 `/bom/new`、sidebar建立入口、組立件wizard或CAD／XLS source selector。
- 以 root隱含套用所有料號。
- 繼續以單一`owner_part_number_id`作 shared BOM唯一authority。
- 每個顏色複製一份 BOM。
- 把多選Child寫成多個BOM line或把quantity乘上候選數量。
- 上傳`.SLDASM`後自動建立／發行 BOM。

## 3. Current Architecture Impact

### 3.1 現況事實

現有 runtime把 `bom_drafts.owner_part_number_id`用於建立、revision conflict、active／pending唯一性、權限、list、diff、release snapshot、obsolete、export與where-used關聯。`bom_release_snapshots`同樣只保存一個owner；`bom_lines_tree`只保存單一part number文字，沒有canonical child identity或per-parent variant mapping。

因此只新增一張多選關聯表會形成雙重authority，無法正確處理revision、發行、匯出與where-used。本DEV必須讓BOM Definition成為結構identity，applicability與resolved projection成為read／write authority；舊owner欄只保留migration／compatibility投影，不能繼續決定行為。

### 3.2 Spec Impact

分類：`Intentional replacement + cross-spec convergence`。

- 延續 `DEV-095`：不恢復DEV-060的 `/bom/new`、from-assembly、CAD/XLS auto-materialize或submission-bound owner。
- 相容擴充 `DEV-093`：新增正交`structureType`；新圖料仍不顯示`建立內容`，合法結果由item kind＋structure type推導。
- 有限修訂 `SPEC-BOM-WORKBENCH-001`：generic editor／review／release保留；新建立、ownership、revision lookup、export與where-used改以本規格為準。
- 延續 `DEV-087/090`：BOM情境投影加入Part detail，但不改Drawing／Part current-state authority，也不把BOM狀態混入Part的data state／handling。

## 4. Domain Model

### 4.1 Identity hierarchy

```text
Part Number（structure_type = assembly）
        │ explicit applicability
        ▼
BOM Definition（stable shared structure identity）
        │
        ├─ BOM Revision 1 → Draft／Review → Released Snapshot
        └─ BOM Revision 2 → Draft／Review → Released Snapshot
                                  │
                                  ├─ applicable Parent snapshots
                                  ├─ shared logical tree
                                  └─ exact Parent → Child variant mappings
```

### 4.2 Required objects

| Object | Authority與必要欄位語意 |
|---|---|
| Part structure type | Part Number層的`single_part／assembly`。Migration-only可有`unclassified`；新建號不得產生unclassified。 |
| BOM Definition | stable identity、company、root scope、row version、created audit；不等於root，也不以任一顏色Part作永久owner。 |
| BOM Draft | definition id、BOM revision、existing lifecycle status、editor version、source=`manual`。新寫入不得以legacy owner欄決定uniqueness。 |
| Draft applicable parents | draft＋Part的explicit set；context Part必須包含其中。每個Draft至少一個Parent。 |
| Logical BOM line | 階層、line identity、quantity、fixed／by_parent mode、canonical child Part或group。 |
| Parent-to-Child mapping | by_parent line下，每一 applicable Parent恰好對應一個canonical Child Part。候選集合本身不是formal mapping。 |
| Released Snapshot | immutable definition／revision、parent binding snapshot、shared line snapshot、mapping snapshot、resolved per-parent projection與hash。 |

實作名稱固定如下；不得再由RD另創平行命名，也不得省略stable definition、Draft applicability、immutable release applicability及exact mapping四項authority：

- `bom_definitions`
- `bom_definition_parent_bindings`
- `bom_draft_parent_bindings`
- `bom_draft_component_nodes`
- `bom_draft_component_candidates`
- `bom_draft_parent_selections`
- `bom_release_parent_snapshots`
- `bom_release_resolved_lines`
- `bom_shared_structure_migration_issues`

現有 `bom_drafts.owner_part_number_id`與`bom_release_snapshots.owner_part_number_id`可暫保為anchor／相容投影；任何新command、permission、revision、release、search、where-used或export不得只讀此欄作決策。

### 4.3 Invariants

1. 一個Definition只屬一家公司；Current Phase所有適用Parents必須同company、同`part_root_id`、`structure_type=assembly`、`item_kind=manufactured`且不是Obsolete／Merged／MainDrawingInvalid。
2. 每個適用Parent必須存在primary manufacturing Drawing M；只有reference Drawing不得建立或加入shared BOM。
3. 一個Parent同時間只能有一個current BOM Definition applicability。歷史obsolete snapshots不算current，但保持可查。
4. 同Definition＋BOM Revision只能有一個active Draft／Rejected及一個PendingReview；Released Snapshot唯一且immutable。
5. applicable parent set去重且至少一筆；context Part一定包含於set，server不得信任client排序。
6. fixed line恰有一個canonical Child；by_parent line對每個適用Parent恰有一個mapping，且全部候選Child同company、同child root。
7. by_parent候選數量不改變line quantity。多個Parents可以映射同一Child。
8. item line quantity必須大於0；group沒有quantity；至少一個item line才可送審。
9. 不允許Parent直接引用自己；release gate必須阻擋resolved BOM graph cycle。
10. Draft／Rejected可修改；PendingReview／Released／Obsolete不可修改。發行後任何tree、applicability或mapping變更都建立新Revision。

## 5. Numbering與Structure Type Contract

### 5.1 New-root input/output

`CanonicalNumberingCreateIntent`新增：

```ts
structureType: "single_part" | "assembly"
```

| Input | Server rule | Output |
|---|---|---|
| `manufactured + single_part` | 沿用DEV-093 | Part＋Drawing M；Part structure type=single_part |
| `manufactured + assembly` | Current Phase合法組立件 | Part＋Drawing M；Part structure type=assembly |
| `purchased + single_part` | 沿用DEV-093 | Part；可選Reference Drawing R |
| `purchased + assembly` | 本期不支援 | 422，零sequence／root／Part／Drawing／relation write |

`structureType`為required field；preview純讀且回傳預估結果，正式create在同一transaction建立identity、relation與structure type。idempotency fingerprint必須包含structure type。

### 5.2 Existing-root

- 只新增Drawing時不輸入structure type。
- 新增Part或Drawing＋Part時，structure type必填；item kind繼承root既有規則，structure type不從檔案或同root其他Part靜默推導。
- UI可以在同root active Parts結構型態一致時預選，但提交payload仍必須明示；server以新Part輸入為authority。
- 既有Part改`single_part ↔ assembly`不走建號command；必須進入現有Part change work／review。若有current／released BOM applicability，改回single_part必須fail closed，直到受控obsolete／detach完成。

### 5.3 Migration classification

- exact canonical manual BOM owner存在且沒有衝突：classify為assembly，建立Definition與唯一applicable binding。
- 沒有任何current／released BOM evidence的既有Part：依使用者重建邊界classify為single_part。
- owner缺失／歧義、跨company、同Part多個current definitions、orphan snapshot或revision lineage不唯一：classify為unclassified並列入migration issues；不得猜測或顯示BOM action。
- `.SLDASM`存在與否不得作structure type migration依據。

## 6. Part Workbench UX Contract

### 6.1 Owner surface

Current Phase唯一BOM action位於Part drawer；Drawing drawer不顯示BOM action。Part detail projection新增獨立`bomContext`，不得把BOM lifecycle混成Part的`dataState`、`handling`或既有footer lifecycle action。

Server-derived states：

| Part情境 | BOM section | 唯一動作 |
|---|---|---|
| single_part／unclassified／inactive | 整段不顯示 | 無 |
| assembly，無definition/binding | 顯示最小BOM區 | `建立 BOM` |
| assembly，有Draft／Rejected | 顯示Revision＋狀態＋適用數 | `開啟 BOM` |
| assembly，PendingReview | 顯示Revision＋審核中＋適用數 | `開啟 BOM`（依權限唯讀／審核） |
| assembly，Released | 顯示latest Revision＋已發行＋適用數 | `開啟 BOM` |
| assembly，ownership／migration異常 | 顯示最短錯誤原因 | 無；不可fallback建立第二份 |

### 6.2 Minimal create dialog

點擊`建立 BOM`只開啟一個輕量dialog，不導向新建立頁。欄位固定為：

1. Current Part：唯讀、必選且不可取消。
2. 適用料號：同company／同root／assembly／manufactured／active候選的checkbox複選；current Part預選。不得自動全選。
3. BOM Rev：沿用existing major revision policy與server suggestion。
4. 一個primary `建立 BOM`、一個secondary `取消`。

不得顯示source、CAD／XLS、Drawing revision、owner type、root重選、說明卡、步驟列或成功頁。成功後直接進既有`/bom/workbench/[draftId]`；失敗保留選取與輸入並就地顯示原因。

### 6.3 Editor variant interaction

- Tree仍以邏輯零件位置為主，不為每個顏色Parent複製節點。
- 插入一個Child候選時建立fixed line。
- 複選同child root的多個Part時，該line切為`依適用料號對應`；Inspector顯示每個Parent一列、每列exact一個Child選擇。
- 未完成mapping可保存Draft，line顯示單一未完成狀態；不得在tree同時疊badge、色塊與重複警告。
- review前的blocking list集中列出未完成Parent／line；正常完成狀態不顯示教學或成功說明。

### 6.4 UX Intent

- 任務／結果：工程人員從exact Part建立或續作一份可同時適用顏色變體的BOM。
- 主物件／主焦點：Part drawer中的BOM context；進editor後主焦點為shared logical tree。
- 預設刪除：Drawing drawer action、sidebar create、source chooser、root owner說明、常駐教學、適用Parent卡片牆與每Parent複製tree。
- 保留舉證：structure type避免單一零件誤建；適用料號複選避免BOM複製；impact list避免shared release靜默影響多Parent；mapping blocker避免formal ambiguity。
- 非語言修復：以欄位順序、current Part鎖定、checkbox選取、single line狀態及disabled primary呈現，不新增教學面板。
- 風險與驗證：dirty guard、stale selection、鍵盤／focus、screen reader、1440×900／1024×768／768×1024／390×844、無水平overflow／雙重捲動。

## 7. Current Phase API I/O Contract

### 7.1 Part detail projection

現有Part detail response新增：

```json
{
  "bomContext": {
    "structureType": "assembly",
    "eligibility": "eligible",
    "action": "create_bom",
    "definitionId": null,
    "draftId": null,
    "releaseSnapshotId": null,
    "bomRevision": null,
    "status": null,
    "applicableParentCount": 0,
    "blocker": null
  }
}
```

`action`只可為`create_bom／open_bom／none`，完全由server依exact Part與permission投影。Client不得從structure type、matrix、檔案或BOM list自行拼action。

### 7.2 Applicability candidates

Dialog開啟時由server按context Part查詢候選，輸出：context Part、same-root eligible Parts、目前binding conflict、selection ETag／row versions。Candidate至少包含canonical id、part number、name、specification及不可選原因；不得回傳跨company或single parts作可選項。

### 7.3 Create Draft

沿用 canonical `POST /api/bom/drafts`，不新增第二條create writer。

Input：

```json
{
  "contextPartNumberId": "part-id-red",
  "applicableParentPartNumberIds": ["part-id-red", "part-id-blue"],
  "bomRevision": "1",
  "source": "manual",
  "baseReleaseSnapshotId": null
}
```

Headers：`idempotency-key`、fresh canonical workbench contract／selection ETag。

Rules：

- normalize、dedupe、sort IDs；context Part必須存在於set。Initial create的`baseReleaseSnapshotId=null`；next Revision必須帶建立候選contract時回傳的latest current snapshot ID。
- lock Definition scope及全部Part IDs（固定排序），重新驗證company／root／status／structure／M drawing／current binding。
- 一個transaction建立Definition、Draft、applicability bindings、create effect、append-only audit及BOM edit event。此domain沒有外部side effect，不新增platform outbox。
- request fingerprint包含context、sorted applicability、revision、source、base snapshot ID及selection ETag。DEV-096不接受client自訂`draftName`；server固定以`{rootCode} BOM Rev {bomRevision}`命名，避免把任一顏色Part誤當owner。
- legacy `ownerPartNumberId`可供existing compatibility flow讀取；DEV-096新create request若只送owner而沒有applicability set，固定422，不得默默建立single-owner新authority。

Output：

```json
{
  "definitionId": "bom-definition-id",
  "draftId": "bom-draft-id",
  "bomRevision": "1",
  "applicableParents": [
    { "partNumberId": "part-id-red", "partNumber": "A0001-P01" },
    { "partNumberId": "part-id-blue", "partNumber": "A0001-P02" }
  ],
  "receipt": { "idempotencyKey": "...", "replayed": false },
  "workbenchUrl": "/bom/workbench/bom-draft-id?parentPartNumberId=part-id-red"
}
```

### 7.4 Save Draft tree

既有save command保留`expectedEditorVersion`、`lines`及`floatingTopics`；為了讓節點在tree與floating區移動時仍保留同一component metadata，variant資料不得嵌入兩張既有節點表，而以同request的`components`陣列提交：

```json
{
  "expectedEditorVersion": 7,
  "lines": [
    { "id": "draft-node-id", "logicalLineId": "logical-line-id", "parentLineId": null, "nodeType": "item", "partNumber": "CHILD-ROOT", "quantity": 1, "sequenceNo": 1 }
  ],
  "floatingTopics": [],
  "components": [
    {
      "nodeId": "draft-node-id",
      "logicalLineId": "logical-line-id",
      "nodeLocation": "tree",
      "componentMode": "by_parent",
      "childPartNumberIds": ["child-red", "child-blue"],
      "parentSelections": [
        { "parentPartNumberId": "part-id-red", "childPartNumberId": "child-red" },
        { "parentPartNumberId": "part-id-blue", "childPartNumberId": "child-blue" }
      ]
    }
  ]
}
```

每個group/item node都必須有`logicalLineId`；同一Draft跨tree／floating不得重複，next Revision clone保持不變，新建node由client使用`crypto.randomUUID()`產生且server驗證UUID格式、Definition歷史collision及同Draft唯一性。每個item node必須exactly one component record，group node不得有component record；`nodeLocation`／`nodeId`／`logicalLineId`必須與實際tree／floating位置一致。fixed必須exactly one Child且`parentSelections=[]`；by_parent需至少一個候選，UI在只剩一個候選時正規化為fixed。Draft可保存incomplete mapping，但response必須回傳`unresolvedMappings`。Candidate IDs不是正式line quantity；server只建立一個logical line。tree、floating topics、component nodes、candidates、parent selections及`editor_version`必須在同一transaction完成compare-and-swap。

### 7.5 Review／release／read

- submit review前驗證至少一個item line、floating topics=0、reconfirmation=0、all parent mappings complete、no cycles、all Parts可用、applicability ETag未變。
- review diff同時顯示tree、quantity、applicable Parent set與variant mapping差異；review snapshot固定exact set，review期間不得跟隨latest。
- approve在同一transaction建立immutable release snapshot、parent snapshots、mapping snapshots、resolved per-parent hashes，並更新Draft／review及append-only audit；不新增platform outbox。
- 同Definition前一個Released Snapshot整體進Obsolete；不得只對部分Parent靜默替換。
- `/bom/workbench/[draftId]`從Part context帶`parentPartNumberId`。Editor顯示shared tree；read-only downstream view顯示該Parent resolved projection。
- released export在applicable count>1時必須指定`parentPartNumberId`；缺少或不適用固定422。檔名使用selected Parent Part Number＋BOM Rev。
- where-used只列實際resolved為該Child的Parents；不能因Child是候選之一就列出所有適用Parents。

## 8. Permission Contract

| Capability | Engineer | R&D Manager | Admin | Manufacturing／Procurement |
|---|---:|---:|---:|---:|
| 看Part BOM context | company scope | company scope | company scope | Released summary only |
| 建立／編輯／提交BOM | 是 | 是 | 是 | 否 |
| 決定review／release | 否 | 是 | 是 | 否 |
| 讀Draft shared tree／mapping | company scope | company scope | company scope | 否 |
| 讀Released exact projection／export | 是 | 是 | 是 | 是，限company與exact Parent |

- 所有read／write都需company access；applicable set任一跨company即整筆拒絕。
- Create／save／submit不得只因使用者能讀其中一個Parent就擴權到其他Parents；必須對全部applicable Parents重新檢查。
- Structure type的新建權限沿用`numbering.create`；既有Part變更沿用Part change work權限與review，不由BOM API直接修改。
- reviewer不得核准自己沒有company access或review role的shared BOM；Manufacturing／Procurement永遠不讀Draft candidate／mapping資料。

## 9. State、Concurrency與Failure Contract

### 9.1 State transitions

```text
Definition created
  └─ Draft ⇄ Rejected
       └─ PendingReview
            ├─ Rejected → same Draft
            └─ Approved → Released Snapshot
                                  └─ next Revision Draft
                                       └─ next Released → prior Snapshot Obsolete
```

Current Phase不支援從Released definition移除單一Parent、partial obsolete或cross-root fork。若發現需求，停止而不是直接改binding。

### 9.2 Concurrency

- Create按sorted applicable Part IDs＋root／definition scope取得provider-safe lock。
- Selection ETag、Part row versions或structure type在dialog載入後改變：409 `BOM_APPLICABILITY_STALE`，零write。
- 同一Part被另一Definition同時綁定：只有一個transaction成功，其餘409。
- Save沿用editor version optimistic concurrency；tree與mapping同一transaction，不得部分更新。
- Approve重新計算resolved projections與hash；review snapshot、current Draft或Part applicability任何stale都409，review保持Pending。
- 同idempotency key相同fingerprint replay同receipt；不同fingerprint 409。

### 9.3 Stable error boundary

| Code | HTTP | Meaning／recovery |
|---|---:|---|
| `BOM_CONTEXT_PART_REQUIRED` | 422 | 缺exact context；回Part drawer重開 |
| `BOM_PART_NOT_ASSEMBLY` | 422 | single／unclassified不得建立 |
| `BOM_ASSEMBLY_REQUIRES_M_DRAWING` | 409 | 補齊primary M relation後重試 |
| `BOM_APPLICABILITY_SCOPE_MISMATCH` | 422 | actor可讀的same-company候選root／structure不一致；移除候選。跨company ID固定404 |
| `BOM_RESOURCE_NOT_FOUND` | 404 | 資源不存在或actor不應知道其存在（含跨company ID） |
| `BOM_CAPABILITY_FORBIDDEN` | 403 | 資源在actor company內，但role缺少該command／read capability |
| `BOM_APPLICABILITY_CONFLICT` | 409 | Parent已有另一current Definition；不可自動合併 |
| `BOM_APPLICABILITY_PRECONDITION_REQUIRED` | 428 | create缺`If-Match`；重新載入候選contract |
| `BOM_APPLICABILITY_STALE` | 409 | reload candidate set，保留使用者選取的仍有效交集 |
| `BOM_VARIANT_CHILD_SCOPE_MISMATCH` | 422 | by-parent children不同company／root |
| `BOM_VARIANT_MAPPING_INCOMPLETE` | 409 | 定位缺mapping的line／Parent，Draft保留 |
| `BOM_RELEASE_PROJECTION_AMBIGUOUS` | 409 | 禁止review／release，零snapshot write |
| `BOM_DEFINITION_REVISION_CONFLICT` | 409 | 重新取得建議BOM Rev |
| `BOM_SHARED_STRUCTURE_DISABLED` | 404 | 新shared create／mutation未啟用；不暴露半成品action |
| `BOM_EDITOR_VERSION_CONFLICT` | 409 | 重新載入Draft；不得覆蓋另一位使用者的tree／mapping |
| `BOM_CHILD_PART_UNAVAILABLE` | 409 | Child已失效或失去正式identity；重新選擇 |
| `BOM_RELEASE_PARENT_REQUIRED` | 422 | multi-parent export／read缺exact Parent context |
| `BOM_RELEASE_PARENT_NOT_APPLICABLE` | 404 | 指定Parent不屬該snapshot；不得fallback owner |
| `BOM_SHARED_MIGRATION_BLOCKED` | 503 | capability activation inventory未過；維持legacy相容讀取 |
| `BOM_REVISION_BASE_REQUIRED` | 422 | 建立下一版缺latest current release snapshot；重新載入workbench |
| `BOM_REVISION_BASE_STALE` | 409 | base snapshot已不是latest current；重新載入，不建立平行新版 |
| `BOM_PARENT_REMOVAL_NOT_SUPPORTED` | 409 | Current Phase只允許新Revision保留舊集合並加入same-root Parent |
| `BOM_OPEN_REVISION_EXISTS` | 409 | Definition已有Draft／Rejected／PendingReview／Archived revision；開啟該版處理 |
| `BOM_RESTORE_CONFLICT` | 409 | Archived revision已非可恢復forward revision或已有另一open revision |
| `BOM_PARTIAL_OBSOLETE_NOT_SUPPORTED` | 409 | obsolete必須作用於整個Definition current Released Snapshot |
| `BOM_REVIEW_SELF_DECISION_FORBIDDEN` | 403 | submitter不得approve／reject自己的review |
| `BOM_OPERATION_RETIRED` | 410 | manual set-active已由單一open revision規則取代 |
| `BOM_SHARED_STRUCTURE_LIMIT_EXCEEDED` | 413 | Parent／candidate／node超過§26.3工程安全界線；縮小單次受控結構 |

所有DEV-096 API error固定回`{ "error": "STABLE_CODE", "message": "localized-safe-message", "details": {}, "correlationId": "..." }`；`details`不得含他公司ID、SQL或stack。已知同company資源但role capability不足回403；跨company或actor不應知道存在性的ID／URL tamper回404。未知transaction結果以同idempotency key查receipt；禁止client自行重建另一Draft。任何validation、permission、concurrency或provider failure都不得留下Definition無Draft、Draft無Parent、partial mappings或partial release snapshots。

## 10. Migration與Compatibility Contract

### 10.1 Provider-aware migration

- SQLite fresh schema與PostgreSQL forward migration必須同構，包含constraints、indexes、FK、uniqueness與snapshot authority。
- migration預設dry-run inventory；正式apply另受production migration／release gate。
- 先建立Definition／binding／snapshot structures，再轉換existing canonical manual BOM；不得恢復已由DEV-095刪除的CAD／XLS tables、sources或assembly references。
- 每個legacy owner lineage建立一個Definition，draft／review／release IDs與timestamps保持；owner建立sole applicable binding，line資料不改quantity／hierarchy。
- legacy owner欄保持read compatibility，但migration manifest必須證明new definition／binding coverage=100%或列入issue。
- manual_review、orphan、cross-company、duplicate current binding、revision lineage conflict全部fail closed；不得刪除或猜測。

### 10.2 Activation gate

Capability固定使用default-off環境旗標`PDM_ASSEMBLY_SHARED_BOM_V1=false`，實作於`src/lib/assembly-bom-feature.ts`。`isAssemblySharedBomV1Enabled()`只有在該flag為truthy、`isUnifiedPartRelationWorkbenchV1Enabled()`及`isBomXmindEditorV2Enabled()`同時成立時才回傳true；client status回傳`requested／enabled／flag／dependencies／phase="DEV-096"`。啟用前至少：

1. legacy canonical manual BOM draft／review／snapshot逐筆mapping 100%。
2. unclassified-with-current-BOM、orphan、duplicate current applicability、cross-company／cross-root、projection ambiguity、FK failure全為0。
3. existing Draft／Released counts、line counts、review decisions、timestamps與released snapshot hashes可重現。
4. legacy owner-only writer／revision／permission／export／where-used active callers為0；允許migration與明確compatibility reader。
5. migration apply／rerun no-op、SQLite／PostgreSQL parity、primary logical invariants與foreign key check通過。

Flag off時：既有manual single-owner regression writer／reader維持DEV-095相容行為，Part drawer不顯示DEV-096 BOM section，新numbering仍把未明示的legacy資料正規化為`single_part`但DEV-096新payload不可寫入。資料表與已完成migration的shared snapshot可被相容read／export讀取；若BOM XMind v2依賴被關閉，shared Draft只可唯讀，不得退回legacy editor造成mapping遺失。Flag on後，`POST /api/bom/drafts`只接受DEV-096 payload；owner-only payload固定422。正式flag activation仍屬release gate，不因本地實作完成自動開啟。

### 10.3 Release feasibility note

本DEV未產生release artifacts。未來若實作完成，正式啟用需由release gate確認provider migration順序、capability off migration、全量reconciliation、read-only canary、rollback/read compatibility及post-activation exact-parent export／where-used smoke。

## 11. Current Phase Slices與Gates

| Slice | Scope | Entry | Gate |
|---|---|---|---|
| 1A Structure／context | Part structure type、numbering validation、Part detail `bomContext`、Part-only action placement | DEV-095 retirement保持PASS | single part action=0；assembly必有M；no Drawing action；DTO/server authority一致 |
| 1B Definition／applicability | stable Definition、Draft parent bindings、create dialog、idempotent atomic create、migration converter | 1A contract與schema可用 | 多Parent一Draft；conflict／stale／cross-scope零write；legacy manual BOM100%轉換 |
| 1C Variant／release consumers | fixed／by-parent line、mapping completeness、review diff、release snapshot、exact export／where-used | 1B invariants PASS | 每Parent deterministic；no quantity multiplication；immutable snapshot；released-only permission |

三個slice皆屬Current Phase；只有1A-1C aggregate通過才可宣稱DEV-096產品完成。不得只做`建立 BOM`按鈕就標示完成。

## 12. Acceptance Criteria

1. `single_part`、unclassified、Purchased與inactive Part的Part／Drawing drawer均無BOM create/open action；assembly Part drawer只有一個正確action。
2. assembly new-root同transaction建立manufactured Part＋M Drawing＋primary relation＋structure type；illegal combinations與idempotency conflict零write。
3. 建立dialog只顯示current Part、適用料號、BOM Rev、建立／取消；同root assembly候選可複選且不自動全選。
4. 兩個以上顏色Parents建立exactly one Definition、one Draft、oneRevision；list/search/open不複製BOM rows。
5. fixed line與by-parent line都只有一個logical line及一個quantity；候選／Parent數量不影響quantity。
6. by-parent mapping可讓red Parent→red Child、blue Parent→blue Child；任一Parent缺mapping可保存Draft但不能submit／approve。
7. review diff完整顯示applicable set、tree、quantity與mapping；review snapshot不跟隨latest Part或Draft變化。
8. release對每個Parent產生唯一projection與hash；Released snapshot不可修改，下一次變更使用新Revision。
9. exact-parent export檔名、內容與where-used正確；multi-parent snapshot缺parent context時不猜測。
10. cross-company／cross-root／single-part／no-M／inactive／other-definition conflict、stale ETag、duplicate submit、graph cycle與provider failure全部fail closed且無partial rows。
11. Engineer／Manager／Admin／Manufacturing／Procurement權限符合§8；Released-only角色無法取得Draft shared tree、candidate或mapping。
12. legacy manual BOM零遺失轉換；DEV-095 retired route／source／writer仍為0，`.SLDASM`通用file authority不變。
13. normal/loading/empty/error/dirty/high-risk及四viewport、keyboard、focus、screen reader可完成主要任務，沒有死CTA、雙重捲動或常駐教學噪音。
14. isolated build／test前後primary schema、canonical identity、BOM counts／hash、migration residue及FK invariants保持；production write／deploy／release=false。

## 13. Stop Conditions

- 需要恢復獨立入口、root隱含owner、CAD/XLS writer或submission-bound BOM identity。
- 無法讓existing owner callers在create/revision/permission/release/export/where-used收斂到Definition＋applicability authority。
- migration會遺失manual BOM、review、Released history、line、where-used或audit evidence。
- formal snapshot仍可包含未解析candidate set、部分Parent mapping或同一Parent多個current Definitions。
- Current Phase被要求支援purchased assembly、跨root sharing、移除Released Parent、partial obsolete或detach／fork執行；須回到product re-entry，不得暗中擴張。
- 需要操作primary／production data、遠端schema或release但未進入相應gate。

## 14. Future Phase Capsules

### Phase 2：`.SLDASM` structure suggestion（Future Phase Captured / Not Requested）

目的：從exact Drawing Revision非同步提取references、hierarchy、quantity、custom properties與configuration，產生可解釋proposal及Draft diff。

解析優先序：full Part Number custom property → approved root＋configuration mapping → root唯一active Part → root多Part複選 → unresolved。若3D檔只以圖料根號命名（例`A0001.SLDASM`），stem只能解析為root候選：系統列出該root下合法assembly Parent Parts供人工複選，不能從根號推定紅／藍／黑哪一個料號；若子件reference也只有root且存在多個Parts，同樣產生一個logical line的複選Child candidates，再由每個Parent明確mapping。Parser不得建立Part、綁Parent或寫formal BOM；unresolved=0及人類確認後，以一次冪等transaction套用Draft。

Re-entry：Current Phase released/read model穩定，且已確認SolidWorks parser／worker capability、source evidence與proposal retention contract。

### Phase 3：applicability evolution（Future Phase Captured / Not Requested）

目的：支援Released後移除Parent、detach／fork、跨root經核准sharing、attribute-driven mapping、batch resolution與完整impact analysis。Current Phase已允許從latest Released建立下一版時加入same-root合法assembly Parent，但不允許移除既有Parent。

Re-entry：真實案例需要結構分歧或新增變體，且使用者確認fork、revision、obsolete與ERP／where-used治理。

## 15. Repository-specific Implementation Assessment

### 15.1 Current provider與transaction facts

- Runtime provider由`src/lib/db-async-provider.ts`統一為`sqlite | postgres | cloud_sql_postgres`；DEV-096不得新增provider-specific domain repository。
- PostgreSQL top-level mutation沿用Serializable transaction與既有retry contract；SQLite沿用single queued top-level transaction。Create／save／submit／approve都必須把DEV-096新增row納入同一既有transaction client，不可在route後補第二段write。
- SQLite fresh authority是`db/schema.sql`，existing local upgrade入口是`src/lib/db.ts`。DEV-096 initializer固定命名`ensureDev096SharedAssemblyBomSchema(database)`，排在`ensureDev090InlineRelationMatrixSchema`之後；以`ensureColumn`處理existing table additive columns，再執行`-- BEGIN DEV-096 shared assembly BOM authority.`至`-- END DEV-096 shared assembly BOM authority.`標記內的新table／index／trigger DDL。Fresh schema以CHECK／FK為主；SQLite無法用ALTER補入的cross-table／existing-column FK語意以named validation trigger補齊。Initializer只做idempotent schema，不啟動正式capability或猜測修復資料。
- PostgreSQL forward migration固定為`db/postgres/048_shared_assembly_bom.sql`，以`BEGIN`／`COMMIT`包覆並先取得`pg_advisory_xact_lock(hashtext('ai_pdm:dev096:shared-assembly-bom-v1'))`；不得修改`001_initial_schema.sql`假裝已遷移existing database。`db/postgres/README.md`追加048順序與capability-off activation note。
- 現有`bom_lines_tree`／`bom_draft_floating_topics`的`part_number`文字及`bom_release_snapshots.line_snapshot_json`是legacy display／compatibility資料；DEV-096正式identity由canonical Part IDs、component tables與resolved release rows決定。

### 15.2 Current call-site disposition

| Current owner-dependent area | DEV-096 disposition |
|---|---|
| `src/lib/repositories/bom-workbench-async-repository.ts` | Current Phase唯一BOM mutation authority；改為Definition/applicability/component/release projection。禁止另建第二repository。 |
| `src/lib/repositories/bom-repository.ts` | sync legacy compatibility only；不得新增DEV-096 writer caller。QC要求new shared writer caller=0；若既有sync AI/read仍需使用，只可讀released resolved authority。 |
| `src/lib/bom-create-context.ts` | access context由任一applicable Parent＋Definition導出，不再由owner單欄授權。 |
| `src/app/bom/workbench/page.tsx` | 保留同一路由／editor；新增context Parent與applicable count，不建立assembly專頁。 |
| `src/lib/repositories/item-insight-async-repository.ts` | where-used改讀`bom_release_resolved_lines`；candidate不算where-used。 |
| `src/lib/pdm-change-control-domain.ts` | reconfirmation／has-reference改查Draft canonical candidates／mappings與Released resolved rows；legacy union只限flag-off compatibility。 |
| `src/lib/transfer-package-phase1d.ts` | 由selected Parent binding取得latest exact resolved snapshot，不再以single owner找latest。 |
| `src/lib/repositories/approval-platform-async-repository.ts` | review inbox顯示Definition revision、context Parent及impact count；不把任一顏色Part當永久owner。 |
| release export route | exact Parent是multi-parent release必要輸入；authorization及filename皆用snapshot parent row。 |
| AI risk／summary／tools | 沿用`listWhereUsedAsync`結果；不得直接回讀legacy `bom_headers/bom_lines`或candidate集合。 |

## 16. Exact Relational Schema Contract

### 16.1 Existing table alterations

| Table | Exact additive change | Compatibility rule |
|---|---|---|
| `part_numbers` | `structure_type TEXT NOT NULL DEFAULT 'single_part' CHECK (structure_type IN ('single_part','assembly','unclassified'))` | 新建號只接受前兩值；`unclassified`只由migration產生。 |
| `bom_drafts` | `definition_id TEXT NULL REFERENCES bom_definitions(id)`、`base_release_snapshot_id TEXT NULL REFERENCES bom_release_snapshots(id) ON DELETE RESTRICT` | DEV-096新row的definition必填；initial Revision的base為null，next Revision必須指向建立當下latest current Released Snapshot。legacy row暫允許null。`owner_part_number_id`保留為context anchor，不是uniqueness／permission authority。 |
| `bom_lines_tree`、`bom_draft_floating_topics` | `logical_line_id TEXT NULL` | DEV-096所有group/item node必填；跨tree/floating移動與next Revision clone保持同一值。row `id`仍是Draft內實體節點ID，不得拿來作跨Revision diff identity。 |
| `bom_review_requests` | `review_schema_version INTEGER NOT NULL DEFAULT 1 CHECK (>0)`、`definition_row_version INTEGER NULL`、`editor_version INTEGER NULL`、`review_snapshot_json TEXT NULL`、`review_snapshot_hash TEXT NULL` | shared submit固定schema version 2且四個evidence欄不可空；Rejected/Approved後仍immutable。legacy version 1只作相容讀取。 |
| `bom_release_snapshots` | `definition_id TEXT NULL REFERENCES bom_definitions(id)`、`snapshot_schema_version INTEGER NOT NULL DEFAULT 1 CHECK (>0)`、`parent_snapshot_json TEXT NULL`、`mapping_snapshot_json TEXT NULL`、`resolved_projection_json TEXT NULL`、`snapshot_hash TEXT NULL` | DEV-096及完成backfill的snapshot固定schema version 2且五個新authority值不可空；legacy version 1只可flag-off讀取。 |
| `bom_reconfirmation_flags` | `logical_line_id TEXT NULL`、`parent_part_number_id TEXT NULL REFERENCES part_numbers(id)`、`reference_scope TEXT NOT NULL DEFAULT 'legacy_line' CHECK IN ('legacy_line','candidate','parent_selection')` | shared flags按exact logical line及適用時exact Parent定位；reconfirm只確認仍使用舊Child，不得自動替換candidate或mapping。 |

新增indexes：

- `idx_bom_drafts_definition_revision`：unique `(definition_id, upper(bom_revision)) WHERE definition_id IS NOT NULL`。
- `idx_bom_drafts_definition_one_open`：unique `(definition_id) WHERE definition_id IS NOT NULL AND status IN ('Draft','Rejected','PendingReview','Archived')`；一個Definition只能有一個未完成／可還原Revision。
- `idx_bom_drafts_definition_status`：`(definition_id, status, updated_at)`。
- `idx_bom_tree_logical_line`及`idx_bom_floating_logical_line`：各自unique `(bom_draft_id,logical_line_id) WHERE logical_line_id IS NOT NULL`；跨兩張表的exactly-once由save validator保證。
- `idx_bom_review_shared_hash`：unique `(bom_draft_id,review_snapshot_hash) WHERE review_schema_version=2 AND review_snapshot_hash IS NOT NULL`。
- `idx_bom_release_definition_revision`：unique `(definition_id, upper(bom_revision)) WHERE definition_id IS NOT NULL`。
- `idx_bom_release_definition_latest`：`(definition_id, released_at DESC)`。

既有owner-based indexes在capability-off compatibility期間保留；activation inventory證明new writer不依賴後才可於未來retirement migration移除，本DEV 048不做破壞性drop。

### 16.2 New authority tables

`bom_definitions`

| Column | Contract |
|---|---|
| `id TEXT PRIMARY KEY` | stable Definition ID。 |
| `company_id TEXT NOT NULL` | FK `companies(id)`。 |
| `part_root_id TEXT NOT NULL` | FK `part_roots(id)`；Current Phase scope boundary。 |
| `row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)` | parent binding／definition metadata CAS。 |
| `created_by TEXT NULL`, `updated_by TEXT NULL` | FK `users(id) ON DELETE SET NULL`。 |
| `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL` | provider-normalized timestamps。 |

Index：`(company_id, part_root_id)`。同root可因未來結構分歧存在多個Definition，因此不得對root設unique。

`bom_definition_parent_bindings`

| Column | Contract |
|---|---|
| `id TEXT PRIMARY KEY`, `company_id TEXT NOT NULL` | company FK。 |
| `definition_id TEXT NOT NULL` | FK `bom_definitions(id) ON DELETE CASCADE`。 |
| `part_number_id TEXT NOT NULL` | FK `part_numbers(id)`。 |
| `bound_from_bom_revision TEXT NOT NULL` | 首次加入Definition的revision evidence。 |
| `created_by TEXT NULL`, `created_at TEXT NOT NULL` | audit。 |

Constraints：unique `(definition_id, part_number_id)`及unique `(part_number_id)`。第二個unique是「一個Parent同時間只有一個current Definition」的DB reservation；Current Phase無detach，因此不需要`ended_at`。company／root／assembly／M relation屬cross-table invariant，由transaction validator與activation QC雙重驗證。

`bom_draft_parent_bindings`

| Column | Contract |
|---|---|
| `id TEXT PRIMARY KEY`, `company_id TEXT NOT NULL` | company FK。 |
| `bom_draft_id TEXT NOT NULL` | FK `bom_drafts(id) ON DELETE CASCADE`。 |
| `part_number_id TEXT NOT NULL` | FK `part_numbers(id)`。 |
| `selection_order INTEGER NOT NULL CHECK (selection_order >= 0)` | deterministic UI／snapshot order。 |
| `created_by TEXT NULL`, `created_at TEXT NOT NULL` | audit。 |

Constraints：unique `(bom_draft_id, part_number_id)`及unique `(bom_draft_id, selection_order)`；另建立composite unique `(bom_draft_id, part_number_id)`供mapping FK使用。Draft set建立後不直接patch；下一Revision從latest Released set複製後才可加入Parent。

`bom_draft_component_nodes`

| Column | Contract |
|---|---|
| `bom_draft_id TEXT NOT NULL`, `logical_line_id TEXT NOT NULL` | composite PK；draft FK cascade；跨Revision stable identity。 |
| `node_id TEXT NOT NULL` | 指向目前Draft的tree/floating row ID；同Draftunique。 |
| `node_location TEXT NOT NULL CHECK IN ('tree','floating')` | 對應既有兩張node table。 |
| `component_mode TEXT NOT NULL CHECK IN ('fixed','by_parent')` | component語意。 |
| `child_part_root_id TEXT NOT NULL` | FK `part_roots(id)`；全部candidate必須同root。 |
| `created_by TEXT NULL`, `updated_by TEXT NULL`, `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL` | audit。 |

Indexes：unique `(bom_draft_id,node_id)`及non-unique `(bom_draft_id,node_location)`。每個existing item node exactly one row、group zero row由save validator及QC保證；component `logical_line_id`必須等於其tree/floating node欄位。`bom_lines_tree.part_number`／floating同欄只存可讀label，不得作canonical join。

`bom_draft_component_candidates`

| Column | Contract |
|---|---|
| `bom_draft_id TEXT NOT NULL`, `logical_line_id TEXT NOT NULL`, `child_part_number_id TEXT NOT NULL` | composite PK；FK component node及`part_numbers(id)`。 |
| `selection_order INTEGER NOT NULL CHECK (selection_order >= 0)` | deterministic candidate order。 |

Constraints：unique `(bom_draft_id,logical_line_id,selection_order)`；index `(child_part_number_id,bom_draft_id,logical_line_id)`供change-control反查。

`bom_draft_parent_selections`

| Column | Contract |
|---|---|
| `bom_draft_id TEXT NOT NULL`, `logical_line_id TEXT NOT NULL`, `parent_part_number_id TEXT NOT NULL` | composite PK；parent須FK到同Draft binding。 |
| `child_part_number_id TEXT NOT NULL` | composite FK到同node candidate。 |

Constraints：FK `(bom_draft_id,parent_part_number_id)`→draft parent binding；FK `(bom_draft_id,logical_line_id,child_part_number_id)`→candidate。fixed mode必須0 row；by_parent review gate要求每個Draft Parent exactly 1 row。

`bom_release_parent_snapshots`

| Column | Contract |
|---|---|
| `release_snapshot_id TEXT NOT NULL`, `parent_part_number_id TEXT NOT NULL` | composite PK；snapshot FK cascade、Part FK restrict。 |
| `definition_id TEXT NOT NULL` | FK definition；必須等於snapshot definition。 |
| `parent_part_number TEXT NOT NULL`, `parent_part_name TEXT NOT NULL` | immutable display evidence。 |
| `selection_order INTEGER NOT NULL CHECK (selection_order >= 0)` | frozen order。 |

Constraints：unique `(release_snapshot_id,selection_order)`；indexes `(parent_part_number_id,release_snapshot_id)`與`(definition_id,parent_part_number_id)`。

`bom_release_resolved_lines`

| Column | Contract |
|---|---|
| `id TEXT PRIMARY KEY`, `release_snapshot_id TEXT NOT NULL`, `definition_id TEXT NOT NULL` | snapshot／definition FKs。 |
| `parent_part_number_id TEXT NOT NULL` | composite FK到release parent snapshot。 |
| `logical_line_id TEXT NOT NULL`, `parent_logical_line_id TEXT NULL` | shared tree identity／hierarchy。 |
| `node_type TEXT NOT NULL CHECK IN ('item','group')` | resolved node type。 |
| `child_part_number_id TEXT NULL` | item必填、group必空；FK Part。 |
| `child_part_number TEXT NULL`, `child_part_name TEXT NULL`, `group_name TEXT NULL` | immutable display evidence。 |
| `quantity REAL NULL`, `sequence_no INTEGER NOT NULL`, `level INTEGER NOT NULL CHECK (level >= 0)` | item quantity>0；group quantity null。 |
| `source TEXT NOT NULL DEFAULT 'manual' CHECK (source='manual')` | DEV-095 retirement不回歸。 |

Constraints：unique `(release_snapshot_id,parent_part_number_id,logical_line_id)`；indexes `(child_part_number_id,release_snapshot_id,parent_part_number_id)`及`(parent_part_number_id,release_snapshot_id,sequence_no)`。此表是export、where-used、技轉包與released-only讀取的relational authority；JSON只作immutable portable evidence。

`bom_shared_structure_migration_issues`

| Column | Contract |
|---|---|
| `id TEXT PRIMARY KEY`, `company_id TEXT NULL`, `bom_draft_id TEXT NULL`, `part_number_id TEXT NULL` | source定位；FK均`ON DELETE SET NULL`。 |
| `issue_code TEXT NOT NULL` | `definition_backfill_ambiguous | owner_missing | cross_company | revision_lineage_conflict | component_identity_ambiguous | logical_line_identity_conflict | review_snapshot_unavailable | release_projection_unavailable | duplicate_current_binding | open_revision_conflict`。 |
| `detail_json TEXT NOT NULL` | deterministic evidence，不含secret。 |
| `issue_status TEXT NOT NULL DEFAULT 'open' CHECK IN ('open','resolved')` | activation要求open=0。 |
| `resolved_by TEXT NULL`, `resolved_at TEXT NULL`, `created_at TEXT NOT NULL` | resolution audit。 |

Index：`(issue_status,issue_code,company_id)`；migration rerun以deterministic issue fingerprint避免重複issue。

### 16.3 Snapshot canonicalization與immutability

schema version 2 hash輸入固定為：

```json
{
  "schemaVersion": 2,
  "definitionId": "...",
  "bomRevision": "1",
  "parents": [],
  "sharedLines": [],
  "components": [],
  "resolvedByParent": []
}
```

物件key固定順序；Parents按`selectionOrder, partNumberId`，lines按tree preorder／`sequenceNo,logicalLineId`，candidates按`selectionOrder,childPartNumberId`，mappings按`parentPartNumberId,logicalLineId`，resolved rows按Parent order／tree preorder。字串trim、BOM revision依numeric major grammar正規化、數值以JSON finite number表示，禁止locale formatting與`undefined`。`snapshot_hash`是canonical UTF-8 JSON的lowercase SHA-256。發行後只有snapshot本身的`obsolete_at／obsolete_by`可更新；parent、mapping、resolved JSON／rows及hash不可被任何runtime writer修改，QC用before/after hash偵測違規。

## 17. Exact API、DTO與Feature Contract

### 17.1 Numbering

- 新增`src/lib/numbering-structure-type.ts`，export `NumberingStructureType = "single_part" | "assembly"`、parser、options及label；禁止把值塞入`numbering-item-kind.ts`形成混合enum。
- `CanonicalNumberingCreateIntent`、`CreateNumberingRecordInput`、`AddPartNumberInput`、`AddDrawingAndPartToRootInput`新增`structureType`。New-root及existing-root的Part-producing command為required；drawing-only DTO不得有此欄。
- `POST /api/numbering/records`、`POST /api/numbering/roots/[rootCode]/parts`、`POST /api/numbering/roots/[rootCode]/drawing-part`及目前相容`drawings/[drawingNumber]/parts` route都需parse／驗證／傳遞；preview回傳`structureType`與預估Part output。
- repository INSERT、receipt、audit payload與idempotency fingerprint必須包含structure type。`purchased+assembly`在取得sequence／建立root之前即422，DB delta=0。

### 17.2 Part detail

`CanonicalPartDetailPresentation`新增required `bomContext`：

```ts
type CanonicalPartBomContext = {
  structureType: "single_part" | "assembly" | "unclassified";
  eligibility: "ineligible" | "eligible" | "blocked";
  action: "create_bom" | "open_bom" | "none";
  definitionId: string | null;
  draftId: string | null;
  releaseSnapshotId: string | null;
  bomRevision: string | null;
  status: "Draft" | "PendingReview" | "Rejected" | "Released" | "Archived" | "Obsolete" | null;
  applicableParentCount: number;
  blocker: { code: string; message: string } | null;
};
```

`bomContext`只能由`pdm-canonical-workbench.ts`經async repository在同一detail read snapshot投影；Drawing DTO不加此欄。UI由`src/components/part-bom-context.tsx`渲染body section＋minimal dialog，`canonical-pdm-workbench.tsx`只做Part kind dispatch。BOM action不可混入既有footer lifecycle action或由client重算。

Projection優先序固定：同Definition的open/restorable Draft（`Draft／Rejected／PendingReview／Archived`）→latest current Released snapshot→latest terminal Obsolete history→無Definition。只要open/restorable存在，`bomContext.draftId/status`必須指向該版，即使仍有previous Released snapshot；不得投影Released並誤顯示`建立下一版`。資料異常（多個open、binding不一致、缺schema-v2 authority）回`eligibility=blocked/action=none`及stable blocker，不由client挑一筆。

### 17.3 Applicability candidates

新增唯一read route：

```http
GET /api/bom/applicability-candidates?contextPartNumberId={id}
```

Response：

```json
{
  "mode": "initial",
  "definitionId": null,
  "baseReleaseSnapshotId": null,
  "contextPart": { "partNumberId": "...", "partNumber": "...", "name": "..." },
  "candidates": [
    {
      "partNumberId": "...",
      "partNumber": "...",
      "name": "...",
      "specification": "...",
      "selected": true,
      "selectable": true,
      "blockedReason": null,
      "rowVersion": "canonical-updated-at-or-version"
    }
  ],
  "suggestedBomRevision": "1",
  "selectionEtag": "sha256-strong-etag"
}
```

`mode`只可為`initial | next_revision`。Initial回`definitionId=null／baseReleaseSnapshotId=null／suggestedBomRevision="1"`；Released Definition無open revision時回`next_revision`、exact Definition ID、latest current schema-v2 release snapshot ID及其major revision + 1。BOM Rev在UI只讀，POST值必須等於server suggestion，不允許跳號。ETag同時放HTTP `ETag` header，輸入包含company、root、context ID、mode、Definition row version、base snapshot ID、sorted candidate `(id,record_status,structure_type,updated_at,primaryMIdentity,currentDefinitionId)`。Create固定要求`If-Match: {selectionEtag}`；缺header為428，stale為409 `BOM_APPLICABILITY_STALE`。

### 17.4 Create／read／save／submit／approve

- `POST /api/bom/drafts`：initial與next Revision共用§7.3同一writer，headers固定`idempotency-key`及`If-Match`。Initial的base為null；next必須指向latest current snapshot且Parent集合是前版集合的superset。Flag on時owner-only body 422；flag off時DEV-096 body回404 `BOM_SHARED_STRUCTURE_DISABLED`。成功201；replay200並`receipt.replayed=true`。
- `GET /api/bom/drafts/[draftId]`：在現有detail加`definitionId`、`applicableParents`、`components`、`unresolvedMappings`及`contextParentPartNumberId`；Draft reader須對全部definition/applicability scope授權。
- `PATCH /api/bom/drafts/[draftId]`：body固定§7.4；success回完整Draft及新`editorVersion`。stale editor 409；任何component錯誤時tree／floating／component／version delta全為0。
- submit review沿用現有draft review route與command；server在transaction內重新讀Definition version、Draft parents、canonical child state、floating/reconfirmation及released graph，通過後把schema-v2 review evidence、canonical hash、Definition/editor versions固定在review row／audit。Review decision只讀該immutable evidence，不重新拼latest Draft。
- approve沿用現有approval route；不新增shared approve endpoint。approve transaction建立snapshot header、parent rows、resolved rows、四份JSON evidence與hash，再更新review／Draft及整體obsolete前版；任一步失敗全部rollback。
- `GET /api/bom/releases/[releaseId]/export?format=csv&parentPartNumberId={id}`：多Parent缺參數422；單Parent可省略並由snapshot唯一row補值；不適用404；跨company資源404、同company但無Released read capability為403。filename固定`{parentPartNumber}-BOM-{bomRevision}.csv`。

### 17.5 Canonical child validation與cycle gate

- Child必須是same company canonical Part，狀態只允許`Active | Released`；`Draft／NeedInfo／PendingReview／Rejected／Obsolete／Merged／PendingAdminConfirm／MainDrawingInvalid`均不可submit／release。
- manufactured Child必須保有exact primary manufacturing M relation；purchased Child不要求M。BOM line永遠不綁Drawing revision。
- fixed的唯一candidate直接解析；by_parent依exact mapping解析。candidate未被Parent選到仍可留在Draft，但release snapshot只保留候選與mapping evidence，resolved rows只寫實際選中Child。
- cycle detection按每個applicable Parent獨立展開：「目前Draft即將發行的resolved projection」覆蓋同Definition舊版，其餘節點讀latest non-obsolete schema-v2 released resolved rows。任一Parent出現self reference或跨層cycle，整份shared release失敗，不做partial release。

## 18. Repository Algorithms與Failure Recovery

### 18.1 Atomic create

1. parse body、permission、flag、idempotency lookup；same key/same fingerprint直接replay。
2. 驗證`If-Match`格式；normalize／dedupe／binary-sort IDs，context必須在set。
3. provider-safe固定鎖序：company → root/Definition scope → sorted Parent IDs → create-effect key。PostgreSQL用既有transaction/advisory pattern；SQLite由queued top-level transaction序列化。
4. transaction內重算ETag及全部Parent invariant。Initial時任一Parent已有binding即conflict。Next時base snapshot Parents必須全部仍綁payload Definition、selected set不得少於base set；新增Parent只能尚未綁定，綁到另一Definition即conflict。若same key／fingerprint已有效果紀錄才走idempotent replay，不以「剛好同Definition」冒充replay。
5. Initial建Definition；next Revision鎖定並重用Definition、clone §23.2 authority且只為新增Parents建立definition bindings。兩者都建立Draft、draft bindings、create effect、append-only audit/edit event；legacy owner anchor固定存context Part，不影響authority。此domain不寫platform outbox。
6. commit後才回workbench URL；未知commit結果只允許相同key查effect，不允許client改key重建。

### 18.2 Atomic save

1. lock Draft＋Definition；驗證status `Draft|Rejected`與`expectedEditorVersion`。
2. normalize完整tree／floating graph，驗證ID唯一、parent存在、無graph cycle、quantity／group規則。
3. normalizecomponents並驗證item coverage、node location、same child root/company、candidate／mapping FK語意；產生`unresolvedMappings`。
4. 在同transaction刪除該Draft既有tree／floating／component selections後，以deterministic order重建，最後CAS `editor_version = editor_version + 1`及寫edit event。刪除／插入／CAS任一失敗全部rollback。
5. client收到409時保留本地內容並提供reload；不得自動last-write-wins。

### 18.3 Release與consumer recovery

- approve先在memory產生canonical schema-v2 snapshot及resolved rows，驗證每Parent line count、hash、cycle及authorization，再開始DB writes；transaction內再重讀review/Draft/Definition versions。
- snapshot header與所有child rows完成後才更新Draft=`Released`及review=`Approved`；prior snapshot obsolete在同transaction。不存在「已核准但沒有resolved rows」的合法狀態。
- export／where-used／技轉包遇到schema-v2 header但缺parent／resolved/hash，固定fail closed為`BOM_RELEASE_PROJECTION_AMBIGUOUS`並建立可觀測error；不得fallback `line_snapshot_json`或owner。
- capability rollback只關閉新create／mutation UI；schema-v2 reads保持，避免已發行資料不可用。若需資料rollback，只能回復provider snapshot／migration restore point並經release gate，禁止反向猜測或刪表。

## 19. Migration、Reconciliation與Activation Implementation

### 19.1 Exact artifacts

- 新增`db/postgres/048_shared_assembly_bom.sql`。
- 修改`db/schema.sql`、`src/lib/db.ts`、`db/postgres/README.md`。
- 新增`scripts/migrate-dev-096-shared-assembly-bom.mjs`；default=`--mode=dry-run`，只有明示`--mode=apply`且資料路徑通過task-owned guard才可寫。`--provider=postgres --mode=rehearsal`只允許explicit disposable DSN，production-like host/name guard命中即BLOCKED。
- runner輸出`source-manifest.json`、`crosswalk.json`、`issues.json`、`target-manifest.json`、`rerun-manifest.json`及`evidence.json`。

### 19.2 Dry-run inventory

逐筆盤點canonical manual Draft／review／release：owner存在性、company/root、owner current status、revision lineage、duplicate current binding、每個item node的text Part Number exact canonical match、floating node、released snapshot可重放性及所有legacy active caller。任何跨company、同號多解、owner缺失、line child歧義或release projection無法重建都只寫issue proposal，不修改資料。

### 19.3 Deterministic backfill

1. 有exact canonical manual BOM lineage的owner分類`assembly`；無任何current/released BOM evidence的existing Part分類`single_part`；異常相關Part分類`unclassified`。
2. 每個exact owner lineage建立一個Definition及definition parent binding；保留原Draft／review／snapshot ID、status、revision、timestamp、quantity與hierarchy，新增Draft binding。
3. 每個可exact解析的legacy item node建立stable `logical_line_id`、fixed component node＋單一candidate；floating item同樣轉換。無法exact解析則issue，Draft保持原資料且activation blocked。
4. 可完整重放的legacy review轉成schema version 2，新增Definition/editor versions、canonical review JSON及hash；無法證明exact submit-time snapshot時保留v1並寫`review_snapshot_unavailable`，不得拿latest Draft偽造。
5. 可完整重放的legacy Released snapshot轉成schema version 2，新增parent snapshot、resolved rows、JSON evidence及hash；不可完整重放不改成v2，寫`release_projection_unavailable`。
6. migration只INSERT additive authority及UPDATE新增欄位／classification；不得刪除legacy row、改原ID、revision、line count、review decision、released／obsolete timestamps或DEV-095 retired schema。
7. 新增authority ID不依賴外部crosswalk：先計算`SHA-256(UTF-8("ai-pdm/dev096/v1|" + entityKind + "|" + stableSourceId))`，取前16 bytes，將byte 6高四位設為`0101`、byte 8高兩位設為`10`，再輸出lowercase `8-4-4-4-12` UUID-format；Definition、binding、logical line、resolved row及issue ID都使用此規則，provider不得各自生成random ID。rerun以deterministic ID、existing source ID及unique constraints成為no-op；crosswalk是evidence而非重跑前置，source/target hashes必須與第一次apply一致。

### 19.4 Activation queries

Flag可從off進入local canary前，runner必須證明：

- 所有canonical manual Draft（含Archived）的`definition_id`、draft parents及item component coverage=100%；多個legacy Archived revision造成one-restorable conflict時必須列issue並在activation前人工處置，不能略過歷史。
- 所有schema-v2 release的parent rows、resolved rows、四份evidence／hash coverage=100%，且independent hash重算一致。
- `bom_shared_structure_migration_issues WHERE issue_status='open'`=0。
- definition binding duplicate=0；cross-company/root/structure/M/status violation=0；all FK checks=0。
- legacy owner-only create/revision/permission/release/export/where-used active caller=0；retired route/source/writer scan仍=0。
- source／target Draft、review、release、logical line、quantity、timestamps counts/hashes一致；apply後rerun delta=0。

正式SQLite primary／Cloud SQL apply、flag activation、deploy及release smoke仍不屬本地RD授權。

## 20. Exact File Impact Matrix

### 20.1 Add

| File | Responsibility |
|---|---|
| `db/postgres/048_shared_assembly_bom.sql` | PostgreSQL additive authority與indexes。 |
| `src/lib/assembly-bom-feature.ts` | default-off flag及dependency status。 |
| `src/lib/numbering-structure-type.ts` | canonical structure type parser／labels。 |
| `src/lib/bom-shared-structure.ts` | normalization、validation、projection、canonical JSON／hash；不得含DB access。 |
| `src/components/part-bom-context.tsx` | Part-only section＋minimal create dialog。 |
| `src/app/api/bom/applicability-candidates/route.ts` | exact context candidate read＋ETag。 |
| `scripts/migrate-dev-096-shared-assembly-bom.mjs` | dry-run／isolated apply／PostgreSQL rehearsal。 |
| `scripts/qc-dev-096-contract.mjs` | static/API/retirement contracts。 |
| `scripts/qc-dev-096-repository.mjs` | projection、hash、permission、consumer queries。 |
| `scripts/qc-dev-096-migration.mjs` | fresh/apply/rerun/parity/reconciliation。 |
| `scripts/qc-dev-096-mutation.ts` | transaction、idempotency、concurrency、fault injection。 |
| `scripts/qc-dev-096-consumers.mjs` | export/where-used/change-control/transfer/approval exact-parent oracle。 |
| `scripts/qc-dev-096-browser.mjs` | authenticated Chromium＋four viewport＋a11y。 |
| `scripts/qc-dev-096-aggregate.mjs` | task-owned orchestration/evidence manifest/cleanup。 |

### 20.2 Modify

| Area | Exact files |
|---|---|
| schema/config | `db/schema.sql`、`db/postgres/README.md`、`src/lib/db.ts`、`.env.example`、`package.json` |
| numbering types/repository | `src/lib/canonical-numbering-create-contract.ts`、`src/lib/repositories/numbering-repository.ts`、`src/lib/repositories/numbering-async-repository.ts`、`src/lib/numbering-async.ts` |
| numbering API/UI | `src/components/canonical-numbering-create-form.tsx`、`src/app/api/numbering/records/route.ts`、`src/app/api/numbering/records/preview/route.ts`、`src/app/api/numbering/roots/[rootCode]/parts/route.ts`、`src/app/api/numbering/roots/[rootCode]/drawing-part/route.ts`、`src/app/api/numbering/drawings/[drawingNumber]/parts/route.ts` |
| Part detail | `src/lib/pdm-canonical-workbench-contract.ts`、`src/lib/pdm-canonical-workbench.ts`、`src/lib/repositories/pdm-canonical-workbench-async-repository.ts`、`src/components/canonical-pdm-workbench.tsx` |
| BOM domain/API | `src/lib/types.ts`、`src/lib/revision-policy.ts`、`src/lib/bom-create-context.ts`、`src/lib/bom-workbench-async.ts`、`src/lib/bom-async.ts`、`src/lib/permissions.ts`、`src/lib/pdm-lifecycle-policy.ts`、`src/lib/repositories/bom-workbench-async-repository.ts`、`src/app/api/bom/drafts/route.ts`、`src/app/api/bom/drafts/[draftId]/route.ts`、`active/route.ts`、`delete/route.ts`、`restore/route.ts`、`obsolete-request/route.ts`、`reconfirm-replacements/route.ts`、`submit-review/route.ts`、`src/app/api/bom/reviews/pending/route.ts`及`src/app/api/bom/reviews/[reviewId]/{approve,reject}/route.ts` |
| editor/list | `src/app/bom/workbench/page.tsx`、`src/app/api/bom/workbench/route.ts`、`src/app/api/bom/drafts/[draftId]/diff/route.ts`、`src/components/bom-editor/bom-editor-types.ts`、`bom-xmind-editor.tsx`、`bom-node-inspector.tsx`、`bom-inline-picker.tsx`、`xmind-bom-node.tsx`、`bom-editor-outliner.tsx`、`src/lib/bom-workbench-diff.ts` |
| released consumers | `src/app/api/bom/releases/[releaseId]/export/route.ts`、`src/lib/repositories/item-insight-async-repository.ts`、`src/lib/pdm-change-control-domain.ts`、`src/lib/transfer-package-phase1d.ts`、`src/lib/approval-platform.ts`、`src/lib/repositories/approval-platform-async-repository.ts`、必要的`src/lib/repositories/bom-repository.ts` compatibility read |

### 20.3 Explicit no-touch／delete=0

- 不新增或恢復`/bom/new`、sidebar assembly入口、create-context／from-assembly／import-xls routes、CAD/XLS source／tables、assembly evidence writer或submission-bound identity。
- 不修改`.SLDASM` file ownership、Drawing Revision attachment API、Relation formal authority、Part/Drawing lifecycle state authority或production credentials。
- 本DEV current phase沒有產品檔案刪除清單；任何需要刪除legacy owner欄、index、sync repository或compatibility reader的發現都停止並另立retirement gate。

### 20.4 Dirty-worktree boundary

2026-08-24 assessment時workspace已有709筆既有dirty entries，且`db/schema.sql`、`.env.example`、`package.json`、BOM routes/repositories及多個DEV-095 retirement檔已修改／刪除；這些都不是DEV-096可清理或回復的授權。RD開始前必須保存`git status --short`、target-file hashes與DEV-096 touched ledger，只做最小重疊patch；禁止`git reset --hard`、checkout覆蓋、全域格式化或把unrelated changes納入DEV-096 evidence。

## 21. Implementation Slices、Commands與Evidence Gate

### 21.1 Ordered slices

| Slice | Deliverable | Exit gate |
|---|---|---|
| 096-A Schema／feature／structure type | 048、SQLite initializer、flag、numbering persistence | migration dry-run/fresh/rerun、purchased+assembly zero write、flag off regression PASS |
| 096-B Definition／Part context／create | Definition/bindings、candidate ETag、Part section/dialog、atomic create | QA-096-009..022＋permission/fault injection PASS |
| 096-C Component mapping/editor | node/candidate/selection tables、editor DTO/inspector/save | QA-096-023..033、editor CAS、tree/floating mapping atomic PASS |
| 096-D Review／release／consumers | schema-v2 review/release snapshot、lifecycle、diff/export/where-used/change-control/transfer/approval | QA-096-034..052、069..082、independent projection/hash exact PASS |
| 096-E Migration／aggregate／handoff | legacy converter、bounds/N+1、retirement scan、browser、build與evidence manifest | QA-096-053..068、083..088、P0/P1=0、all-phase aggregate PASS |

不得平行啟用B～D的writer；每個slice可合併到同一implementation branch，但capability必須保持off直到E完成。

### 21.2 Exact package commands to add

```json
{
  "migrate:dev-096:dry-run": "node scripts/migrate-dev-096-shared-assembly-bom.mjs --mode=dry-run",
  "migrate:dev-096:apply": "node scripts/migrate-dev-096-shared-assembly-bom.mjs --mode=apply",
  "migrate:dev-096:postgres": "node scripts/migrate-dev-096-shared-assembly-bom.mjs --provider=postgres --mode=rehearsal",
  "qc:dev-096:contract": "node scripts/qc-dev-096-contract.mjs",
  "qc:dev-096:repository": "node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-dev-096-repository.mjs",
  "qc:dev-096:migration": "node scripts/qc-dev-096-migration.mjs",
  "qc:dev-096:mutation": "node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-dev-096-mutation.ts",
  "qc:dev-096:consumers": "node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-dev-096-consumers.mjs",
  "qc:dev-096:browser": "node scripts/qc-dev-096-browser.mjs",
  "qc:dev-096": "node scripts/qc-dev-096-aggregate.mjs"
}
```

### 21.3 Focused execution order

1. `npm.cmd run qc:dev-096:contract`
2. `npm.cmd run qc:dev-096:migration`
3. `npm.cmd run qc:dev-096:repository`
4. `npm.cmd run qc:dev-096:mutation`
5. `npm.cmd run qc:dev-096:consumers`
6. `npm.cmd run qc:dev-096:browser`
7. `npm.cmd run typecheck:app`
8. affected-file ESLint；不得以全workspace既有error混淆DEV-096 delta。
9. `npm.cmd run build:isolated`
10. `npm.cmd run qc:dev-096`重跑fresh aggregate，再執行`git diff --check`。

所有會schema-init或寫資料的command必須由aggregate建立task-owned`PDM_DATA_DIR`及`PDM_REPOSITORY_DIR`；browser runtime啟動前記錄project、purpose、port、process tree、mutation scope及cleanup condition，完成後只停止該process tree並確認port釋放。build前後必須證明primary SQLite schema、canonical root/Part/Drawing identities、BOM counts/hashes、migration residue及`PRAGMA foreign_key_check`完全不變。無disposable PostgreSQL shadow時provider case標`BLOCKED`，不得以SQLite PASS替代。

### 21.4 Evidence output

Fresh run固定輸出`output/qa/dev-096-shared-assembly-bom/{runId}/`：

- `manifest.json`：commit、dirty boundary、provider、flags、task-owned paths、runtime/port/process、commands、case denominator。
- `pre-invariants.json`／`post-invariants.json`：primary及fixture schema／identity／BOM／residue／FK hashes。
- `migration/`：source/target/crosswalk/issues/rerun/provider parity。
- `api/`：requests、redacted responses、idempotency receipts、ETags、fault deltas。
- `projection/`：canonical snapshot input、independent per-parent projection、hash、export/where-used comparisons。
- `browser/`：四viewport screenshots、trace、accessibility、console/network/5xx logs。
- `cleanup.json`：runtime stopped、port released、task-owned temp removed、productionWrites=false。

PASS必須case denominator固定為QA-096-001..088，`FAIL=0`、`NOT_RUN=0`、`BLOCKED=0`、P0/P1=0；若PostgreSQL未提供disposable shadow，整體只能標`Local SQLite RD Complete / Multi-provider QA Blocked`，不得標DEV-096產品完成。

## 22. Readiness與Execution Boundary

### 22.1 Readiness conclusion

- Human decision gaps：0。入口、合法assembly、shared identity、Parent/Child複選、quantity語意、future boundary已確認。
- P0/P1 implementation-spec gaps：0。exact schema、provider migration、flag、DTO、transaction、consumer、file impact、failure recovery、test commands及evidence皆已固定。
- RD可派工狀態：`RD Implementation Ready / Local Implementation Eligible / RD Not Started`。因風險High，必須按096-A→E且flag default-off；任一slice完成不等於產品完成。
- Release狀態：`Production Release Gated`。本文件不授權primary／Cloud SQL migration、正式資料repair、flag activation、deploy、release smoke、merge或PR。

### 22.2 This documentation turn

本輪只修改DEV-096開發文件、QA計畫、ADR語意與索引；沒有修改產品、schema、API、test、資料或runtime，沒有stage／commit／merge／PR／deploy／release。若後續使用者明示開始開發，RD可直接從096-A開始，不需再新增入口或重新設計ownership；若觸發§13 stop condition，回到產品決策而不是自行擴張。

## 23. Revision Lineage與「建立下一版」契約

### 23.1 唯一revision policy

- Current Phase只接受正整數major revision：`/^[1-9]\d*$/`。Initial固定`1`；next固定為同Definition latest Released major + 1。Server suggestion是authority，UI只讀，client送入不同值固定409 `BOM_DEFINITION_REVISION_CONFLICT`。
- 一個Definition同一時間最多一個open／restorable revision；集合固定為`Draft | Rejected | PendingReview | Archived`。若存在其中任一狀態，Part drawer與workbench只能開啟該版，不顯示建立初版／下一版。
- `base_release_snapshot_id`把next Draft綁到建立當下latest current schema-v2 snapshot。Approve前必須再次證明base仍為latest；不允許從歷史Obsolete snapshot分支、跳號或平行Draft。
- Initial Draft由Part drawer的`建立 BOM`進入；next Revision只在同一BOM workbench的Released狀態顯示`建立下一版`。兩者都呼叫同一candidate route及同一`POST /api/bom/drafts`，不得新增URL、sidebar入口或第二writer。

### 23.2 Next Revision clone

在create transaction內鎖Definition與base snapshot後，server執行以下clone；不得由client下載再重送整棵tree：

1. Draft Parent set = base snapshot Parent set ∪ 本次合法same-root新增Parents；若少任一base Parent固定409 `BOM_PARENT_REMOVAL_NOT_SUPPORTED`。
2. 由schema-v2 shared tree、component candidates與mapping evidence建立新Draft row IDs；每個既有節點的`logical_line_id`保持，新建立節點才取得新logical ID。
3. fixed line對新增Parent自動解析同一fixed Child，不建立parent-selection row。
4. by-parent line保留base candidates與舊Parents mappings；每個新增Parent保持unresolved，使用者必須人工選擇既有／新增候選。不得按顏色、名稱、suffix或陣列位置自動猜Child。
5. 新Draft的`editor_version=1`、status=`Draft`、name由server產生；clone、bindings、effect、audit/edit event同transaction全有或全無。

### 23.3 Logical line identity與diff

- `logical_line_id`是Definition內的長期邏輯位置，不是目前Draft node row ID。tree↔floating移動、Rejected修改及next Revision clone都保留；複製／新增位置取得新ID，刪除後不得在同Definition回收舊ID給不同位置。
- Save驗證目前Draft的每個tree／floating node exactly one logical ID、跨兩表唯一、component node exact match；server另查Definition歷史，拒絕「非clone新節點重用舊logical ID」。
- Diff以`logical_line_id`配對，分類`added | removed | moved | quantity_changed | candidate_changed | parent_mapping_changed | unchanged`；row ID或顯示順序改變不得被誤判為刪除再新增。

## 24. 完整Lifecycle Command Matrix

| Existing route／command | Allowed source state | Success result | Shared Definition invariant |
|---|---|---|---|
| `POST /api/bom/drafts` initial | 無Definition／binding | Draft Rev 1 | 建Definition＋selected bindings；one open revision |
| `POST /api/bom/drafts` next | latest Released，且無open/restorable | cloned Draft Rev n+1 | 同Definition；Parent superset；exact base snapshot |
| `PATCH /api/bom/drafts/[draftId]` | Draft／Rejected | same Draft、editor version +1 | tree＋component＋mapping原子CAS |
| `POST .../submit-review` | Draft／Rejected | PendingReview＋schema-v2 review row | complete projection；immutable review evidence |
| `POST /api/bom/reviews/[reviewId]/reject` | PendingReview | Draft=Rejected、review=Rejected | reviewer非submitter；evidence不改 |
| `POST /api/bom/reviews/[reviewId]/approve` | PendingReview | Released＋schema-v2 snapshot | all Parents一起release；prior snapshot whole obsolete |
| `POST .../delete` | Draft | Archived | soft archive；Definition／Parent bindings／內容保留 |
| `POST .../restore` | Archived | Draft | 無另一open revision、仍為forward revision才可恢復 |
| `POST .../obsolete-request` | latest current Released | whole-Definition obsolete review | 影響全部current Parents；不得指定subset |
| approve obsolete review | approved request | current snapshot=Obsolete，Definition terminal read-only | bindings/history保留；不partial obsolete／detach |
| `POST .../reconfirm-replacements` | Draft／Rejected | exact flags acknowledged | 不改candidate或mapping |
| `POST .../active` | shared `definition_id`非null的any state | 410 `BOM_OPERATION_RETIRED` | manual active selection退役；flag-off legacy-null row只保留既有相容行為 |

補充規則：

- legacy `is_active`由status transition自動維護：`Draft／Rejected／PendingReview=1`；`Released／Archived／Obsolete=0`。它只供相容顯示，不是revision authority。
- Archive是可恢復soft state，仍佔Definition的one-open/restorable slot。Part drawer顯示`open_bom`並開啟Archived workbench，唯一主動作為`恢復`；不得顯示第二個`建立 BOM`。
- Released workbench在無open revision時顯示`建立下一版`；Obsolete workbench只讀歷史且沒有建立下一版。Current Phase不支援復活terminal obsolete Definition。
- 所有lifecycle route都在transaction內依序鎖company、Definition、Draft／Review／Snapshot，重新驗證status、Definition row version、editor/review version及actor capability；route外pre-read只可做顯示，不得作授權或CAS authority。

## 25. Shared Permission、Review與Audit Contract

### 25.1 Central resolver

所有BOM route、workbench、approval projection與consumer共用一個async capability resolver，輸入`actorId + companyId + definitionId/draftId/snapshotId + capability`，輸出authorized Definition與完整Parent scope。禁止任何caller以`owner_part_number_id`、submitter本人或context Parent單欄放行。

| Capability | Engineer | R&D Manager | Admin | Manufacturing／Procurement |
|---|---:|---:|---:|---:|
| initial／next create、edit、submit、archive／restore、reconfirm | company scope | company scope | company scope | no |
| request whole-Definition obsolete | company scope | company scope | company scope | no |
| Draft／review evidence read | company scope | company scope | company scope | no |
| approve／reject／obsolete decision | no | company scope，且非自己提交 | company scope，且非自己提交 | no |
| Released projection／history／export | company scope | company scope | company scope | company scope，exact Parent only |

同company但缺capability回403；cross-company ID、review、snapshot、Parent query一律404。Shared mutation必須對完整Parent set授權；只可存取其中一個Parent不構成部分成功。

### 25.2 Review snapshot與approval platform

Schema-v2 submit canonical JSON至少包含`schemaVersion`、Definition ID／row version、Draft ID／editor version、BOM revision、submitter、sorted Parents、shared lines、component candidates、exact mappings、resolved projection hashes、reconfirmation count及base release snapshot ID；canonical UTF-8 JSON與lowercase SHA-256寫入review row。Decision transaction核對hash與版本後只讀此snapshot，Draft latest view只能作stale比較。

新review在approval platform的canonical source固定為`bom_workbench`，inbox stable key為`bom_workbench:{reviewId}`。現有`legacy_bom`只保留historical Approved／Rejected decoder alias；未決legacy review必須在migration中exact backfill為schema-v2 canonical projection，否則寫`review_snapshot_unavailable`並阻擋activation。Approve與reject都禁止submitter自決，固定403 `BOM_REVIEW_SELF_DECISION_FORBIDDEN`。

### 25.3 Audit，無外部outbox

- create、clone、save、submit、approve、reject、archive、restore、obsolete request／decision及reconfirm都寫既有append-only `audit_logs`；tree／mapping變更另寫`bom_edit_events`。本DEV不建立BOM platform outbox，因上述command沒有DB transaction外必須投遞的side effect。
- Audit payload固定含`action`、actor、company、Definition／Draft／Review／Snapshot IDs、BOM revision、sorted affected Parent IDs、before/after status與row/editor versions、idempotency key（適用時）、review/snapshot hash（適用時）、correlation ID及安全reason code。不得只記legacy owner。
- replacement flag按`logical_line_id`及必要時exact `parent_part_number_id`定位。`reference_scope=candidate`代表候選受影響，`parent_selection`代表某Parent實際映射受影響；reconfirm只承認「仍採用目前值」，不得自動替換Child、增刪candidate或重寫mapping。

## 26. List、Workbench與Consumer DTO Contract

### 26.1 List row cardinality

`GET /api/bom/workbench`固定一個Definition／Revision一列，不按Parent展開：

```ts
type BomWorkbenchRow = {
  definitionId: string;
  draftId: string;
  releaseSnapshotId: string | null;
  bomRevision: string;
  status: "Draft" | "PendingReview" | "Rejected" | "Released" | "Archived" | "Obsolete";
  applicableParentCount: number;
  applicableParents: Array<{ partNumberId: string; partNumber: string; name: string }>;
  unresolvedMappingCount: number;
  baseReleaseSnapshotId: string | null;
  updatedAt: string;
};
```

搜尋任一適用Parent的part number／name都命中同一row；SQL以Definition／Revision分頁後聚合Parents，不得join造成duplicate或用client dedupe掩蓋。排序固定`updatedAt DESC, definitionId, numeric bomRevision DESC`；cursor需含相同tie-breakers。

### 26.2 Detail／diff／approval impact

- Draft detail的`applicableParents`、components、unresolved mappings及context Parent來自同一repository read snapshot；`contextParentPartNumberId`必須屬binding，否則404。
- `GET /api/bom/drafts/[draftId]/diff`回`baseReleaseSnapshotId`、Parent added/removed（Current Phase removed必為0）、logical line changes、candidate changes、per-Parent mapping changes及每Parent resolved impact count。Released initial無base時以empty baseline比較。
- Approval inbox一個review一列，顯示BOM Rev、全部Parent count、context Parent label、changed logical line count及affected resolved Parent count；不得為每個顏色Parent產生重複approval item。
- Export、where-used、change-control、技轉包與AI consumer一律走schema-v2 released relational authority；只有workbench可讀Draft candidate／mapping。Corrupt schema-v2任何consumer固定fail closed，不能fallback owner／line文字。

### 26.3 Bounds與query budget

- 一個Definition最多250個applicable Parents、一個logical line最多250個Child candidates、一個Draft最多5000個tree＋floating nodes，且release展開的`applicable Parent count × shared node count`不得超過100,000 resolved rows；任一上限超過固定413 `BOM_SHARED_STRUCTURE_LIMIT_EXCEEDED`且zero write。這是防止失控payload／projection的工程安全界線，不代表UI應鼓勵大量選取。
- Candidate route、list、Draft detail、diff、approval inbox與exact-parent export各自必須使用bounded set-based query；Parent／line數增加不得線性增加SQL round trips。單request SQL round-trip上限固定為candidate 4、list 4、detail 12、diff 14、approval inbox 5、export 5；Repository QC在1／50／250 Parents與10／1000／5000 nodes量測時都不得超過各自上限，並記錄duration但不設定缺乏production baseline的毫秒SLA。

## 27. UI State Machine、RWD與Accessibility

### 27.1 Part drawer唯一入口

| Server `bomContext` | Visible section／action |
|---|---|
| non-assembly／unclassified／blocked | 不顯示create；blocked只在已有異常BOM關聯時顯示可處理原因 |
| assembly＋無Definition | `BOM` section，一個`建立 BOM` |
| Draft／Rejected／PendingReview | 一個`開啟 BOM` |
| Archived | 一個`開啟 BOM`；進workbench後才可`恢復` |
| Released | 一個`開啟 BOM`；進workbench後依規則顯示`建立下一版` |
| Obsolete | 一個`查看 BOM 歷史`；唯讀 |

Drawing drawer永遠沒有create按鈕；可先透過既有圖料矩陣選到exact assembly Part，再由Part drawer進入。這同時落實「只有組合件才有建立BOM入口」及「組合件仍走既有圖號／料號工作臺」。

### 27.2 Minimal create dialog

- Dialog只含：locked current Part、same-root合法assembly候選checkbox fieldset、read-only BOM Rev、`建立`primary與`取消`secondary。Current Part預選且不可取消；其他候選不自動全選，可複選。
- Loading期間保留dialog shell並disable submit；empty只保留current Part；candidate error顯示在fieldset附近並提供重試。409 stale保留仍有效的人工選取交集、移除已失效項並announce；不得清空整張表單。
- Submit成功關閉dialog並導航canonical workbench URL；失敗保持dialog與焦點。開啟時focus到標題後第一個可操作欄，Tab trap在dialog內，Escape等同取消，關閉後focus回原CTA；error summary使用`role=alert`／`aria-live`且連到欄位。

### 27.3 Workbench Parent context

- Shared editor始終顯示一棵tree；Parent switch只切換resolved preview／mapping row，不複製editor。Released view切換Parent顯示該snapshot exact projection。
- 切換Parent、離開workbench、archive、submit或建立下一版都先走既有dirty guard；Save／Discard／Cancel選擇未完成前不得導航或丟失本地tree/mapping。
- Desktop以側欄／inspector呈現，tablet可收合，390×844採單欄並避免內外雙重捲動；mapping表在窄螢幕轉成每Parent label-value group，不靠水平捲動才能完成選擇。
- 狀態不得只靠顏色；unresolved mapping提供文字、icon與可聚焦跳轉。1440×900、1024×768、768×1024、390×844都必須可看見唯一主動作、無裁切／重疊／水平overflow。

## 28. Second Readiness Audit Closure

第二輪從現有repository、permission、lifecycle routes、approval source、migration initializer及consumer反向檢查後，已關閉以下原先未明示的implementation gaps：

1. 初版／下一版共用writer、exact revision與base snapshot lineage。
2. one-open/restorable revision、archive／restore／obsolete／retired active完整狀態語意。
3. stable logical line ID、schema-v2 immutable review evidence與self-decision gate。
4. Definition-wide permission resolver、404／403邊界、canonical approval source與append-only audit；移除不必要outbox。
5. list/diff cardinality、no-N+1 query budget、payload bounds、Part drawer／dialog／workbench完整UI state。
6. provider-specific additive DDL方式及不依賴crosswalk的deterministic migration IDs。

以上條款與前文衝突時，以§23～28較具體條款為Current Phase實作authority。Human decision gaps仍為0；QA分母同步擴充為88 cases。狀態維持`RD Implementation Ready / Local Implementation Eligible / RD Not Started / Production Release Gated`，不代表產品已實作或允許正式migration／activation／release。
