# ADR-PDM-PART-STRUCTURE-CLASSIFICATION-001：結構分類延後且由 Exact Part 持有

狀態：`Accepted / Human Confirmed / Implemented / Local QA-QC Complete / 2026-08-26`

關聯 DEV：`DEV-099`

Authority SPEC：`.ai-doc/specs/SPEC-PDM-DEFERRED-STRUCTURE-CLASSIFICATION-001-numbering-and-bom-readiness.md`

父決策：

- `.ai-doc/decisions/ADR-PDM-ASSEMBLY-MASTER-ENTRY-001-canonical-workbenches-only.md`
- `.ai-doc/decisions/ADR-PDM-BOM-STRUCTURE-SHARING-001-variant-part-applicability.md`

## Context

現行建號流程把 `single_part／assembly` 當成 new-root 必填欄位。這使使用者在 identity 尚未完整、尚未確認是否為組立件時就必須做長期分類；分類錯誤又會直接改變 BOM 入口與後續行為。existing-root則以第一筆Part繼承，並把`unclassified`視為錯誤而阻擋追加。

這些規則把三個不同問題綁在一起：

1. 現在要建立哪個圖號／料號 identity。
2. exact Part未來是單一零件或組立件。
3. 該組立件目前是否具備可建立製造BOM的條件。

圖料根號可以包含顏色或規格差異Part，甚至可能出現不同結構語意；Drawing與3D檔名也不一定能唯一指向exact Part。因此root、Drawing、檔案或BOM存在都不適合作為classification authority。

## Options

### Option 1：建號時維持必填

優點是新資料永遠已分類，BOM eligibility簡單。缺點是過早決策、建立流程受阻、錯誤分類成本高，並迫使所有Part建立者理解BOM語意。

### Option 2：建號時提供可跳過的選填欄

優點是比必填彈性高。缺點是建號畫面仍承擔非當下任務，使用者容易把預設值當成事實，且client／API仍維護兩種建立心智模型。

### Option 3：建號不分類，之後由exact Part分類

優點是identity與結構決策分離，建號最精簡；分類發生在有exact Part context的地方，可複選明確同root變體並以BOM conflict、ETag與audit保護。成本是系統必須正式支援`unclassified`及derived BOM readiness。

## Decision

採 Option 3。

1. canonical new-root建號不顯示、不要求、不送出structure type；新Part明確寫入`unclassified`。
2. `unclassified`是合法暫態，不阻擋建號或existing-root追加。
3. exact Part Number持有structure type。root只可提供候選邊界與一致共識的初始值，不能被當成隱含authority。
4. existing-root新增Part時，只有全部current Parts共享同一decided type才初始化為該值；empty、mixed或含unclassified一律初始化為unclassified。這不回寫既有Parts。
5. 分類入口只位於既有Part drawer，不新增頁面、sidebar或組立件主檔。
6. 使用者可明確複選同company／root的Parts並all-or-nothing套用；current Part固定包含。系統不預設全選，也不因root相同自動套用。
7. 分類command以strong ETag、idempotency、permission、transaction、before／after audit及BOM conflict gate保護；不走建號command。
8. BOM section只在exact Part為assembly時顯示；製造BOM動作另由manufactured、primary M、availability及Definition狀態推導。
9. purchased assembly是合法分類，但Current Phase不提供製造BOM動作。
10. CAD／3D檔名／AI只可產生候選建議，不可自動寫分類或BOM。

## Authority Boundaries

| Concern | Authority |
|---|---|
| canonical identity | numbering command／formal Drawing／Part tables |
| structure classification | exact `part_numbers.structure_type` |
| same-root batch choice | human-selected exact Part IDs |
| BOM readiness | server projection of Part＋primary M＋Definition state |
| shared BOM structure | DEV-096 stable BOM Definition／explicit bindings |
| CAD/root suggestion | non-authoritative proposal only |

## Consequences

正面效果：

- 建號者不必過早知道零件結構，identity建立不再被`unclassified`阻擋。
- 顏色差異Parts可一次明確分類，仍保留每個exact Part的authority與audit。
- purchased assembly、缺M assembly與manufactured-ready assembly不再被同一enum硬塞成相同行為。
- BOM入口與action由server資料推導，不需要在建號表單預測未來工作流。

限制與成本：

- 所有active Part writer都必須明示structure type，否則physical default可能造成silent single-part classification。
- 某些Part可長期保持unclassified；依賴結構語意的功能必須自行定義readiness，不可偷偷預設single part。
- decided-to-decided變更與批次變更需要原因、audit與stale protection。
- assembly改回single_part遇使用中／Released BOM時必須先完成既有BOM治理；DEV-099不自動detach或fork。

## Rejected Interpretations

- `unclassified`等於migration錯誤或系統管理員才能修復。
- 同root即全部自動分類相同。
- 有`.SLDASM`、BOM或Drawing M即自動判定assembly。
- purchased不可能是assembly。
- 為了延後分類而新增組立件工作臺、專用建立入口或新的root-level欄位。
- 用前端隱藏欄位但後端仍預設single_part。

## Superseded / Amended Documents

- Intentional-replace `SPEC-PDM-CANONICAL-NUMBER-CREATION-001` 中new-root required structure type、first-Part inheritance及unclassified append block。
- Intentional-replace `SPEC-PDM-ASSEMBLY-BOM-REBUILD-001` 中purchased assembly建號拒絕、建號即分類及只能經Part change work調整structure type的Current Phase限制。
- 保留 `ADR-PDM-ASSEMBLY-MASTER-ENTRY-001` 的「不新增組立件入口」。
- 保留 `ADR-PDM-BOM-STRUCTURE-SHARING-001` 的stable Definition、explicit Parent bindings與同root變體共用結構。
- DEV-093／096既有QA evidence保留為historical revision evidence，不自動支持DEV-099。

## Revisit Triggers

只有下列情形需重開本ADR：

- 公司流程要求結構分類必須正式送審而非direct audited command。
- exact Part以外出現經人類核准的root-level structure authority。
- purchased assembly進入正式供應商BOM／採購BOM治理。
- classification batch超過100成為常態，需獨立bulk governance。
- CAD配置能以受控證據唯一解析exact Part且人類決定允許更高程度自動化。

## Implementation Boundary

本ADR已由DEV-099實作並通過本機 Local QA-QC；建號、分類入口與BOM projection已在同一產品變更與aggregate evidence中完成 coherent 驗證。正式 activation、deploy、release與production migration仍受 release gate 管制，未由本ADR自動授權。
