# ADR-PDM-MATERIAL-IDENTITY-REVISION-001：料號身份與受控定義版次分離

狀態：Accepted / Human Confirmed  
日期：2026-08-10  
Owner：Dev PM  
關聯 DEV：`DEV-PDM-BOM-MODULE-ENTRY-001` / `DEV-060`  
關聯規格：`SPEC-PDM-CHANGE-CONTROL-001`、`SPEC-BOM-WORKBENCH-001`  
決策來源：使用者於 HCS 引導模式明確確認

> 2026-08-24 Limited Amendment：`ADR-PDM-BOM-STRUCTURE-SHARING-001` 有限修訂本文件的單一 owner 語意。結構相同的變體 Part Numbers可共用一份 BOM tree／Revision／Released Snapshot，但每個 Part仍必須有明確適用綁定與可確定投影；結構不同時仍須建立或 fork獨立BOM。本文件其餘 Part Number無版次、Drawing／BOM獨立版控與Released不可變規則不變。

## 1. Context

既有系統部分 schema、API 與 UI 使用 `parent_revision`、`child_revision`、`items.current_revision` 等名稱，且 BOM 草稿由 `submissionId` 建立。這些實作容易把圖面送審版次、BOM 版次與料號身份混為同一個概念，造成下列治理風險：

- 使用者誤以為 Part Number 本身會「升版」。
- 圖面變更時，系統不當地自動推動 BOM 或料號變更。
- BOM 行以「料號 + 料號版次」識別物料，破壞料號作為穩定物料身份的唯一性。
- 同一物料的 Drawing 與 BOM 無法各自保留獨立、可稽核的變更歷程。

本 ADR 將「什麼時候升 Rev、什麼時候換 Part Number」提升為 PDM 跨模組設計權威。未來的需求、資料模型、API、UI、匯入匯出、測試與 migration 都必須依本 ADR 判斷。

## 2. Decision

### 2.1 唯一核心規則

> 料號代表物料身份，本身不設 Revision。Drawing 與 BOM 是受控工程定義，各自擁有獨立 Revision。變更不改變物料身份時，維持原料號，只提升實際受影響的 Drawing 或 BOM Revision；變更造成 FFF、互換性、法規／品質管制或其他物料身份條件改變時，必須建立新料號，並建立該新料號自己的 BOM。

此規則中的 MUST / MUST NOT：

1. `Part Number` MUST 是公司範圍內穩定且無版次的物料身份。
2. `Drawing Revision` MUST 隸屬受控圖面定義，不得存成 Part Number Revision。
3. `BOM Revision` MUST 隸屬stable BOM Definition；Definition再明確綁定一個或多個適用 owner Part Numbers，且與 Drawing Revision獨立。不得以圖料根號或任一顏色Part隱含擁有。
4. 同一物料身份的變更 MUST 保留原料號，只提升實際改變的受控定義版次；Drawing 與 BOM 不得因另一方升版而自動同步升版。
5. 一旦 FFF、互換性、法規／品質管制或其他已核准的物料身份條件改變，MUST 建立新 Part Number；不得以「舊料號升版」代替。
6. 新 Part Number MUST 擁有明確的 BOM適用綁定與可確定投影。結構相同的變體可以共用受控BOM；結構不同時必須建立或fork獨立BOM，不得借共用關係靜默改寫其他料號。
7. Released Drawing、Released BOM 與舊料號歷史 MUST 保持不可被新定義靜默改寫。

### 2.2 判斷表

| 變更情境 | Part Number | Drawing Revision | BOM Revision |
|---|---|---|---|
| 標註、文字、非身份性的圖面定義修正，產品結構不變 | 維持 | 提升 | 維持；留下「無 BOM 影響」確認 |
| 數量、階層或組成改變，但 owner 物料身份仍相同 | 維持 | 只有圖面定義受影響時才提升 | 提升 |
| Drawing 與 BOM 都有實質定義變更，但物料身份不變 | 維持 | 各自提升 | 各自提升；兩者版次不要求相同 |
| FFF、互換性、法規／品質管制或其他物料身份條件改變 | 建立新料號 | 為新身份建立／關聯適當受控圖面定義 | 為新料號建立或明確綁定適用 BOM；結構不同時必須獨立／fork |

是否改變物料身份屬人類受控判定。AI、匯入器、CAD extractor 或單純欄位差異不得自行成為換號 authority；它們只能提供證據、風險提示與候選建議。

### 2.3 BOM 行與設定快照

- BOM item line 的材料識別鍵 MUST 只包含 Part Number identity；第一版同父層合併鍵為 `parent_line_id + child_part_number`。
- `child_revision`、`part_revision` 或同義欄位 MUST NOT 表示料號版次，新寫入不得再填此語意。
- 若正式設定必須固定某一 Drawing 或子 BOM 定義版次，MUST 以獨立的 `drawing_revision`／`bom_revision` 受控參照或 immutable release snapshot 保存，不得重用 Part Number 欄位。
- Where-used、替代關係與 Released BOM 不因新 Drawing/BOM revision 或新 Part Number 自動重寫；受影響 owner 必須經明確影響分析、建立新 BOM revision 或留下 no-change 確認。

## 3. Options Considered

| 方案 | 決定 | 原因 |
|---|---|---|
| Part Number 與 Drawing/BOM 一起帶 Revision | Rejected | 混淆物料身份與工程定義，搜尋、互換性與 ERP 整合都會產生多重身份。 |
| 任一 Drawing 進版就自動推動 BOM 進版 | Rejected | Drawing 與產品結構不是同一變更軸，會產生無意義版次與錯誤 Released mutation。 |
| 僅以 FFF 判斷是否換號 | Amended | FFF 是核心檢查，但互換性、法規／品質管制及其他物料身份條件也可能要求新料號。 |
| Part Number 無版次；Drawing/BOM 獨立版控 | Accepted | 能穩定表示物料身份，同時保留工程定義的可追溯變更。 |

## 4. Consequences

正面效果：

- 搜尋、BOM、Where-used、ERP 與採購可共同使用穩定 Part Number identity。
- Drawing 與 BOM 只在真正受影響時升版，降低無效版次與誤操作。
- 換號原因可以被 FFF、互換性、法規／品質證據明確稽核。
- 新舊料號及其 Released BOM 不會被自動覆寫。

成本與取捨：

- 現有 BOM schema 與 workbench 必須從 submission-bound ownership 遷移為 part-owned、BOM-revision-owned 模型。
- 舊的 `parent_revision`／`child_revision`／`items.current_revision` 需要相容讀取、語意標記與 migration evidence。
- CAD/XLS 匯入必須把 source submission 當作來源證據，而非 BOM owner 或 BOM revision authority。
- UI 需清楚標示 `料號（無版次）`、`圖面 Rev`、`BOM Rev`，避免只用模糊的「版次」。

## 5. Compatibility And Migration Authority

1. Canonical Part Number identity 是 `part_numbers.id`；`items.id` 與 `submissions.item_id` 只保留 legacy/runtime compatibility，不得成為新 BOM owner authority。
2. 新 BOM 寫入必須使用stable BOM Definition、獨立`bom_revision`與explicit applicable Part bindings。Legacy `owner_part_number_id`可暫作migration／compatibility anchor，但不得再單獨成為create、revision、permission、release、export或where-used authority；CAD/Drawing來源也不得成為owner。
3. 現有 `parent_revision = submissions.revision` 不得被持續解讀為料號版次。Migration 可在 company + part number 唯一且歷史序列無衝突時，將舊值一次性採認為初始 BOM revision，但必須保留原 `source_submission_id`、原 drawing revision 與 migration audit reason。
4. 缺少 canonical Part Number、同 owner/revision 衝突或無法證明序列的舊資料 MUST 進入 `manual_review`，不得猜測、覆寫、刪除或宣稱完成。
5. Legacy `bom_lines_tree.revision` / `bom_lines.child_revision` 新寫入 MUST 為 null；移除欄位前須先證明所有 reader/export/diff 已改讀獨立受控定義參照。
6. `items.current_revision` 不得在 UI/API/規則中被解釋為 Part Number Revision；後續 DEV 應移除其 authority 或改為明確命名的 legacy drawing cache。

## 6. Superseded / Amended Documents

本 ADR 修訂下列文件中所有「Part Number revision／料號版次／同料號同版次」語意：

- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
- `.ai-doc/specs/SPEC-BOM-WORKBENCH-001-bom-workbench.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`
- `.ai-doc/specs/SPEC-PDM-TRANSFER-PACKAGE-INTAKE-001-pack-and-go-assembly-classification.md`

既有 implementation/QC evidence 保留為歷史證據，但不能用來推翻本 ADR。發現其他文件或程式使用「料號升版」時，Spec Impact Preflight 必須分類為 `Intentional replacement` 或 `Unresolved conflict`，不得默默沿用。

## 7. Enforcement

未來每一個涉及料號、圖面、BOM、ECO、技轉、匯入／匯出或 ERP 同步的 DEV，至少必須回答並驗證：

1. 本次變更改的是物料身份，還是某一受控工程定義？
2. 若維持原料號，究竟是哪一個 Drawing/BOM definition 升版，另一方為何升或不升？
3. 若建立新料號，身份改變依據與 reviewer confirmation 在哪裡？新料號自己的 BOM 如何建立？
4. API/schema 是否存在任何 Part Number Revision 欄位或語意？若有，必須阻擋合併並修正。
5. Released history、Where-used 與舊 BOM 是否保持不可被靜默改寫？

以下任一情況為 P0/P1 readiness blocker：

- 新資料模型仍以 submission/drawing revision 作為 BOM revision authority。
- 建立 BOM 時沒有stable BOM Definition、至少一個canonical applicable Part binding與可確定的context Part。
- 換號與升版可由 AI/匯入器自動裁決且沒有 human confirmation。
- Released BOM、舊料號或 Where-used 被背景程序直接改寫。
- UI 或 export 把任何 `revision` 呈現為 Part Number Revision。
