# SPEC-PDM-SALES-KIT-BOM-001：銷售組合包 BOM

狀態：`Superseded Before Production Release / Historical Local Implementation and QA-QC 30/30 Retained / Not a Current Release Candidate`
日期：2026-08-31
關聯任務：`DEV-106 / DEV-PDM-SALES-KIT-BOM-001`
關聯規格：`DEV-095`、`DEV-096`、`DEV-099`、`DEV-104`
決策紀錄：current=`ADR-PDM-BOM-DOMAIN-002-unified-composition-and-deferred-execution-policy.md`；historical=`ADR-PDM-BOM-PURPOSE-001-manufacturing-and-sales-kit-separation.md`

## 1. 問題與產品價值

現行 BOM eligibility 將「BOM」收斂為製造 BOM：Parent 必須是 `manufactured + assembly`，且具有 primary manufacturing Drawing M。
這能保護製造資料，但無法表達公司自行將多個既有料號揀料、裝包，再以一個獨立料號販售的商業組合包。

本期要交付的不是「允許缺圖建立製造 BOM」，而是新增一個明確且不會被製造流程誤用的 BOM 用途：

- `manufacturing`：描述如何製造，原有 M 圖、Parent applicability、review、release與consumer gate全部保留。
- `sales_kit`：描述一個可販售料號由哪些庫存料號組成；不要求 Parent 製造圖，Released 後供組包、報價、出貨與下游匯出辨識。

成功結果：使用者只建立 Parent 料號、將其分類為有下階結構後，即可由 BOM 工作台找到入口，建立、編輯、送審並發布銷售組合包結構；整個流程不新增第二套 writer、editor 或 lifecycle。

## 2. Human Decision Brief

### 2.1 已確認

- `HD-106-01=A`：Current Phase 支援「公司自行把多個既有料號組成一包販售」。
- 組合包具有獨立且精確的 Parent 販售料號。
- Parent 可以沒有 Drawing；沒有 Drawing 不是製造 BOM 的例外。
- 沿用既有 BOM Definition、Draft、Outliner editor、review、Released snapshot與next revision。
- BOM 工作台新增可發現入口，但正式建立仍以 exact Part context 與同一個 server writer 為權威。

### 2.2 Current Phase 保守約束

下列為控制第一期複雜度的可逆邊界，不是使用者已明示的永久政策：

- `AS-106-01`：一個 sales kit Definition 只綁定一個 exact Parent；不做 same-root多Parent sharing。
- `AS-106-02`：沿用既有 BOM 角色與審核責任，不新增 Sales／Warehouse 角色或 permission。
- `AS-106-03`：每個Child代表既有庫存單位，quantity必須為正整數；不新增UOM與換算。
- `AS-106-04`：Released sales kit只輸出direct components，不遞迴展開Child自己的BOM。
- `AS-106-05`：一個Part在Current Phase只能有一個current Definition及一個purpose；需要製造與銷售兩套結構時，使用不同販售料號。

任一約束被實際案例否定時，停止對應slice並回到產品決策，不暗中擴張schema或consumer語意。

## 3. Spec Impact Preflight

判定：`Intentional replacement`。

- 取代 `DEV-096`「purchased assembly完全沒有BOM action」的廣義敘述；該限制仍完整適用於 `manufacturing`。
- 取代 `DEV-099`「purchased assembly本期沒有任何BOM action」；改為沒有製造BOM action，但可在sales-kit flag開啟且資格成立時建立 `sales_kit`。
- 保留 `DEV-095` 退役 `/bom/new`、CAD／XLS／from-assembly writer與第二入口的決策。
- 保留 `DEV-096` stable Definition、one-open Revision、idempotency、ETag、review/release、immutable snapshot、audit與exact Child authority。
- 保留 `DEV-104` Outliner唯一可寫、Map唯讀、Floating Topic為Draft staging，以及desktop edit／tablet-phone read-review-export邊界。

本SPEC是 sales-kit purpose 的current authority；製造BOM仍以 `SPEC-PDM-ASSEMBLY-BOM-REBUILD-001` 為authority。

## 4. 系統描繪

### 4.1 系統邊界

~~~mermaid
flowchart LR
  U[研發工程師／主管／Admin] --> BW[BOM 工作台]
  BW --> CP[建立候選唯讀投影]
  CP --> PM[Part Master]
  CP --> PB[exact Part 抽屜]
  PB --> EC[Purpose-aware eligibility]
  EC -->|manufacturing| MG[製造 BOM gate: manufactured + M]
  EC -->|sales_kit| SG[組合包 gate: active Part + exact Parent]
  MG --> W[同一 BOM Draft writer]
  SG --> W
  W --> D[Stable Definition + Draft]
  D --> E[同一 Outliner editor]
  E --> R[同一 review／release lifecycle]
  R --> S[Immutable Released Snapshot]
  S --> MC[製造／採購 consumer]
  S --> KC[組包／報價／出貨 export]
  KC -. no inventory write .-> ERP[ERP／庫存系統]
~~~

### 4.2 主要槓桿與防錯

| 系統風險 | 槓桿點 | Current Phase控制 |
|---|---|---|
| 缺M被當成製造例外 | Definition purpose | sales kit永遠不滿足manufacturing readiness |
| 工作台成為第二writer | exact Part context | 工作台只找Part並導向canonical create context |
| Parent被當成整包採購 | released purpose | sales kit固定投影為`explode_components=true`；PDM不下庫存交易 |
| 多Parent誤套結構 | binding cardinality | sales kit固定一個exact Parent |
| 重複Child造成重複扣料 | release gate | 同一exact Child只能出現一次，需合併quantity |
| Child形成循環 | graph gate | self與跨Definition cycle皆阻擋 |

## 5. Domain Contract

### 5.1 BOM Purpose

~~~ts
type BomPurpose = "manufacturing" | "sales_kit";
~~~

`bom_definitions.purpose` 是Definition的不可變語意：

- 建立Definition時由server根據使用者明示purpose與Part資格寫入。
- 同一Definition的所有Draft、Review、Released Snapshot與Next Revision繼承相同purpose。
- purpose不可由Draft PATCH、next revision或client-side state改寫。
- 現有Definition migration後固定為 `manufacturing`。
- `bom_usage_policy` 繼續表示可使用／受限／停用等政策，不得拿來代替purpose。

### 5.2 Eligibility Matrix

| 條件 | manufacturing | sales_kit |
|---|---:|---:|
| same company | 必須 | 必須 |
| Parent record usable | 必須 | 必須 |
| `structure_type=assembly` | 必須 | 必須 |
| `item_kind=manufactured` | 必須 | 不限制 |
| primary M | 必須 | 不要求 |
| existing current Definition | 開啟／下一版 | 開啟／下一版 |
| Parent bindings | same-root explicit multi-Parent | exact Parent一筆 |
| fulfilment projection | manufacturing | `explode_components` |

`structure_type=assembly` 在UI的人類標籤調整為「有下階結構（製造組立／銷售組合包）」；physical enum與既有分類writer不新增值。BOM purpose再回答這份結構供哪個流程使用。

### 5.3 Sales Kit 結構不變量

1. Parent必須是same-company、非Obsolete／Merged／MainDrawingInvalid的exact Part。
2. Definition只允許一筆Parent binding，Draft與Released snapshot的Parent count都必須為1。
3. 至少一個item line；group只作視覺分類，不是庫存項目。
4. Child必須是same-company canonical Part且處於可使用狀態。
5. purchased Child不要求M；manufactured Child沿用現有primary M readiness，不因sales kit放寬。
6. quantity為正整數；同一exact Child不得在同一Revision重複出現。
7. 只允許fixed Child；`by_parent` candidates／mapping在sales kit不適用。
8. Parent不可成為自己的Child；跨manufacturing／sales-kit Definitions的cycle都必須fail closed。
9. Floating Topic可在Draft暫存，但送審前必須為0。
10. Released export只展開本Definition direct components，不遞迴解析Child BOM。

## 6. 使用者流程

### 6.1 建立Parent料號

1. 使用者沿用canonical建立編號流程，只建立一個可販售Parent Part；Drawing不是必要輸入。
2. 若Part為 `unclassified` 或 `single_part`，由exact Part drawer既有「設定結構型態」改為 `assembly`。
3. 分類writer、ETag、audit與BOM conflict gate沿用DEV-099；BOM工作台不直接寫structure type。

### 6.2 從BOM工作台進入

1. 使用者由 `/bom/workbench` Header選 `從料號建立`。
2. 開啟短流程Modal，搜尋exact Part number／name。
3. 每個結果只顯示一個server-derived next action：
   - `建立銷售組合包`
   - `建立製造 BOM`
   - `開啟既有 BOM`
   - `前往設定結構型態`
   - 無可行動作時顯示最短blocker
4. 選定後導向canonical Part drawer；工作台不直接呼叫第二個writer。

### 6.3 Exact Part 建立

- 只有一個purpose可用時，按鈕直接使用明確名稱，例如 `建立銷售組合包`。
- 同時可建立兩種purpose時，`建立 BOM` Dialog只增加一個purpose choice，不建立stepper。
- sales kit dialog只顯示locked Parent、locked purpose、read-only BOM Rev、建立／取消；不顯示same-root Parent checkbox。
- manufacturing dialog維持DEV-096現況。
- 建立成功直接導航 `/bom/workbench/[draftId]?parentPartNumberId=[exactPartId]`。

### 6.4 編輯、送審與下一版

- sales kit沿用同一Outliner、Undo／Redo、save CAS、dirty guard、archive／restore、submit／reject／approve、Released與建立下一版。
- Header在BOM Rev旁顯示一個可讀purpose文字；不得以顏色作唯一辨識。
- sales kit不顯示Parent switch、variant mapping或by-parent controls。
- Release gate失敗時定位到exact line並保留使用者輸入。

### 6.5 下游使用

- Manufacturing readiness、技轉包與製造baseline只接受 `purpose=manufacturing`；sales kit不得冒充。
- Where-used包含sales kit關係，但每筆顯示purpose。
- sales kit CSV／XLSX／API export固定帶 `purpose=sales_kit` 與 `explodeComponents=true`。
- Current Phase只發布composition evidence；PDM不建立訂單、不扣庫存、不寫ERP。

## 7. UI Entry Contract

| 項目 | Contract |
|---|---|
| Target actor | 可管理BOM且可存取company的Engineer、R&D Manager、Admin |
| 正常起點 | `/bom/workbench` |
| Header CTA | 次要動作`從料號建立`；清單主要任務仍是搜尋／續作 |
| Empty state | 短事實＋同一個`從料號建立`，不建立另一流程 |
| Picker | server search、鍵盤可操作、單選；保留query與選取直到導航／取消 |
| Canonical destination | exact Part drawer；分類與建立action都由server projection |
| List identity | 在「BOM定義」cell顯示`製造`或`組合包`；另提供purpose filter |
| Editor | purpose只顯示一次；sales kit移除不適用的Parent／mapping controls |
| Narrow view | 390×844不水平overflow；Modal單欄；tablet／phone維持DEV-104 read/review/export |
| Accessibility | Modal focus trap／Escape／focus return；dynamic error live region；所有action有可存取名稱 |

正常狀態不得增加用途教學卡、三步驟說明、來源選擇、CAD／XLS入口、成功頁或第二套toolbar。

## 8. API Contract

### 8.1 建立候選

`GET /api/bom/create-candidates?query=&purpose=&cursor=`

~~~ts
type BomCreateCandidate = {
  partNumberId: string;
  partNumber: string;
  partName: string;
  itemKind: "manufactured" | "purchased";
  structureType: "unclassified" | "single_part" | "assembly";
  allowedPurposes: BomPurpose[];
  action: "create" | "open" | "classify" | "none";
  definitionId: string | null;
  draftId: string | null;
  blockerCode: string | null;
  updatedAt: string;
};
~~~

- endpoint唯讀、company-scoped、bounded pagination；client不得自行推導allowed purposes。
- same-company缺mutation權限時不回create action；cross-company資料不可列出。
- existing open Draft回open，不得建立duplicate。

### 8.2 建立上下文

既有 `GET /api/bom/applicability-candidates` 增加必填 `purpose`：

- `manufacturing` 回既有same-root Parent candidates。
- `sales_kit` 只回current Part一筆，`selected=true`、`selectable=false`。
- ETag fingerprint加入purpose、Part row version、Definition row version與base snapshot。

### 8.3 建立Draft

既有 `POST /api/bom/drafts` 增加：

~~~ts
{
  contextPartNumberId: string;
  bomPurpose: "manufacturing" | "sales_kit";
  applicableParentPartNumberIds: string[];
  bomRevision: string;
  source: "manual";
  baseReleaseSnapshotId: string | null;
}
~~~

- 仍使用 `Idempotency-Key` 與 `If-Match`。
- request fingerprint必須包含purpose。
- sales kit的Parent IDs必須恰為 `[contextPartNumberId]`。
- writer仍是既有shared Draft transaction；不得建立 `POST /api/bom/sales-kits` 或第二repository。

### 8.4 List／Detail／Review／Export

- Work list row、Draft detail、diff、review snapshot、Released read model與export DTO增加 `bomPurpose`。
- Review snapshot同時固定 `fulfillmentPolicy="explode_components"`，只對sales kit存在。
- Audit payload加入purpose；existing ID、status、row/editor version與hash欄位不變。

## 9. Data與Migration Contract

### 9.1 最小schema

在 `bom_definitions` 增加：

~~~sql
purpose TEXT NOT NULL DEFAULT 'manufacturing'
  CHECK (purpose IN ('manufacturing', 'sales_kit'))
~~~

另加company／purpose的read index；不新增sales-kit專用table。

### 9.2 Compatibility

- SQLite initializer與PostgreSQL forward migration使用下一個序號 `052_sales_kit_bom.sql`。
- 所有existing Definition deterministic backfill為 `manufacturing`；row count、ID、binding、Draft、Review與Snapshot不變。
- legacy無Definition Draft只作相容讀取並投影 `manufacturing`，不得成為sales kit建立入口。
- `bom_definition_parent_bindings` 的一個Part只能有一個current Definition限制保持不變。
- purpose為Definition immutable field，不做修改purpose的migration／API。

### 9.3 Feature Gate

新增default-off `PDM_SALES_KIT_BOM_V1_ENABLED`，依賴既有shared BOM與structured editor flags。

- flag off：既有製造BOM行為與DTO相容；sales kit create candidate/action為0。
- flag on但migration缺失：fail closed，不部分顯示入口。
- 不以flag建立平行writer；flag只控制新purpose capability與UI projection。

## 10. Permission、State與Transaction

### 10.1 Permission

- create／edit／submit／archive／restore沿用既有non-released-only BOM權限。
- decision沿用R&D Manager／Admin且禁止submitter self-decision。
- Manufacturing／Procurement維持Released-only read/export。
- Current Phase不新增Sales／Warehouse role；需要時另行re-entry，不修改既有role semantics。

### 10.2 State

~~~mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> PendingReview: submit
  PendingReview --> Rejected: reject
  Rejected --> Draft: edit
  PendingReview --> Released: approve
  Draft --> Archived: archive
  Rejected --> Archived: archive
  Archived --> Draft: restore
  Released --> Draft: create next revision
  Released --> Obsolete: approved obsolete
~~~

purpose不參與狀態轉換，也不得在任一轉換中改變。

### 10.3 Atomicity

- create transaction原子寫Definition、exact Parent binding、Draft、Draft Parent binding、idempotency effect與audit。
- 任一資格、ETag、purpose、binding或revision衝突時zero write。
- save／submit／approve沿用現行CAS、snapshot hash與provider transaction boundary。

## 11. Release Gate與Stable Errors

| Code | HTTP | 使用者恢復 |
|---|---:|---|
| `BOM_PURPOSE_INVALID` | 422 | 重新由正常建立入口選擇用途 |
| `BOM_PURPOSE_STRUCTURE_MISMATCH` | 422 | 先到exact Part設定為有下階結構 |
| `BOM_SALES_KIT_EXACT_PARENT_REQUIRED` | 422 | 只保留目前Parent |
| `BOM_SALES_KIT_PARENT_INACTIVE` | 409 | 處理Parent狀態後重試 |
| `BOM_SALES_KIT_EMPTY` | 409 | 至少加入一個組成料號 |
| `BOM_SALES_KIT_QUANTITY_INVALID` | 422 | 改為正整數 |
| `BOM_SALES_KIT_DUPLICATE_CHILD` | 409 | 合併同料號並調整quantity |
| `BOM_SALES_KIT_COMPONENT_INVALID` | 409 | 換成same-company可使用Child |
| `BOM_SALES_KIT_CYCLE` | 409 | 移除形成循環的Child |
| `BOM_SALES_KIT_FLOATING_BLOCKED` | 409 | 將暫存項納入正式樹或移除 |

既有 `BOM_OPEN_REVISION_EXISTS`、revision conflict、idempotency conflict、stale ETag、permission與migration errors維持。

## 12. Current Phase Scope

### 12.1 In Scope

- Definition purpose與additive provider migration。
- BOM工作台 `從料號建立` 與empty-state共用入口。
- purpose-aware candidate、Part drawer action、minimal create dialog。
- sales kit exact Parent Draft、Outliner edit、review、release、next revision。
- purpose filter／label、where-used purpose、released export contract。
- manufacturing與sales-kit cross-purpose negative gates。

### 12.2 Out of Scope

- ERP訂單、庫存扣料、採購單、成本過帳與PDM直接寫外部系統。
- 供應商整包購入／reference contents。
- 同一Part同時擁有manufacturing與sales-kit Definition。
- sales kit same-root多Parent sharing、by-parent mapping。
- optional item、替代料、贈品規則、組合促銷、價格條件。
- UOM、換算、小數數量。
- recursive child-BOM explosion。
- CAD／XLS／AI自動建立、`/bom/new` 或Drawing drawer create。
- 新角色、新approval platform或production release artifact。

## 13. Implementation Slices

| Slice | 交付 | Entry | Exit gate | 估工 |
|---|---|---|---|---:|
| `106-A Purpose foundation` | Definition purpose、migration、feature gate、typed DTO | current shared BOM schema/evidence可讀 | SQLite／PostgreSQL fresh/apply/rerun與existing manufacturing zero-drift | 2–3日 |
| `106-B Capability／writer` | create candidates、purpose matrix、same writer、release gates | 106-A PASS | API／repository／fault／idempotency／cycle cases PASS | 2–3日 |
| `106-C UI entry／editor` | workbench CTA、picker、Part handoff、dialog、purpose label/filter、sales-kit editor reductions | 106-B contract frozen | normal entry、keyboard、四viewport、visible-error sweep PASS | 2–3日 |
| `106-D Review／consumer` | immutable review purpose、Released export、where-used與manufacturing isolation | 106-C candidate frozen | actor matrix、snapshot/export一致、manufacturing false-positive=0 | 1–2日 |
| `106-E Aggregate` | affected DEV-096／099／104 regressions與isolated build | 106-A～D PASS | fixed QA set、provider、primary invariant、cleanup全部PASS | 1–2日 |

估工為本機RD＋QA/QC約8–13 person-days，不含production migration、activation、deploy或release。

## 14. Acceptance Criteria

1. 使用者能從BOM工作台正常Header與empty state找到同一個 `從料號建立` 入口。
2. 工作台只搜尋、選擇並導向exact Part；不產生第二個writer。
3. purchased assembly或無M assembly可明確建立 `sales_kit`，但仍不能建立 `manufacturing`。
4. sales kit完全不滿足manufacturing readiness、技轉或製造baseline。
5. existing manufacturing Definition migration後purpose全部為manufacturing且資料、hash、binding與狀態不變。
6. sales kit create原子產生一個Definition、一個Parent binding與一個Draft；重播不重複。
7. 同一Part已有Definition或open/restorable revision時只開啟續作，不建立duplicate。
8. sales kit沒有same-root Parent選擇、Parent switch、by-parent candidate或mapping controls。
9. 至少一個有效Child、正整數quantity、same-company、可使用、無duplicate、無self/cycle且Floating=0才可送審。
10. manufactured Child readiness不因sales kit被放寬。
11. purpose在Draft、Review、Released、next revision、list、diff、where-used與export一致且不可修改。
12. R&D Manager／Admin decision與self-decision denial沿用現行權限；released-only actor只見Released。
13. Released sales kit export提供exact Parent、direct Child、quantity、purpose與explode flag，不觸發庫存寫入。
14. manufacturing list／create／edit／review／release／exact Parent projection既有行為不退化。
15. flag off完全沒有sales kit action，且舊client／DTO仍可讀manufacturing資料。
16. SQLite與PostgreSQL transaction、constraint、idempotency、rollback與read projection一致。
17. 1440×900、1024×768、768×1024、390×844正常入口無overflow、遮擋、focus loss或unexpected visible error。
18. build／API／DB evidence不得替代正常UI入口與真實互動證據。

## 15. Stop Conditions

遇到任一條件，停止目前slice並回送Dev PM：

- 實際需求是供應商整包購入，不是公司自行組包。
- 需要同一Part同時存在製造與銷售兩個current Definitions。
- 需要小數quantity、UOM換算、recursive explosion或optional／alternative semantics。
- 需要PDM直接扣庫存、下單、寫ERP或產生成本交易。
- 需要新增Sales／Warehouse角色或改變現有approval責任。
- 需要跨company Child、跨root Parent sharing或Released purpose切換。
- 實作只能恢復 `/bom/new`、CAD／XLS writer或第二repository才可完成。
- provider migration無法additive、existing manufacturing資料出現非deterministic purpose，或primary invariant改變。

## 16. Future Phase Capsules

### 16.1 ERP／庫存整合

目的：Released sales kit在銷售或出貨事件發生時，由外部transaction owner展開並扣用Child。Re-entry需先確認ERP provider、order authority、retry/idempotency、partial fulfilment、退貨與對帳；PDM只提供immutable composition，不直接擁有庫存交易。

### 16.2 供應商整包內容

目的：描述整包購入、整包販售但不扣用內部Child的reference contents。Re-entry需定義採購Parent、供應商版本、收料、內容差異與reference-only export；不得重用 `sales_kit` 的explode semantics。

### 16.3 Dual-purpose Part

目的：同一Part同時擁有manufacturing與sales-kit Definitions。Re-entry需修改binding uniqueness、current Definition選擇、where-used、review與consumer selection；Current Phase以獨立販售料號避免這項複雜度。

### 16.4 UOM／選配／多階展開

只有實際組包案例需要小數、不同單位、選配件、替代料或Child BOM遞迴展開時，才補完整資料、release與downstream contract。

## 17. Readiness與Execution Boundary

- 文件成熟度：`RD Implementation Complete`；產品程式、migration runner、feature flag、API／DTO、repository、UI與consumer isolation已落地。
- Human decision gap：Current Phase核心語意為0；`AS-106-01..05` 是明確保守scope，命中re-entry才重新決策。
- 本輪完成：exact file／function、DDL、API／DTO、UI、consumer、slice dependency、local failure recovery、固定30案runner／command與evidence manifest均已凍結；106-A～106-E本機程式變更已完成。
- 已驗證：`npm run typecheck:app`、changed-file ESLint、`npm run qc:dev-106` 的固定 `QA-106-001..030` 30/30、task-owned SQLite migration、實際 localhost PostgreSQL provider parity、Chromium 四 viewport normal-entry flow，以及DEV-096／099／104 current contract regressions均PASS。最新manifest：`output/qa/dev-106/20260831044613157/manifest.json`。
- 本機 provider／UI gate 已完成；production migration／flag activation／deploy／release仍是獨立release gate，不得以本機證據推定已授權或已上線。
- `qc:dev-106` 現在是唯一full completion aggregate；每次建立隔離PostgreSQL cluster、隔離SQLite／repository與Next runtime，結束時確認process、port、fixture與dist清理。
- production migration、flag activation、deploy、release artifact及正式rollback procedure仍只能由後續release gate建立與執行。

## 18. Frozen Implementation Architecture

### 18.1 最小擴充原則

1. `bom_definitions.purpose` 是唯一purpose authority；不在Draft、Review或Snapshot另建可獨立修改的purpose欄位。
2. Draft／Review／Release仍只經 `AsyncBomWorkbenchRepository`；不得建立sales-kit repository、table、route family或lifecycle。
3. `bom_drafts.definition_id` 決定purpose；所有DTO以Definition join投影 `bom_purpose`，client傳入值只用於create intent，不是讀取authority。
4. sales kit只增加purpose-specific validation；manufacturing既有小數quantity、多Parent、fixed／by-parent mapping不得被全域收窄。
5. `snapshot_schema_version=2` 保留，不為一個additive discriminator升成v3；新v2 evidence加入purpose，舊v2 manufacturing evidence走明確legacy verification branch。
6. `PDM_SALES_KIT_BOM_V1_ENABLED` 只控制新capability與UI，不替代DDL。正式app revision的entry gate是先完成additive `052`，再部署default-off程式，最後另行授權activation。

### 18.2 Consumer Purpose Matrix

| Consumer／保護 | manufacturing | sales_kit | 實作決定 |
|---|---:|---:|---|
| canonical Part BOM context／workbench／review／Released read | 讀寫 | 讀寫 | 共用同一Definition與lifecycle，顯示purpose |
| `officialItemSnapshot`／技轉 current controlled BOM version | 可用 | 不可用 | shared v2 candidate與legacy-shadow suppression都只接受Definition `manufacturing` |
| manufacturing readiness／baseline | 可用 | 不可用 | 現行無另一個直接shared-BOM query；contract scan禁止新增無purpose predicate的consumer |
| where-used | 顯示 | 顯示 | 每筆投影purpose，不隱藏sales-kit引用 |
| Part replacement／retirement BOM reference guard | 保護 | 保護 | `hasBomReference`保持purpose-agnostic，避免停用仍被組包引用的Child |
| structure classification conflict guard | 保護 | 保護 | Parent已有任一Definition即禁止破壞其`assembly`資格；不加purpose filter |
| legacy synchronous manual BOM repository | 相容舊資料 | 不支援 | 不修改、不新增caller；sales kit不得落到此writer |

### 18.3 Snapshot Compatibility

- 新建schema-v2 review JSON固定增加 `bomPurpose`；只在 `sales_kit` 增加 `fulfillmentPolicy: "explode_components"`。
- 新建release snapshot hash material同步加入上述欄位，但relational snapshot table不重複增加purpose欄位。
- `assertSharedReleaseSnapshotIntegrity` 讀Approved review JSON判別新舊格式：
  - 有 `bomPurpose`：必須等於Definition purpose；sales kit必須同時有explode policy，再用新hash material驗證。
  - 無 `bomPurpose`：只允許Definition `manufacturing`，並用既有v2 hash material驗證。
  - sales kit不得進入legacy branch；purpose／policy缺漏一律 `BOM_RELEASE_SNAPSHOT_INVALID`。
- 既有review、release、hash、parent binding與resolved line都不回填、不重算、不改ID。

## 19. Exact File／Function Inventory

下列是RD允許且本輪實際採用的產品變更面；`Modify`表示既有檔案已以最小範圍整合，`Add`表示新增受控檔案。未列出的writer、table、route與consumer不得擴張。

### 19.1 `106-A Purpose foundation`

| Action | File | Exact responsibility |
|---|---|---|
| Modify | `db/schema.sql` | `bom_definitions`加入purpose CHECK／default、read index與purpose immutable trigger |
| Add | `db/postgres/052_sales_kit_bom.sql` | additive backfill、constraint、index、immutable trigger；同一transaction＋advisory lock |
| Modify | `db/postgres/README.md` | 登錄052的順序、backward compatibility與forward-only boundary |
| Add | `scripts/migrate-dev-106-sales-kit-bom.mjs` | task-owned SQLite dry-run／apply與disposable PostgreSQL rehearsal；拒絕primary／production scope |
| Modify | `.env.example` | 新增default-off `PDM_SALES_KIT_BOM_V1_ENABLED=false` |
| Modify | `package.json` | 加入DEV-106 migration與QC commands；不改production deploy scripts |
| Add | `src/lib/sales-kit-bom-feature.ts` | `SALES_KIT_BOM_V1_FLAG`、`isSalesKitBomV1Enabled()`、client status；依賴shared BOM及structured editor flags |
| Modify | `src/lib/types.ts` | 新增`BomPurpose`；work list／Draft／Review／Release／WhereUsed DTO加入`bom_purpose` |
| Modify | `src/lib/pdm-canonical-workbench-contract.ts` | `CanonicalPartBomContext`加入`definitionPurpose`與`allowedCreatePurposes`，保留既有action enum |

禁止在 `src/lib/db.ts` 增加第二條隱式auto-migration；既有SQLite資料只經frozen migration command處理。

### 19.2 `106-B Capability／writer`

| Action | File／symbol | Exact responsibility |
|---|---|---|
| Modify | `src/lib/bom-create-context.ts` / `getBomApplicabilityCandidateContractAsync` | 增加required purpose；manufacturing維持原演算法，sales kit只回exact Part locked candidate；ETag納入purpose |
| Add in same file | `BomCreateCandidateContract`、`listBomCreateCandidatesAsync` | company-scoped read-only search、bounded cursor與server-derived action／allowed purposes |
| Modify | `resolveCanonicalPartBomContextAsync` | 先處理existing Definition purpose，再投影create/open/blocker；不得先用M圖gate把sales kit擋掉 |
| Add in same file | `assertSalesKitBomMigrationReadyAsync` | 新purpose create前驗證052與shared migration readiness；stable fail-closed error |
| Modify | `src/lib/bom-shared-structure.ts` / `validateSharedGraph`旁新增`validateSalesKitStructure` | 只封裝sales-kit single-parent、fixed、integer、duplicate規則；不改manufacturing validator |
| Modify | `src/lib/bom-workbench-async.ts` | `listBomWorkbenchRecordsAsync`與`createSharedBomDraftAsync`傳遞purpose |
| Modify | `src/lib/repositories/bom-workbench-async-repository.ts` / input types、list/get/create/save/buildEvidence/submit/approve/parse | Definition purpose lock、purpose-specific save/release gate、snapshot/audit propagation、next revision inheritance |
| Add | `src/app/api/bom/create-candidates/route.ts` | authenticated GET only；query／purpose／cursor／limit parser、permission projection、canonical row key、`no-store` |
| Modify | `src/app/api/bom/applicability-candidates/route.ts` | required purpose parser與stable SharedBomError response |
| Modify | `src/app/api/bom/drafts/route.ts` | POST `bomPurpose`、fingerprint、same writer；GET work-list purpose filter |
| Modify | `src/app/api/bom/drafts/[draftId]/route.ts` | purpose-bearing detail與purpose-specific save errors；不允許PATCH purpose |

`createSharedDraft`是唯一Definition create transaction。不得呼叫legacy `createCanonicalDraft`承接sales kit，也不得新增 `POST /api/bom/sales-kits`。

### 19.3 `106-C UI entry／editor`

| Action | File／symbol | Exact responsibility |
|---|---|---|
| Modify | `src/components/bom-workbench-list-page.tsx` | Header／empty-state共用`從料號建立`、purpose filter／label；新增入口只保留這一個次要動作 |
| Add | `src/components/bom-create-from-part-dialog.tsx` | server search、single-result action、loading／empty／error、focus trap／return；只導航canonical Part |
| Modify | `src/components/part-bom-context.tsx` | purpose-aware applicability與create payload；單purpose locked、雙purpose單選；sales kit不顯示Parent checklist |
| Modify | `src/components/bom-workbench-detail.tsx` | next revision沿用`draft.bom_purpose`，不得重新選purpose |
| Modify | `src/components/bom-editor/bom-editor-types.ts` | `BomEditorDraftLike.bom_purpose` typed contract |
| Modify | `src/components/bom-editor/bom-structured-editor.tsx` | Header顯示purpose一次；sales kit隱藏Parent／mapping操作，其他Outliner command不分叉 |
| Modify | `src/components/bom-editor/bom-node-inspector.tsx` | 接受purpose或`allowParentMapping`；sales kit只編fixed Child／正整數quantity |
| Modify | `src/app/globals.css`、`src/app/styles/responsive.css` | picker、purpose filter與390／768／1024 responsive；不新增卡中卡或第二toolbar |

Picker destination固定為 `/parts?detail=cw_<canonicalStateUuid>`，由候選API提供server-derived canonical row key。它不自動POST、不在URL攜帶可信purpose；exact Part drawer載入server projection後才允許使用者建立。

### 19.4 `106-D Review／consumer`

| Action | File／symbol | Exact responsibility |
|---|---|---|
| Modify | `src/lib/bom-release-integrity.ts` / `assertSharedReleaseSnapshotIntegrity` | 新舊schema-v2 hash branch與purpose／policy一致性 |
| Modify | `src/lib/bom-release-export.ts` | shared export固定增加`bom_purpose`、`fulfillment_policy`欄；sales kit只輸出direct components |
| Modify | `src/app/api/bom/releases/[releaseId]/export/route.ts` | 使用purpose-aware integrity／export，不新增kit export route |
| Modify | `src/lib/repositories/item-insight-async-repository.ts` | where-used joinDefinition並投影purpose；corruption query檢查Definition/purpose authority |
| Modify | `src/lib/repositories/approval-platform-async-repository.ts` / `listLegacyBomInbox` | join Definition purpose，在BOM審核inbox target／impact顯示「製造／組合包」 |
| Modify | `src/lib/transfer-package-phase1d.ts` / `officialItemSnapshot` | shared current version及legacy-shadow suppression都只接受manufacturing Definition |
| Verify no diff | `src/lib/pdm-change-control-domain.ts` / `hasBomReference` | draft與released Child reference必須繼續涵蓋兩種purpose |
| Verify no diff | `src/lib/part-structure-classification.ts` / `hasBomConflict` | 任一purpose的Parent binding都繼續阻擋破壞性重分類 |
| Verify no diff | `src/lib/repositories/bom-repository.ts` | legacy synchronous writer不獲得sales-kit caller或purpose branch |

### 19.5 `106-E QA／aggregate`

| Action | File | Exact responsibility |
|---|---|---|
| Add | `scripts/dev106-qc-fixture.mjs` | 只seed前置company／actors／Part／Drawing；輸出fixture mutation ledger |
| Add | `scripts/qc-dev-106-migration.mjs` | fixed cases 001–002，fresh/apply/rerun SQLite＋disposable PostgreSQL |
| Add | `scripts/qc-dev-106-contract.mjs` | fixed cases 003–005，matrix／DTO／writer-retirement scan |
| Add | `scripts/qc-dev-106-repository.ts` | provider-parameterized raw mutation／API-domain checks |
| Add | `scripts/qc-dev-106-repository-runner.mjs` | 合併SQLite＋PostgreSQL後才產生fixed cases 006–018 |
| Add | `scripts/qc-dev-106-postgres.mjs` | task-owned PostgreSQL 052／writer／review／release provider parity，支援006–018 evidence |
| Add | `scripts/qc-dev-106-browser-real.mjs` | fixed cases 019–026，Chromium normal entry、actors、keyboard與四viewport；保存screenshots與network errors |
| Add | `scripts/qc-dev-106-browser.mjs` | static source contract supporting scan，不作real-browser completion authority |
| Modify | `scripts/qc-dev-106-aggregate.mjs` | 執行migration／contract／repository／PostgreSQL／real-browser，產生027–030、驗證exact 30、regression與cleanup |

## 20. Frozen DDL與Migration Algorithm

### 20.1 SQLite initializer

`db/schema.sql` 的Definition欄位與保護固定為：

~~~sql
purpose TEXT NOT NULL DEFAULT 'manufacturing'
  CHECK (purpose IN ('manufacturing', 'sales_kit')),

CREATE INDEX IF NOT EXISTS idx_bom_definitions_company_purpose
ON bom_definitions(company_id, purpose, updated_at, id);

CREATE TRIGGER IF NOT EXISTS trg_bom_definition_purpose_immutable
BEFORE UPDATE OF purpose ON bom_definitions
WHEN NEW.purpose IS NOT OLD.purpose
BEGIN
  SELECT RAISE(ABORT, 'BOM_DEFINITION_PURPOSE_IMMUTABLE');
END;
~~~

### 20.2 PostgreSQL `052_sales_kit_bom.sql`

順序固定如下，不可在migration內建立sales-kit資料：

1. `BEGIN`與`pg_advisory_xact_lock(hashtext('ai_pdm:dev106:sales-kit-bom-v1'))`。
2. `ALTER TABLE bom_definitions ADD COLUMN IF NOT EXISTS purpose TEXT`。
3. `UPDATE ... SET purpose='manufacturing' WHERE purpose IS NULL`；記錄更新數只可等於migration前Definition數或0（rerun）。
4. 設default與NOT NULL；drop／recreate named CHECK `bom_definitions_purpose_check`。
5. 建 `idx_bom_definitions_company_purpose`。
6. 建 `dev106_guard_bom_definition_purpose()` 與 `trg_bom_definition_purpose_immutable BEFORE UPDATE OF purpose`；值改變時拋 `BOM_DEFINITION_PURPOSE_IMMUTABLE`。
7. 驗證invalid/null purpose=0後 `COMMIT`。

### 20.3 Migration command safety

- SQLite `--mode=dry-run`只讀plan；`--mode=apply`只接受resolved DB位於本任務明示的`PDM_DATA_DIR`，且若指向repo `data/ai-pdm.sqlite`立即拒絕。
- apply前保存task-owned DB backup與before invariant；DDL與backfill在單一transaction，失敗ROLLBACK，成功後跑`PRAGMA foreign_key_check`及rerun no-op。
- PostgreSQL本機rehearsal由`qc-dev-106-postgres.mjs`建立task-owned localhost cluster，不讀取`DEV106_POSTGRES_DSN`或既有Supabase／Cloud SQL；production DSN永遠不在本DEV範圍。
- 052是forward-only additive migration。本DEV不提供production down migration；正式環境失敗恢復、備份與release sequencing由release gate另建。
- `output/dev-032-migration-package/`、`output/dev-046-cloudsql-migration-package/`與既有release bundle不在本期產品實作變更面。

## 21. Frozen DTO／API Details

### 21.1 Naming與default

- TypeScript/domain type：`BomPurpose = "manufacturing" | "sales_kit"`。
- persisted/read DTO沿用repo snake_case：`bom_purpose`。
- create intent沿用request camelCase：`bomPurpose`。
- schema-v2 canonical JSON沿用camelCase：`bomPurpose`、`fulfillmentPolicy`。
- legacy無Definition read model只可投影`manufacturing`；不得成為sales-kit create／next-revision authority。

### 21.2 Create candidate pagination

`GET /api/bom/create-candidates?query=<text>&purpose=<optional>&cursor=<optional>&limit=<optional>`：

- `limit` default 25、max 50；order固定 `lower(part_number), id`。
- cursor為base64url JSON `{ partNumberKey, id }`；decode／shape錯誤回 `BOM_CREATE_CANDIDATE_CURSOR_INVALID` 422。
- response固定 `{ items: BomCreateCandidate[], nextCursor: string | null }`，每個item含server-derived `canonicalRowKey`（`cw_<UUID>`或`null`），並帶`Cache-Control: no-store`。
- purpose filter只保留可建立該purpose或已存在同purpose Definition的Part；無purpose時回server排序後的唯一next action。
- open Definition優先於create；unclassified／single_part回classify；inactive／cross-company／無權限不得回create。

### 21.3 Create與next revision

- `POST /api/bom/drafts`在shared payload中要求`bomPurpose`；缺漏／非法值為`BOM_PURPOSE_INVALID` 422。
- request fingerprint至少包含company、actor、context Part、purpose、ordered Parent IDs、BOM revision、base snapshot與selection ETag。
- transaction重新讀Part、Definition、purpose、binding、base release及ETag；client candidate result不具authority。
- 新Definition INSERT明示purpose；既有Definition要求purpose完全相同，否則 `BOM_DEFINITION_PURPOSE_CONFLICT` 409。
- next revision從Definition繼承purpose；`bomPurpose`只作一致性assert，不可切換。
- sales kit Parent陣列必須exact為`[contextPartNumberId]`；manufacturing繼續使用原same-root選取規則。

### 21.4 Purpose-specific validation order

save／submit／approve依序：shared graph通用shape與limit → Definition purpose → exact Parent → component mode／selection → Child scope／readiness → quantity／duplicate → self／cross-definition cycle → Floating／reconfirmation → immutable review/hash。第一個錯誤回stable code與`logicalLineId`／`partNumberId` details；合法已輸入Draft不得因release rejection被清空。

## 22. Transaction、Evidence與Audit Contract

- `createSharedDraft`同一transaction寫Definition、Definition Parent binding、Draft、Draft Parent binding、create effect、edit event與audit；任一checkpoint失敗全部zero-write。
- Definition lock讀取必須包含`purpose`；SQLite靠transaction serialized write，PostgreSQL沿用`FOR UPDATE`。兩session競爭只允許一個Definition／Draft winner。
- `validateSalesKitStructure`只在Definition purpose為sales kit時執行：Parent count=1、component mode全fixed、每item一個Child、parent selections=0、quantity為safe positive integer、整份revision exact Child唯一。
- cycle graph仍讀所有current schema-v2 released edges，不依purpose過濾，故manufacturing↔sales-kit跨purpose cycle會被拒絕。
- create/save/submit/reject/approve/archive/restore/next-revision audit detail均帶`bomPurpose`；audit不是purpose authority。
- review inbox、diff與Released detail的purpose來自Definition join；任何JSON與Definition不一致都fail closed，不用UI label掩蓋。

## 23. Slice Dependency與Git Boundary

| Slice | 可開始條件 | 必須完成後才可進下一slice |
|---|---|---|
| `106-A` | 本文件與ADR／QA一致 | DDL fresh/apply/rerun、flag-off、typed compile、existing data zero-drift |
| `106-B` | 106-A PASS；052存在於所有isolated providers | cases 003–018 PASS；no second writer；transaction/fault checkpoints有效 |
| `106-C` | 106-B API／DTO frozen | cases 019–021、023、024、026 PASS；四viewport與keyboard無可見錯誤 |
| `106-D` | 106-C candidate source frozen | cases 016–018、022、025 PASS；approval／where-used／export／transfer isolation一致 |
| `106-E` | A–D同一source candidate | 001–030 exact PASS、DEV-096／099／104 current-source contract regressions、cleanup complete；各專案完整歷史aggregate另由其authority維護 |

本repo目前已有與DEV-106無關的未提交變更；RD每個slice必須在evidence記錄`git status --short`與source hash，只修改§19列出的檔案及該slice測試。若目標檔已有他人變更，先保存並以最小patch整合，不reset／checkout／覆寫。DEV-106完成前不stage、commit、deploy或release，除非使用者另行明確授權。

## 24. Local Failure Recovery與Flag-off

| Failure | Recovery contract |
|---|---|
| SQLite dry-run／preflight失敗 | zero write；修正fixture或migration後重跑，不改primary |
| SQLite task-owned apply中斷 | transaction rollback；比對backup與before invariant，只有task-owned copy可restore |
| PostgreSQL rehearsal失敗 | 保留evidence、刪除／重建disposable target後重跑；不得轉向production DSN |
| create／save／approve fault checkpoint | transaction zero-write；以同idempotency key或最新ETag重試，不能手工補半套rows |
| UI／API sales-kit異常 | 將`PDM_SALES_KIT_BOM_V1_ENABLED=false`並重啟該task-owned runtime；manufacturing gate與既有Definition仍可用 |
| 新hash驗證失敗 | 停止release，保留Draft／Review；不得重算或覆寫immutable evidence |
| regression／primary invariant／source drift失敗 | aggregate FAIL，停止slice，清理本任務runtime，回送RD／Dev PM |

Flag-off是本機與未來activation的能力關閉手段，不是production rollback procedure。已建立的sales-kit Definition在flag-off時仍需可由授權角色讀取Released evidence，但不得建立、編輯、送審、核准或建立下一版；若實作無法維持這個read-only降級，停止並回到Dev PM。

## 25. Package Command Contract

實作完成後`package.json`固定提供：

~~~text
npm run migrate:dev-106:dry-run
npm run migrate:dev-106:apply
npm run migrate:dev-106:postgres
npm run qc:dev-106:migration
npm run qc:dev-106:contract
npm run qc:dev-106:repository
npm run qc:dev-106:postgres
npm run qc:dev-106:browser-real
npm run qc:dev-106
~~~

`qc:dev-106`是唯一completion aggregate。單一runner成功只能回報partial PASS；缺實際PostgreSQL、normal browser entry或任一固定case時必須`Blocked／FAIL`且保留30為分母。runner分配、evidence目錄與manifest schema以QA文件§9～§13為authority。

## 26. DEV-109 Create Page and Human Label Amendment（2026-08-31）

`SPEC-PDM-BOM-CREATE-PAGE-001-canonical-entry-and-candidates.md`是DEV-109的target authority。舊purpose runtime與UI remediation已完成但只作歷史基線；current unified domain狀態以主SPEC §33的`RD Implemented Locally / Full QA-QC Passed 54/54 / Production Release Gated`為準。Production release仍是獨立gate。以下條款只描述舊流程被取代的追溯關係：

1. 本SPEC §6.2、§6.3與§7的「工作台Modal → exact Part drawer → Part create Modal」改由單一`/bom/create`頁取代；BOM工作台與Part context都進入同一路由。
2. 使用者可見的`sales_kit`名稱固定為`非製造 BOM`；本SPEC、ADR、migration、QA ID、API、DB、snapshot、audit與歷史evidence保留technical value／歷史名稱，不作全域technical rename。
3. 工作台空白query可顯示受控`.SLDASM`、目前使用者近期與公司近期Part候選；候選只作read projection，不改變本SPEC的purpose、eligibility、exact Parent、writer、review／release或consumer authority。
4. `.SLDASM`只在current production Drawing Revision、active primary file及formal exact Drawing-Part relation成立時作reason；不得由檔名推定、解析Child、自動分類或寫BOM。
5. candidate、applicability與create仍沿用既有endpoint／writer；不得新增second writer、schema或recommendation persistence。

本SPEC原§6.2、§6.3與§7現改作DEV-106 historical runtime baseline；本節記錄已落地的successor contract。DEV-106既有30／30 evidence維持immutable historical baseline，不是DEV-109證據；production release仍不得由本機QA-QC自動核准。

2026-09-01 successor update：DEV-109的舊suggested／search／purpose／writer與UI disposition保留為48／48及舊60／60 historical baseline；Current SPEC §29～§33已完成單一BOM domain、UOM、SLDASM promotion與固定54／54 aggregate。Production capability、migration、deploy與release gate不變；current evidence以`output/qa/dev-109-unified/2026-08-31T19-13-51-837Z/aggregate.json`為準。

## 27. Unified BOM Supersession（2026-08-31 Human Confirmed）

本SPEC保留為DEV-106歷史實作、migration 052與30／30 evidence的追溯基線，不再是target product authority。使用者已確認單一BOM domain，因此本文件中下列條款全部被`ADR-PDM-BOM-DOMAIN-002`與`SPEC-PDM-BOM-CREATE-PAGE-001` §29～§33刻意取代：

- `manufacturing | sales_kit` immutable purpose、purpose selector／filter／flag 與 exact-one-purpose-per-Part。
- sales kit 只允許 fixed Child、direct explosion、正數 quantity 與隱含庫存單位。
- 製造 BOM 必須 `manufactured + primary M`，以及無 M 圖 assembly 只能建 sales kit 的資格矩陣。
- purpose-specific snapshot／audit／export／consumer isolation 作為 target behavior。

Target rule 為：任一合法 `assembly` Part 可擁有單一 BOM，不受 Drawing、CAD、`item_kind` 或 Child 有無圖檔限制；數量允許正小數，單位由 Child 基本單位帶入並鎖定在 BOM Revision。PDM 不負責 ERP／庫存的履行策略。

DEV-106程式、052 migration與evidence不在本文件回溯改寫。Current contract已由主SPEC §33記錄為`RD Implemented Locally / Full QA-QC Passed 54/54`；production migration、activation、deploy與release仍不得由本文件或本機收據自動授權。
