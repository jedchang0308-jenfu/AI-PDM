# ADR-PDM-BOM-PURPOSE-001：製造 BOM 與銷售組合包用途分離

狀態：Superseded by ADR-PDM-BOM-DOMAIN-002 Before Production Release / Historical DEV-106 Record
日期：2026-08-31

## Context

現行系統以 `manufactured + assembly + primary M` 作為BOM建立資格，實際上把BOM等同製造BOM。公司另有一種真實工作：建立獨立販售料號，將多個既有料號自行揀料、裝包後販售，但Parent沒有製造圖。

若只移除M圖檢查，缺文件的製造組立件也能發布，並可能被技轉、製造baseline與採購consumer誤用。若另建sales-kit模組或writer，Definition、Draft、版本、審核與Released evidence會形成雙authority。

## Options

### Option 1：所有BOM都允許沒有M圖

實作最少，但無法區分「不需要圖」與「缺少必要圖」，會破壞製造gate。否決。

### Option 2：新增 `item_kind=kit`

能讓料號直接分類，但把make／buy與BOM用途混在一起，會影響建號、篩選、採購與大量既有consumer。Current Phase不採用。

### Option 3：建立獨立Sales Kit模組與writer

畫面可完全分離，但會複製BOM lifecycle、權限、review、release與audit，長期一致性成本最高。否決。

### Option 4：在既有BOM Definition加入purpose

Part identity、structure classification與BOM operational purpose維持分層；製造與組合包共用同一個writer／editor／lifecycle，再由purpose控制資格與consumer。採用。

## Decision

1. `bom_definitions` 增加immutable `purpose=manufacturing | sales_kit`。
2. 所有existing Definitions migration為 `manufacturing`，製造BOM的M圖與Parent規則不變。
3. `sales_kit` 代表公司自行揀料組包，Parent不要求Drawing；它不滿足任何manufacturing readiness。
4. sales kit Current Phase固定一個exact Parent、fixed Child、direct explosion與正整數quantity。
5. 工作台新增的是發現／導引入口；正式create仍由exact Part context與既有 `POST /api/bom/drafts` writer執行。
6. 同一套Draft、Outliner、review、Released snapshot、next revision、audit與permission繼續是唯一authority。
7. Released sales kit可供where-used與export辨識，但PDM不擁有訂單、庫存或ERP transaction。
8. Current Phase一個Part只有一個current Definition／purpose；需要雙purpose時用不同販售料號。

## Consequences

正面：

- 不放寬製造安全gate即可支援無圖組合包。
- 不新增第二套BOM資料與生命週期。
- 下游能明確拒絕把sales kit當成manufacturing BOM。
- 未來可在purpose維度增加供應商reference／service kit，而不改item kind語意。

成本：

- Definition schema、DTO、migration、review snapshot、audit與consumer都必須purpose-aware。
- 工作台與Part drawer需要一個新的建立導引與最小purpose訊號。
- Current Phase不支援同一Part雙purpose，需以獨立販售料號建模。

## Authority Boundaries

| Concern | Authority |
|---|---|
| Part identity | canonical Part Number |
| 有無下階結構 | `part_numbers.structure_type` |
| BOM operational purpose | `bom_definitions.purpose` |
| Draft／revision／review／release | existing BOM repository與lifecycle |
| manufacturing readiness | purpose=manufacturing＋existing M gates |
| sales-kit composition | purpose=sales_kit＋Released exact-parent snapshot |
| order／inventory transaction | 外部ERP／庫存系統，不屬PDM |

## Amended Documents

- `SPEC-PDM-ASSEMBLY-BOM-REBUILD-001`：purchased assembly仍不可建立manufacturing BOM；DEV-106只新增sales-kit purpose。
- `SPEC-PDM-DEFERRED-STRUCTURE-CLASSIFICATION-001` 與 `ADR-PDM-PART-STRUCTURE-CLASSIFICATION-001`：assembly表示有下階結構；BOM readiness改為purpose-aware。
- `SPEC-BOM-WORKBENCH-001`：增加從料號建立、purpose label/filter與sales-kit UI reduction。
- `ADR-PDM-ASSEMBLY-MASTER-ENTRY-001`：保留canonical Part owner與不恢復 `/bom/new`。

## Revisit Triggers

- 同一Part必須同時存在manufacturing與sales-kit Definition。
- 公司要支援供應商整包、service kit或reference-only contents。
- 組合包需要UOM、選配、替代料、價格條件或recursive explosion。
- PDM必須直接觸發庫存／ERP交易。
- sales kit需要不同審核角色或跨公司components。

## Superseding Decision（2026-08-31）

### New evidence

本ADR原決策假設「沒有 M 圖的組件不可成為製造結構」。後續業務案例證明，新組件料號 B 可以由有 `.SLDPRT` 的零件 A 與無圖檔潤滑油組成，B 必須有 BOM，但可能沒有 `.SLDASM` 或 M 圖。因此「有無 CAD／M 圖」不能推論 BOM 的運作用途。

此外，PDM 現行不負責工單、庫存、揀貨或訂單交易；在 BOM Definition 強制儲存 `manufacturing | sales_kit` 只帶來兩套 eligibility、validator、UI、filter、snapshot 與 feature-flag 分支，卻沒有已確認的當前交易 consumer 效用。

### Reconsidered options

1. 保留兩個 BOM types：可供未來 consumer 直接判斷，但繼續將 composition 與 fulfillment 綁在一起，且要求建立者做當下無效用的決策。
2. UI 隱藏 purpose，後端保留：操作較簡單，但讓關鍵語意變成不可見的隱式預設，會增加誤用與資料債。
3. 單一 BOM domain，執行策略延後到真實 ERP／庫存整合邊界：符合 PDM 當前負責的 composition／revision／review／release authority，也保留未來以獨立 policy 擴充的空間。

### New decision

採 Option 3，取代本ADR原 Option 4。

1. 新 target domain 只有 `BOM`，不將製造／非製造作為 Definition identity、建立資格或 UI 必選欄位。
2. `bom_definitions.purpose`、migration 052、`sales_kit` feature flag、purpose-specific validation／snapshot／export 是待退役的 current implementation，不再是 target authority。
3. 歷史 Definition、Released snapshot、audit 與 DEV-106 evidence 必須保留可追溯，不可為簡化 schema 改寫 immutable evidence。詳細 migration／compatibility 由 RD Contract 決定。
4. 任一合法 `assembly` Part 都可擁有單一 BOM，不以 `item_kind`、M 圖、`.SLDASM` 或 Child 有無圖檔作為建立條件。
5. 當真實 ERP／庫存 consumer 需要區分「生產入庫」與「出貨時拆料」，以獨立 execution／fulfillment policy 建模；該 policy 不是 BOM type，也不由 CAD 類型推論。

### Consequences

- 正面：建立頁、candidate、validation、filter、review 與 export 回到單一結構心智模型；無圖組件與含耗材組件不再被假性 purpose gate 阻擋。
- 成本：已有 DEV-106／109 程式與 052 schema 必須做 provider-aware retirement，並重建受影響 QA／QC 分母。
- 風險：在退役 contract 封口前，不得開始 production migration／activation／deploy／release；也不得將 DEV-106 30／30 或 DEV-109 60／60 稱為新設計已驗證。

新決策authority：`ADR-PDM-BOM-DOMAIN-002-unified-composition-and-deferred-execution-policy.md`。
新產品／技術contract：`SPEC-PDM-BOM-CREATE-PAGE-001-canonical-entry-and-candidates.md` §29～§33（`RD Implemented Locally / Full QA-QC Passed 54/54`）；本ADR仍僅作historical record。
