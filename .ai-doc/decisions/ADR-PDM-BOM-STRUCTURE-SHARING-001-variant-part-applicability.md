# ADR-PDM-BOM-STRUCTURE-SHARING-001：結構相同的變體料號共用 BOM

狀態：Historical / Superseded by ADR-PDM-BOM-RETIREMENT-001 / 2026-08-28

關聯 DEV：`DEV-096`

父決策：

- `.ai-doc/decisions/ADR-PDM-ASSEMBLY-MASTER-ENTRY-001-canonical-workbenches-only.md`
- `.ai-doc/decisions/ADR-PDM-MATERIAL-IDENTITY-REVISION-001-part-number-vs-controlled-definition-revision.md`

## Context

組立件仍是既有 Drawing／Part identity，不建立專用主檔入口。實際產品可能在同一圖料根號下具有多個只差顏色、表面屬性或其他非結構性條件的 Parent Part Number；若每個料號都複製一份相同 BOM，後續修改、審核與發行容易產生內容漂移，也增加不必要的維護工作。

既有 `ADR-PDM-MATERIAL-IDENTITY-REVISION-001` 要求新 Part Number 擁有自己的 BOM 定義，原意是避免不同物料身份被另一個料號的 BOM 靜默改寫。此規則仍須保留身份與歷史隔離，但不應被解讀為「結構相同也必須複製一棵 BOM」。

## Options

1. 每個 Parent Part Number 固定建立獨立 BOM，顏色差異也複製整棵結構。
2. 一份受控 BOM 結構／Revision 明確綁定多個適用 Parent Part Numbers；差異由同一結構中的變體對應表達。
3. 直接讓圖料根號隱含擁有 BOM，根號下所有料號自動適用。

## Decision

採 Option 2。

- 一份 BOM 結構、BOM Revision 與 Released Snapshot可以明確適用於多個 Parent Part Numbers，不需要為顏色或其他非結構性變體複製 BOM。
- 共用結構必須具有stable `BOM Definition` identity；BOM Revision屬於Definition。任一顏色Part、圖料根號或legacy owner欄都不得成為隱含Definition owner。
- 每個適用 Parent Part Number 都必須有可稽核的明確綁定；圖料根號只能協助縮小候選範圍，不得使根號下所有料號自動適用。
- Current Phase 只允許同公司、同圖料根號、結構型態為`組立件`的 Parent Part Numbers 共用。跨根號共用不在本決策的目前範圍。
- 「結構相同」至少要求階層、邏輯零件位置、數量與組成角色相同。只改顏色或其他變體屬性可以共用；數量、階層或零件角色不同時，必須解除適用並 fork／建立新的 BOM 定義或使用後續已核准的結構規則。
- 共用結構中的每個邏輯子件位置，可以對所有 Parent 使用同一個 Child Part Number，或以完整的 `Parent Part → Child Part` 變體對應表達。多選候選本身不是多個 BOM line，也不得使數量倍增。
- BOM 發行前，每一個適用 Parent 在每一個變體位置都必須能解析為確定 Child Part Number；未解析、多對多歧義或對應不完整時不得送審／發行。
- 修改共用 BOM 時，影響範圍必須顯示全部適用 Parent Part Numbers。Released Snapshot 不得因新增／移除適用 Parent 或後續修改而被原地改寫。
- applicable Parent set與Parent-to-Child mappings必須隨Draft／review／Released Snapshot保存；release後的變更建立新BOM Revision。新Revision必須以latest current Released Snapshot為base，保留原Parent集合並可加入same-root合法assembly Parent；移除Released Parent與detach／fork執行留待後續治理。
- CAD／檔名解析只可提出結構與候選建議，不能新增 Part、綁定 Parent、決定變體或直接成為正式 BOM authority。

本 ADR 的RD Implementation Ready amendment固定四層authority名稱：`bom_definitions`／`bom_definition_parent_bindings`承接stable ownership，`bom_draft_parent_bindings`承接Draft適用集合，`bom_draft_component_nodes`／`bom_draft_component_candidates`／`bom_draft_parent_selections`承接stable `logical_line_id`與exact mapping，`bom_release_parent_snapshots`／`bom_release_resolved_lines`及schema-v2 review／release snapshot欄承接immutable evidence。每個Definition同時最多一個`Draft／Rejected／PendingReview／Archived` open/restorable Revision；manual active selection不再是authority。`owner_part_number_id`只保留相容錨點，不能再作create、permission、revision、release、export或where-used決策。

## Consequences

正面效果：

- 顏色變體只維護、審核與發行一份結構，不會因複製 BOM 逐漸漂移。
- 每個 Parent Part仍可從自己的料號情境開啟同一份適用 BOM，並保留 where-used、影響分析與 audit 可追溯性。
- 變體子件可在同一邏輯位置完成確定對應，不會被誤算成多倍數量。

限制與成本：

- review／release、where-used、diff 與 export 必須能以指定 Parent Part投影確定結構，不能只顯示模糊的候選集合。
- 任何 BOM 變更都可能同時影響多個 Parent；必須先呈現影響清單，不能靜默套用。
- 從共用 BOM 移除 Parent、結構開始分歧或修正 Released 定義時，需要明確的 detach／fork 與新版次治理。

## Superseded / amended documents

- 有限修訂 `ADR-PDM-MATERIAL-IDENTITY-REVISION-001` 第 2.1.3、2.1.6 與「新料號自己的 BOM」語意：每個 Part Number 必須擁有自己的明確適用綁定與可確定投影，但結構相同的變體不必擁有不同的 BOM tree／Revision／Snapshot。
- 保留該 ADR 的 Part Number 無版次、Drawing／BOM 獨立版控、Released history不可靜默改寫與身份變更判斷規則。
- 延續 `ADR-PDM-ASSEMBLY-MASTER-ENTRY-001`：不新增組立件入口，BOM action只出現在既有 Drawing／Part情境。
