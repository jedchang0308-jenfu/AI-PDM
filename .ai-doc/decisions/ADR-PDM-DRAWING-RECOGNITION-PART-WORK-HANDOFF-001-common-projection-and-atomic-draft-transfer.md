# ADR-PDM-DRAWING-RECOGNITION-PART-WORK-HANDOFF-001 — Common Projection And Atomic Part-work Transfer

- Status：`Accepted / Repository Assessed / RD Implemented Locally / DEV-110 Full QC Passed 60/60 / Production Release Gated`
- Date：2026-08-31
- Owners：Dev PM、Drawing Recognition、PDM Part Work、Canonical Part Workspace
- Related DEV：`DEV-110`
- Related SPEC：`.ai-doc/specs/SPEC-PDM-RECOGNITION-COMMON-VALUE-EXCEPTIONS-001-upstream-part-work-handoff.md`
- Amends：`ADR-PDM-DRAWING-RECOGNITION-AMENDMENT-LINEAGE-001-origin-overlay-and-synchronized-commit.md`

## Context

DEV-107目前讓Drawing智慧辨識以single synchronized commit直接寫入Part master，並在存在active Part work時同步或阻擋。使用者確認的新操作模型把智慧辨識視為上游：大部分料號共用同一值，只有差異才展開，確認後交給DEV-108逐料號工作與送審。

若仍直接寫master，下游Part work會變成事後修正層，操作與approval ownership不一致。若client逐Part呼叫多個create／PATCH，任何中段失敗都會留下partial handoff；若另建root default／batch writer／combined review，又會產生第二套Part authority。

決策必須同時固定：common projection不是root data、圖面overall與料號對照表per-Part evidence的適用範圍、handoff destination是Part work、跨Part draft transfer的atomic boundary、legacy evidence compatibility，以及Drawing與Part review responsibility分離。

## Options Considered

### A. 保留DEV-107 direct master formalization

優點是沿用已完成的single commit與formalization event；缺點是繞過下游Part work／review，使用者在上游與下游面對兩套寫入／送審邏輯。否決為DEV-110 target；在固定60-case QA/QC與cutover gate完成前，DEV-107仍是current runtime。

### B. Browser逐Part呼叫既有create／PATCH，允許partial retry

不需新的server orchestrator，但source／relation drift可能發生在多次HTTP之間，response loss與第k筆失敗會讓使用者難判斷已帶入範圍，且無單一append-only completion event。否決。

### C. 建立root-level共用值與combined Part review

能長期套用與一次審核，但新增root persisted authority、第二個writer／review package，且後來新增Part的繼承時點與撤銷語意未被使用者要求。否決。

### D. Session common projection＋recognition-specific atomic Part-work handoff

common與override只存在於review projection；single server command在同一transaction中以existing Part work invariants建立／更新exact works，全部成功後才建立append-only synchronization event。Part master與Part review仍由既有authority負責。採用。

### E. 以per-Part辨識值的眾數自動推導common

可在缺少overall candidate時快速填值，但值出現次數不能證明圖面適用範圍；料號／資料對照表中的多數值可能只是多個例外，將其放大到未列出的Parts會產生錯誤寫入。否決。common只能來自明確overall evidence或人工explicit intent。

## Decision

1. `effective(part, field) = override(part, field) ?? common(field)`是session-level decision projection；common不得存成Part Root default或master欄位。
2. canonical handoff最多處理100個formal related exact Parts。server重算source與relation fingerprints，client不擁有target authority。
3. handoff是one-gesture／one-command／one-transaction：先完成all-target preflight，再使用同一Part work repository validation建立或更新works；任何target失敗整筆rollback。
4. existing work非target fields必須保留；target field已有第三值時要求人類明確選`保留料號工作值`或`使用辨識值`，不得靜默覆寫。
5. zero-delta Part不建立work；session仍可建立一次synchronization event表示人工核對已完成。
6. 沿用`drawing_recognition_formalization_events`與links，new logical event以`result_json.schemaVersion=2`及`destination=part_work`辨識。legacy missing discriminator視為`direct_master`，不backfill。
7. new event成功後session可維持physical `formalized` terminal state；產品語意是`已帶入料號工作`，不是Part master已核准或已更新。
8. Part work的edit／submit／review／approve由DEV-108與existing Part domain獨立負責；Drawing review package只封存recognition handoff摘要，不取得Part decision authority。
9. DEV-110 canonical panel使用new handoff command後，DEV-107 direct-master commit/formalize只保留legacy／internal compatibility，不得成為平行正常流程。
10. Current Phase不新增schema、migration、permission、root writer、combined review或後續Part自動繼承。
11. Physical `drawing_recognition_formalization_links.change_kind`只允許`create | update | not_applicable | evidence`。positive work field才建立`target_type=part_work` link；zero-delta／already-in-work只記在v2 event result與target fingerprints，zero-delta event為0 links。不得新增不存在的`no_change`值或為此改schema。
12. common／override handoff snapshot存於schema-v2 event；既有candidate／observation繼續作source evidence。不得把多Part override硬改寫為single-owner candidate，亦不得新增第二組candidate authority。
13. evidence applicability是write authority的一部分：圖面一般區域或明確共用列的`overall` evidence可形成common；料號／資料對照表的exact Part evidence只形成該Part override；缺overall時不得用unique mode／majority推導common。Current Phase不新增structured table parser：candidate owner必須由linked adapter原始結果證明exact eligible Part ID，或完整canonical anchor／configuration一對一相等；persisted owner ID或`resolved`標記本身不夠。其餘只允許該欄位同一PDF／OCR observation以token boundary唯一命中formal eligible集合內一個完整canonical part number。既有unanchored／suffix resolver、縮寫、substring、fuzzy、filename、多重／non-eligible命中或owner不一致一律unresolved／zero patch。此resolver只分派evidence，不能擴張eligible targets。
14. manual common／override是合法explicit intent，不以candidate存在為前提。manual-only change完整保存在event，但不得為滿足physical `candidate_id NOT NULL`建立synthetic candidate或假link。
15. destination-aware submitted recognition projection升為additive v2；既有v1 package與legacy event保持immutable並解讀為`direct_master`。Drawing submit guard、snapshot writer／parser與review copy必須讀同一discriminator。

16. 一圖多料號的證據適用範圍固定採「語意區域＋exact owner」：圖面一般區域／明確共用列（例如一般註記的表面處理）形成overall common；料號／資料對照表的完整canonical料號列（例如`A0006-P03→SUS301`）只形成該Part override。即使P01與P02同為SUS304，也不得以多數或出現次數推導common；對照表沒有列到的P04/P05保持unset，除非另有overall／其他／共用列。表格邊界、縮寫、合併儲存格或一列多Part無法安全解析時，維持unresolved並交由人工explicit intent處理。

## Lock And Transaction Rule

固定lock order：

`Drawing aggregate/work → current source set → recognition lineage/session → formal relation/root → sorted Part formal state → sorted Part work state/work`

PostgreSQL使用serializable transaction與`FOR UPDATE`；SQLite使用top-level`BEGIN IMMEDIATE`。Outer idempotency receipt綁定session、actor、source／relation fingerprint、canonical common／override draft hash；same key same hash replay同一event，same key different hash拒絕。

此bounded atomic handoff是對DEV-108「不得新增cross-Part atomic writer」stop condition的精確例外：它只能由recognition session觸發、只能寫existing Part work model、最多100 Parts、不能submit／approve／formalize Part master，也不能暴露成通用root batch API。DEV-108自己的autosave與N-work submit仍維持原契約。

## Consequences

### Positive

- 正常UI只顯示共用值，差異與來源噪音大幅降低。
- 一次動作不會留下partial Part works，source／relation drift與work conflict可fail closed。
- Part master與review authority維持單一，DEV-108可直接續編與送審。
- 既有evidence-origin overlay、append-only event、idempotency與submitted snapshot基礎可沿用。
- 無DDL／migration即可區分historical direct-master與new Part-work events。

### Cost And Constraints

- 既有Part work repository新增set-based `lockBatch`／`applyLockedBatch` primitive，讓外層transaction重用normalization、rowVersion、handling與work/state雙寫；不得呼叫會自建receipt的Part service，也不得複製SQL成第二writer。
- event consumer、snapshot selector與UI copy必須認得`destination=part_work`，不能把所有`formalized`session都翻譯為`已寫入PDM`；DEV-101 shared projection／snapshot／package code因此需要additive相容修改，但既有immutable package rows與approval authority不變。
- atomic transaction最多100 Parts並需sorted lock；Implementation Readiness已固定GET domain SELECT≤7、handoff domain `10 + 2M + ceil(L/25)`且最壞226、platform infrastructure first-attempt 8／transaction總上限234，並以SQLite／PostgreSQL provider parity與5s lock／8s end-to-end gate驗證。
- SQLite `queued／extracting`輪詢只讀processing shell，不取得`BEGIN IMMEDIATE`；rich scope等session進入reviewable狀態後才讀，並驗證worker write不被read poll飢餓。
- 現有OCR adapter的泛用`overall`標記不是表格owner authority；legacy persisted owner也可能來自suffix／unanchored resolver，因此projector必須先驗linked adapter exact-owner provenance，再執行完整canonical token one-to-one resolver，最後才決定per-Part／overall。這降低誤寫，但Current Phase不保證自動理解縮寫、合併儲存格或跨多行表格，無法安全解析時必須由人工common／override處理。
- downstream work後續變更不回寫recognition；upstream event只證明交接時點，不是current Part work truth。

## Migration And Compatibility

- Schema／migration：none。
- Existing DEV-107 events、master rows、links與38/38 evidence保持immutable historical baseline。
- 新consumer以result discriminator讀v2；legacy absent discriminator與既有recognition projection v1視為direct-master historical contract。
- DEV-110產品本機實作與 contract／SQLite／PostgreSQL／browser／integration／engineering QC已完成固定60/60；DEV-107仍保留為legacy baseline，canonical panel的runtime切換與production activation仍受獨立release gate管制。

## Implementation Decision Record

- Exact boundary、scope-aware algorithm、dirty SHA ledger與17–24 person-days estimate以authoritative SPEC §20～§26為準。
- Exact boundary remains `12 add / 10 modify / 0 delete`; current local slice includes the handoff files、route、CSS、session GET／panel／destination-aware review consumers、package scripts and contract／SQLite／PostgreSQL／browser／integration／aggregate runners. Latest aggregate evidence固定60/60 PASS；no schema／migration／dependency was added。
- DEV-101 shared recognition projection／snapshot／package code納入modify boundary，只增加destination-aware v2 producer／parser／submit guard；review UI authority與historical snapshot資料no-touch。
- session GET在repeatable read snapshot投影formal-only scope；POST使用single serializable transaction。UI natural order只供顯示，DB lock固定exact Part ID order。
- DEV-108 optional `initialPayload`是shared predecessor，不由DEV-110重做；DEV-110只在Part repository增加batch primitive。DEV-108 matrix files與Part create service／route是no-touch。
- `drawing-recognition-part-owner.ts` legacy resolver維持no-touch；DEV-110在new handoff contract／projector以linked adapter provenance與observation exact-token evidence建立更嚴格的write-authority policy，不回頭改變DEV-107 ingestion語意。
- zero-delta、legacy event與response-loss皆由event discriminator＋single session event unique＋platform receipt收斂；canonical UI不得呼叫legacy direct-master normal path。

## Amended Documents

- `SPEC-PDM-DRAWING-RECOGNITION-001`：canonical action由direct master commit改為Part-work handoff；evidence lineage與single receipt保留。
- `SPEC-PDM-ENTITY-DETAIL-DRAWER-001`：DEV-108新增recognition alternate entry，且只對bounded atomic draft handoff豁免cross-Part atomic stop；downstream submit不變。
- `ADR-PDM-DRAWING-RECOGNITION-AMENDMENT-LINEAGE-001`：purpose／origin overlay與single synchronized intent保留；synchronization destination由master擴充為versioned Part-work target。

## Revisit Triggers

- existing tables無法可靠區分event destination或保存work links。
- Part work repository無法在同一transaction重用而必須建立第二writer。
- 100-Part atomic lock造成不可接受的deadlock／latency且無法以bounded contract解決。
- 使用者要求root template、後加Part繼承、combined Part review或Drawing reviewer直接決定Part changes。
- 使用者要求縮寫料號、跨多行／合併儲存格表格或一列多Part自動展開，且完整canonical token one-to-one resolver不足；此時需另開structured table parser／model ADR與驗證，不得增加heuristic猜測。
- 法遵要求handoff後所有downstream work變更反向更新recognition evidence。
