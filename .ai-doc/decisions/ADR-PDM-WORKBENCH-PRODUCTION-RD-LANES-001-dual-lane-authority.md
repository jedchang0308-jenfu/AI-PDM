# ADR-PDM-WORKBENCH-PRODUCTION-RD-LANES-001：同一主檔的量產／研發雙 lane authority

Status: `Historical Accepted Decision / Current Runtime Baseline / Superseded by DEV-087 on Activation / Production Release Gated`
Date: 2026-08-20
Owner: Dev PM
Related DEV: `DEV-086` / `DEV-PDM-WORKBENCH-PRODUCTION-RD-LANES-001`
Related SPEC: `.ai-doc/specs/SPEC-PDM-WORKBENCH-PRODUCTION-RD-LANES-001-dual-latest-projection.md`
Related QA: `.ai-doc/qa/qa-dev-086-production-rd-lanes-validation-plan-2026-08-20.md`

> **2026-08-22 DEV-087 supersession**：新決策優先。DEV-087 activation後，本ADR的單一RD aggregate、最多雙列、legacy lane/status/current-work authority全部退役；只保留production與RD不可互相遮蔽、exact reference、server authority與permission邊界。不得用本ADR建立相容fallback或阻擋舊code拆除。

## 1. Context

圖號、料號、圖料三個工作台同時供研發與生產使用。既有 single-row projection會在量產 V1 建立 V2 設變後，以最高revision或active candidate狀態覆蓋同一列；生產可能看不到仍有效的V1，或誤把尚未發布的V2當成量產依據。

這不是單一UI欄位問題，而是跨Drawing、Part、Relation、release、cursor、permission與exact file reference的長期產品契約。決策必須同時維持：

1. canonical master identity只有一份。
2. production-effective與active RD definition可同時可見。
3. Part Number不產生Revision。
4. client不能組裝或猜測哪一個source是量產／研發最新版。
5. release失敗不能讓生產讀到半完成V2。

## 2. Options Considered

### A. 繼續只顯示全域最新版

Rejected。資料列最少，但把「版本新舊」與「生產效力」錯誤視為同一軸；V2編輯／審核期間會遮蔽V1。

### B. 為研發與量產各建立一份master

Rejected。會破壞Drawing／Part／Root identity、where-used、BOM、權限、audit與ERP對接，並產生兩份內容漂移。

### C. 一列master，將量產／研發版本藏在drawer或popover

Rejected。第一層無法掃描、比較或直接篩選；生產仍可能點到預設的全域最新版，且無法滿足清單各分一列。

### D. 同一canonical group投影最多兩個lane rows

Chosen。同一identity只存在一次，server在同一read snapshot內投影production與RD；清單保留兩列的可掃描性、可篩選性與exact detail，同時不新增第二份master。

### E. 儲存人工可編輯的「目前量產版pointer」

Rejected for Current Phase。人工pointer可能落後或指到未完整發布source，且會新增另一個release authority。Current Phase採derived effective reference；只有repository audit證明現有evidence無法無歧義推導時，才回Dev PM重新決策。

## 3. Decision

採用「single canonical identity + server-derived production／RD lane projection」：

- 每個canonical group最多有`production`與`rd`兩列；production固定在上、RD固定在下。
- production lane只由完整commit且production-eligible的Released source產生；不是client latest、人工pointer或updatedAt最大值。
- RD lane是一個active change projection。多個相容changes可形成一個change set；互斥changes形成一列conflict projection，不任選一筆冒充latest。
- release commit前後以完整read snapshot切換。失敗／rollback時production保持上一個合法reference，RD顯示發布未完成。
- row key包含canonical identity與lane但不含版號；另以opaque projection token鎖定list看到的exact reference。
- pagination以canonical group為單位；filter與lane resolution都在server-side limit前完成。
- Part／Root的版本欄顯示manufacturing baseline或受控Drawing／BOM definition reference，不建立Part Revision或Root Revision。
- formal group的既有viewer可看兩lane的安全summary；detail、file與commands仍由domain permission裁切。source-less candidate維持workspace permission。

## 4. Chosen Identity and Key Rule

| Domain | Group key | Production row key | RD row key |
|---|---|---|---|
| Drawing canonical | `drawing:{unifiedDrawingId}` | `drawing:{unifiedDrawingId}:production` | `drawing:{unifiedDrawingId}:rd` |
| Part formal | `part:{partNumberId}` | `part:{partNumberId}:production` | `part:{partNumberId}:rd` |
| Relation formal | `root:{partRootId}` | `root:{partRootId}:production` | `root:{partRootId}:rd` |
| Part／Root source-less candidate | `candidate:{workspaceId}` | 不存在 | `candidate:{workspaceId}:rd` |

Drawing從建立candidate起已有unified `drawings.id`，因此不因正式化改key；舊`candidate:{workspaceId}`只做一次性deep-link canonicalization。Display code、revision、baseline revision與updatedAt皆不得進stable row identity。

## 5. Authority Rule

| Domain | Production authority | RD authority |
|---|---|---|
| Drawing | Released major drawing revision package＋complete lifecycle evidence | active／RD-controlled／correction／review／release-incomplete drawing definition |
| Part | Released part-number manufacturing baseline；legacy則為Part master＋production-eligible primary drawing basis | Draft part baseline＋stable scoped active drawing/workspace change set |
| Relation | Released root manufacturing baseline；legacy則為root＋production-eligible dependency aggregate | source-root workspaces＋root drawing changes＋Draft root baseline change set |

所有resolver都必須由domain adapter擁有。Workbench Core只治理group／cursor／filter／request race／selection與responsive mechanics，不得理解Drawing／Part／Relation business state。

## 6. Consequences

正面：

- 生產在V2設變期間仍可看到並開啟V1 exact definition。
- 研發可直接篩出active changes，且不必複製master。
- release failure、stale detail與parallel changes有明確fail-closed路徑。
- 三工作台共享group／lane mechanics，但保留domain authority與Part Number無Revision原則。

成本與限制：

- list response每group最多兩rows，`limit`必須改讀為group count，cursor升級version 2。
- current repositories需新增batch lane-source reads與change-set resolver；不能沿用單一highest revision overlay。
- legacy Part／Root沒有manufacturing baseline時需保守compatibility projection與啟用前classifier。
- exact detail需要projection token與stale handling；既有unscoped row key只能在相容期canonicalize。
- UI與QA必須覆蓋兩lane、四viewport、permission、release success／failure與no-fallback，而非只驗證DOM多一個badge。

## 7. Migration and Compatibility Impact

- Current Phase預設不建立新master、Part Revision或人工pointer，也不批次改寫Released history。
- schema／migration classification固定為`none`；既有drawing package、source workspace與manufacturing baseline owner indexes足夠，DEV-086不得修改schema或新增backfill。若實測否定此結論，停止並重開ADR，不得自行加migration。
- feature flag off維持既有single-row／overlay runtime。
- feature flag on時三工作台一起切換；v1 cursor失效並安全回第一頁。
- legacy formal row key優先canonicalize到production，無production才到RD；legacy candidate只到RD。canonicalize後所有新href都帶lane-aware key與projection token。
- manufacturing baseline的Released切換與`ManufacturingBaselineReleased` audit必須同一transaction；Drawing沿用既有`drawing-revision-lifecycle` transaction。任何rollback都不得產生新的production-effective source。
- 若read-only classifier發現unmapped、duplicate、incomparable或partial production evidence，activation停止；不得用updatedAt或display code自動修復。

## 8. Superseded／Amended Documents

本決策只取代下列top-level projection語意，其他authority保留：

- `SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001`：正式drawing master只顯示一列。
- `SPEC-PDM-NUMBER-STATE-FLOW-001` DEV-062：candidate／formal Part各自獨立top-level rows。
- `SPEC-PDM-DRAWING-PART-RELATION-VIEW-001` DEV-062：source-root active change只作formal root overlay。
- `SPEC-PDM-WORKBENCH-CORE-001`／`ADR-PDM-WORKBENCH-CORE-001`：cursor與pagination以單row identity為單位。

保留 `ADR-PDM-MATERIAL-IDENTITY-REVISION-001`、domain release／approval、shared mechanics + domain adapters、single human status與private actor-scoped projection。

## 9. Re-entry Triggers

回Dev PM／ADR，不由RD自行決定：

- 需要人工pointer或新production authority table才能判定effective source。
- lane safe summary的跨角色可見性與既有privacy政策互斥。
- active change無stable FK，只能文字／時間模糊比對。
- release失敗會留下resolver可見的partial Released source且無補償方式。
- 需要改Part Number identity、BOM revision規則、approval responsibility或production資料。

## 10. Execution Boundary

Decision accepted、產品方向Human Confirmed且exact implementation contract已達`RD Implementation Ready`。Phase 1A～1D 已完成本機實作與 focused static QC；未修改 schema／migration、資料或 production runtime，staging／production、deploy與release仍受 gate 管控。
