# SPEC-PDM-BOM-CREATE-PAGE-001：BOM 統一建立頁與候選料號建議

狀態：`CAPA Local Corrected / Contract Corrected / Historical Local 54/54 Retained / Production Effectiveness Required / Production Release Gated`
日期：2026-08-31（2026-09-01 升級）
關聯任務：`DEV-109 / DEV-PDM-BOM-CANONICAL-CREATE-PAGE-001`
關聯規格：`SPEC-PDM-SALES-KIT-BOM-001`、`SPEC-BOM-WORKBENCH-001`、`SPEC-PDM-ASSEMBLY-BOM-REBUILD-001`、`SPEC-PDM-DEFERRED-STRUCTURE-CLASSIFICATION-001`、`SPEC-PDM-CANONICAL-NUMBER-CREATION-001`
關聯決策：`ADR-PDM-BOM-DOMAIN-002`（current）、`ADR-PDM-BOM-PURPOSE-001`（superseded history）

> Current authority：§34為current CAPA correction，§29為Human-confirmed產品決策，§31為Current RD Implementation Contract，§32記錄RD技術主管審查與已併回§31的修正，§33為historical本機實作與QA/QC收據。§1～§28保留為DEV-106／109歷史基線；衝突時依序以§34、§31、§30、§29、§33為準。歷史54／60分母不支持CAPA完成。

## 1. Outcome 與成熟度

本期將現行 BOM 工作台的兩段式 Modal 建立流程，收斂成單一 `/bom/create` 頁。使用者先從搜尋或系統候選選定 exact assembly Parent Part；系統不再要求選擇 BOM 用途，直接顯示「將建立」摘要，最後沿用既有 `POST /api/bom/drafts` canonical writer 建立 Draft 並進入既有 editor。

本文件已凍結產品與技術邊界、UI Entry、read projection、API 相容、permission、錯誤恢復、repo／module／file 責任、source-level query plan、fixed case registry、可執行 commands、QA/QC 與 stop conditions。109-A～D 的 domain／API／DB／delivery-path 功能基線 48／48 保留；2026-08-31 使用者提供的實際 `/bom/create` 畫面證明視覺層未符合原核准方向，因此同一 DEV-109 依 §28 重開 UI remediation；該重開已由本輪109-E～G與60／60 gate完成。

既有本機implementation與54／54 receipt只作回歸基線。A0044現場失敗已由§34重開CAPA；目前成熟度為
`CAPA Local Corrected / Contract Corrected / Production Effectiveness Required / Release Gated`。CAPA local修正、正式資料
dry-run／核准apply、artifact activation、canonical smoke與scheduled effectiveness仍未執行；本文件不授權正式操作。

## 2. Human Decision Brief

已確認：

1. BOM 建立採用與 `/numbering/create` 相同的獨立頁、漸進揭露、「將建立」摘要與底部唯一主要動作，但不共用建號 domain component。
2. BOM 工作台 Header 與 empty state 使用同一個 `建立 BOM` 入口；Part context 也導向同一頁，不長期保留平行 Modal。
3. 空白 query 顯示候選料號；輸入 query 後原位置切換成搜尋結果，清除後恢復候選，不建立「建議／搜尋」頁籤。
4. 候選優先序為：有正式 current `.SLDASM` 組合檔關聯、目前使用者近期建立、公司近期建立／更新；低訊號的公司近期資料只有已可建立／開啟 BOM 時才進 default suggested，不能只因可分類就占用前 5 筆。
5. `.SLDASM` 只作為可解釋的候選訊號，不解析 Child、不修改 structure type、不推定用途、不建立或預填 BOM。
6. 使用者可見名稱固定為 `製造 BOM` 與 `非製造 BOM`；technical value 仍為 `manufacturing` 與 `sales_kit`。
7. `非製造 BOM` 精確對應 DEV-106 已存在的 `sales_kit`，不是新的通用非製造 domain，也不擴張既有用途語意。
8. 第一版不加入推薦分數、AI、行為追蹤、embedding 或持久化推薦紀錄。

## 3. Spec Impact 與 Authority

判定：`Intentional replacement + compatible preservation`。

DEV-109 實作並通過本文件驗收後，已取代：

- `SPEC-PDM-SALES-KIT-BOM-001` §6.2、§6.3、§7 的「工作台 Modal → exact Part drawer → Part create Modal」建立路徑。
- `SPEC-BOM-WORKBENCH-001` §19.1～§19.4 的 `從料號建立` picker 與 Part drawer create presentation。
- current UI 中 `銷售組合包`、`組合包`等對 `purpose=sales_kit` 的人類標籤，統一改為 `非製造 BOM`。

DEV-109 保留：

- `ADR-PDM-BOM-PURPOSE-001` 的 immutable `manufacturing | sales_kit`、同一 writer、同一 lifecycle 及 manufacturing isolation。
- DEV-095 退役 `/bom/new`、CAD／XLS／`from-assembly` 與第二套 writer 的邊界。
- DEV-096 stable Definition、one-open Revision、ETag、idempotency、review／release、exact Parent 與 `.SLDASM` parser Future Phase。
- DEV-099 exact Part structure classification authority；建立頁不得直接寫 `structure_type`。
- DEV-104 Outliner-first editor、Map read-only、dirty guard、desktop edit 與窄版 capability。

Authority 順序：

1. BOM purpose、Definition、Draft、review／release與 consumer：既有 DEV-106／096 domain spec 與 ADR。
2. DEV-109 目標建立入口、候選 projection、用途文案與本期驗收：本文件。
3. DEV-104 editor 與 workbench detail presentation：`SPEC-BOM-WORKBENCH-001` §18。
4. DEV-109 的 `/bom/create`、candidate projection 與 current copy 已是 runtime authority；DEV-106 Modal／Part drawer 僅保留為 historical baseline，不能作為新入口或新證據。

ADR 判定：`No new ADR required`。本期是可逆的 UI／navigation／read projection 與人類文案調整；不改 identity、schema、purpose enum、permission、lifecycle 或 writer。若實作評估必須新增持久化推薦 authority、改 writer、擴張 `sales_kit` 語意或建立新的 file-to-Part 關係，必須停止並重新評估 ADR。

## 4. Current Repository Facts

2026-08-31 盤點到的現行能力：

| Concern | Current authority／fact | DEV-109 gap |
|---|---|---|
| Workbench entry | `src/components/bom-workbench-list-page.tsx` 以 `BomCreateFromPartDialog` 提供 Header／empty-state Modal | 改為同一 `/bom/create` Link；Modal caller 歸零後退役 |
| Candidate API | `GET /api/bom/create-candidates` → `listBomCreateCandidatesAsync`，已具 company scope、purpose、action、blocker、cursor | 空白 query 目前按料號排序，尚無三種候選來源與 reason contract |
| Part context | `PartBomContext` 以第二個 Modal 選 purpose／applicability 後建立 | 導向 `/bom/create?partNumberId=...`；分類與 open 仍走 server-derived action |
| Eligibility | `bom-create-context.ts` 已推導 `allowedPurposes`、`create/open/classify/none` | 建立頁只消費，不在 client 重算 |
| Create context | `GET /api/bom/applicability-candidates` 已提供 purpose、Parent candidates、BOM Rev、strong ETag | 由新頁在 Parent／purpose 確定後呼叫 |
| Writer | `POST /api/bom/drafts` 已要求 `Idempotency-Key`、`If-Match`，建立 shared Definition／Draft | 完整沿用，不新增 endpoint／repository |
| Current Drawing file | `canonical_workbench_states.data_layer=drawing_production` 指向 current production revision；`drawing_revision_files` 與 `file_assets` 提供 active primary file | 新增只讀 `.SLDASM` candidate projection；不得掃檔名猜 Parent |
| Exact relation | `drawing_part_links` 保存 formal Drawing-Part relation | 只接受正式 exact relation，不使用 root／stem 推定 |
| Recent Part | `part_numbers.created_by`、`created_at`、`updated_at` 已存在 | route 需把 authenticated actor ID 傳入 projection |

Current Architecture Impact：新增一個 page shell 與一個 purpose-aware candidate read projection；既有 domain transaction、schema、migration、permission resolver、lifecycle、editor、review、Released snapshot與 export 均不變。不得抽象成通用 recommendation platform、wizard engine 或 create-page framework。

## 5. Current Phase Scope

### 5.1 In Scope

- `/bom/create` standalone page，以及 BOM workbench Header／empty state與 exact Part context 的統一入口。
- 空白 query 最多 5 筆的 server-derived 候選；搜尋結果與候選共用同一 list contract。
- 三種候選理由、deterministic priority、Part 去重、company／permission／record-state gate。
- exact `.SLDASM` current production evidence 的只讀投影。
- Parent 選取、必要 purpose 選擇、read-only「將建立」、create／open／classify 的唯一 next action。
- UI 全面將 `purpose=sales_kit` 顯示為 `非製造 BOM`；technical identifiers 保持不變。
- 沿用 applicability contract、strong ETag、idempotent writer、canonical workbench destination 與 safe return。
- Medium 風險所需的 API／repository、normal UI entry、真實 browser、viewport、keyboard、visible-error 與 primary-data invariant 驗證。

### 5.2 Out of Scope

- 解析 `.SLDASM` references、configuration、custom properties、hierarchy、quantity 或 Child Part。
- 依檔名／stem／root 猜 Parent，或由檔案自動建立 Part、relation、structure type、purpose、BOM line 或 Draft。
- 恢復 `/bom/new`、CAD／XLS import、`from-assembly`、第二個 create endpoint 或 sales-kit 專用 writer。
- 新 table／column／migration、推薦分數、machine learning、embedding、個人瀏覽紀錄或推薦事件表。
- 修改 `BomPurpose`、052 migration、Definition purpose、review／release、ERP／庫存、role 或 permission semantics。
- 同一 Part 雙 purpose、供應商整包、service kit、UOM、選配、遞迴展開與 DEV-096 `.SLDASM` parser Future Phase。
- production migration、feature activation、deploy、release、PR 或 commit artifact。

## 6. System Flow

~~~mermaid
flowchart LR
  U[Engineer／R&D Manager／Admin] --> E[BOM workbench／exact Part entry]
  E --> P[/bom/create]
  P --> C[Candidate read projection]
  C --> PM[Part master／created_by／timestamps]
  C --> DR[current drawing production revision]
  DR --> F[active primary .SLDASM]
  C --> R[formal exact Drawing-Part relation]
  P --> A[Existing applicability contract + ETag]
  A --> W[Existing POST /api/bom/drafts]
  W --> D[Existing Definition／Draft]
  D --> X[Existing BOM editor]
~~~

Candidate reason 只影響排序與可理解性。Eligibility、purpose、Definition、BOM Rev、ETag 與 create 結果一律由現有 server authority 重新決定。

## 7. UI Entry、Route 與 Navigation Contract

| Actor | Normal start | Visible entry | Destination |
|---|---|---|---|
| Engineer、R&D Manager、Admin | `/bom/workbench` | Header 次要動作 `建立 BOM` | `/bom/create?returnTo=<safe workbench URL>` |
| 同上；BOM 清單為空 | `/bom/workbench` empty state | 短事實＋同一個 `建立 BOM` | 同上 |
| 同上；exact Part drawer | canonical Part workbench | `建立 BOM` | `/bom/create?partNumberId=<exact ID>&returnTo=<safe Part URL>` |
| Released-only actor | BOM list／Released consumer | 不顯示建立入口 | 既有 Released read／export，不取得 create capability |

Route query contract：

~~~ts
type BomCreatePageQuery = {
  partNumberId?: string; // exact canonical Part ID；不得接受料號字串作 identity
  purpose?: "manufacturing" | "sales_kit"; // optional intent；server 必須重新驗證
  returnTo?: string; // only same-origin allowlisted BOM／Part route
};
~~~

- `partNumberId` 合法且可讀時直接進 selected Parent state；不存在回 404，cross-company 對外同樣回 404，無 mutate capability 回 403／受限頁。
- `purpose` 只有在該 Parent 的 `allowedPurposes` 包含時才可預選；不合法或 stale 時不得偷偷 fallback，改回 server 合法選項或顯示就地 blocker。
- `returnTo` 只允許 `/bom/workbench`、canonical `/parts` 及其安全 query；拒絕 `//`、scheme、host、backslash與非 allowlist path。缺漏時回 `/bom/workbench`。
- 建立成功只接受 writer 回傳的 `workbenchUrl`；client 不自行拼接未驗證 Draft destination。
- `open` action 進 exact existing Draft／Released-origin Draft；`classify` action回 exact Part structure section並保留 safe return；不得讓使用者重搜同一 Part。
- direct URL 只證明 route 可達；QC 必須從正常工作台與 Part 入口各完成至少一條 delivery path。
- `GET /api/bom/drafts?surface=work_list` 以 additive `capabilities: { canCreate: boolean }` 回傳建立能力；工作台在 response 前預設不顯示 create CTA，避免 Released-only actor 發生權限閃現。Header 與真正 empty state消費同一 capability，不在 client 以角色名稱重算。

## 8. UX View 與 Interaction Contract

### 8.1 Page shell

- 資訊架構沿用 `/numbering/create`：單一頁首、依序揭露的內容、單行「將建立」與底部取消／主要動作。
- 只沿用 layout pattern、spacing、form controls與 responsive shell，不匯入建號 typed intent、命名器、root 邏輯或 submit component。
- 主要工作物件是 exact Parent Part；Parent 未選時 list 是唯一主焦點，選定後 Parent summary 是唯一主焦點。
- 正常狀態不顯示目的介紹、三步驟教學、用途說明卡、推薦分數、來源頁籤、CAD tab、成功頁或第二套 toolbar。

### 8.2 Parent selection

- 初次載入且 query 空白：同一清單最多顯示 5 筆候選，每筆只含料號、品名、一個最高價值 reason 或 blocker 與一個可辨識 action state。
- 輸入 query：原位置切成搜尋結果；client debounce／取消 stale request，較舊 response 不得覆蓋較新 query。
- 清除 query：恢復候選；不保留第二份 hidden list 或頁籤狀態。
- 選定可建立 Parent：清單收起成 read-only summary並顯示 `更換`；client 以 `router.replace(..., { scroll: false })` 將 exact `partNumberId`與合法 purpose寫回目前 URL，讓 reload／分類後 browser Back 能恢復同一 Parent。更換回到先前 query／scroll／focus，並從 URL 移除 stale Parent／purpose。
- `action=open` 的主要動作為 `開啟既有 BOM`；`action=classify` 為 `設定為組立件`；`action=none` 只顯示最短 blocker，不提供假的建立 CTA。

### 8.3 Purpose 與「將建立」

- 一種合法 purpose：直接使用，不顯示選擇器。
- 兩種合法 purpose：才顯示兩個同層 radio choice，文字為 `製造 BOM`、`非製造 BOM`。
- purpose 選定後才讀 applicability contract；loading 只阻擋受影響區域，不以全頁 overlay 中斷搜尋／取消。
- `manufacturing` 顯示既有 applicability contract 的 compact checklist：exact context Parent 必選且不可取消，其餘 same-root selectable Parents可複選；blocked row只顯示既有原因。`sales_kit`固定 exact Parent，不顯示 checklist或 same-root mapping。
- 「將建立」只顯示 Parent 料號／品名、用途、BOM Rev，以及適用時一個 `.SLDASM` 檔名 reason；它是 read-only preview，不是新資料 authority。
- Primary CTA 依 action 為 `建立 BOM`、`開啟既有 BOM`或`設定為組立件`；同一時刻只有一個同權重 primary。

### 8.4 Human label mapping

| Technical value | Current human label |
|---|---|
| `manufacturing` | `製造 BOM` |
| `sales_kit` | `非製造 BOM` |

上述 mapping 適用於 workbench filter／row、candidate action、create page、selected summary、editor header、read-only message、Released display與一般人類錯誤訊息。DB、API、TypeScript union、migration、audit、log key、test fixture ID與歷史文件保留 `sales_kit`；不得做無價值的全域 technical rename。

## 9. Candidate Read Projection Contract

### 9.1 Endpoint 與 request

沿用：

`GET /api/bom/create-candidates?query=<text>&partNumberId=<exact-id>&purpose=<optional>&cursor=<optional>&limit=<optional>`

- authenticated、company-scoped、`Cache-Control: private, no-store`。
- route 必須把 authenticated `actorId` 與 mutate capability 傳入 projection；client 不得提交「這是我的近期」等 reason。
- `partNumberId` 是 Part context／reload 使用的 exact identity mode；與非空 `query`、`cursor` 互斥，成功只回 1 筆 exact row，找不到與 cross-company 都回 `BOM_RESOURCE_NOT_FOUND` 404，不以料號、root 或檔名 fallback。
- Released-only actor 對此 create-only endpoint 一律回 `BOM_CREATE_FORBIDDEN` 403；不得用 `action=none` 洩漏候選、reason 或 exact Part 存在性。
- `limit` 介於 1～50；create page 空白 query 固定要求 5，search 預設 25。
- suggested／exact mode 的 `nextCursor=null`；search cursor 為 opaque、versioned，固定綁定 company、normalized query、purpose、`mode=search` 與最後 `(searchRank, lowerPartNumber, partId)` sort tuple。任一輸入改變、decoded payload欄位／型別／rank超界或version不符時回 `BOM_CREATE_CANDIDATE_CURSOR_INVALID`；`searchRank`只接受在server先前產生或client自行構造但完整通過same-context decode／binding驗證的cursor內，不另收獨立query欄位，也不得跨query重用。

### 9.2 Response

~~~ts
type BomCandidateReasonCode =
  | "controlled_assembly_file"
  | "created_by_me_recently"
  | "company_recent";

type BomCreateCandidate = {
  partNumberId: string;
  partNumber: string;
  partName: string;
  itemKind: "manufactured" | "purchased";
  structureType: "unclassified" | "single_part" | "assembly";
  allowedPurposes: Array<"manufacturing" | "sales_kit">;
  action: "create" | "open" | "classify" | "none";
  definitionId: string | null;
  draftId: string | null;
  blockerCode: string | null;
  canonicalRowKey: string | null;
  reason: {
    code: BomCandidateReasonCode;
    label: string; // server-owned, shortest visible explanation
    fileName: string | null; // only controlled_assembly_file may populate
  } | null;
  updatedAt: string;
};

type BomCreateCandidateResponse = {
  mode: "suggested" | "search" | "exact";
  items: BomCreateCandidate[];
  nextCursor: string | null;
};
~~~

- `allowedPurposes`、`action`、`draftId`、`blockerCode`與 `reason` 全由 server 推導。
- `reason` 不是授權、eligibility或 purpose 證據。提交時 writer 不接收 reason，也不把 reason 寫入 Definition／Draft。
- 同一 Part 無論命中多少來源只回一列與最高優先 reason，不回分數或所有命中細節。

### 9.3 Suggested mode

query trim 後為空時：

1. `controlled_assembly_file`。
2. `created_by_me_recently`。
3. `company_recent`。

同一優先級按 reason evidence time DESC、Part `updated_at` DESC、`lower(part_number)` ASC、Part ID ASC；去重後取前 5 筆，`nextCursor=null`。

Suggested mode 的來源／action matrix固定如下；inactive、cross-company、無權限與無恢復動作的 `none` 不占 5 筆：

| Highest reason | Suggested 可列 action | 理由 |
|---|---|---|
| `controlled_assembly_file` | `create | open | classify` | 受控組合檔是強烈且可解釋的組立需求訊號；尚未分類時可導向唯一安全下一步 |
| `created_by_me_recently` | `create | open | classify` | 支援使用者剛建立、尚無圖檔的非製造 BOM Parent，不讓其重新搜尋 |
| `company_recent` | `create | open` | 公司近期更新本身不足以建議把一般單件改成組立件，避免低訊號資料占滿前 5 筆 |

Search／exact mode仍可回 `classify` 或 `none` blocker；上述限制只影響空白 query 的 default suggested，不改變使用者明確搜尋或 exact Part context 的可恢復能力。

### 9.4 Search mode

query 非空時按：exact part number → part number prefix → part number contains → part name contains，再按 `lower(part_number)`、ID。Search 可回 `action=none` 與最短 blocker，讓使用者理解為何指定料號不能建立；不得把 blocked row 偽裝成候選推薦。

Search response 的 reason 可為該 Part 同時命中的最高優先 suggestion reason；沒有 suggestion reason 時為 `null`。搜尋 relevance 不顯示成分數。

### 9.5 Exact mode

`partNumberId` 非空時不執行文字搜尋或 suggestion pagination。projection 仍回完整 server-derived `action`、`allowedPurposes`、blocker、existing destination與最高優先 reason，使 direct Part entry、reload及 browser Back 都能由 exact identity 恢復同一 Parent。exact row 即使 blocked 也可回傳，讓頁面顯示唯一可恢復動作；不存在、cross-company或 Released-only 依 §9.1 fail closed。

### 9.6 Controlled `.SLDASM` predicate

只有全部成立才可產生 `controlled_assembly_file`：

1. `canonical_workbench_states` 的 same-company、`entity_type=drawing`、`data_layer=drawing_production` current state 指向 exact `drawing_revision_id`。
2. current Drawing 具有正式 `formal_drawing_number_id`，且 `drawing_part_links` 對 candidate Part 存在 explicit formal pair；`primary_manufacturing` 或 `reference` 都是 relation evidence，但不改變 purpose eligibility。
3. revision file `removed_at IS NULL`、`role=cad_3d`、`is_primary=1`。
4. `file_assets.deleted_at IS NULL` 且 normalized `file_ext=sldasm`；不得只看 display name 或 path suffix。
5. Drawing、revision、file、asset、relation與Part皆為 same company；Part record 仍由既有 eligibility gate判斷。

禁止事項：

- 不讀 preparing／in-review／correction work file作 current production reason。
- 不使用 `.SLDASM` stem、Drawing number、root或排序推定唯一 Parent。
- 同一檔案若透過正式關係對應多個 exact Parts，每個 Part 可獨立成候選；不得猜其中一個。
- `.SLDASM` 不會自動把 `unclassified`／`single_part` 改為 `assembly`；該列 action仍是 `classify`。
- file／relation anomaly不得導致 BOM mutation。reason projection失敗時 candidate可由其他來源出現，但不能偽造組合檔理由。

### 9.7 Recent predicates

- `created_by_me_recently`：same-company `part_numbers.created_by=actorId`；使用 `created_at` 為 reason evidence time。
- `company_recent`：same-company Part；使用 `updated_at` 為 reason evidence time。
- 兩者都必須通過現有 record status、definition、purpose與 actor capability projection；不新增 user activity tracking。
- 「近期」不是永久時間窗政策；第一版只按 timestamp 取相對最新，不以 7／30 天 cutoff 排除可用資料。

### 9.8 Query safety

- projection 必須 bounded、無 per-row query／N+1；eligibility、Definition／Draft與 reason 在同一 bounded read plan或固定數量 bulk query完成。
- search wildcard 必須參數化；cursor不得接受 client 自訂 rank。
- cross-company、tombstone、removed file、deleted asset、非 current production revision與 filename-only relation必須有 negative tests。
- 本期預設 schema／index 變更為 0。若 RD query-plan 證據顯示現有 index 無法達到互動式搜尋，且唯一合理修正必須新增 index／migration，立即命中§17 stop condition並停止 DEV-109；先補 provider／migration contract並重新接受技術審查，不可在實作中暗加 DDL。

## 10. Applicability、Create 與 Duplicate Contract

Parent action 為 `create` 時：

1. 一個 `allowedPurpose` 直接使用；兩個才讓使用者選。
2. 呼叫既有 `GET /api/bom/applicability-candidates?contextPartNumberId=<id>&purpose=<value>`。
3. `manufacturing` 沿用 same-root explicit Parent selection；`sales_kit` 沿用 exact Parent locked selection。
4. response 的 `suggestedBomRevision`、`baseReleaseSnapshotId`、candidate set與 `selectionEtag` 形成 read-only preview。
5. submit 呼叫既有 `POST /api/bom/drafts`，沿用 `Idempotency-Key` 與 `If-Match`；payload不新增 recommendation／file欄位。
6. server transaction重新讀 Part、purpose、Definition、binding、base release與 ETag；client selection與 label不具 authority。

Duplicate／race：

- candidate 已有 open／Released-origin Draft時 action為 `open`，不得送 create request。
- `open` destination 優先使用 open Draft；只有沒有 open Draft 時才使用最新可讀 Released snapshot 的 `bom_draft_id`。Definition 同時缺少兩者時是 `BOM_DEFINITION_STATE_INVALID`，search／exact 顯示 blocker，suggested 不列入。
- 選定後若另一 session先建立，server回既有 `BOM_OPEN_REVISION_EXISTS`／conflict；UI在 details含可讀 Draft ID時改呈現 `開啟既有 BOM`，不重複建立。
- 相同 idempotency key＋相同 fingerprint走 replay並進同一 workbench URL；相同 key＋不同 fingerprint為 conflict。
- network unknown result 使用既有 `GET /api/bom/drafts?idempotencyKey=<key>` effect readback恢復；此 readback additive 回傳 server-derived `workbenchUrl`。effect 已存在時直接進同一 Draft；404時以同一 key＋同一 fingerprint安全重試，不能自行產生新 key盲目重送。

## 11. Permission、Data 與 Compatibility

- 建立頁與 writer沿用既有 company access及 non-released-only BOM mutate capability；不新增 role。
- cross-company exact Part／Drawing／file／Draft一律不列出；direct ID對外維持 404 隱匿。
- Released-only actor不見 Header／empty／Part create CTA，也不能透過 direct route取得 create／classify action；既有 Released read／export不受影響。
- 候選 endpoint 是 read projection，不得授權 client mutation；writer仍作最終 permission check。
- Schema、migration、persisted data與 snapshot shape變更為 0；`bom_definitions.purpose` 仍 immutable。
- feature flag仍沿用 `PDM_ASSEMBLY_SHARED_BOM_V1`／`PDM_SALES_KIT_BOM_V1_ENABLED`。相關 capability關閉時頁面只顯示 server stable blocker，不呈現失效 CTA。
- DEV-106 historical spec／QA／migration與 evidence可保留「銷售組合包」作歷史名稱；current產品畫面不得再顯示。

## 12. UI State、Failure 與 Recovery

~~~ts
type BomCreatePageState =
  | { phase: "loading_candidates"; query: string }
  | { phase: "selecting_parent"; query: string; mode: "suggested" | "search" }
  | { phase: "parent_selected"; partNumberId: string; purpose: null | "manufacturing" | "sales_kit" }
  | { phase: "loading_context"; partNumberId: string; purpose: "manufacturing" | "sales_kit" }
  | { phase: "ready"; partNumberId: string; purpose: "manufacturing" | "sales_kit"; selectionEtag: string }
  | { phase: "submitting"; idempotencyKey: string }
  | { phase: "error"; recoverTo: "candidates" | "selected" | "ready" };
~~~

- candidate load失敗：保留 query，錯誤放在清單位置，提供一個 `重試`；不得清空整頁或跳回 workbench。
- search stale／abort：舊 response不得覆蓋新 query；loading／empty／error互斥。
- applicability失敗：保留 Parent與 purpose；stale ETag重新讀 context，仍合法的人工 Parent選取保留交集。
- create validation／permission失敗：保留 preview及可恢復輸入；錯誤靠近 CTA／受影響欄位，technical stack或 raw SQL不進UI。
- submit期間 disable duplicate primary，但取消／browser leave必須避免產生第二次 mutation；結果已知成功後只導航一次。
- 返回／取消使用 validated `returnTo`；更換 Parent與 API error後 focus回到合理 control。所有動態錯誤使用適當 `role=alert`／live region。

Stable code沿用既有 BOM errors；DEV-109新增或收斂時至少涵蓋：

| Code | HTTP | Recovery |
|---|---:|---|
| `BOM_CREATE_CANDIDATE_CURSOR_INVALID` | 422 | 清除 cursor並從目前 query第一頁重讀 |
| `BOM_CREATE_CANDIDATE_READ_FAILED` | 500 | 保留 query，原位重試 |
| `BOM_RESOURCE_NOT_FOUND` | 404 | 回候選或 safe return |
| `BOM_CREATE_FORBIDDEN` | 403 | 移除 create action，回既有可讀 surface |
| `BOM_PURPOSE_INVALID` | 422 | 重新使用 server allowed purposes |
| `BOM_OPEN_REVISION_EXISTS` | 409 | 轉成 `開啟既有 BOM` |
| stale ETag／selection conflict | 409／412 | 重新讀 applicability，保留仍合法選取 |

## 13. Responsive、Accessibility 與 Quietness

- 1440×900、1024×768、390×844 均無頁面級水平 overflow、重疊、截斷、固定底列遮擋或內外雙重捲動。
- 窄版採單欄；不把 desktop 欄位壓成多張 card，也不把主要 CTA藏在水平捲動中。
- 搜尋、結果選取、更換 Parent、purpose、取消與主要動作皆可只用鍵盤完成；focus順序與視覺順序一致。
- selected／disabled／blocked／loading不能只靠顏色；所有 control具 accessible name與可見 focus。
- normal state不得有常駐 helper、教學、推薦分數、重複 reason badge、成功宣告或無獨立邊界的框中框。
- `reason.label` 是保留的最小文字，因移除後使用者無法分辨「為何這筆在未搜尋時出現」；同一列不再疊加 reason icon、色塊與 badge。

## 14. Acceptance Criteria

1. BOM workbench Header與真正 empty state都能發現同一個 `建立 BOM`，並由 normal entry到達 `/bom/create`；不再開 Modal。
2. exact Part context導向同一路由並預選 exact Part ID；invalid／cross-company ID不會以料號或 root fallback。
3. 空白 query最多顯示5筆去重候選，優先序、tie-break與 reason符合§9；search／clear在同一清單切換。
4. current production revision＋formal exact relation＋active primary `.SLDASM`正向案例顯示 `controlled_assembly_file`；work file、superseded revision、removed file、deleted asset、non-primary、非 `.SLDASM`、filename-only與cross-company全部不產生該 reason。
5. 同一 `.SLDASM`透過正式關係對應多個 Parts時各自列出；同一 Part多來源只列一次且採最高優先 reason。
6. 「我近期建立」只由authenticated actor＋`created_by`推導；公司近期不跨公司，client不能偽造。
7. unclassified／single Part的 `.SLDASM`列只提供 `設定為組立件`，沒有 silent structure mutation；inactive／無恢復動作資料不占 default候選。
8. action、allowed purposes與 blocker全由 server決定；search指定 blocked Part時顯示最短原因，沒有假 `建立` CTA。
9. 一種 purpose時不顯示選擇器；兩種才顯示 `製造 BOM／非製造 BOM`，且「將建立」即時同步。
10. `sales_kit` 在所有 current UI surface只顯示 `非製造 BOM`；client／API／DB／snapshot／audit仍為 `sales_kit`，manufacturing readiness沒有放寬。
11. 建立只呼叫既有 applicability endpoint與 `POST /api/bom/drafts`；沒有新 writer／table／migration／recommendation persistence。
12. normal create原子產生唯一Definition／Draft並進既有 editor；replay不duplicate，race轉為 open existing，network unknown可readback恢復。
13. existing BOM與分類不足各自只有 `開啟既有 BOM`／`設定為組立件`一個主要動作，returnTo安全且上下文可恢復。
14. Released-only與cross-company actor沒有建立能力；direct API不能繞過 company、permission或 writer final recheck。
15. candidate、applicability與submit錯誤都保留 query／Parent／purpose／仍合法選取，且在受影響區域可重試。
16. 1440×900、1024×768與390×844實際 browser操作無 overflow、遮擋、focus loss、dead CTA、unexpected alert、HTTP 4xx／5xx、console error或錯誤全零資料。
17. 搜尋、選取、更換、用途、取消與建立可由鍵盤完成；focus、accessible name與live error符合§13。
18. `BomCreateFromPartDialog`與 Part create Modal只有在新頁 parity與 regression gate通過後才退役；caller=0，不保留 hidden fallback或 `/bom/new`。

## 15. QA／QC Minimum Contract

驗證層級分成四組，不能互相替代：

| Layer | Minimum coverage | Evidence |
|---|---|---|
| Contract／static | route、label mapping、no second writer、no schema、legacy caller retirement | source inventory、typed assertions、old-label current-surface scan |
| Repository／API | ranking、dedupe、exact file predicate、recent actor、search、permission、cursor、ETag、idempotency／race | task-owned SQLite與實際 PostgreSQL read projection／mutation evidence；primary schema／data before-after invariant |
| Browser | workbench Header、true empty、Part entry、suggested／search、select／change、single／dual purpose、open／classify、create／error recovery | normal entry URL sequence、request ledger、DOM／accessibility與 screenshots |
| Regression | DEV-096／099／104／106 affected current contracts，writer、editor、review／release與 manufacturing isolation | focused existing runners或等價新 aggregate；歷史 manifest不可改寫 |

Browser fixture至少包含：

- 可直接建立且具 current `.SLDASM`的 manufactured assembly。
- 具 `.SLDASM`但 unclassified 的 Part。
- 可建立 `sales_kit`但沒有 Drawing 的 Part。
- 目前使用者近期、他人公司近期、同一Part多來源去重。
- existing open Draft、Released-origin Definition、purpose conflict、permission denied。
- superseded／work-only／removed／deleted／cross-company／filename-only負向檔案資料。
- candidate API錯誤、search無結果、stale ETag、create race與 network unknown readback。

FMEA：

| 失效模式 | 使用者影響 | 偵測 | Priority | Gate |
|---|---|---|---:|---|
| 由檔名猜錯 Parent | 建錯正式 BOM | filename-only／同root多Part負向 fixture | P0 | exact relation assertion，任何誤列即停止 |
| recommendation變成 create authority | stale／錯用途 mutation | submit tamper＋writer reread | P0 | reason不得進 payload／persistence |
| query race覆蓋新結果 | 選錯料號 | 延遲 response交錯測試 | P1 | abort／request token，DOM與query一致 |
| 既有 Definition被重複建立 | duplicate Draft／Definition | two-session race／idempotency | P0 | unique winner＋open existing recovery |
| UI改名誤改 technical value | consumer／migration破壞 | API／DB／snapshot regression | P0 | persisted value仍為`sales_kit` |
| Modal與新頁雙軌 | 入口、焦點與維護分裂 | caller inventory＋normal entry browser | P1 | parity後 caller=0／Modal退役 |
| 窄版主要動作被遮擋 | 無法完成建立 | 390×844 keyboard／overflow sweep | P1 | actual browser screenshot＋measurement |
| 可見錯誤被 build／API pass掩蓋 | false pass | alert／network／console／data sanity sweep | P0 | 任一unexpected visible error即QC Fail |

QC只在 final frozen candidate執行完整 visual gate；中途缺陷先回 RD 修正。所有 temporary runtime必須記錄 project、purpose、port、PID tree、`PDM_DATA_DIR`、`PDM_REPOSITORY_DIR`、mutation scope、cleanup condition，結束後確認 task-owned port與temporary path已釋放；不得碰 primary database。

## 16. RD Slices 與 Handoff

| Slice | Purpose | Entry | Exit gate |
|---|---|---|---|
| `109-A Candidate contract` | 擴充 candidate DTO、actor-aware suggested／search／exact projection、三來源排序與exact `.SLDASM` predicate | 已完成；response／cursor與PostgreSQL cast修正已凍結 | `QA-109-001..029` PASS、company／permission、query budget、provider parity與no schema evidence可重現 |
| `109-B Canonical create page` | `/bom/create`、workbench／Part entry、selection／purpose／preview／create state | 已完成；109-A response frozen | normal create、open、classify、return、error recovery與keyboard在desktop通過 |
| `109-C Copy convergence and retirement` | current UI改為`非製造 BOM`，切換入口並退役兩個 create Modal | 已完成；109-B parity通過 | current-surface old-label=0、Modal caller=0、no hidden fallback、affected regressions通過 |
| `109-D Targeted functional QA/QC` | aggregate API／repository／real Chromium delivery path／regression與primary invariants | historical 48／48功能基線完成；不含visual parity | contract／DB／normal-entry／overflow／safe return與cleanup證據保留；不能作UI完成證據 |
| `109-E Visual foundation` | scoped CSS與canonical create page／footer骨架 | 已完成；scoped module與global collision修正已凍結 | PASS；legacy selector不再影響DEV-109，search／candidate／footer層級符合§28 |
| `109-F Candidate and summary` | create-row selection、purpose segment、structured summary與cancel／primary | 已完成；109-E frozen candidate | PASS；create／open／classify／none語意與v1＋delta視覺同時成立 |
| `109-G Visual QC` | 新增049..060與60案aggregate | 已完成；E／F frozen candidate | PASS；functional＋visual 60／60、Blocked／Not Run=0、三viewport與visual review PASS |

Historical A→D已完成並保持functional baseline；current execution sequence`109-E → 109-F → 109-G`已完成。既有A／C domain與retirement不重做；G只在E／F frozen candidate後執行一次final visual gate。

Historical A～D估工與證據保留。Current E～G remediation估工另為2.0～3.5 person-days；不含production deploy／release，不得藉視覺修正擴張推薦平台、CAD parser、schema或domain。

## 17. Stop Conditions

發生任一項停止該 slice，不暗中擴張：

1. 無法以 current production revision＋正式 relation可靠取得 `.SLDASM`，必須新建 file-to-Part authority或由檔名推定。
2. 候選效能必須新增 schema／index migration、cache、queue或 persistent recommendation record，且尚未補 provider contract。
3. 產品要求解析 Child、configuration、quantity或自動套用 Draft line。
4. 新頁需要第二套 BOM writer、Definition、lifecycle、permission或 purpose enum。
5. `非製造 BOM` 被要求涵蓋超出既有 `sales_kit` 的 service／reference／supplier kit語意。
6. released-only／新 Sales／Warehouse角色需要新的建立或審核權限。
7. 現有 dirty target file與他人修改無法以最小 patch安全整合。
8. primary SQLite／canonical identity／migration residue／foreign key invariant在任一 task-owned build或測試前後改變。

第1、3～6項需要產品／架構 re-entry；第2、7、8項由 RD／PM依證據修正文檔或隔離邊界後再繼續。

## 18. Future Phase Capsule

`.SLDASM` structure suggestion維持 DEV-096 Future Phase：目的為解析references、hierarchy、quantity與configuration，產生 proposal／human diff；parser不得直接寫 formal BOM。只有本期手動建立與候選入口穩定、有真實省時樣本，且使用者另行要求 Child suggestion時重新進入完整規劃。它不是 DEV-109驗收或估工的一部分。

## 19. Execution Boundary

- Current status：`RD Implemented Locally / Functional + Visual QA-QC Complete 60/60 / Functional Baseline 48/48 Retained / Production Release Gated`。
- 已完成且保留：109-A～D domain／API／DB／normal-entry functionality、task-owned SQLite／disposable PostgreSQL／Chromium delivery-path runner與isolated build；schema／migration／production data均未變更，primary invariant保持一致。
- 本輪已完成：§28的109-E～G、`QA-109-049..060`與60案completion aggregate。Current P0 product gaps=`0`、P1 implementation planning gaps=`0`、P1 implementation／visual evidence gaps=`0`。
- 本輪仍不可執行：production capability activation、正式資料／schema migration、stage、commit、merge、PR、deploy與release；這些動作仍由獨立 release gate 管理。
- 不建立新DEV或重做舊Modal；同一DEV-109只修正§28 presentation與visual gate。若需變更candidate語意、purpose、writer或`.SLDASM`解析，必須依stop condition重新開Spec Impact／ADR評估。
- Production migration、feature activation、deploy與release仍由既有 DEV-032／release gate管理；本文件不產生 release artifact。

## 20. Exact Repository／Module／File Plan

### 20.1 Add

| File | Responsibility | Must not contain |
|---|---|---|
| `src/app/bom/create/page.tsx` | Next.js Server Component；await `searchParams`、只取第一個 scalar、呼叫 allowlist navigation helper後把 initial exact ID／purpose／returnTo傳給 client | DB query、writer、client hooks、料號／root fallback |
| `src/components/bom-create-page.tsx` | 單一 interactive surface；suggested／search／exact、Parent selection、purpose、applicability、preview、create／open／classify、readback與focus recovery | role推定、eligibility重算、第二 writer、CAD parser |
| `src/lib/bom-create-navigation.ts` | pure `buildBomCreateHref`與`safeBomCreateReturnTo`；只接受 `/bom/workbench`、`/bom/workbench/<id>`、`/parts` same-origin relative path／query | `window`、DB、auth、任意 external redirect |
| `src/lib/bom-purpose-presentation.ts` | client／server共用 `manufacturing → 製造 BOM`、`sales_kit → 非製造 BOM`及建立動作標籤 | enum rename、permission或lifecycle logic |
| `scripts/qc-dev-109-contract.mjs` | `QA-109-001..010` static／contract evidence | runtime／primary write |
| `scripts/qc-dev-109-repository.mjs` | `QA-109-009..024` task-owned SQLite projection evidence | primary DB、production DSN |
| `scripts/qc-dev-109-postgres.mjs` | `QA-109-025..029` disposable localhost PostgreSQL parity | remote／shared PostgreSQL |
| `scripts/qc-dev-109-browser-real.mjs` | `QA-109-030..044`與`QA-109-049..060` task-owned real Chromium normal-entry／three viewport／visible-error／network evidence | primary DB／production write |
| `scripts/qc-dev-109-browser.mjs` | supplemental static UI contract scan for `QA-109-030..044`與`QA-109-049..060` | runtime／primary write；不取代 real Chromium owner evidence |
| `scripts/qc-dev-109-aggregate.mjs` | 固定60案分母、nested regression、build／cleanup／provenance manifest | 改寫歷史DEV-096／104／106 evidence |

### 20.2 Modify

| File | Exact responsibility |
|---|---|
| `src/app/api/bom/create-candidates/route.ts` | Released-only早期403；解析互斥 `query`／`partNumberId`／cursor；傳 authenticated actor；輸出 exact/suggested/search及stable errors；移除route-local舊cursor tuple |
| `src/lib/bom-create-context.ts` | 擴充 DTO／reason／mode；一次性readiness check；provider-neutral CTE內唯一action projection、DTO-only row projector、versioned bound cursor、open／Released destination與suggested filtering |
| `src/app/api/bom/applicability-candidates/route.ts` | 保留現行 ETag／writer前置契約，只收斂 current human label；不得改purpose或eligibility |
| `src/app/api/bom/drafts/route.ts` | work-list additive `capabilities.canCreate`；idempotency effect readback additive `workbenchUrl`；current human label收斂；POST fingerprint／transaction不變 |
| `src/app/api/bom/drafts/[draftId]/route.ts`、`src/lib/bom-shared-http.ts` | 只改 current human message；stable error code不變 |
| `src/components/bom-workbench-list-page.tsx` | Header／true-empty改為同一 `/bom/create` Link；response前 fail-closed隱藏CTA；filter／row顯示新label；filtered-empty不複製入口 |
| `src/components/part-bom-context.tsx` | create action改為 exact `/bom/create` navigation並保留當前Part URL；移除create Modal／applicability／POST state；existing open action與summary保留 |
| `src/components/part-structure-classification.tsx` | 增加 `#part-structure-classification` exact anchor及一次性focus／scroll，使 classify destination可發現；classification writer不變 |
| `src/components/bom-workbench-detail.tsx`、`src/components/bom-editor/bom-structured-editor.tsx`、`src/components/bom-editor/bom-node-inspector.tsx` | current visible `sales_kit`文案收斂；editor state、validation、mapping isolation不變 |
| `src/lib/repositories/approval-platform-async-repository.ts` | BOM review title／impact current human label收斂；snapshot technical value不變 |
| `src/app/globals.css`、`src/app/styles/responsive.css` | 新頁最小 list／selected／purpose／applicability／footer樣式；沿用canonical create shell；移除退役Modal專用selectors；三viewport無雙重捲動 |
| `package.json` | 新增 `qc:dev-109:{contract,repository,postgres,browser}`與唯一 aggregate `qc:dev-109`；不改依賴或build命令 |

### 20.3 Delete after parity

- `src/components/bom-create-from-part-dialog.tsx`：只在 `109-B` new-page create／open／classify parity通過、`rg` caller=0後由 `109-C` 刪除。
- 專屬 `.bom-create-picker*`、`.part-bom-dialog*`、`.part-bom-purpose-choice`、`.part-bom-candidate` CSS：確認無其他 caller後同 slice移除；不刪共用 `.canonical-modal*`。

### 20.4 Explicit no-touch

- `db/schema.sql`、`db/postgres/*`、`052_sales_kit_bom.sql`、所有migration／backfill：0變更。
- `BomPurpose` technical union、`bom_definitions.purpose`、Definition／Draft／review／release schema與Released snapshot：0變更。
- `createSharedBomDraftAsync`的transaction／locks／idempotency effect writer、DEV-104 editor reducer／history、DEV-096 parser Future Phase：不重構。
- `scripts/qc-dev-106-browser*.mjs`及既有 `output/qa/dev-106/**` 是DEV-106舊UI歷史基線，不改寫；DEV-109 aggregate只重用未被successor取代的domain contract，不把舊Modal evidence當current UI證據。
- production data、primary SQLite、remote PostgreSQL、feature activation、Git stage／commit、deploy與release：不在本DEV本地實作邊界。

## 21. Next.js 16.3.0 Implementation Contract

已依 repository 內 `node_modules/next/dist/docs/` 的 `page.js`、Route Handlers、Server／Client Components、Linking and Navigating與 `useSearchParams`規則盤點：

1. `src/app/bom/create/page.tsx` 是預設 Server Component；Next.js 16的 `searchParams` 為 Promise，必須 `await`。它只解析 request-time URL資料並把 serializable props傳給 client component。
2. 互動、debounce、AbortController、focus、crypto UUID與 `router.push／replace`只存在 `bom-create-page.tsx` Client Component。頁面不使用 `useSearchParams`，避免額外 Suspense／CSR bailout；URL初值由 Server Page props傳入。
3. 正常工作台入口使用 `<Link>`；create／open／classify結果需依 server回傳或 exact row動態導航時使用 `useRouter`。不得用 `<a>`造成不必要full reload，也不得 client拼接 writer destination。
4. Candidate GET Route Handler維持 request-time、private、no-store；Next 16 Route Handler預設不快取，但仍顯式送 `Cache-Control: private, no-store`作外部contract。`page.tsx`與`route.ts`位於不同segment，不發生route conflict。
5. `/bom/create`由client局部 loading／error狀態提供立即回饋，不新增整頁 `loading.tsx`；若後續Server Page加入遠端／DB讀取，才以新證據重新評估route-level streaming。

## 22. Source-level Candidate Query Plan

### 22.1 Projection boundary

`listBomCreateCandidatesAsync`仍留在 `src/lib/bom-create-context.ts`，接受：

~~~ts
type ListBomCreateCandidatesInput = {
  client?: AsyncDatabaseClient;
  companyId: string;
  actorId: string;
  canMutate: boolean;
  query?: string;
  exactPartNumberId?: string;
  purpose?: BomPurpose | "";
  cursor?: string | null;
  limit?: number;
};
~~~

route在進 projection 前完成 auth、company與 Released-only 403。projection內先一次取得purpose schema readiness，再一次檢查shared migration issues，最後執行一個candidate CTE；不重複呼叫 `assertSalesKitBomMigrationReadyAsync`與`assertSharedBomMigrationReadyAsync`。不含auth／company lookup時，正常 candidate read固定最多3個DB statements，row數增加不得增加statement數。

### 22.2 CTE 與 joins

同一 provider-neutral statement使用SQLite／PostgreSQL皆支援的 CTE、`ROW_NUMBER()`、`CASE`、`LOWER`、`COALESCE`與named parameters：

1. `controlled_file_hits`：`canonical_workbench_states state`限定same-company、drawing、`drawing_production`；join `drawings.formal_drawing_number_id`、`drawing_part_links` exact pair、`drawing_revision_files` exact `state.revision_id`與same-company、active `cad_3d` primary、`file_assets` non-deleted `LOWER(file_ext)='sldasm'`。以 Part partition，`file.updated_at DESC, file.sort_order ASC, file.id ASC`取一筆，輸出exact filename及evidence time。
2. `candidate_base`：從same-company `part_numbers`左接唯一Parent binding／Definition、最新open Draft、最新non-obsolete Released snapshot的 `bom_draft_id`、canonical `part_formal` row key、既有primary M relation及controlled hit。open destination優先於Released destination；binding存在但兩者皆無時標記invalid state。
3. `projected_candidates`：以route傳入的bound `canMutate`、assembly／sales-kit feature flags與requested purpose，在同一CTE使用同一組互斥 `CASE` expressions產生 `projected_action`、`blocker_code`、`allows_manufacturing`、`allows_sales_kit`與 `suggestion_eligible`。`suggestion_eligible`同時套用§9.3來源／action matrix；這是candidate read model的唯一action projection，writer仍在transaction內作final authority reread。
4. `ranked_candidates`：pure SQL只對已投影row產生 `search_rank`與reason priority／time，依mode過濾、排序及limit。pure TypeScript projector只把SQL columns映射為DTO、建立 `allowedPurposes` array與human label，並assert action／blocker組合合法；不得再次決定eligibility、action或執行DB query。

不得 join work file、preparing／review／correction revision；不得從display name/path suffix判斷extension；不得由Drawing number、root或filename stem推Parent。

### 22.3 Mode、filter與sort

| Mode | SQL filter | Order／limit | Result |
|---|---|---|---|
| `suggested` | active same-company且 `suggestion_eligible=1`；在limit前排除 `none`及不符合§9.3來源／action matrix的row | reason priority ASC、evidence time DESC、Part updated DESC、lower number ASC、ID ASC；投影後取5 | dedupe Part、即使排序前段有blocked row仍回完整前5筆eligible、`nextCursor=null` |
| `search` | same-company且number／name參數化contains；允許blocked row | exact number 0、prefix 1、number contains 2、name contains 3、lower number、ID；預設25＋1 | cursor只由最後已回傳row產生 |
| `exact` | `part.id=:exactPartNumberId AND company_id=:companyId` | 1 | 找不到即404；blocked row仍回；`nextCursor=null` |

同一 Part的reason固定取 `controlled_assembly_file > created_by_me_recently > company_recent`。Reason time依序為controlled file `updated_at`、Part `created_at`、Part `updated_at`。`created_by_me_recently`只能比較server傳入的authenticated `actorId`；request沒有actor欄位。

### 22.4 Cursor contract

~~~ts
type BomCreateSearchCursorV1 = {
  v: 1;
  mode: "search";
  companyId: string;
  query: string; // trimmed + lower-cased canonical form
  purpose: BomPurpose | "";
  searchRank: 0 | 1 | 2 | 3;
  partNumberKey: string;
  partNumberId: string;
};
~~~

cursor只以base64url傳輸且作opaque internal tuple，不加簽章或HMAC；decode後逐欄型別／值域驗證，再與current company／query／purpose／mode比對。格式、version、mode或context binding不一致回stable 422；cursor不能出現在suggested／exact或與 `partNumberId` 同時出現。格式合法但由client自行構造的same-context position最多改變同公司同query的遍歷起點，不能擴張company、filter、permission或mutation authority；因此不得把「所有tamper皆可偵測」列為驗收。這是pagination position，不是授權或snapshot，writer仍作final reread。

### 22.5 Query budget／migration decision

- SQLite 10,000 Parts＋1,000 Drawing Revision的task-owned fixture，candidate projection每request statements≤3，search 25筆與suggested 5筆各自 elapsed p95≤250ms；browser debounce 220ms。
- Disposable PostgreSQL使用同case shape的至少2,000 Parts／200 Drawing Revision smoke，statements≤3且單次candidate read≤500ms；保存 `EXPLAIN`摘要，不以正式環境數據作文件假設。
- 任一 provider超過budget先檢查query shape與既有index使用；若唯一合理修正需要新index／migration，命中§17 stop condition，DEV-109不得暗增DDL。效能budget是本期 gate，不是production SLA。

## 23. Client State、Mutation 與 Recovery Implementation

### 23.1 Request orchestration

- blank query以220ms debounce後讀suggested；非空query取消前一個request並讀search；exact initial ID立即讀exact。每個response以monotonic request token＋AbortController雙重防stale overwrite。
- selection保存完整server row、先前query／scroll／focus。`更換`恢復原list context；reload只靠URL exact ID恢復，不把reason或eligibility寫進URL／storage。
- purpose只有server allowed list為2時顯示radio；1時直接使用。每次Parent／purpose／applicable Parent set／ETag改變都產生新的intent fingerprint並重置idempotency key；同一attempt retry保持原key。
- manufacturing applicability的context Parent必選；sales kit payload只含exact Parent。CTA enabled條件為contract ready、ETag存在、required Parent合法且目前沒有submit。

### 23.2 Submit／unknown result

1. POST只送既有 `{ contextPartNumberId, bomPurpose, applicableParentPartNumberIds, bomRevision, source:'manual', baseReleaseSnapshotId }`，headers為同一attempt的`Idempotency-Key`與latest `If-Match`；reason／filename／label不得進payload。
2. 201／200只導航response的 `workbenchUrl`一次。
3. 409 `BOM_OPEN_REVISION_EXISTS`且details可讀時，exact reload candidate並轉 `open`；412／stale重新讀applicability，保留仍合法Parent交集並重置key。
4. network exception先用同一key呼叫effect readback；200使用server-derived `workbenchUrl`，404顯示可安全重試且沿用同一key，其他結果保留畫面並顯示correlation ID。
5. definitive 4xx修正輸入後才建立新key；未知結果、browser Back、double click與重複render不得產生第二個Draft。

### 23.3 Navigation／focus

- Normal entry的 `returnTo`由builder encode，Server Page再allowlist；取消只使用sanitized prop。
- Parent選取／purpose用replace更新current URL但不新增history；classify用push到exact canonical row＋`#part-structure-classification`，browser Back回exact create URL並重新讀server state。
- candidate error後focus回 `重試`／搜尋；更換後回原row或搜尋；create error回primary；成功不顯示中間success page。

## 24. Historical Functional Baseline Registry（48；current completion另見§28）

本節48案與既有manifest保持immutable，支持domain／API／DB／delivery-path功能基線，不再單獨支持DEV-109 completion。`QA-109-030..044`曾由task-owned real Chromium驗證normal-entry、互動、三viewport overflow、keyboard、visible-error與data-sanity；它沒有定義或判定visual parity。Current fixed completion denominator依§28擴為60。

### 24.1 Contract／static：`QA-109-001..008`

| ID | Frozen assertion |
|---|---|
| 001 | `/bom/create`存在，Server Page await Promise `searchParams`並只傳sanitized scalar props |
| 002 | workbench Header／true-empty與Part create都指向同一路由；response前無permission flash |
| 003 | DTO含suggested／search／exact、三reason、server action／purpose／destination；actor不來自request |
| 004 | 只存在既有applicability＋`POST /api/bom/drafts` writer；reason／file不進payload／persistence |
| 005 | current live presentation scan的`銷售組合包／組合包`為0；technical `sales_kit` union／schema／snapshot仍存在 |
| 006 | `BomCreateFromPartDialog` caller=0且檔案已刪；`/bom/new`、from-assembly、sales-kit writer皆不存在 |
| 007 | safe return allowlist拒絕scheme、`//`、backslash、control char與非BOM／Part path |
| 008 | historical package scripts、runner ID ranges與aggregate denominator恰為48，歷史manifest沒有被改寫；remediation aggregate另依§28擴為60 |

### 24.2 Task-owned SQLite repository：`QA-109-009..024`

| ID | Frozen assertion |
|---|---|
| 009 | suggested回傳最多5筆、`nextCursor=null`且readiness＋projection總statement數≤3 |
| 010 | current production＋formal exact relation＋active primary `.SLDASM`產生唯一受控檔案reason |
| 011 | `created_by_me_recently`只由server actor／created_by投影，不接受client偽造 |
| 012 | manufacturing缺M圖保留`BOM_ASSEMBLY_REQUIRES_M_DRAWING` blocker |
| 013 | exact missing／cross-company fail closed並回`BOM_RESOURCE_NOT_FOUND` |
| 014 | search cursor的query／company／purpose context binding與同context page continuity穩定 |
| 015 | 同Part多來源去重，suggested不重複料號 |
| 016 | search保留blocked row並投影最短 blocker；inactive不假裝可建立 |
| 017 | `purpose=sales_kit`可建立無M圖的`非製造 BOM` |
| 018 | existing Definition／destination狀態正確投影，無Definition時不偽造 draft |
| 019 | malformed cursor fail closed為`BOM_CREATE_CANDIDATE_CURSOR_INVALID` |
| 020 | one／dual purpose projection正確，manufacturing gate未放寬 |
| 021 | 只有filename或asset資訊不足時不產生`.SLDASM` reason |
| 022 | inactive Part排除於suggested |
| 023 | `company_recent + classify`不占default suggested前5筆 |
| 024 | candidate projection只讀，不寫reason／file到`bom_create_effects`或其他持久化推薦資料 |

### 24.3 Disposable PostgreSQL：`QA-109-025..029`

| ID | Frozen assertion |
|---|---|
| 025 | CTE／window query可編譯，suggested結果≤500ms且回傳正確筆數 |
| 026 | PostgreSQL search與exact mode結果對齊SQLite contract |
| 027 | PostgreSQL DTO shape與server actor reason對齊 |
| 028 | disposable PostgreSQL保存`EXPLAIN (FORMAT JSON)`證據 |
| 029 | PostgreSQL candidate read不產生mutation，`productionWrites=false` |

### 24.4 Real Chromium：`QA-109-030..044`

| ID | Normal delivery path／visible result |
|---|---|
| 030 | workbench Header的`建立 BOM`指向canonical `/bom/create` |
| 031 | true-empty state仍提供同一canonical entry與可見CTA |
| 032 | Part context使用exact `partNumberId`導向建立頁 |
| 033 | suggested／search共用同一candidate list與limit切換 |
| 034 | search具220ms debounce、AbortController與stale request token |
| 035 | select／更換Parent以URL replace並維持recoverable context |
| 036 | single／dual purpose依server `allowedPurposes`顯示，文案共用presentation helper |
| 037 | 「將建立」是唯讀摘要，不含第二套writer或client eligibility重算 |
| 038 | existing BOM以`開啟既有 BOM`導向既有workbench |
| 039 | classify action導向exact Part結構分類區，不在candidate page silent mutation |
| 040 | create使用idempotency key與既有writer |
| 041 | network unknown先做effect readback與同key安全重試 |
| 042 | applicability stale retry保留selected Parent／purpose |
| 043 | keyboard／live error具`role=alert`、`role=status`與button semantics |
| 044 | `returnTo`通過allowlist與scheme／hostile path拒絕 |

### 24.5 Aggregate gates：`QA-109-045..048`

| ID | Aggregate assertion |
|---|---|
| 045 | DEV-096／099／104 current contract regressions PASS |
| 046 | DEV-106未被successor取代的purpose／writer／graph／release isolation regressions PASS；舊Modal browser cases不冒充current evidence |
| 047 | `typecheck:app`、targeted ESLint、isolated build及primary schema／identity／residue／FK before-after invariants PASS |
| 048 | historical 48 unique IDs的contract／DB／real Chromium functional aggregate全PASS、Blocked／Not Run=0，PostgreSQL runtime與task temp cleanup完成；不宣稱visual parity |

## 25. Runner、Command 與 Evidence Contract

`package.json`完成後的唯一命令：

~~~text
npm run qc:dev-109:contract
npm run qc:dev-109:repository
npm run qc:dev-109:postgres
npm run qc:dev-109:browser-contract
npm run qc:dev-109:browser
npm run qc:dev-109
npm run typecheck:app
npx eslint <DEV-109 changed source and runner files>
npm run build:isolated
~~~

- `qc:dev-109`順序執行own contract→SQLite→disposable PostgreSQL→task-owned real Chromium→nested regressions，彙整 `output/qa/dev-109/<run-id>/aggregate-case-results.json`；`qc:dev-109:browser-contract`是可選的supplemental static scan；`typecheck:app`、targeted ESLint與`build:isolated`是同一交付的獨立 quality gates，結果回寫本DEV證據，不由aggregate偷偷重跑。
- 每個result使用 `{ runner, status, cases[], productionWrites:false }`；若runner有環境資料，另保存`runtimeDeclaration`與provider／fixture／cleanup detail。case含`id、label、pass、detail`。Historical aggregate只能判定48案functional baseline；remediation後只有包含§28新增12案、共60案的aggregate可判定completion。
- Browser evidence保存route timeline、request／response ledger、actor、fixture ledger、三viewport screenshots、DOM／accessibility assertions、alert／console／pageerror／failed-request inventory、port／PID tree與cleanup。
- Repository／PostgreSQL保存fixture before／after counts、query statement ledger、elapsed／EXPLAIN摘要、cross-company negative與DB delta。Build保存primary SQLite schema、canonical root／Part／Drawing identity、migration-residue及global FK before／after fingerprint。
- runtime啟動前必須輸出project、purpose、free port、owner PID tree、cleanup condition、task-owned `PDM_DATA_DIR`、`PDM_REPOSITORY_DIR`與mutation scope。資料只在OS temp的 `ai-pdm-dev109-*`；結束停止exact child、確認port released並刪task temp。無disposable PostgreSQL時 `QA-109-025..029=Blocked`且aggregate不得PASS。

## 26. Dirty Target SHA Ledger（readiness baseline）

2026-08-31 repository已有大量使用者／其他DEV變更。下列是本次盤點時「未實作DEV-109前」target bytes；RD開始每個slice前必須重新 `git hash-object`。hash不一致先讀diff並最小整合；不得reset、checkout、覆寫或把untracked檔視為可重建：

| Status | File | SHA-1 |
|---|---|---|
| M | `package.json` | `fa5426711a94585701607dd834b7d5210e656749` |
| ?? | `src/app/api/bom/create-candidates/route.ts` | `01123dff117f1828c5d66bd7f13670ddcad7bd83` |
| M | `src/lib/bom-create-context.ts` | `292eb9bc53774aff494f6d126fb94733ddfd3ec7` |
| M | `src/app/api/bom/applicability-candidates/route.ts` | `9be4b69ec42ef4223448887f6fdbf20fad24f381` |
| M | `src/app/api/bom/drafts/route.ts` | `6d822d9be4799dafc13c174b1047834a0905a1ef` |
| M | `src/app/api/bom/drafts/[draftId]/route.ts` | `d4f06cf497e9c033678378dccd2ebb2687de1cdc` |
| ?? | `src/components/bom-workbench-list-page.tsx` | `bb00b877cb061698aee0b37399d266f55e50e8c0` |
| M | `src/components/part-bom-context.tsx` | `2aaa9768a97c0a936f9375358ae427f015baa597` |
| ?? | `src/components/bom-create-from-part-dialog.tsx` | `0e4a0239710b702dca123f1224d2c160fc8dfdb3` |
| clean | `src/components/part-structure-classification.tsx` | `0cdb237bbb809c68bf3062f285331cde395d1a55` |
| ?? | `src/components/bom-workbench-detail.tsx` | `f77913c6514892ec5d294390828e109b0816b02a` |
| ?? | `src/components/bom-editor/bom-structured-editor.tsx` | `a9d7ec13cd11bf371ec0c20ab0e121ecdd8a22da` |
| M | `src/components/bom-editor/bom-node-inspector.tsx` | `ec9836223074d9236ab595f45821f90a377f2f98` |
| M | `src/lib/bom-shared-http.ts` | `ef79b4ca2c1d78a128da7977db5a6c4036436341` |
| M | `src/lib/repositories/approval-platform-async-repository.ts` | `74b3c7a0305ac7c609a4dc926d58a1db0e7f97ce` |
| M | `src/app/globals.css` | `e052530fc2b5ef39adb3a6d155549372a0643ac1` |
| M | `src/app/styles/responsive.css` | `e24bfc55d4209128460f874610c01dbd0486ce5d` |

Planned add files目前必須是absent；若RD開始時已存在，視為concurrent work並先合併責任。Slice完成保存 `beforeSha／afterSha／touched reason` ledger；未列入target的dirty檔一律不碰。

2026-08-31 RD技術主管複核時，`package.json`已由原ledger `94d6c35bf250c08da763c6fdbe189cf6c55228a4`漂移；檢視current diff後確認是其他既有DEV的contract／QC scripts，尚無 `qc:dev-109*`、依賴或build命令衝突，因此只刷新上表baseline為`fa5426711a94585701607dd834b7d5210e656749`。這不是可永久忽略的例外；109-A開始時仍須依本節重新hash並最小整合。

### 26.1 DEV-109 實作後 dirty boundary evidence（2026-08-31）

以下 hash 是本機實作與 QA/QC 完成後的 working-tree bytes；只用於交接與後續 diff 定位，不代表已 stage 或 commit。未列出的 dirty 檔案屬其他 DEV／使用者變更，未納入本 DEV：

| File | SHA-1／狀態 |
|---|---|
| `package.json` | `8ae992a2768e471192b9cd0ded0a7c722172a5bf` |
| `src/app/api/bom/create-candidates/route.ts` | `a5df0e19c8c1857eafc8da8421fd37f75bbc594e` |
| `src/lib/bom-create-context.ts` | `701a708d9a41722d396eb034ac95ea87d73d8f14` |
| `src/app/api/bom/applicability-candidates/route.ts` | `a5df1d18dc803098dc4ccaa798a4df72ca726f58` |
| `src/app/api/bom/drafts/route.ts` | `d3c4515fe2edce2670eca3ca3c8a32abd1f49668` |
| `src/app/api/bom/drafts/[draftId]/route.ts` | `6a9b692027b136b3869c13d50e25dfa2078a0552` |
| `src/components/bom-workbench-list-page.tsx` | `ffcf820a1482440cdb47bdc05536cf658a971c36` |
| `src/components/part-bom-context.tsx` | `3b6a826f61ec84643c02b58af48613a8222a7de2` |
| `src/components/bom-create-page.tsx` | `7291301899cd95a8f7c8f1cee4ad52d52755e431` |
| `src/app/bom/create/page.tsx` | `2d5b17941ea5c72cb03a3a02ef5cd0ff46c186c6` |
| `src/lib/bom-create-navigation.ts` | `687e87d289ebc19fdcd662ec07f68515c485c7f8` |
| `src/lib/bom-purpose-presentation.ts` | `b0dda555d58c16b4fc8ea7102e66d516f6a8f6cf` |
| `src/components/bom-editor/bom-node-inspector.tsx` | `ba963c7fb63fcb06df3c84909693339dcae0802c` |
| `src/lib/bom-shared-http.ts` | `59e7c0fc118a2ac4d04b99e7e96c93e9f9c40d5a` |
| `src/lib/repositories/approval-platform-async-repository.ts` | `6b032d41e51c90b26852e2be1a669f95c16545b5` |
| `src/app/globals.css` | `8729af925fb5e374619abbaecd0797c321cd6a1a` |
| `src/app/styles/responsive.css` | `af4f85d18ec98436d14a7d3cd28c64c7a5555349` |
| `scripts/qc-dev-109-contract.mjs` | `d03ca93eded62cb21214ca42424fd0e914f89022` |
| `scripts/qc-dev-109-repository.mjs` | `ce5c5d2950601673ba96f7030369e1b8747af807` |
| `scripts/qc-dev-109-postgres.mjs` | `44bdd2163856d752761939f3bde164b6b8929ab5` |
| `scripts/qc-dev-109-browser.mjs` | `6a9ccfc9851ed8b6398f6a9298e20aa3f63d25a2` |
| `scripts/qc-dev-109-aggregate.mjs` | `8267e79be3f9403340490f73491118bf4e9f4295` |
| `scripts/qc-dev-109-browser-real.mjs` | `89328ad66f0a9473c71f52d4d53ce2bd245ef0d5` |
| `src/components/bom-create-from-part-dialog.tsx` | `deleted after B/C parity; caller=0` |

## 27. Historical Functional Closure（2026-08-31；已由 §28 視覺重開取代）

- P0 domain／data／permission gaps：0；既有 functional implementation gaps：0。Action projection source-of-truth、cursor語意、migration stop wording與dirty SHA drift均已封口。後續實際畫面證明「三 viewport 可開啟、無 overflow」不足以支持視覺完成，故 P1 visual implementation gap 與 verification evidence gap 重新開啟。
- Schema／migration／backfill：`none / not required / not authorized`。Transaction與duplicate authority完整沿用既有writer；read projection不持久化。
- Failure recovery、permission、provider parity、UI entry、normal delivery path、fixture、viewport、evidence layer與stop conditions已可執行。
- ADR：仍為 `No new ADR required`。只有命中§17第1～6項或要新增persistent authority／writer／purpose semantics時重開ADR判斷。
- High-impact deferred scope只有§18 `.SLDASM` Child suggestion capsule，re-entry trigger已固定且不阻塞目前phase。
- Spec convergence：本文件仍是DEV-109 target authority；DEV-106 domain與歷史evidence保留，current runtime仍為`/bom/create`。§28只重開presentation、visual acceptance與completion gate，不恢復舊Modal，也不改domain／writer／permission。
- Historical receipt：`npm run qc:dev-109`曾為`48/48 PASS`（contract／SQLite／disposable PostgreSQL／real Chromium／regression），evidence=`output/qa/dev-109/2026-08-31T08-22-15-784Z/aggregate-case-results.json`。這份receipt保持immutable，仍支持功能基線、provider parity、安全返回與cleanup；因browser case只驗presence／flow／overflow／safe return，沒有逐項比對視覺目標，不能支持「UI Visual Parity PASS」或DEV整體完成。

## 28. UI Visual Remediation Reopen（2026-08-31）

### 28.1 不符合事實與影響

使用者提供的實際畫面是本次QC reopen的一級證據。已確認：

1. `/bom/workbench`是入口清單，不應與建立頁設計稿直接做畫面等價；真正需修正的是點擊後的`/bom/create`。
2. `/bom/create`搜尋標籤與輸入框被排成左右兩欄，與核准方向的全寬搜尋列不符。直接機制是legacy `.bom-create-search { grid-template-columns: 1fr auto; }`仍在global cascade，而DEV-109後加同名selector沒有unset該property。
3. 實作另建一套global `bom-create-*` presentation，沒有忠實採用`/numbering/create`的canonical page／form／footer骨架；整頁只剩單一外框surface，缺少清楚的候選選取、平面用途區、結構化「將建立」與底部取消／主要動作空間節奏。
4. 設計稿中的所有row radio不是current domain truth。`action=create`才是可選Parent；`open／classify／none`必須保留server-derived action／blocker，不能為視覺還原而偽裝成可建立。
5. Historical `QA-109-044`雖保存三viewport screenshot，實際assertion只檢查horizontal overflow與safe return；沒有檢查設計層級、full-width search、selected row、purpose control、summary或footer，因此既有48／48不能反證本次可見失敗。

影響分類：`完成率失真 + UI implementation drift + visual verification control failure`。Domain、API、DB、permission、idempotency、provider parity與production isolation沒有因本次畫面證據失效。

### 28.2 根因與 CAPA

| 層次 | 根因／控制失效 | 已知證據 | 矯正措施 CA | 預防措施 PA |
|---|---|---|---|---|
| 產品／基準 | 已交付設計稿後，文件把它降為「只作版面參考」，沒有保存authoritative delta register | `dev_task.md`舊紀錄與現場畫面 | 將`output/design/bom-create-candidate-ui-v1.png`升為structural baseline，並以§28.3列出唯一核准差異 | 後續視覺稿若不是authority，DEV不得宣稱design parity；若是authority，必須有delta register |
| 實作／CSS | 新舊頁共用global `.bom-create-*` selector，cascade允許legacy layout滲入；另造presentation而非共用canonical create shell | `globals.css`兩組同名selector及current render | DEV-109 presentation改用CSS Module並採canonical create primitives；刪除DEV-109追加global selectors，不碰DEV-060 legacy規則 | UI新增或重構優先scoped styles；共名global selector需由contract／lint assertion阻擋 |
| QA／QC | screenshot只被保存，沒有依視覺目標判讀；overflow PASS被誤升格為visual PASS | `qc-dev-109-browser-real.mjs` historical QA-109-044 | 新增`QA-109-049..060`，同時驗DOM量測、互動後畫面與人工／AI visual review | Aggregate分開呈現functional baseline與visual remediation；visual Not Run／Fail時completion必須Fail |
| PM／完成狀態 | 48案不同evidence layer被彙整成單一完成宣告，沒有列出「不證明什麼」 | historical completion receipt | 保留48／48為immutable functional baseline，撤回整體完成；本DEV改為可執行 | 每個completion receipt需標示acceptance layer與明確non-claim |

反事實檢查：若設計基準與delta是authority、CSS selector被scoped、且aggregate必須通過新增visual cases，則相同功能測試即使全綠也無法把目前畫面誤判為完成；這些控制點可直接降低同類問題再發與漏檢。

### 28.3 Authoritative Visual Target：v1 baseline＋核准差異

`output/design/bom-create-candidate-ui-v1.png`現在是DEV-109建立頁的structural baseline，不再只是靈感圖。RD必須保留其主層級：`頁首 → 全寬Parent搜尋 → 單一候選清單 → 選定後用途 → 結構化將建立摘要 → 底部取消／唯一主要動作`。

唯一核准差異：

- Global shell以current AI PDM icon rail、字體、token與page chrome為authority；不得為還原概念稿重建展開式sidebar。
- `銷售組合包`一律改為`非製造 BOM`；technical `sales_kit`不變。
- 不自動選第一筆候選。使用者必須點選`action=create` row；選定後row具radio／selected visual state並漸進顯示後續區塊。
- `action=open`顯示`開啟既有 BOM`；`action=classify`顯示`設定為組立件`；`action=none`只顯示blocker。這三類row不可顯示成可建立radio。
- 只有兩個purpose都合法時才顯示segment-style radio；單一purpose直接使用。Manufacturing可在summary後顯示既有compact applicability checklist。
- 正常初始狀態只顯示取消；可建立Parent與合法purpose ready後才顯示唯一primary。不得用假的disabled CTA或常駐教學補足空間。

不可接受差異：搜尋label／input左右分欄、候選與搜尋寬度失衡、框中框surface、create row只能靠右側次要按鈕選取、沒有selected state、缺少結構化summary、缺少cancel／bottom action region、桌機過度留白、手機水平overflow／重疊／截斷。

### 28.4 RD Implementation Contract

風險：`Medium`。只修改presentation與visual QC，不改route、API、DTO、query、permission、writer、schema、migration、資料、lifecycle或production capability。

Exact file plan：

| Action | File | Responsibility |
|---|---|---|
| Add | `src/components/bom-create-page.module.css` | DEV-109 scoped layout、candidate selected state、purpose segment、summary、footer與RWD；不得定義domain state |
| Modify | `src/components/bom-create-page.tsx` | 改用CSS Module與canonical create page／form／footer primitives；create row整列可選，open／classify／none維持action contract；加入取消與structured summary |
| Modify | `src/app/globals.css` | 只移除§26.1所列DEV-109追加global block；保留DEV-060 legacy與其他DEV styles |
| Modify | `src/app/styles/responsive.css` | 只移除DEV-109 global responsive selectors；RWD移入module |
| Modify | `scripts/qc-dev-109-contract.mjs` | 驗證CSS scoped、legacy selector不再影響DEV-109、no domain/API drift |
| Modify | `scripts/qc-dev-109-browser-real.mjs` | 新增049..060 normal-entry、state-specific、measurement與visual evidence；既有030..044保持historical semantics |
| Modify | `scripts/qc-dev-109-aggregate.mjs` | 固定分母由48升為60，分開輸出`functionalBaseline`與`visualRemediation` |
| Modify | `package.json` | 只有runner命令或display name確實需要時修改；不增dependency |

No-touch：`src/app/api/bom/**`、`src/lib/bom-create-context.ts`、`src/lib/bom-create-navigation.ts`、`src/lib/bom-purpose-presentation.ts`、repository／DB／migration／permission／writer／editor。若視覺修正需要修改上述任一檔，立即停止並回PM判斷scope drift。

Slice：

1. `109-E Visual foundation`：freeze current hashes；建立module、清除DEV-109 global collision、接回canonical create page／footer骨架。
2. `109-F Candidate and summary`：create row selection、selected state、purpose segment、structured summary、cancel／primary；保留open／classify／none與progressive disclosure。
3. `109-G Visual QC`：新增12案、三viewport、互動後screenshots、DOM量測、visible-error／console／network／cleanup，重跑functional regression與isolated build。

估工：`2.0–3.5 person-days`；不含production release。不得順帶重構candidate API、推薦排序、Part classification或BOM editor。

### 28.5 Fixed Visual Remediation Registry（新增12案）

| ID | Normal path／fixture | PASS criteria |
|---|---|---|
| `QA-109-049` | `/bom/workbench` Header與empty入口 | 入口仍到同一`/bom/create`；workbench本身不套建立頁視覺baseline |
| `QA-109-050` | 空白query／desktop | 搜尋label在input上方；input、candidate list與content column同寬，無legacy two-column computed style |
| `QA-109-051` | suggested fixture含create／classify／open／none | create row整列可選且有radio語意；其餘三種只有正確action／blocker，不得偽裝可建立 |
| `QA-109-052` | 從normal create row點選 | selected visual明確、URL帶exact ID、候選收斂／後續區塊出現；不自動選第一筆 |
| `QA-109-053` | dual-purpose Parent | `製造 BOM／非製造 BOM`同層segment radio，選取狀態、keyboard與summary同步 |
| `QA-109-054` | single-purpose Parent | 不顯示purpose selector，直接顯示合法purpose與summary，不留空容器 |
| `QA-109-055` | selected controlled-file Parent | 「將建立」以key/value結構顯示Parent、用途、BOM Rev與exact `.SLDASM` evidence；不是一行壓縮文字 |
| `QA-109-056` | selected non-file sales-kit Parent | 不偽造組合檔列；summary與`非製造 BOM` copy正確 |
| `QA-109-057` | ready／not-ready／submitting | bottom action region位置穩定；取消可safe return；ready只有一個primary；初始沒有fake disabled CTA |
| `QA-109-058` | 1440×900 | 依v1＋delta逐項visual review PASS；無框中框、過度留白、重疊、截斷、水平overflow；保存before／after screenshot |
| `QA-109-059` | 1024×768 | 同一資訊骨架與順序；candidate action不擠壓copy，footer可達且無雙重scroll |
| `QA-109-060` | 390×844＋keyboard | 單欄、按鈕不被擠壓、無horizontal overflow；focus order為search→candidate→purpose→cancel／primary，visible error就地可恢復 |

Current status：historical `QA-109-001..048=PASS`保留作functional baseline；本輪`QA-109-049..060=PASS`，新aggregate固定60案且已完成。後續若任一visual case變為Not Run／Blocked／Fail，DEV-109必須撤回完成狀態。

### 28.6 Visual Evidence Gate 與 completion rule

- Evidence必須從`/bom/workbench`正常入口進入，使用task-owned實際Chromium，在1440×900、1024×768、390×844操作至少一個create、classify、open與blocked row。
- Screenshot不是只保存檔案；manifest必須逐項記錄v1 baseline／delta checklist的`PASS／FAIL`、DOM measurement與觀察理由。AI／QC需實際檢視最終frozen candidate screenshot。
- Field-visible failure優先於historical automation PASS；新失敗訊號出現時只重開受影響layer，但completion一定撤回。
- Completion需要：60 unique cases PASS、Blocked／Not Run=0、console／page error=0、unexpected failed request=0、visible alert=0、task-owned port／process／fixture／dist cleanup=true、typecheck、affected lint、isolated build及functional baseline regression PASS。
- 完成聲明必須寫成`Functional + Visual QA-QC Complete 60/60`，並附一句non-claim：不代表production deploy／release。不得再用「real Chromium已截圖」替代visual parity結論。

### 28.7 Reopen Dirty Boundary

以下是重開文件時的current working-tree bytes，只作RD合併保護，不代表commit：

| File | SHA-1／state |
|---|---|
| `src/components/bom-create-page.tsx` | `7291301899cd95a8f7c8f1cee4ad52d52755e431` |
| `src/components/bom-create-page.module.css` | `ABSENT；planned add` |
| `src/app/globals.css` | `5db3ae2fb66187272ccffaa7a9fe5c346670af56` |
| `src/app/styles/responsive.css` | `af4f85d18ec98436d14a7d3cd28c64c7a5555349` |
| `scripts/qc-dev-109-browser-real.mjs` | `89328ad66f0a9473c71f52d4d53ce2bd245ef0d5` |
| `scripts/qc-dev-109-browser.mjs` | `6a9ccfc9851ed8b6398f6a9298e20aa3f63d25a2` |
| `scripts/qc-dev-109-aggregate.mjs` | `8267e79be3f9403340490f73491118bf4e9f4295` |
| `package.json` | `8ae992a2768e471192b9cd0ded0a7c722172a5bf` |
| `output/design/bom-create-candidate-ui-v1.png` | `e7b479781402f4bcfe6f4d7b6ea57095ecc870fa` |

RD開始109-E前必須重算hash並讀取任何漂移；不得reset／checkout／覆寫使用者或其他DEV變更。Current P0 product gaps=0、P1 implementation planning gaps=0；可直接交RD本機修改。ADR仍`not required`，因本次只矯正已確認UI／verification drift，不改domain authority。

### 28.8 RD Implementation and QA-QC Receipt（2026-08-31）

本輪已依109-E→109-F→109-G完成本機presentation remediation與visual gate，DEV-109狀態恢復為：
`RD Implemented Locally / Functional + Visual QA-QC Complete 60/60 / Functional Baseline 48/48 Retained / Production Release Gated`。

- `npm.cmd run qc:dev-109` aggregate固定分母為60，contract／SQLite repository／disposable PostgreSQL／real Chromium與regression均exit 0；`QA-109-001..060` unique且全部`PASS`，`productionWrites=false`。
- 新增`QA-109-049..060`已由實際Chromium完成入口、全寬搜尋、create／open／classify／none action、明確選取、purpose segment、structured summary、非製造 BOM、footer、1440／1024／390 viewport、keyboard focus與overflow驗證；browser evidence=`output/qa/dev-109/2026-08-31T10-48-40-956Z/browser-real/browser-real.json`。
- 工程 gates：`npm.cmd run typecheck:app`、受影響檔案 ESLint（`src/components/bom-create-page.tsx`）與`npm.cmd run build:isolated`均PASS；隔離建置確認primary SQLite schema、canonical root／Part／Drawing identity、migration residue與`PRAGMA foreign_key_check`前後一致，artifact存在且cleanup完成。
- 本輪實作後target SHA-1（working tree，未stage／commit）：

| File | SHA-1 |
|---|---|
| `src/components/bom-create-page.tsx` | `175de5ee45c36b35239d4b2e820a3984bc84fafc` |
| `src/components/bom-create-page.module.css` | `534d68242413506926e9573e075101e83bdfff90` |
| `src/app/globals.css` | `00098746ead7101ca28ffc1d174265b2b12b991d` |
| `src/app/styles/responsive.css` | `75189d30be26f0aaa30953ec009b86177dba0cf6` |
| `scripts/qc-dev-109-contract.mjs` | `980218a07ab32d686248fb8d1efeb4d3bbac8a59` |
| `scripts/qc-dev-109-browser.mjs` | `559be691263560df258a26e06a7ff8d2555bfcae` |
| `scripts/qc-dev-109-browser-real.mjs` | `34b262740f98b73ad9a1b911f0777cbc3e4bd7a7` |
| `scripts/qc-dev-109-aggregate.mjs` | `44a9490e7cf272c6526955253ac7e0a75df37e5a` |
| `package.json` | `30b9971bceca7a79ebfef551706f1afef4abb6cd` |
| `output/design/bom-create-candidate-ui-v1.png` | `a77ea69472dd1a6b4dda49566cc23534a2d925f3` |

- `src/app/api/bom/**`、`src/lib/bom-create-context.ts`、navigation／purpose／repository／DB／migration／permission／writer／editor等no-touch邊界未因本輪視覺修正而改變；task-owned port／process／fixture／dist均已清理。
- 本receipt只代表本機RD與QA-QC完成，不代表production capability activation、migration、deploy或release；正式環境仍須另走既有release gate。

## 29. Unified BOM Domain Redesign Brief（2026-08-31 Human Confirmed）

### 29.1 問題與決策來源

現行 `manufacturing | sales_kit` 是建立在「沒有 M 圖的組件不能是製造 BOM」的假設上。實際業務已證明該假設不成立：新組件料號 B 可能由具 `.SLDPRT` 的零件 A 與沒有圖檔的潤滑油組成，B 仍需要受控 BOM，且不一定有 `.SLDASM`。

2026-08-31 引導模式人類決策：`1A / 2A / 3A`。

1. BOM 不再區分「製造 BOM」與「非製造 BOM」；PDM 的 BOM authority 只回答 Parent 由哪些 Child、數量與版本組成。
2. PDM 不在 BOM 建立時收集或推論製造／銷售履行方式。工單、庫存、揀貨與訂單如需 `produce_and_stock` 或 `explode_at_fulfillment` 等執行策略，屬實際 ERP／庫存整合邊界，不是 BOM type。
3. `.SLDASM` 是組合檔的充分證據；當 active primary 檔案成功上傳且可透過正式 `primary_manufacturing` 關係唯一解析 exact Part 時，系統自動將該 Part 晉級為 `assembly`。這個動作不建立、不預填 BOM。
4. `.SLDPRT` 只表示 CAD 檔案是單零件模型，不足以證明關聯料號沒有下階結構；上傳不寫入 `structure_type`。人工分類 UI 可將「單件」作為初始預選，但不得因此覆蓋已有組合件。
5. Child Part 無須圖檔。只要 exact Parent 的 `structure_type=assembly`、Part 狀態及權限合法，即可建立或開啟單一 BOM；`item_kind`、M 圖與 CAD 類型不再是 BOM 建立資格。
6. 子料號持有基本單位，例如 `EA` 、`L`、`mL`、`kg`、`g`；BOM 明細允許正小數數量，並將當時單位鎖定在 BOM 版本明細，例如 `0.015 L`。

使用思考習慣：#批判、#效用理論

### 29.2 Domain 與 authority 邊界

| Concern | Current target authority |
|---|---|
| 料號 identity | canonical exact Part Number |
| 有無下階結構 | `part_numbers.structure_type` |
| BOM identity | exact owner Parent＋stable Definition＋Revision |
| BOM 內容 | Parent／Child／quantity／locked UOM／revision snapshot |
| CAD 檔案類型 | Drawing Revision active primary file |
| `.SLDASM` 自動晉級 | file upload command 內的 exact formal-relation side effect；不是 BOM writer |
| `.SLDPRT` | 只寫檔案類型；不寫 Part 結構分類 |
| BOM Draft／review／release | 現有單一 BOM writer 與 lifecycle |
| 履行／工單／庫存策略 | PDM BOM out of scope；實際串接需求成立後另設 integration contract |

`assembly` 表示料號具有或預期具有下階結構，不表示一定有 `.SLDASM`、M 圖或已建 BOM。BOM 存在與 CAD 存在不得互相反向推論。移除或替換 `.SLDASM` 也不得自動降級料號，因為「缺少當前證據」不等於「證明為單件」。

### 29.3 主要流程

1. 圖號工作台上傳 active primary `.SLDASM`。Server 完成檔案保存後，在同一可審計 command 內重新讀取正式 exact relation；只對唯一 `primary_manufacturing` Part 執行 idempotent `assembly` 晉級。無關係、多重主關係、cross-company、stale 或權限不足時 fail closed，檔案成功與分類失敗的 atomicity／recovery 由 RD Contract 封口。
2. `.SLDPRT` 上傳只更新檔案資訊，不觸發 Part 分類 command。
3. 使用者從 BOM 工作台或 exact Part context 進入 `/bom/create`，搜尋或選擇 Parent。
4. 已是 `assembly` 且沒有 Definition：直接顯示「建立 BOM」；已有 Definition：顯示「開啟既有 BOM」；`single_part／unclassified`：導向 exact Part 的人工結構設定，不在建立頁 silent mutate。
5. 建立頁不再顯示 purpose selector，「將建立」只顯示 Parent、BOM Rev 與可解釋的候選來源。
6. 進入既有 editor 後建立 Child lines；數量必須為正數，單位由 Child 基本單位帶入並鎖定於該 BOM Revision。

### 29.4 Current Phase Scope

In Scope：

- 單一 BOM domain，建立頁、工作台、filter、DTO、writer、review／release snapshot、export 與 consumer 不再以 `manufacturing | sales_kit` 分支用戶行為。
- 任一合法 `assembly` Part 可擁有單一 current BOM Definition；exact Parent 為建立預設，現有 explicit additional Parent applicability 能力保留但不再與 purpose 綁定。
- `.SLDASM` 上傳後的 exact Part 自動晉級、`.SLDPRT` 零分類 side effect、不自動降級。
- Part 基本單位、BOM line 正小數數量與 revision-locked UOM。
- 舊 `manufacturing／sales_kit` Definition、snapshot、audit、feature flag、migration 052 與 30／60 案證據的相容／退役計畫。歷史 evidence 不改寫。

Out of Scope：

- 工單、採購、庫存扣帳、揀貨、訂單 explode、售價、稅務或 ERP transaction。
- 任意單位換算、密度換算、複合單位或使用者在每條 BOM line 任意改單位。
- 解析 `.SLDASM` Child／configuration／quantity，或自動建立／預填 BOM。
- 因 `.SLDPRT`、移除 `.SLDASM`、檔名、root 或 AI 推論而自動將 Part 降級為 `single_part`。

### 29.5 Acceptance Direction

1. `/bom/create` 沒有製造／非製造用途選擇，workbench 也沒有 purpose filter；同一 exact Parent 不因用途產生第二個 Definition。
2. 沒有 Drawing 或 M 圖、`item_kind=purchased` 的 assembly Part 也可建立 BOM；Child 沒有圖檔不阻擋 save／submit／release。
3. active primary `.SLDASM` 且唯一 exact formal primary relation 成立時，Part 在上傳完成後可讀回 `assembly`；retry 不產生重複 audit，也不建 BOM。
4. `.SLDPRT` 上傳對 `unclassified／single_part／assembly` 三種 Part 都不修改分類；manual classification UI 可預選 single，但須由使用者明確送出。
5. 移除／替換 `.SLDASM` 不自動降級 assembly；ambiguous／stale／cross-company 關係不能誤更新其他 Part。
6. Child 數量接受合法正小數；例如潤滑油料號的基本單位為 `L` 時，BOM Revision 明細可保存並重讀 `0.015 L`。
7. Child 基本單位後續變更不得改寫已發行 Revision 的 locked UOM；未分類單位的舊資料不得靜默假設為 `EA`。
8. DEV-106 30／30 與 DEV-109 60／60 只作歷史回歸基線；新設計必須建立新的 contract／provider／browser／data invariant evidence，不得繼承 PASS 結論。

### 29.6 Compatibility, Deferred Scope and Next Gate

Spec Impact：`Intentional replacement`。本節取代本文件中所有 purpose selector／allowed purposes／purpose-specific eligibility／`sales_kit` label／integer-only quantity／`.SLDASM` read-only-only 及「製造 BOM 必須 primary M」的當前產品主張。單一 route、exact Part identity、candidate list、safe return、idempotent writer、Draft／review／release lifecycle、Outliner editor、permission 與 audit 原則保留。

本節在2026-08-31建立時為`Brief Ready`；下列工程輸入現已由§30封口並升級為`RD Contract Ready`：

- `bom_definitions.purpose`、052 migration、feature flag、API／DTO、snapshot／audit／export 的退役與相容策略；immutable historical snapshot 不得改寫。
- Part 基本單位與 BOM line locked UOM 的 provider-aware schema、舊資料盤點、fail-closed backfill 與 release gate。
- `.SLDASM` upload／relation／classification 的 transaction、permission、idempotency、audit、partial failure recovery 與上傳可用性取捨。
- 全部受影響 test registry、legacy case disposition、SQLite／PostgreSQL parity、normal-entry Chromium 與 primary-data invariants。

Future Phase Capsule：只有真實 ERP／庫存 consumer 開始依賴 PDM 來決定工單、備貨或接單拆料時，才重新設計獨立 execution policy。該 policy 不得回填成 BOM type，也不得從 CAD 類型推論。

Historical boundary：本節原建立時，§29只保存Human-confirmed產品決策，當時可執行邊界只到§30。Current已由§31取代此「不可開始實作」限制；歷史PASS仍不可用來宣告新domain完成。

## 30. Unified BOM Current Phase RD Contract（2026-09-01）

### 30.1 成熟度、目的與架構影響

成熟度：RD Contract Ready。Human product blockers=0，RD可依本節評估、拆分與估工；本節尚未列出exact repository file plan、migration SQL、runner registry或release操作，因此不得標為RD Implementation Ready，也不授權修改程式、schema、資料或runtime。

Current Architecture Impact為High：

- Domain：Definition不再持有會改變行為的manufacturing／sales-kit type；existing shared Definition、Parent binding、Draft、review與release lifecycle仍是唯一authority。
- Data：退役purpose runtime欄位、加入Part基本單位與Draft／Released line locked UOM，並以review／release snapshot schema v3承接新契約。
- Cross-module：Drawing Revision work上傳與formal relation writer都必須共用同一個SLDASM evidence reconciliation primitive。
- API／UI：建立、候選、applicability、workbench、editor、review、export與where-used移除purpose分支；Part工作區新增基本單位維護。
- Compatibility：歷史v1／v2 snapshot與DEV-106／109 evidence保持immutable；新runtime不得借用歷史PASS。

初估：20～30 person-days，包含雙provider migration rehearsal、purpose retirement、snapshot v3、Part UOM、editor UOM、SLDASM transaction side effect、targeted regression與real Chromium gate。此估算供排程，不是實作承諾；若RD發現需要第二writer、任意單位換算、background event platform或重寫immutable snapshot，必須停止並重開contract。

### 30.2 Current Phase Domain Invariants

| ID | Invariant |
|---|---|
| UBOM-01 | PDM只有一種BOM；composition、revision、review與release是BOM authority，fulfillment／ERP policy不是。 |
| UBOM-02 | 同一exact Parent同一時間只能由一個current Definition承接；purpose不得形成第二個Definition。 |
| UBOM-03 | Existing explicit additional Parent applicability與shared logical line能力保留；purpose不得限制Parent count、fixed／by-parent mapping或Outliner能力。 |
| UBOM-04 | 建立資格只取決於same-company exact Parent、structure_type=assembly、合法record status、permission與是否已有Definition／open Draft。item_kind、M圖、CAD與Child Drawing均非gate。 |
| UBOM-05 | SLDASM是升級為assembly的充分證據，但不是BOM內容；不解析Child、不預填quantity、不建立Draft。 |
| UBOM-06 | SLDPRT永遠沒有Part分類side effect；移除或替換SLDASM永遠不自動降級。 |
| UBOM-07 | 每個Child Part持有base UOM；BOM item line持有正數quantity與revision-locked UOM。line不得自行選另一單位。 |
| UBOM-08 | Released evidence只可用其原schema decoder讀取；任何migration、export或新validator不得改寫v1／v2 bytes、hash或derived immutable rows。 |
| UBOM-09 | 所有create／open／next-revision／submit／approve仍走existing canonical BOM writer與lifecycle；不得建立purpose retirement專用writer。 |
| UBOM-10 | Tenant、exact Part ID、formal relation、file asset與snapshot identity全部由server重新解析；不得以root、料號字串、檔名或client flag猜測。 |

Definition identity維持stable Definition＋exact Parent bindings。bom_definitions.part_root_id繼續提供shared-root structural scope；bom_definition_parent_bindings繼續決定exact applicable Parents。Migration不得因兩個legacy Definitions具有相同root就自動合併；只有同一exact Parent同時落入多個current Definition才是blocking anomaly。

### 30.3 Purpose Retirement and Historical Compatibility Contract

#### Target state

1. bom_definitions不再有behavior-bearing purpose。Provider target schema保留nullable legacy_purpose，只保存既有Definition在cutover前的manufacturing／sales_kit值；new Definition寫NULL。
2. legacy_purpose不得出現在create eligibility、candidate rank、writer fingerprint、validation、workbench filter、review v3、release v3、where-used或current export decision。只可在historical detail／diagnostic中以「歷史用途」唯讀呈現。
3. 舊purpose check、immutable trigger與company-purpose index退役；existing Definition row_version、binding、revision lineage與ID不改。
4. sales-kit feature flag與purpose presentation helper在target runtime退役。不得以「UI隱藏、backend仍預設manufacturing」作為相容方案。

#### Provider convergence

新的forward-only provider migration必須讓下列兩種來源狀態收斂到同一target：

- S0：未套用PostgreSQL 052，bom_definitions沒有purpose。
- S1：已套用052或SQLite canonical schema已含purpose。

遷移流程結果必須符合：

1. 先盤點Definition／binding／open Draft／PendingReview／snapshot schema／migration residue與global FK。
2. S1把purpose原值複製到legacy_purpose；S0既有Definition以legacy manufacturing lineage記錄，不能把它當new NULL Definition。
3. 移除behavior-bearing purpose；不刪除或改寫052 migration檔與既有migration history。
4. Draft／Rejected／Archived可保留並改走unified validator；其item line在UOM補齊前不得submit。
5. PendingReview的v1／v2 review不能轉譯或原地升版。Cutover前必須為0；否則migration stop。
6. Released／Obsolete v1／v2 snapshot、resolved rows、hash、audit與export decoder保持原樣。
7. Migration rerun必須idempotent；SQLite rebuild與PostgreSQL ALTER完成後schema、row count、Definition／binding identity與foreign-key invariants一致。

既有bom_shared_structure_migration_issues應沿用並以聯集擴充issue codes，不新增平行migration issue authority或覆蓋舊code。至少能記錄legacy_purpose_invalid、duplicate_current_parent_definition、pending_legacy_review、part_base_uom_missing、draft_line_uom_unresolved、draft_quantity_exactness_unresolved、sldasm_target_missing與sldasm_target_ambiguous。detail需能追溯Definition／Draft／Part／Drawing evidence ID，不放敏感檔案內容。

#### Snapshot and export compatibility

- review／release schema v1與v2：維持既有decoder、hash material與immutable guards；legacy sales-kit仍依舊schema驗證bomPurpose／fulfillmentPolicy。
- 新submit與release：一律產生schemaVersion=3；hash material不含bomPurpose／fulfillmentPolicy，包含每個item line的quantityUomCode。
- schema v3 review／release header、line snapshot與resolved rows都必須受immutable guard保護，且guard納入quantityUomCode；不得放寬既有v1／v2 guard。
- v3 export：欄位聚焦Parent、Child、BOM Revision、quantity與uom_code，不輸出履行策略。
- v1／v2 export：維持既有legacy欄位與語意，不轉成v3後再輸出。Consumer必須依snapshot schema version選decoder。
- next revision由legacy release建立時，base snapshot仍保持immutable；新Draft建立後必須完成UOM reconciliation，下一次submit才產生v3。

### 30.4 Part Base UOM and BOM Locked UOM Contract

#### Controlled values

Current Phase canonical codes固定為EA、SET、M、MM、L、ML、KG、G；UI label分別為個、組、公尺、毫米、公升、毫升、公斤、公克。Code大小寫由server正規化成uppercase。Current Phase不建unit master table、不做單位／密度換算，也不允許自由文字。

#### Data ownership

| Object | Field contract | Mutation rule |
|---|---|---|
| Part Number | nullable base_uom_code | legacy／剛建立identity可為NULL；Part正式工作區可設定或改成controlled code；一旦設定不可清空。 |
| Draft tree／floating item node | quantity_uom_code | 選入第一個Child時複製其base UOM；之後為line-locked，quantity編輯不改unit。group永遠NULL。 |
| Component candidates | 共用logical line的unit contract | 同一logical line全部候選Child的base UOM必須等於locked UOM；不符時拒絕加入或mapping。 |
| Review／release v3 | quantityUomCode | item必填、group不得有；納入canonical hash。 |
| Released resolved line | quantity_uom_code | item必填且immutable；v1／v2 legacy row可維持unknown，不回填。 |

Quantity contract為finite positive decimal，最多6位小數；server拒絕0、負數、NaN、Infinity與超過6位小數，不靜默四捨五入。現有duplicate sibling merge只有在Child identity、revision與locked UOM相同時才可合併。

#### Legacy and drift behavior

1. 不把legacy Part或line默認為EA。
2. base_uom_code=NULL的Part可以被搜尋與查看，但不能新增為Child；picker在原列顯示「先設定基本單位」與exact Part recovery entry。
3. Parent自身沒有base UOM不阻擋建立BOM；只有它作為其他BOM的Child時才需要。
4. Part base UOM改變不改寫任何existing Draft／Released line。Draft與next-revision clone顯示UOM drift並在submit前阻擋；使用者必須重新選定Child並重新確認quantity，系統不自動換算或沿用數字。
5. Released v1／v2畫面與export顯示「單位未記錄」或空值，不推論EA；這不是資料錯誤，也不觸發歷史backfill。
6. Part base UOM變更沿用existing Part work／numbering.workspace.update permission、stale protection與audit；不新增角色或BOM專用Part writer。

### 30.5 SLDASM Automatic Assembly Promotion Contract

#### Evidence predicate

只有同時成立才進行promotion：

1. canonical Drawing Revision work的file upload已通過size、hash、storage與work ownership驗證。
2. active work binding指向removed_at=NULL、is_primary=1、role=cad_3d的file；file_assets.file_ext正規化後精確為sldasm。
3. work.drawing_id可解析到same-company formal Drawing Number。
4. formal drawing_part_links中剛好一筆same-company、current、link_type=primary_manufacturing的exact Part。

SLDPRT、display name包含SLDASM、secondary／removed file、reference relation、root-only relation、cross-company或client提供Part ID一律不成立。

#### Transaction and recovery

1. Promotion必須是drawing.file.upload既有idempotent transaction內的reusable transactional primitive，不得在server內自呼Part HTTP API，也不得開nested transaction或第二command receipt。
2. 全域鎖序固定為same-company `part_roots`／formal relation scope → Drawing work／revision file → exact Part。Upload依`drawings.part_root_id`先取root scope lock再讀locked work；relation writer已是root-first，必須保留相同鎖序。不得在upload路徑先鎖work再反向等root，也不得在共用primitive內重取transaction。
3. exact target存在時，file binding、replacement tombstone、Part single_part／unclassified→assembly、audit與work row_version同commit。任一DB／classification／audit fault均rollback；新storage object由existing compensation刪除。不得回「上傳成功」但Part仍未同步。
4. target已是assembly時是idempotent no-op；upload或exact-file reuse仍成功，不新增重複classification audit。
5. zero target不阻擋合法檔案上傳。Response回傳classificationOutcome=no_target，畫面只在file區顯示可恢復提示「尚未找到主要關聯料號」；不得猜Part。
6. multiple／cross-company／stale target不更新任何Part，Response回classificationOutcome=blocked_relation並顯示修正關聯入口；這裡的fail closed是zero wrong-Part write，不是丟棄已驗證檔案。
7. formal relation之後由matrix建立／修正時，same transaction呼叫同一primitive重新檢查current active primary SLDASM；exact target成立即promotion。Current Phase不新增queue、cron或eventual-consistency worker。
8. retry key由logical file upload command＋work＋content hash承接；audit只在實際structure_type變更時寫一筆，reason code固定sldasm_primary_evidence，包含drawingId、revisionId、fileAssetId、formalDrawingNumberId、partNumberId與initiating actor。
9. 自動promotion是file／relation invariant side effect；成功執行upload或formal relation mutation的既有權限即足夠，不再要求使用者同時擁有manual Part classification permission。Audit actor仍是initiating user，authority標示system invariant。
10. 刪除／替換SLDASM、改成SLDPRT或移除relation都不降級Part。人工降級仍走existing classification contract，且有BOM時繼續fail closed。

#### Existing data reconciliation

Activation前必須在task-owned copy執行dry-run：掃描current active primary SLDASM＋formal primary relation，輸出exact promotions、already-assembly、no-target、ambiguous與cross-company counts。Production apply只能對exact current target做單向assembly promotion；system audit reason為sldasm_existing_evidence_reconcile。no-target／ambiguous不猜測、不自動建BOM，寫入existing migration issue authority。此primary-data mutation屬release gate，不由本文件執行。

### 30.6 API, DTO and State Contract

| Surface | Unified target |
|---|---|
| GET /api/bom/create-candidates | 移除purpose query、allowedPurposes與definitionPurpose；action只為create／open／classify／none，reason可含assembly_file、created_by_me、company_recent。 |
| GET /api/bom/applicability-candidates | 移除purpose；server依existing Definition與shared applicability回selection ETag。 |
| POST /api/bom/drafts | request移除bomPurpose，idempotency fingerprint也不含purpose；writer重驗exact Parent assembly、status、permission、selection ETag與existing Definition。 |
| GET /api/bom/drafts?surface=work_list | 移除purpose filter與current purpose projection；`/api/bom/workbench`draft detail不新增purpose filter。Legacy snapshot detail可回nullable legacyPurpose供歷史追溯。 |
| Draft save／submit | item line傳quantity與quantityUomCode；server以Child base UOM、locked line、candidate set與stale state重驗。 |
| Review／release／export | 新資料只產v3；歷史v1／v2走原decoder。 |
| Part read／work | 增加nullable baseUomCode；mutation沿用existing exact Part work與permission。 |
| Drawing file upload | response增加classificationOutcome=promoted／already_assembly／no_target／blocked_relation；不把client Part ID當輸入。 |

Target runtime對legacy purpose輸入不忽略：query含purpose或create body含bomPurpose時回400 BOM_PURPOSE_RETIRED且zero write，避免舊client在不可見預設下繼續產生資料。Read-only historical response的legacyPurpose不得被送回writer。

State transitions：

- Part structure：unclassified→assembly、single_part→assembly可由SLDASM invariant觸發；assembly→assembly為no-op；任何→single_part都不自動發生。
- Part UOM：NULL→controlled code、code A→code B須explicit user mutation與audit；code→NULL不允許。
- BOM lifecycle：Draft／Rejected→PendingReview→Released／Rejected沿用既有狀態機；target不新增purpose state。
- Snapshot：legacy v1／v2只讀；所有新review／release為v3，不能在同一review chain混用。

### 30.7 UI Entry Contract and UX Intent

Target actor為具有existing BOM create／edit權限的Engineer、R&D Manager或Admin。正常起點是BOM工作台Header或empty state的唯一「建立BOM」，以及exact Part context的同一路由入口；destination固定/bom/create，再進existing /bom/workbench/{draftId} editor。

正常delivery path：

1. 從/bom/workbench點建立BOM。
2. 由default candidates或搜尋選exact assembly Parent；existing Definition顯示開啟，single_part／unclassified顯示前往exact Part分類。
3. 不顯示用途選擇。摘要只保留Parent、BOM Rev與必要來源；底部只有取消與一個建立／開啟主要動作。
4. 進editor後選Child；有base UOM才可加入，quantity旁顯示唯讀locked unit。
5. 儲存、submit、approve後由v3 snapshot與export讀回相同quantity＋UOM。

Drawing path：

1. 從Drawing work正常file區上傳SLDASM，不增加「是否為組合件」checkbox。
2. exact target成立時，upload完成後Part structure可讀回assembly；already assembly不重複提示。
3. no target／blocked relation時，提示貼近file row並只給一個「設定關聯」recovery；修正formal relation後自動reconcile。

Part UOM path：base UOM控制放在existing exact Part工作區／矩陣的正式屬性區，不放在BOM create page做silent mutation。BOM child picker只顯示blocker與返回該Part的recovery link；回到BOM後保留Draft與選取上下文。

UX Intent：

- 主物件／主焦點：create page為exact Parent；editor為BOM structure；Drawing file區為上傳檔案。
- 預設刪除：purpose selector／filter／chip、purpose說明、第二建立入口、SLDASM分類checkbox、推薦分數、UOM自由下拉、常駐成功panel與框中框。
- 保留舉證：candidate reason用於理解為何出現；locked UOM避免quantity誤讀；relation／UOM blocker提供可恢復路徑；其他helper無可觀察失效即刪除。
- 非語言修復：先以順序、selected state、row-local status與單一主要動作表達，不以長說明補強。
- Accessibility／viewport：主要流程可鍵盤完成；dynamic result與row error有programmatic status；1440×900、1024×768、390×844沒有水平／雙重捲動、footer遮擋或focus loss。

### 30.8 Permission, Error and Observability Contract

- BOM read／create／edit／submit／approve沿用現有permission checks；不新增unified BOM role。
- Candidate與exact read必須actor／company scoped；create與open action由同一server projection決定，不由DTO projector重新計算。
- Part base UOM沿用numbering.workspace.update與existing Part work concurrency／audit。
- SLDASM auto-promotion只由verified upload／formal relation command觸發；manual classification API與permission不放寬。
- Error至少包含stable code、最短可見訊息、correlation ID與zero-sensitive-data log。Expected codes：BOM_PURPOSE_RETIRED、BOM_PARENT_NOT_ASSEMBLY、PART_BASE_UOM_REQUIRED、BOM_COMPONENT_UOM_MISMATCH、BOM_LINE_UOM_STALE、BOM_QUANTITY_PRECISION_INVALID。
- classificationOutcome=no_target／blocked_relation是成功upload的bounded outcome，不是全域toast；promotion DB fault則整個upload失敗並回existing recoverable upload error。
- Audit必須能由Draft／Review／Release、Part UOM mutation及SLDASM evidence mutation追到actor、company、exact entity與before／after；不得記錄file bytes或credential。

### 30.9 Final Acceptance and Verification Gate

Risk lane：High。理由是同時改變schema、immutable snapshot版本、雙provider migration、Drawing upload transaction、Part master與主要UI delivery path。

#### Product acceptance

1. 所有normal UI與current API都沒有manufacturing／非製造purpose決策；legacy purpose request明確被拒絕且zero write。
2. purchased或manufactured assembly、無M圖／無CAD的Parent都能建立；Child無Drawing不阻擋，缺base UOM才阻擋。
3. 同一exact Parent不因legacy purpose產生duplicate Definition；existing shared applicability仍可編輯、review與release。
4. SLDASM exact upload能在同一commit晉級single_part／unclassified Part；retry、same-content reuse與already assembly不重複audit或建立BOM。
5. SLDPRT、secondary file、reference relation、remove／replace行為都不修改structure_type。
6. no-target SLDASM上傳保留檔案且zero Part write；formal relation修正後promotion完成。ambiguous／cross-company永不誤改Part。
7. quantity 0.015＋UOM L可save、reload、submit、approve、export；v3 hash與resolved row一致。
8. alternate Child UOM不同、legacy NULL UOM、base UOM drift與超過6位小數都fail closed，且原輸入／Draft可恢復。
9. 改Part base UOM不改寫Released v1／v2／v3；legacy released unit保持unknown，不顯示假EA。
10. v1／v2 historical review、release、export與hash regression通過；new review／release只產v3。

#### QA fail-seeking minimum

- Migration：S0、S1、rerun、pending legacy review、invalid purpose、duplicate Parent authority、SQLite rebuild fault與PostgreSQL transaction fault。
- Upload：storage hash fault、binding insert fault、Part update fault、audit fault、same-content retry、relation concurrently changed、missing／multiple／cross-company target與compensation delete failure。
- UOM：NULL child、candidate mismatch、drift after Draft save、legacy base release clone、duplicate line merge with different UOM、precision boundary。
- API／security：legacy purpose injection、cross-company Part／Drawing ID、stale ETag、unauthorized UOM edit、client-forged classification target。
- UI：normal entry discoverability、loading／empty／error／selected／recovery、keyboard／screen reader、desktop／tablet／mobile，及workbench purpose control absence。

#### Evidence required

- Contract／unit evidence：domain validators、schema v3 canonical hash、legacy decoder與error mapping。
- Provider evidence：task-owned SQLite copy與disposable PostgreSQL實際migration＋mutation；S0／S1 before-after schema、row counts、Definition／binding IDs、snapshot hashes、global FK與migration residue。
- Transaction evidence：本機只以共用 primitive 的 source-contract assertions 核對 lock／stage／rollback／compensation 邊界；真正外部 storage fault injection、upload rollback 與 compensation inventory 必須在 deployment/release gate 執行，不得以 source PASS 宣稱 runtime 已證實。
- Browser evidence：由normal entry操作，不以direct URL或seed完成結果代替；記錄source revision／dirty boundary、actor、route、fixture、viewport、console、screenshots與cleanup。
- Primary invariants：任何build／test前後證明primary SQLite schema、canonical root／Part／Drawing identities、snapshot hashes、migration residue與PRAGMA foreign_key_check不變。
- Historical DEV-106 30／30與DEV-109 48／48、60／60只作regression case來源；新aggregate必須使用新case IDs與新source evidence。

Stop conditions：

1. 任一方案需要改寫v1／v2 snapshot、hash、audit或historical evidence。
2. purpose仍在current writer、eligibility、validation、filter、snapshot或export中影響行為。
3. exact SLDASM target成立時無法保證DB atomicity與storage compensation，或需以client／檔名猜Part。
4. base UOM需要silent EA backfill、line任意改unit或未確認的conversion engine。
5. migration preflight存在PendingReview、duplicate Parent authority、unknown purpose、FK／residue異常而仍嘗試apply。
6. RD需要new role、second BOM writer、background event infrastructure或ERP transaction semantics。

### 30.10 Delivery Slices, Dependencies and Execution Boundary

| Slice | Execution boundary | Document status | Output | Entry／exit gate |
|---|---|---|---|---|
| 109-U0 | Current Phase；尚未授權執行 | RD Contract Ready | Source inventory、legacy data dry-run、new ADR與migration state model | S0／S1、open review、purpose／UOM／SLDASM issue counts可重現；未寫primary data。 |
| 109-U1 | U0後；尚未授權執行 | RD Contract Ready | Unified purpose retirement＋API／DTO／UI removal | current path無purpose；legacy v1／v2 read regression通過。 |
| 109-U2 | U1後；尚未授權執行 | RD Contract Ready | Part base UOM＋Draft／resolved line locked UOM＋snapshot v3 | provider parity、drift／legacy fail-closed與v3 hash通過。 |
| 109-U3 | U1後，可與U2由Implementation plan決定安全順序；尚未授權執行 | RD Contract Ready | SLDASM upload／relation reconciliation primitive | fault-injection證明atomicity、idempotency、no wrong-Part write與no downgrade。 |
| 109-U4 | U2＋U3後；尚未授權執行 | RD Contract Ready | End-to-end create／editor／review／release／export與real Chromium | 新fixed denominator全部PASS、primary invariants與task-owned cleanup通過。 |

Dependencies：existing DEV-087 Drawing work transaction／storage compensation、DEV-090 formal relation authority、DEV-099 exact Part classification、DEV-096 shared BOM／schema-v2 evidence、DEV-104 Outliner editor、DEV-108 Part work authority。這些是reused boundaries，不代表可借用其完成證據。

Current Phase Deferred Scope Audit：

- Future Phase Capsule（Future Phase Captured / Not Requested）：真實ERP／庫存consumer出現時，另設execution policy contract，定義owner、effective time、order／inventory semantics、audit與fallback。Dependency是具名consumer與transaction owner；驗收方向是相同Released composition可被policy消費且不改BOM identity／snapshot。不得把legacy purpose復活成BOM type。Re-entry trigger是具名consumer與可驗收transaction需求。
- Future Phase Capsule（Future Phase Captured / Not Requested）：若業務需要UOM conversion、密度、包裝換算或supplier unit，另設unit service／master-data contract。Dependency是controlled unit／conversion master owner；驗收方向是conversion可追溯、rounding明確且不改寫Released locked UOM。Re-entry trigger是至少一個不能以Part base UOM直接表示的已確認案例。
- Out of Scope：SLDASM Child parser、自動BOM、AI推薦、price／cost、procurement、inventory與order explosion。

Historical boundary：本節當時只達RD Contract Ready。使用者已於2026-09-01明確要求升級到RD可實作；後續exact repository／migration／I/O／fault／case／command／dirty boundary以§31為Current authority。Production migration、primary-data reconciliation、activation、deploy與release仍受release gate控制。

## 31. Unified BOM RD Implementation Contract（2026-09-01）

### 31.1 Readiness verdict and execution boundary

成熟度：`RD Implementation Ready / Human Confirmed / RD Not Started / High Risk / Production Release Gated`。§29～§30的產品與domain決策不變；本節將它收斂為repository-level可實作契約。Human decision blocker=0，P0 implementation-contract gap=0，P1 implementation-contract gap=0。

RD可依109-U0→U4在本機task-owned範圍開始實作，但每個slice開始前必須重算§31.10 dirty ledger並先讀當前diff；若任一target bytes已變，只能最小整合，不得reset、checkout、覆寫或將untracked檔當成可重建。本readiness不代表任一程式已改、migration已apply、QA已PASS、主要資料可修復、可deploy或可release。

Repository fact correction：current purpose work-list filter在`GET /api/bom/drafts?surface=work_list`，不在`GET /api/bom/workbench`；current Child validator仍要求manufactured Child具primary M圖，target必須明確移除這個gate。不得只改文案或將purpose隱藏。

### 31.2 Exact repository change inventory

#### Add

| Path | Single responsibility |
|---|---|
| `db/postgres/054_unified_bom_domain_and_uom.sql` | PostgreSQL S0／S1→target forward migration；transactional DDL、advisory lock、preflight blocker與v3 guard。 |
| `src/lib/bom-unit-of-measure.ts` | UOM code registry、label、normalization、positive decimal max-6 parser、scale-6 integer codec與stable errors的唯一domain helper。 |
| `src/lib/sldasm-assembly-evidence.ts` | 在caller transaction與既有writer lock下執行exact SLDASM evidence reconciliation；提供async provider client與SQLite sync transaction adapter，共用同一eligibility／outcome規則，不開transaction、不呼HTTP、不寫BOM。 |
| `scripts/migrate-dev-109-unified-bom.mjs` | SQLite task-owned copy的S0／S1 dry-run／apply／schema identity／rollback runner。 |
| `scripts/reconcile-dev-109-sldasm-assembly.mjs` | Existing SLDASM evidence dry-run／explicit apply；default dry-run，primary apply受release gate。 |
| `scripts/qc-dev-109-unified-contract.mjs` | C01～C08。 |
| `scripts/qc-dev-109-unified-migration.mjs` | M01～M08。 |
| `scripts/qc-dev-109-unified-provider.mjs` | P01～P06。 |
| `scripts/qc-dev-109-unified-repository.mjs` | R01～R14。 |
| `scripts/qc-dev-109-unified-transaction.mjs` | T01～T08。 |
| `scripts/qc-dev-109-unified-browser.mjs` | B01～B10，task-owned real Chromium。 |
| `scripts/qc-dev-109-unified-aggregate.mjs` | 只聚合新C／M／P／R／T／B manifest，固定54案；不把歷史runner計入PASS。 |
| `.ai-doc/qa/qa-dev-109-unified-bom-domain-validation-plan-2026-09-01.md` | Current 54-case QA authority、evidence schema、runtime lifecycle與fail-closed gate。 |

#### Modify

- Configuration／schema：`.env.example`、`package.json`、`db/schema.sql`、`db/postgres/README.md`、`src/lib/db.ts`。移除sales-kit current flag與dev pre-schema的purpose auto-add，加入target commands／UOM／v3／provider readiness。
- BOM domain／projection：`src/lib/types.ts`、`src/lib/bom-create-context.ts`、`src/lib/bom-create-navigation.ts`、`src/lib/bom-release-export.ts`、`src/lib/bom-release-integrity.ts`、`src/lib/bom-shared-structure.ts`、`src/lib/bom-workbench-async.ts`、`src/lib/bom-workbench-diff.ts`、`src/lib/bom-submission-diff.ts`、`src/lib/pdm-canonical-workbench-contract.ts`、`src/lib/repositories/bom-workbench-async-repository.ts`、`src/lib/repositories/approval-platform-async-repository.ts`、`src/lib/repositories/item-insight-async-repository.ts`。移除current purpose branch，加入locked UOM、UOM diff／v3與legacy decoder dispatch。
- BOM HTTP：`src/app/api/bom/create-candidates/route.ts`、`src/app/api/bom/applicability-candidates/route.ts`、`src/app/api/bom/drafts/route.ts`、`src/app/api/bom/drafts/[draftId]/route.ts`、`src/app/api/bom/drafts/[draftId]/delete/route.ts`、`src/app/api/bom/drafts/[draftId]/obsolete-request/route.ts`、`src/app/api/bom/drafts/[draftId]/reconfirm-replacements/route.ts`、`src/app/api/bom/drafts/[draftId]/restore/route.ts`、`src/app/api/bom/drafts/[draftId]/submit-review/route.ts`、`src/app/api/bom/reviews/[reviewId]/approve/route.ts`、`src/app/api/bom/reviews/[reviewId]/reject/route.ts`、`src/app/api/bom/releases/[releaseId]/export/route.ts`。所有legacy purpose input統一400，current writer只接受unified DTO。
- BOM UI：`src/components/bom-create-page.tsx`、`src/components/bom-workbench-detail.tsx`、`src/components/bom-workbench-list-page.tsx`、`src/components/part-bom-context.tsx`、`src/components/bom-editor/bom-editor-types.ts`、`src/components/bom-editor/bom-structured-editor.tsx`、`src/components/bom-editor/bom-node-inspector.tsx`、`src/components/bom-editor/bom-inline-picker.tsx`、`src/components/bom-editor/bom-editor-reducer.ts`、`src/components/bom-editor/bom-map-view.tsx`、`src/components/bom-editor/bom-outliner.tsx`。移除purpose selector／filter／chip，增加UOM blocker／locked display／drift recovery，不新增框中框。
- Part base UOM：`src/lib/repositories/part-change-work-async-repository.ts`、`src/lib/part-number-matrix-contract.ts`、`src/lib/repositories/part-number-matrix-async-repository.ts`、`src/components/canonical-change-workspace.tsx`、`src/components/part-number-matrix-workspace.tsx`、`src/app/api/search/route.ts`。沿用existing Part work／review／formalization／ETag／audit，search回傳base UOM與exact recovery href。
- SLDASM：`src/lib/drawing-revision-work-file.ts`、`src/lib/repositories/relation-formal-authority-async-repository.ts`、`src/lib/repositories/relation-formal-authority-sync-repository.ts`、`src/lib/repositories/numbering-repository.ts`、`src/components/canonical-drawing-change-workspace.tsx`。Upload same-content reuse與new binding、async `upsertPair`／`replaceRootLinks`／`applyMatrix`及SQLite sync numbering link／main-drawing restore都必須在各自既有transaction的final relation state只呼一次共用規則；UI只在file row顯示bounded recovery。

#### Delete after all imports are zero

- `src/lib/bom-purpose-presentation.ts`：current purpose label helper退役。
- `src/lib/sales-kit-bom-feature.ts`：current purpose capability flag退役。

#### No-touch historical boundary

- 不刪、不重寫`db/postgres/052_add_bom_purpose.sql`與已套用migration history；054是唯一forward correction。
- 不改寫`output/qa/dev-106/**`、`output/qa/dev-109/**`、歷史QA／QC receipts或`QA-109-001..060`結果。
- 不把現有`scripts/qc-dev-106-*`、`scripts/qc-dev-109-contract.mjs`、`scripts/qc-dev-109-repository.mjs`、`scripts/qc-dev-109-browser-real.mjs`等歷史runner改名或重用；new runner使用`unified`namespace。
- v1／v2 snapshot bytes、hash material、released resolved rows、audit rows與legacy export semantics保持immutable。可在同檔案加schema dispatcher，但不可用v3 normalizer重寫legacy evidence。

### 31.3 Target schema and provider migration state machine

#### Target DDL

| Object | Target |
|---|---|
| `bom_definitions` | 刪除behavior-bearing `purpose`；增加`legacy_purpose TEXT NULL CHECK (legacy_purpose IS NULL OR legacy_purpose IN ('manufacturing','sales_kit'))`。New row必須NULL。 |
| `part_numbers` | 增加`base_uom_code TEXT NULL`，controlled check限`EA,SET,M,MM,L,ML,KG,G`。Application禁止non-NULL→NULL並受Part work audit。 |
| `bom_lines_tree` | 增加`quantity_uom_code TEXT NULL`與`quantity_scaled_6 INTEGER/BIGINT NULL`；legacy允許NULL，new item兩者必填，group兩者必須NULL。既有`quantity REAL/DOUBLE PRECISION`只作legacy display／相容投影，不是v3 authority。 |
| `bom_draft_floating_topics` | 同tree line；move／promote／restore不得丟locked UOM或`quantity_scaled_6`。 |
| `bom_release_resolved_lines` | 增加`quantity_uom_code TEXT NULL`與`quantity_scaled_6 INTEGER/BIGINT NULL`；v3 item兩者必填且immutable，v1／v2保留NULL。 |
| `bom_review_requests`／`bom_release_snapshots` | 保留v1／v2 guard；允許且保護schema v3 canonical JSON／hash，v3不含purpose並含`quantityUomCode`。 |
| `bom_shared_structure_migration_issues` | 既有10個code完整保留，再以聯集增加`legacy_purpose_invalid`、`duplicate_current_parent_definition`、`pending_legacy_review`、`part_base_uom_missing`、`draft_line_uom_unresolved`、`draft_quantity_exactness_unresolved`、`sldasm_target_missing`、`sldasm_target_ambiguous`；不得以新清單覆蓋舊CHECK或建立第二issue table。 |

Tree／floating的physical CHECK只能限制`quantity_scaled_6 IS NULL OR BETWEEN 1 AND 999999999999999`及group不得有scaled／UOM；不得用全表`item => NOT NULL`破壞legacy rows。New writer與v3 submit guard負責item non-NULL；release resolved insert／immutability guard則依linked snapshot `schema_version=3`要求scaled＋UOM，v1／v2維持NULL合法。

#### Source-state transitions

| State | Detection | Apply result |
|---|---|---|
| S0 pre-052 | `bom_definitions.purpose`不存在 | 新增`legacy_purpose`；cutover前existing Definition記錄`manufacturing`；new row target預設NULL。 |
| S1 post-052 | `purpose`存在且值合法 | copy exact value→`legacy_purpose`，再移除trigger／function／index／constraint／column。 |
| S2 target | 只有`legacy_purpose`、UOM與`quantity_scaled_6` columns，v3 guard存在 | rerun為no-op，schema fingerprint／row identity／FK不變。 |
| B blocked | 任一preflight blocker成立 | zero target write，manifest列exact issue，不得部分apply。 |

Blocking preflight固定為：PendingReview v1／v2 count > 0、unknown purpose、same exact Parent同時屬多個current Definition、global FK failure、unknown migration residue、source master count／root reference異常。`part_base_uom_missing`、`draft_line_uom_unresolved`與`draft_quantity_exactness_unresolved`可作non-blocking inventory保留Draft，但該Draft submit必須fail closed；不得預設EA，也不得從legacy浮點值宣稱已取得exact v3 quantity。

SQLite existing-data runner必須在task-owned copy：先記錄primary logical invariant，再於transaction外`PRAGMA foreign_keys=OFF`，`BEGIN IMMEDIATE`後rebuild受check／column影響tables，保留ID、row count、binding／snapshot bytes／hash，commit後重開FK並執行`PRAGMA foreign_key_check`。任一fault rollback／拋棄task-owned copy，不改primary。

PostgreSQL 054必須使用single `BEGIN`、專用advisory transaction lock、S0／S1結構偵測、blocking preflight、add／copy／drop／constraint／v3 guard與`COMMIT`。凡只存在於S1的`purpose`欄位、trigger、function或index，必須在`DO` block內以catalog／`information_schema`判斷並用dynamic `EXECUTE`處理；static SQL不得在S0因parse／bind不存在欄位而失敗。Migration issue CHECK必須重建為「existing 10 + new 8」聯集並保留既有rows／IDs。任一fault由PostgreSQL整筆rollback。`db/postgres/README.md`依序列054，不把052從歷史移除。

`src/lib/db.ts`只對fresh dev DB以target `db/schema.sql`建立；發現old purpose schema時fail closed並引導執行migration runner，不再自動add purpose或半套target columns。

### 31.4 Canonical UOM and decimal contract

`BomUomCode = "EA" | "SET" | "M" | "MM" | "L" | "ML" | "KG" | "G"`。`normalizeBomUomCode`只做trim／uppercase，unknown回`PART_BASE_UOM_INVALID`；不做alias或conversion。

V3 quantity的API authority是plain decimal string；trim後先符合ASCII grammar `^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$`，不接受leading zero、exponent、NaN、Infinity、千分位或sign。再移除小數尾端0，判定canonical value必須為正數、effective scale <= 6且不大於`999999999.999999`。因此`1.0000000`canonicalize為`1`，但`0.0000001`回`BOM_QUANTITY_PRECISION_INVALID`，超過上限回`BOM_QUANTITY_RANGE_INVALID`。Server不得`toFixed`、四捨五入或先轉binary float。

唯一持久化authority為`quantity_scaled_6 = canonicalQuantity × 1_000_000`的整數，合法範圍`1..999999999999999`，可安全通過JavaScript safe integer、SQLite INTEGER與PostgreSQL BIGINT。parser用decimal digits／BigInt計算，read時由scaled integer還原無exponent、無trailing zero的canonical string；v3 hash、equality、diff、export與release projection一律只讀scaled authority。既有`quantity REAL/DOUBLE PRECISION`欄位在Current Phase保留，writer可寫derived相容值，但不得反向生成v3 hash或繞過scaled guard；這是exact persistence encoding，不是UOM conversion engine。

Legacy Draft item的`quantity_scaled_6=NULL`時可顯示舊quantity作人工參考，但read model必須標`quantityRequiresReconfirmation=true`，save／submit在使用者以decimal string重新確認前fail closed。V1／v2 review、release與resolved row不回填scaled value，仍由原decoder保持immutable。

UOM drift檢查在save與submit都做：`line.quantityUomCode !== current child.baseUomCode`時回`BOM_LINE_UOM_STALE`與exact Part recovery，保留Draft input。使用者必須重新選定Child並確認quantity；不自動把number搬到新unit。

### 31.5 Full current API and DTO contract

Legacy rule：下列current endpoints只要query出現`purpose`／`bomPurpose`或body出現`bomPurpose`，不論值為何都回HTTP 400：

```json
{
  "error": "BOM_PURPOSE_RETIRED",
  "message": "BOM 不再區分用途。",
  "details": {},
  "correlationId": "<server id>"
}
```

此shape沿用`sharedBomHttpError()`的flat envelope；不得另造只供本DEV使用的nested error contract。Response前後的Definition／Draft／audit count必須相同。不可silent ignore或預設manufacturing。

#### `GET /api/bom/create-candidates`

Query：`query?`、`cursor?`、`limit?`、`partNumberId?`、`returnTo?`；無purpose。Candidate item exact shape：

```ts
type BomCreateCandidate = {
  partNumberId: string;
  partNumber: string;
  partName: string;
  itemKind: "purchased" | "manufactured";
  structureType: "single_part" | "assembly" | "unclassified";
  action: "create" | "open" | "classify" | "none";
  definitionId: string | null;
  openDraftId: string | null;
  releasedDraftId: string | null;
  reason: "assembly_file" | "created_by_me" | "company_recent" | null;
  blockerCode: string | null;
  actionHref: string | null;
};
```

Eligibility／action／reason／blocker由limit前同一server SQL projection決定；TypeScript只映射DTO。`assembly`且沒Definition→create；有open Draft／Definition→open；`single_part | unclassified`→classify；不合法status／permission／conflict→none。Item kind、M圖、CAD與base UOM不影響Parent create eligibility。

#### `GET /api/bom/applicability-candidates`

Query只接受`contextPartNumberId`、`definitionId?`、`baseReleaseSnapshotId?`；回：

```ts
type BomApplicabilityResponse = {
  mode: "create" | "next_revision";
  definitionId: string | null;
  baseReleaseSnapshotId: string | null;
  suggestedBomRevision: string;
  contextPart: { partNumberId: string; partNumber: string; structureType: "assembly" };
  candidates: Array<{ partNumberId: string; partNumber: string; selected: boolean; selectable: boolean; blockerCode: string | null }>;
  selectionEtag: string;
};
```

Server必須重驗same company、same root current shared-applicability rules與exact assembly，不讀purpose，不以item_kind／M圖限制。

#### `POST /api/bom/drafts`

```ts
type CreateBomDraftRequest = {
  contextPartNumberId: string;
  applicableParentPartNumberIds: string[];
  bomRevision: string;
  source: "manual";
  baseReleaseSnapshotId: string | null;
  selectionEtag: string;
};
```

Idempotency-Key維持header，fingerprint只取company／actor／exact sorted Parent IDs／bomRevision／source／baseReleaseSnapshotId／selectionEtag，不含purpose。New Definition寫`legacy_purpose=NULL`。Existing legacy non-Definition Draft不得由此route產生；current create只走shared Definition writer。

#### Draft read／save

Read model的item line／floating topic增加`quantity: string | null`、`quantity_uom_code: BomUomCode | null`與`quantity_requires_reconfirmation: boolean`；`quantity`對v3由`quantity_scaled_6`還原，legacy display不得被誤當exact authority。Child candidate增加`base_uom_code: BomUomCode | null`與`uomRecoveryHref: string | null`。Save body保留existing `expectedEditorVersion`、Parent selection、components與ETag，line及floating item精確增：

```ts
type BomDraftNodeInput = {
  id: string;
  logicalLineId: string;
  parentLineId: string | null;
  nodeType: "group" | "item";
  partNumber: string | null;
  revision: string | null;
  groupName: string | null;
  quantity: string | null;
  quantityUomCode: BomUomCode | null;
  sequenceNo: number;
};
```

Item必須quantity／quantityUomCode，server parse後寫`quantity_scaled_6`；group兩者與scaled value必須NULL。Same logical line的所有component candidates與Parent mapping必須共用locked UOM。Null base UOM的Part可出現但不可select，回`PART_BASE_UOM_REQUIRED`，不得在BOM editor暗中修改Part。

#### Part work／search

`PartChangePayload`、Part read projection與matrix row增加`baseUomCode: BomUomCode | null`。Payload出現unknown code→422，existing non-NULL改NULL→422 `PART_BASE_UOM_CLEAR_FORBIDDEN`，code A→B沿用work／review／audit。`GET /api/search?entity=part&q=...&returnTo?=...`每筆只增`baseUomCode`與server-canonical `uomRecoveryHref`；BOM Child picker以`baseUomCode !== null`唯一導出selectability，不把`selectableAsBomChild`這個BOM-specific衍生規則塞進generic search。`returnTo`必須走allowlist；tenant與exact Part identity仍由server限制。

#### Drawing upload result

Non-SLDASM回`classificationOutcome: null`。Active primary SLDASM回exact shape：

```ts
type SldasmClassificationOutcome = {
  status: "promoted" | "already_assembly" | "no_target" | "blocked_relation";
  partNumberId: string | null;
  reasonCode:
    | "sldasm_primary_evidence"
    | "part_already_assembly"
    | "formal_primary_relation_missing"
    | "formal_primary_relation_ambiguous"
    | "formal_primary_relation_cross_company_or_stale";
  recoveryHref: string | null;
};
```

`recoveryHref`必須由server canonical navigation產生，指向exact Drawing在圖號工作台的relation matrix context並帶safe return；client不自行拼Part ID。Promoted／already為null recovery；no_target／blocked_relation才顯示row-local recovery。

### 31.6 Snapshot v3, review, release and export

New submit canonical review JSON：

```ts
type BomReviewSnapshotV3 = {
  schemaVersion: 3;
  definitionId: string;
  definitionRowVersion: number;
  draftId: string;
  editorVersion: number;
  bomRevision: string;
  submitterId: string;
  parents: Array<{ partNumberId: string; partNumber: string }>;
  sharedLines: Array<{
    logicalLineId: string;
    parentLogicalLineId: string | null;
    nodeType: "group" | "item";
    groupName: string | null;
    quantity: string | null;
    quantityUomCode: BomUomCode | null;
    sequenceNo: number;
    level: number;
  }>;
  componentCandidates: Array<{ logicalLineId: string; partNumberId: string; partNumber: string; baseUomCode: BomUomCode }>;
  mappings: Array<{ logicalLineId: string; parentPartNumberId: string; childPartNumberId: string }>;
  resolvedProjectionHashes: Array<{ parentPartNumberId: string; hash: string }>;
  reconfirmationCount: number;
  baseReleaseSnapshotId: string | null;
};
```

Canonical serialization以stable key order、arrays以existing structural order／exact ID決定性排序，quantity只由§31.4 `quantity_scaled_6`還原decimal string，UTF-8 lowercase SHA-256。V3禁止`bomPurpose`、`fulfillmentPolicy`。Approve只讀review v3 bytes／hash，重驗Definition／Draft versions後產生release schema v3及`bom_release_resolved_lines.quantity_scaled_6／quantity_uom_code`；不用latest Draft重組歷史。

Next revision from v1／v2可保留baseReleaseSnapshotId與legacy lines，但clone item只alert、不猜UOM；所有line補齊或重選Child後才可submit v3。V1／v2 review／release／export繼續使用原decoder，new v3 export columns為Parent Part、Child Part、BOM Revision、quantity、uom_code，無fulfillment policy。

Diff將`quantity_uom_code`變更列為`uom_changed`；小心不把v1／v2 NULL單位與Part current UOM比對後假造歷史change。

### 31.7 SLDASM transaction, lock, idempotency and recovery

`reconcileSldasmAssemblyEvidence(tx, input)`只接受transaction client與server-resolved `companyId`、`partRootId`、`drawingId`、`drawingRevisionId`、`workId`、`fileAssetId`、`actorId`、`reasonCode`；不接受client Part ID。`partRootId`只可作preflight lock key，不能作mutation authority。Caller取same-company root lock後，helper必須在同transaction重讀work→Drawing→root、active primary binding、formal Drawing Number與unique current `primary_manufacturing` exact Part；任一identity與preflight不一致即409／zero Part write，最後才鎖Part。

Upload以`workId`為入口，無法在完全不讀work的情況先知道root，因此順序固定為：transaction外既有`readWork`只做auth與non-authoritative root hint／same-content hint → 驗證bytes／hash並以exact request呼現成`replayDev087TerminalReceipt`，terminal hit直接回傳 → hint顯示需要new object時，在DB transaction外stage並verify storage → 呼`runDev087IdempotentCommand` → command內lock hinted root → locked re-read work與Drawing並驗證company、root、row version、handling及mutation basis → authoritative same-content／binding read → binding／tombstone → SLDASM reconcile → audit／work version → commit。如此PostgreSQL不在remote I/O期間持row lock，SQLite也不在storage I/O期間持`BEGIN IMMEDIATE` writer lock。

Preflight與locked read不一致回409；不得在持鎖時做remote storage fallback。若terminal replay在preflight miss後由race winner完成，或authoritative read發現same-content已存在，callback不得引用本command staged object，commit／replay後只刪除exact `preexisting=false`且key仍為本command requested key的unused object；cleanup失敗留下orphan evidence但不得把已完成的canonical command改報失敗。若本command DB transaction失敗，則執行原有compensation；其cleanup失敗維持upload failure。Public response不得暴露internal staged-object state。

Upload command checkpoints固定為：

1. `after_storage_put`：terminal receipt preflight miss且新object已在DB transaction外stage／verify；後續DB failure必須compensation，race replay／authoritative reuse必須unused-object cleanup。
2. `after_root_and_work_revalidation`：root-first lock已取得，locked work／Drawing／company／root／row version已與preflight重驗，尚未讀取或修改Part。
3. `after_binding_switch`：new binding／replacement tombstone已在transaction內。
4. `before_part_update`：evidence已精確解析，尚未改Part。
5. `after_part_update`：structure_type已變，audit尚未寫。
6. `before_audit`：實際promotion必須只產生一筆system-invariant audit。
7. `before_work_version`：file／Part／audit已準備，row_version尚未推進。
8. `before_commit`：所有DB side effect必須同transaction。
9. `during_storage_compensation`：DB rollback後刪除本command新建object；compensation failure記錄orphan recovery evidence並回upload failure，不偽報成功。

Exact target成立時，任一DB／audit fault都使file binding、tombstone、Part、audit、work version全數rollback，new object compensation。Same-content reuse沒有new storage object，仍必須在root-first＋locked revalidation後re-run reconciliation；Part已assembly時no-op且無duplicate audit。

Zero target／ambiguous／cross-company／stale的已驗證檔案可commit，但Part write=0；分別回`no_target`或`blocked_relation`。後續formal relation寫入必須以final relation state執行一次reconcile：async `upsertPair`、`replaceRootLinks`、`applyMatrix`沿用root row lock；SQLite sync `linkPartNumberToDrawing`、numbering create與`main_drawing_restore`的affected outer transaction必須由現行deferred `database.transaction()()`提升為`.immediate()`，先取得SQLite writer lock再讀final relation／SLDASM evidence。Sync repository不得自行巢狀開transaction，且在無active transaction時fail closed。Batch／replace不得在中間pair逐筆promotion，remove／reference change不降級；不得留下可建立`primary_manufacturing`卻繞過invariant的formal writer。兩種adapter共用同一eligibility／outcome規則，不建queue／cron／second receipt。

SLDPRT、secondary cad_3d、removed binding、顯示名含`.SLDASM`、只有root relation與client-forged Part ID全部zero classification write。Delete／replace／relation removal永不降級。

### 31.8 UI implementation and recovery contract

- `/bom/create`保留現有canonical shell：頁首→全寬Parent search→單一candidate list→將建立摘要→footer。刪除purpose segment後不留空容器，不用長helper補空白。
- Work list只顯示Parent／applicability、BOM Rev、status、updated time與action；無purpose filter／badge／chip。Historical detail的「歷史用途」不出現在current list或writer。
- Child picker每列顯示Part、name、base UOM。Missing UOM時當列disabled，只有一個「先設定基本單位」recovery；離開前保存Draft，returnTo回exact Draft／selection context。
- Inspector的quantity可編輯，UOM為唯讀suffix；group不顯示quantity／UOM control。Map／Outliner／move／floating都顯示或保留同一locked UOM，不產生第二unit state。
- Part workspace與matrix的base UOM放於正式屬性區且使用controlled select；BOM page不代改Part。
- Drawing upload結果只在對應file row顯示。`promoted`不常駐success panel，`already_assembly`不重複提示，`no_target | blocked_relation`顯示一個recovery action。
- Normal route必須在1440×900、1024×768、390×844驗證：無horizontal／double scroll、footer不遮擋、drawer／recovery返回不focus loss、keyboard可完成，dynamic blocker有`role=status | alert`。

### 31.9 Delivery slices and ownership

| Slice | Primary owner | Exact output | Entry gate | Exit gate |
|---|---|---|---|---|
| 109-U0 boundary／harness | Tech Lead + QA | re-hash 54 existing targets，建立new scripts／QA manifest schema，S0／S1／primary preflight dry-run | §31 accepted | C01～C08 harness可執行，primary writes=0 |
| 109-U1 migration／purpose retirement | Backend + DBA | target schema、SQLite runner、PostgreSQL 054、purpose API／projection／UI removal、legacy dispatch | U0 | M01～M08／P01～P06，current purpose behavioral ref=0 |
| 109-U2 UOM／snapshot v3 | Backend + Frontend | Part UOM work／search，line lock／drift／scale-6 exact quantity／v3 submit／release／export／diff | U1 target schema | R01～R14 related cases，v1／v2 bytes／hash unchanged |
| 109-U3 SLDASM invariant | Backend + Frontend | root-first helper，upload與async／sync formal writer integration、row-local recovery／reconcile runner | U1；可與U2分branch但不共用未凍結schema | T01～T08 source contract PASS；外部 fault下zero wrong-Part write／compensation須由deployment gate證明 |
| 109-U4 integration／QA-QC | RD→QA→QC | normal-route browser、full aggregate／typecheck／lint／isolated build／provider receipts | U2+U3 | exact 54/54 PASS，Not Run／Blocked=0，primary invariants unchanged，task-owned cleanup complete |

Single-writer rule：U1～U4只擴充`BomWorkbenchAsyncRepository`與existing Part／Drawing／relation authorities；不建UnifiedBomRepository v2、sales-kit adapter writer、SLDASM background writer或BOM內建Part writer。

### 31.10 Dirty worktree handoff ledger

Source revision at planning：`91de270c3a644dfbcbee49ed255b3c18e13df9dd`。Ledger algorithm：依本節54筆順序將`path<TAB>sha256<TAB>git status`以UTF-8／LF連接後取SHA-256。Combined manifest：`d3f0d9f934bf5ad2dd96b1f4e34c29223c6b7c063fc2144746232ad0b32917c7`。

| Existing target path | SHA-256 | Planning status |
|---|---|---|
| `.env.example` | `d2294086f145956884a26355dad268e931ac2afad66266e27720b26209e40f6e` | modified |
| `package.json` | `22a25e938ee9757f7500ba27ae72abed72807c2779e5669a184f81c95e90fa92` | modified |
| `db/schema.sql` | `03d581774f3f67c970a24a11135c2fd4b6c63530760e550f1b552ced7d10158b` | modified |
| `db/postgres/README.md` | `f9459f4d02af87a40491d8a7173a700730db785747cc31bdbfcb6c474b66b5b9` | modified |
| `src/lib/db.ts` | `9d5fb32924afcae41f5ce03a491150f0a684e7c480d6fe28fc8f06a66800df43` | modified |
| `src/lib/types.ts` | `30988d3aa7e9a917456e6634b91f3cf42bc3676f77eb334751b294e7c70a1527` | modified |
| `src/lib/bom-create-context.ts` | `4fb1972815ed23c0466432dc589667c3f965b111870efb508b6b0ba783aeafb7` | modified |
| `src/lib/bom-create-navigation.ts` | `d493f6f057b57f2fa4f0bc864bc0f837b27794ce6649b621dd24eb7ad12e018a` | untracked |
| `src/lib/bom-release-export.ts` | `16d132582f5bca93fa17386464f63ec02f172d5ef172594a88986323e24619a3` | modified |
| `src/lib/bom-release-integrity.ts` | `6dedee9e8d3ec02fc4a881d19f47fa46066008a43bcfeaae50cc7d1ac41cf5d9` | modified |
| `src/lib/bom-shared-structure.ts` | `790228ba99a28087d00aa8cd218e1a54b2f1d2f839f11cd5b20ae80a96e309f7` | modified |
| `src/lib/bom-workbench-async.ts` | `2daaf201951f3472c444abdf6a33c5bd3f21eb0117c2cd5970302fd82227c258` | modified |
| `src/lib/bom-workbench-diff.ts` | `d6943e75cb0e871e9c401bdfa740a77c8648347db31ec5f3d23bf4a9c9441c37` | clean |
| `src/lib/bom-submission-diff.ts` | `5a2c362b057aa91057255937b9adf86ab721183e5adacc212c2cd3d30d5bc2f9` | clean |
| `src/lib/pdm-canonical-workbench-contract.ts` | `6235f7dc307cfee24e3ed5dcd189a00b1516dee537eaac4c357440fc24a85e68` | modified |
| `src/lib/repositories/bom-workbench-async-repository.ts` | `104cfe6df785140c07cf7297527e2d016b43913466dae47c48086b5f715825c9` | modified |
| `src/lib/repositories/approval-platform-async-repository.ts` | `bd9cd61287acb50dac068370d36a532396b0cda014138234847d92a0925e2908` | modified |
| `src/lib/repositories/item-insight-async-repository.ts` | `9ab82417216721c2a56f6fe30a22dff57af0573452fceac4d2bfbc6ad3a823cb` | modified |
| `src/lib/bom-purpose-presentation.ts` | `299ee3b1e5d94bcf58e5b632e27d3f873db354c668b9eae6eea598f149be75cd` | untracked; planned delete |
| `src/lib/sales-kit-bom-feature.ts` | `7552734a82361a7f6d22ea23e3e8316fcf1d1dff045934856c5f044f8e02ea67` | untracked; planned delete |
| `src/app/api/bom/create-candidates/route.ts` | `a213cc3cf6f6f18b8f00be12a393af0a697f769a2f6fd8ec7078f41b5c9a723d` | untracked |
| `src/app/api/bom/applicability-candidates/route.ts` | `2cb38466275db9b7e6c0b8f12623660b55c750e093dc5df2d335d6842c6d4500` | modified |
| `src/app/api/bom/drafts/route.ts` | `c3712082eb9984dbf79ebfb2988f68cab1c7aaf0341533d62d8c57d37c5764af` | modified |
| `src/app/api/bom/drafts/[draftId]/route.ts` | `1632843b89999bfd55e07a08ef4f80e7e7c7313a1553c4440836a30e6de733a4` | modified |
| `src/app/api/bom/drafts/[draftId]/delete/route.ts` | `b51e42562022b2a6dffe4de572c7ee034802e55c04a2ee0cd48a4e2420d0fa68` | modified |
| `src/app/api/bom/drafts/[draftId]/obsolete-request/route.ts` | `2d54294239988d1ea5cc232d03ee038e64a26fa2b50ee461d4cd1ec04d0c44aa` | modified |
| `src/app/api/bom/drafts/[draftId]/reconfirm-replacements/route.ts` | `4dbe1f01c454fab7bf685b7b54d7df84cd1e57a6c5b8175d187e2b2b3974ce04` | modified |
| `src/app/api/bom/drafts/[draftId]/restore/route.ts` | `091189be1c8bf38078a958aa1506ac9503dd83093740ecac670a4234beaf833c` | modified |
| `src/app/api/bom/drafts/[draftId]/submit-review/route.ts` | `2e0077ec0029617e5e23df175f1bb1fe9180bb079b3ae45aaa06c5ef453b5830` | modified |
| `src/app/api/bom/reviews/[reviewId]/approve/route.ts` | `0895fe826b7643e0bfa4d765e39b29feebc9895272b37a3faf603d0c969c3ac0` | modified |
| `src/app/api/bom/reviews/[reviewId]/reject/route.ts` | `7ac75ac917e29b4b4c76d8a247e20a90bf0d92cdf3337c06959f684923aaa4d7` | modified |
| `src/app/api/bom/releases/[releaseId]/export/route.ts` | `0f38bcd4bc792244bac064e3783f365bdb3fd94aa9f663aae8e798df0add76b0` | modified |
| `src/components/bom-create-page.tsx` | `802c67619a7b6eac8ec2bccbe934fe9dd131e28b0118106d33407f5371fdc7e7` | untracked |
| `src/components/bom-workbench-detail.tsx` | `ad2d58a0467c2b4862d3968e28d2520d65397ab19fe3e56cc4421a2cb92e1fb3` | untracked |
| `src/components/bom-workbench-list-page.tsx` | `060430f110d0dc2a536503b6986098b931c289e0a8ca20d3cc3157d55ed2a06e` | untracked |
| `src/components/part-bom-context.tsx` | `d337feea98d61298dc5903d841b77a65350c0e80d88e85b89a52938b4ce6532c` | modified |
| `src/components/bom-editor/bom-editor-types.ts` | `9deffba05d51ded8f0d55853db35a6e3265abc9a85ead5ea5193320bb01bc9bc` | modified |
| `src/components/bom-editor/bom-structured-editor.tsx` | `35c7750e8f7c4eddd9434053aec29206f1ef893cdf72978e2b6ff81fbbeaec13` | untracked |
| `src/components/bom-editor/bom-node-inspector.tsx` | `8efea8ba2d7b8e3445144cebef154f38b2a73db6642e0ee983fba3113cd42923` | modified |
| `src/components/bom-editor/bom-inline-picker.tsx` | `753ff7e471f37ea7bfe5a38b8f193ee750efc82160eff0dff4024733bd9a08d1` | modified |
| `src/components/bom-editor/bom-editor-reducer.ts` | `f74317b7d1fe74aded7dfbb29c9881aece9019d37fc30bfbc76772568b05a598` | untracked |
| `src/components/bom-editor/bom-map-view.tsx` | `c89bd3ea1c1a4c251bbe4e104e30f103f4b95404b7881caaf37b4847b8c8dba3` | untracked |
| `src/components/bom-editor/bom-outliner.tsx` | `8920793761176b4aee8399e6bca63f9c6aa4353d7e98fe4f0075114ac7aeab94` | modified |
| `src/lib/repositories/part-change-work-async-repository.ts` | `3f7c39ecd28d70f505abef18bf2774357e451f9ec44153e89bf179ecdd5a54a7` | modified |
| `src/lib/part-number-matrix-contract.ts` | `f0e18070f1c235338fa6eee3833cbe2c7e81719ef43e67147ea41e81caac8dac` | untracked |
| `src/lib/repositories/part-number-matrix-async-repository.ts` | `3f006a6cef540c45c74eca82634fa1301f1ee285701ccc9c9176482dbff23015` | untracked |
| `src/components/canonical-change-workspace.tsx` | `ecf19f0e5e92733561ab48febb7364db867e9b811a3dfb5f150953d88b77feb3` | modified |
| `src/components/part-number-matrix-workspace.tsx` | `9a45d3bfeb27dd15682329b4b5923fecae38495b6f13097181b1c9ec7a571f3e` | untracked |
| `src/app/api/search/route.ts` | `a43d7db568f8946268ab6e6c74ef871a51bac39e5bbd94d0cbf5a3317b210b29` | clean |
| `src/lib/drawing-revision-work-file.ts` | `53acadb25c7b5aa08e1aee3361061d67e8e9df6d31fae9e62cbb3285ae8e7634` | modified |
| `src/lib/repositories/relation-formal-authority-async-repository.ts` | `9a714e72ed2a2444f90c6c3e37ffd5ce29878b7a48629438f634c9662160bfa5` | modified |
| `src/lib/repositories/relation-formal-authority-sync-repository.ts` | `66104510335651d5236fdf604dc7a0835b0905994358b740a3a7bce5ccf4dc3c` | clean |
| `src/lib/repositories/numbering-repository.ts` | `9caec1914a31c3f5becc9a68e8c0b39aec6ac4c8c3ce44f662ffbd8b01fbd4c8` | clean |
| `src/components/canonical-drawing-change-workspace.tsx` | `829593ff6d5e005bda6189f2a2b4b4c3689095ea2137abe5600306f0ca7b9a16` | modified |

Ledger是planning snapshot，不是對使用者變更的ownership聲明。Implementation receipt必須保留before／after ledger、原使用者hunk的整合說明與unrelated dirty files untouched list。

### 31.11 Executable commands and fixed verification denominator

`package.json`target scripts：

```text
npm run migrate:dev-109:dry-run
npm run migrate:dev-109:apply
npm run migrate:dev-109:postgres
npm run reconcile:dev-109:sldasm:dry-run
npm run reconcile:dev-109:sldasm:apply
npm run qc:dev-109:unified:contract
npm run qc:dev-109:unified:migration
npm run qc:dev-109:unified:provider
npm run qc:dev-109:unified:repository
npm run qc:dev-109:unified:transaction
npm run qc:dev-109:unified:browser
npm run qc:dev-109:unified
npm run typecheck:app
npx eslint <all changed source and runner files>
npm run build:isolated
```

Migration／reconcile `apply`必須要求task-owned path與explicit `--apply`，primary path或production connection直接fail closed。PostgreSQL runner只接disposable shadow；沒有provider時P01～P06=BLOCKED，不可以SQLite PASS取代。Browser runner啟動前依AGENTS.md記錄project、purpose、port、owning process tree、cleanup condition、`PDM_DATA_DIR`、`PDM_REPOSITORY_DIR`與mutation scope，結束只停止task-owned tree並證明port released。

Fixed denominator為54，以`.ai-doc/qa/qa-dev-109-unified-bom-domain-validation-plan-2026-09-01.md`為exact registry：C01～C08=8，M01～M08=8，P01～P06=6，R01～R14=14，T01～T08=8，B01～B10=10。Aggregate自身不計case；completion要求54／54 PASS、Fail／Blocked／Not Run=0，manifest case IDs無重複或多報。

### 31.12 RD Readiness Gate receipt

| Gate | Result | Evidence／disposition |
|---|---|---|
| Product decisions | PASS | 單一BOM、SLDASM／SLDPRT、Child無圖、UOM／purpose retirement均Human Confirmed。 |
| Architecture／authority | PASS | Definition／Draft／review／release single writer；Part／Drawing／relation沿用existing authority；無second domain。 |
| Exact repository plan | PASS | §31.2凍結13 add／52 modify／2 delete／no-touch與54-file dirty ledger。 |
| Provider migration | PASS | S0／S1／S2／blocked、SQLite rebuild／PostgreSQL 054／rollback／rerun已定義。 |
| API／snapshot | PASS | Current DTO、flat retired-input error、scaled v3 JSON／hash／v1／v2 dispatcher已定義。 |
| Transaction／recovery | PASS（contract） | terminal replay→storage stage→root-first locked revalidation、async／sync formal writer coverage、same-content／9 fault checkpoints／storage compensation／row-local recovery已由source contract核對；外部 storage fault injection 尚未在本機執行，列入deployment gate。 |
| UX normal route | PASS | create／Child UOM／Part recovery／Drawing recovery／3 viewport／a11y已定義。 |
| Verification integrity | PASS | new 54-case registry／task-owned providers／real Chromium／primary invariants／cleanup已定義。 |
| P0 gaps | 0 | 無待補不可逆變資料、security、migration、atomicity決策。 |
| P1 gaps | 0 | 無待補主流程、DTO、error、UI recovery或case denominator。 |

Final execution boundary：DEV-109的U0→U4已完成task-owned本機RD實作，並由QA/QC固定54／54、typecheck／lint／isolated build、disposable provider actual apply＋rerun與primary invariant gate收據證實；transaction runner 的 T01～T08 為 source-contract evidence。Production 054 apply、existing-data SLDASM promotion、外部 storage fault injection、feature activation、deploy、smoke與release均需另行release authorization。

## 32. RD Tech Lead Review and Direct Corrections（2026-09-01）

審查結論：`通過（已修正）`。產品方向沒有過度設計：single BOM domain、existing writer／lifecycle、future execution policy與不解析SLDASM Child都應保留。原§31有五項會讓RD「照文件做仍產生不一致或漏寫」的實作缺口；本次已直接併回§31、QA authority、ADR、dev_task與documentation map，P0／P1 gap恢復為0。

| Finding | 原問題 | 已採最小修正 | 為何不是過度設計 |
|---|---|---|---|
| F1 quantity authority | 要求跨provider deterministic v3 hash，卻以SQLite REAL／PostgreSQL DOUBLE作持久化authority，無法保證exact decimal readback。 | 新增nullable `quantity_scaled_6`；v3以scale-6 integer為唯一authority，legacy浮點只讀／相容，API使用plain decimal string並設safe upper bound。 | 只加三欄與一個既有UOM helper codec，不建立任意精度或單位換算引擎。 |
| F2 formal writer coverage | 原契約只接async relation matrix；現有SQLite sync authority仍可由numbering link／create／main-drawing restore建立主要製造關聯而繞過promotion invariant。 | 將兩個sync authority檔納入54-file boundary；所有async／sync formal writer均在final relation state以同一規則reconcile，remove不降級。 | 沿用現有authority與transaction，不建eventual-consistency queue、trigger或第二writer。 |
| F3 upload lock feasibility | Upload只收到workId，原文字卻要求「完全不讀work先鎖root」，且既有command callback先開SQLite `BEGIN IMMEDIATE`再做storage I/O，會反向鎖序或長時間佔writer lock。 | 明定terminal receipt preflight、read-only root hint、DB transaction外storage stage、root lock後locked work／Drawing revalidation；checkpoint改為`after_root_and_work_revalidation`，drift／race replay有exact cleanup。 | 直接沿用現成`replayDev087TerminalReceipt`與compensation，不新增reservation table或分散式工作流。 |
| F4 migration preservation | Issue CHECK若直接換成新code會使既有10種issue失效；PostgreSQL S0若以static SQL引用不存在的purpose欄位會在條件判斷前失敗。 | 新舊issue code取聯集；054以catalog detection＋dynamic EXECUTE處理S1-only objects，single transaction rollback不變。 | 這是forward migration基本安全性，不是新domain。 |
| F5 HTTP／search coupling | Retired-purpose error shape與現有`sharedBomHttpError()`不一致；generic part search被要求持有BOM-specific `selectableAsBomChild`衍生規則。 | Error對齊flat envelope；search只回base UOM＋canonical recovery href，Child picker由base UOM唯一導出selectability。 | 刪除平行contract與重複規則，降低耦合。 |

反例門檻：若RD無法在不改v1／v2 bytes的前提加入scaled authority、發現其他可寫formal relation path、storage adapter無法證明compensation、或054無法在actual disposable S0／S1 PostgreSQL完成apply＋rerun，必須立即停止並將readiness降回`RD Contract Reopen`，不得以typecheck或SQLite PASS代替。

## 33. RD Implementation and QA/QC Receipt（2026-09-01）

本節取代§30、§31原先的「尚未開始」狀態，記錄本機 implementation boundary 的實際結果；不改寫歷史§28收據或任何 v1／v2 evidence。

### 33.1 已交付範圍

- U0/U1：新增 forward-only SQLite runner 與 PostgreSQL `054_unified_bom_domain_and_uom.sql`；`purpose` 退役為 nullable `legacy_purpose`，current API／workbench 不再接受 purpose decision，舊輸入固定回 flat `BOM_PURPOSE_RETIRED` 400。
- U2：Part `base_uom_code`、line locked UOM、scale-6 `quantity_scaled_6`、正小數 parser、drift／legacy reconfirm guard、review／release v3 canonical hash、v3 export quantity unit 與 v1／v2 decoder compatibility 已接入既有 writer。
- U3：`sldasm-assembly-evidence` 成為 upload、async relation 與 sync relation writer 共用 primitive；只對 same-company、formal、唯一 active primary relation 的 exact Part 單向升級，zero／ambiguous／cross-company fail closed，remove／replace 不降級；新增 task-owned existing-data reconcile runner，預設 dry-run。
- U4：`/bom/create` purpose-free canonical entry、exact Parent action projection、Child UOM 顯示／鎖定、editor decimal input、workbench filter cleanup 與 recovery navigation 已落地；未新增第二 BOM writer、單位換算引擎或 background queue。

### 33.2 實際驗證結果

固定分母為 `.ai-doc/qa/qa-dev-109-unified-bom-domain-validation-plan-2026-09-01.md` 的 54 案：

| Runner | Cases | Result | Evidence |
|---|---:|---|---|
| Contract | C01–C08 (8) | PASS | `output/qa/dev-109-unified/2026-08-31T20-00-15-154Z/aggregate.json` |
| Migration | M01–M08 (8) | PASS | 同上；SQLite dry-run/apply/rerun、FK check |
| Provider | P01–P06 (6) | PASS | `output/qa/dev-109-unified/2026-08-31T20-00-15-154Z/provider/postgres.json`；task-owned PostgreSQL S0/S1 actual 054 apply＋rerun，未連 production |
| Repository | R01–R14 (14) | PASS | 同上；task-owned SQLite actual create/save/review/release readback＋UOM/eligibility/drift；boundary guards以source contract補強 |
| Transaction | T01–T08 (8) | PASS（contract） | 同上；source-contract 核對 storage stage、rollback、root-first lock；外部 storage fault injection 未在本機執行 |
| Browser | B01–B10 (10) | PASS | `output/qa/dev-109-unified/2026-08-31T20-00-15-154Z/browser/browser.json`；1440/1024/390、real Chromium、CTA POST/readback |
| **Aggregate** | **54** | **PASS 54/54** | `aggregate.json` 的 `observedCount=54`、`missing=[]`、所有 child exit code=0 |

工程 gate：`npm run typecheck:app`、受影響 source／runner ESLint、`npm run build:isolated` 與 `git diff --check` PASS；aggregate 明確 `productionWrites=false`。瀏覽器 runtime 使用 task-owned `PDM_DATA_DIR`／`PDM_REPOSITORY_DIR` 與動態 port，完成後 process、port、fixture 均清理。未執行 production migration、primary data reconcile、外部 storage fault injection、feature activation、deploy、smoke 或 release。

### 33.3 Current status 與後續 gate

Historical local receipt status：`RD Implemented Locally / Human Confirmed / Full QA-QC Passed 54/54 / Production Release Gated`。2026-09-01現場A0044不符合已由§34重開CAPA；此狀態不得再作current completion或production-ready判定。

本收據只代表本機程式與隔離驗證完成。正式環境仍必須由 deployment/release gate 另行執行：

1. release candidate 若要進正式環境，仍須重新執行 deployment gate 要求的 disposable PostgreSQL 054 apply＋rerun 與 schema／row／FK evidence（本機 provider evidence 已完成）；
2. primary existing-data SLDASM dry-run review 後的明確 apply authorization；
3. exact SLDASM upload 的 external storage fault／rollback／compensation matrix（含inventory與row readback）；
4. capability activation、deploy、production smoke、rollback rehearsal與release approval。

在上述 gate 完成前，不得把本機 54/54 宣稱為 production migration 或 release 完成。

## 34. CAPA：SLDASM 組立分類與 BOM 候選一致性（2026-09-01，RD Review Corrected）

CAPA ID：`CAPA-DEV-109-SLDASM-CANDIDATE-001`

Current status：`CAPA Local Corrected / Contract Corrected / CAPA-P01 Read-only Observed / Production Effectiveness Blocked / Production Release Gated`

問題類型：`歷史資料未回補 + 實作覆蓋缺口 + 驗證控制失效 + 正式環境結案邊界不足`

風險：`P1 / High / Release Lane 3`。程式修正不新增 schema；但既有正式資料可能需要單向
`structure_type=assembly` 回補，因此 live apply 必須有 exact dry-run、備份、mutation ledger、獨立核准與
正式環境 readback。本節只制定改善契約，不授權本輪寫正式資料、activation、deploy 或 release。

### 34.1 不符合事實與證據邊界

| 層次 | 已確認事實 | 判定 |
|---|---|---|
| 料號主資料 | `A0044-P01` 是正式可用 Part，但 `part_numbers.structure_type=single_part` | BOM action 正確依 Part authority 回 `classify`；錯的是 Part 未被既有證據回補 |
| 圖號與檔案 | `A0044-M01` 的 active primary `A0044.SLDASM` 建立於 2026-08-26，早於 DEV-109 promotion 功能於 2026-09-01 完成；formal unique `primary_manufacturing` relation 已存在 | 歷史 upload 不可能執行後來才加入的 promotion side effect，必須靠 existing-data reconcile 修復 |
| Audit | A0044 沒有 `bom.sldasm.assembly_promoted` audit | 與「歷史檔案未回補」一致；不得假稱 upload helper 已執行但失敗 |
| Upload writer | `EVIDENCE_SQL` 依 current work、active primary exact `.SLDASM` 與 formal unique relation判定，沒有 lifecycle／data-layer gate | upload path 本身不是本案的 layer-gate 缺陷；CAPA 不得改壞已核准 predicate |
| Relation／existing-data writer | `DRAWING_EVIDENCE_SQL` 與 reconcile runner硬性要求 `drawing_production`，且 runner依賴work binding；會漏掉 current revision 已存在、work已結束或位於其他合法layer的資料 | 既有資料與relation後補無法完整收斂 |
| Candidate read | assembly action以 Part `structure_type` 為authority是正確的；但assembly-file reason另以 `drawing_production + rd_controlled/released`過度限縮 | A0044既未回補，又失去高價值「有組合檔」reason，因而不在預設建議中 |

`revision.lifecycle_state` 與 `canonical_workbench_states.data_layer` 是流程／呈現狀態，不是 `.SLDASM` 是否代表組合檔的
必要條件。依 §30.5 與 structure ADR，充分條件始終是「已驗證的 current active primary exact `.SLDASM`＋
same-company formal unique `primary_manufacturing` relation」。

影響：

1. 功能上線前已存在的 SLDASM Part 可能維持 `single_part`，無法直接建立 BOM。
2. relation 後補或 current state 不在 production layer 時，現行 drawing-level reconcile 可能無法自動收斂。
3. candidate 可能同時回 `classify` 且沒有 assembly-file reason，降低可發現性；只人工修 A0044 會留下同型漂移。
4. 歷史 54/54 沒有覆蓋「檔案早於功能、current formal state、無work binding」的 fixture，不能關閉本 CAPA。

尚待 release gate 查證：正式 Cloud SQL 的 054 inventory、exact reconcile count、A0044 是否存在於正式 target、
production artifact 與 rollback revision。這些未知不得以本機資料推定。

### 34.2 根因分析

本案有兩條並行因果鏈，不得混成單一「RD layer 被排除」：

1. `SLDASM 早於功能存在` → `當時沒有 promotion side effect` → `primary existing-data reconcile 未執行`
   → `Part 維持 single_part` → `candidate action 正確回 classify`。
2. `candidate reason／drawing-level reconcile 另加 production-layer／lifecycle gate` → `current 合法 assembly file evidence漏投影`
   → `沒有 assembly_file reason／ranking` → `空白建議漏列`。

| 根因 ID | 層次 | 根因與控制失效 | 證據狀態 | 反事實檢查 |
|---|---|---|---|---|
| RC-1 | Data transition | 功能加入時沒有在 primary／formal existing data 執行已規劃的 reconcile；歷史 SLDASM 不會自行重播 upload side effect | 已由 file／feature日期與無promotion audit確認 | 若 activation 前完成 exact reconcile，A0044-shaped Part會收斂為assembly |
| RC-2 | Implementation coverage | drawing-level relation reconcile、existing-data runner與candidate file projection把data layer／lifecycle當成結構證據，且runner只掃有work binding的資料 | 已由source確認；upload helper不含此缺陷 | 移除非必要 gate並以current revision／active file為邊界，可涵蓋A0044且不擴張到歷史非current revision |
| RC-3 | Verification control | 固定54案缺少pre-existing current formal SLDASM、無work binding、preparation／RD／production多layer正例，以及candidate action與reason分離驗證 | 已由case registry確認 | 加入fixture後，現行runner與candidate projection會失敗，能在交付前攔截 |
| RC-4 | Completion governance | local completion沒有要求回收primary reconcile與正式環境correctness evidence | 已由§33完成語意與現場再發確認 | 將四個CAPA-specific production gates設為closure條件，可阻止local PASS被誤報為CAPA完成 |

系統性根因不是使用者未按「設定為組立件」、A0044建立者不同，也不是upload writer要求錯誤lifecycle；真正缺口是
existing-data transition、部分caller/read projection的過度限縮，以及缺少跨入口的語意不變量測試。

### 34.3 立即圍堵

1. DEV-109 的 54/54只保留為historical regression baseline；不得宣稱CAPA完成或production ready。
2. 修正與CAPA local gate通過前，不得部署現行drawing-level reconcile／candidate projection作正式target。
3. 不用filename／root猜Part、不批次修改所有SLDASM料號、不把candidate GET改成writer。
4. 營運若急需建立A0044 BOM，可由有權限者對exact Part執行既有manual classification並留下audit；此為temporary correction，不是CAPA closure。

### 34.4 CA／PA 追溯矩陣

| 根因 | CA（修正已發生問題） | PA（防止再發） | 效用判斷 | 驗證證據 | 建議流向 |
|---|---|---|---|---|---|
| RC-1 | 對task-owned copy、primary target與正式target依gate執行existing-data dry-run／核准apply；只晉級exact current target | activation checklist固定包含reconcile dry-run、apply／audit count、rerun no-op與drift=0 | 直接修復既有漂移，不新增常駐job | exact plan、before／after、audit、rerun與drift receipt | `dev_task + DEV-032 release gate` |
| RC-2 | 修正drawing-level helper、runner與candidate file projection：不以data layer／lifecycle作必要條件；保留current revision、active primary exact file、same-company formal unique relation | writer與read projection共享「語意不變量＋契約測試」，不強迫共用同一SQL或把read path耦合到mutation helper | 修正範圍小、責任清楚，避免為DRY製造跨context耦合 | upload／relation／reconcile／candidate各自正負案例與cross-provider readback | `dev_task + code review checklist` |
| RC-3 | 增加A0044-shaped fixture與bounded ranking fixture；分別驗證pre-reconcile classify、post-reconcile create／open及assembly_file reason | 固定case保留pre-existing／no-work／multi-layer／negative evidence矩陣；舊54案只作回歸 | 少量case覆蓋真正失效面，不膨脹成完整release重測 | CAPA-L01～L08與歷史54案PASS | `QA plan` |
| RC-4 | 由DEV-032執行四個CAPA-specific production gates；generic provenance／activation／rollback沿用DEV-032，不在本CAPA重複計分 | closure需正式dry-run／apply receipt、feature smoke與一次已排程read-only effectiveness audit | 保留正式環境責任，刪除重複10-case治理負擔 | CAPA-P01～P04 receipt | `DEV-032 release gate + QC report` |

教育訓練不是主要PA；控制點是程式不變量、fixed fixture與release gate。

### 34.5 RD 最小修正範圍

必改：

- `src/lib/sldasm-assembly-evidence.ts`：保留work upload `EVIDENCE_SQL`既有無layer／lifecycle gate的語意；修正
  `DRAWING_EVIDENCE_SQL`，從current canonical Drawing revision取得active primary exact `.SLDASM`，不要求
  `drawing_production`、特定lifecycle或work仍存在。Async／sync輸出與audit語意一致。
- `scripts/reconcile-dev-109-sldasm-assembly.mjs`：依current canonical revision＋active primary exact file掃描，不以
  data layer／lifecycle／work binding縮小範圍；輸出exact promotions、already、no-target、ambiguous、cross-company、
  scope fingerprint、plan hash、before／after、apply count與rerun no-op。
- `src/lib/bom-create-context.ts`：action／blocker仍只依Part classification、permission、Part lifecycle與existing BOM；
  assembly-file reason採獨立read-only projection但符合相同語意不變量，不含data-layer／lifecycle gate。對外reason改為
  `assembly_file`、人類文案為「有組合檔」，避免錯稱「受控」；不得在GET內mutation。
- `src/app/api/bom/create-candidates/route.ts`、`src/components/bom-create-page.tsx`：DTO enum、route mapping與可見label
  同步改為`assembly_file／有組合檔`；不得保留`controlled_sldasm` compatibility alias造成雙語意。
- DEV-109 contract／repository／provider／browser runner：加入§34.7 cases，不改寫歷史54案manifest。

允許為共用selector／normalizer做最小抽取，但不要求writer與candidate共用同一SQL／helper；兩者transaction、lock、
read-only責任不同。不得新增第二writer、background job、trigger、推薦資料表或新route。

Out of Scope：解析SLDASM Child／數量、從檔名猜Part、自動建立BOM、assembly自動降級、改manual classification權限、
推薦模型、BOM purpose復活、ERP／庫存履行策略。

### 34.6 行為與資料驗收契約

1. 經驗證的current work upload，只要active primary exact `.SLDASM`與same-company formal unique
   `primary_manufacturing` relation成立，就將exact Part單向晉級為assembly；`drawing_preparation`可成立，
   lifecycle／data layer不是必要條件。
2. formal relation後補與existing-data reconcile以current canonical revision的active primary exact `.SLDASM`判定；
   current state可位於preparation／RD／production，不另以Revision lifecycle值作filter。
3. SLDPRT、secondary／removed／deleted file、非current revision、reference relation、zero／multiple target、cross-company、
   stale或terminal target全部zero wrong-Part write。移除或替換SLDASM不自動降級。
4. upload、same-content replay、formal relation後補與existing-data reconcile維持相同語意不變量；already assembly為no-op，
   不產生duplicate audit或BOM。這不要求read／write path共用同一SQL。
5. candidate GET永遠zero write；action／blocker只由current Part authority、permission、Part lifecycle與existing BOM決定。
   `assembly_file`只提供解釋與排序，不成為第二個structure authority。
6. A0044-shaped資料在reconcile前可回`classify + assembly_file`；reconcile後無既有BOM為`create`、有既有BOM為`open`。
   exact search必須命中。預設前5只在固定bounded fixture驗證reason優先序與deterministic ordering；正式環境不要求
   特定A0044永遠位於全公司top 5。
7. mutation留下actor／reason／exact entity／before-after audit；回補前後schema fingerprint、canonical identity、v1／v2
   snapshot、migration residue、非目標資料與foreign key invariant不變，只有plan ledger內exact Part可變更。

### 34.7 Fixed CAPA verification registry

CAPA固定12個gate，詳細oracle以current QA §12為authority：

- `CAPA-L01..L08`：本機／隔離provider的upload、relation、candidate、reconcile、provider invariant與原54案回歸。
- `CAPA-P01..P04`：正式dry-run／核准範圍、reconcile apply、artifact activation feature smoke與一次scheduled effectiveness audit。

Local RD門檻是`CAPA-L01..L08 = 8/8 PASS`且歷史54案仍54/54；本門檻已於2026-09-01通過，receipt=`.ai-doc/qc/qc-dev-109-capa-2026-09-01.md`，只代表可交DEV-032。
CAPA關閉門檻是`CAPA-P01..P04 = 4/4 PASS`且Blocked／Not Run／Fail=0。DEV-032的generic release gate仍需通過，
但不重複計入CAPA分母。

### 34.8 正式環境改善與 release gate

唯一production入口仍是`DEV-032`與`https://jenfu-ai-pdm-prod.web.app`；不得另建旁路deploy。DEV-032負責clean source、
immutable artifact、migration inventory、backup／restore reference、activation、rollback與generic smoke。本CAPA只新增四個
問題特定gate：

1. **CAPA-P01 Exact dry-run／approval**：在正式DB read-only執行054 inventory與SLDASM reconcile dry-run，保存scope
   fingerprint、plan hash、分類count與exact row ledger；確認可還原backup。054 apply、Part回補與activation分別需要其
   對應的明確核准，不能由本文件推定。
2. **CAPA-P02 Reconcile apply／readback**：只對核准plan中仍一致的exact current target單向promotion；apply count＝
   audit count、rerun no-op、post-apply drift=0，schema／FK／canonical identity不變。dry-run為0時以NO_OP receipt通過，
   不為湊案例寫正式資料。
3. **CAPA-P03 Artifact activation／feature smoke**：沿用DEV-032驗證過的同一artifact；具BOM create／Part read權限的actor
   從BOM工作台正常「建立 BOM」入口進入`/bom/create`。Inactive candidate與activation後分別驗證authenticated exact
   search、`classify → create/open`資料結果、`assembly_file` reason、deterministic ordering contract、API／DB readback、
   console／pageerror／failed request／5xx=0及read-only drift=0。Production不得seed；
   A0044不存在時使用dry-run或current inventory中的等價既有row並記錄identity。全公司default top 5不以特定料號作硬性oracle。
4. **CAPA-P04 Scheduled effectiveness audit**：Release Capsule在activation時指定一次read-only audit的owner與日期；
   於該日期驗證eligible-but-not-assembly drift=0、wrong-Part=0、duplicate promotion audit／auto-BOM=0及candidate
   exact-search語意正確。若組織另有固定CAPA觀察期，引用該政策；否則不任意要求14日或3次自然事件。

#### 34.8.1 CAPA-P01 formal read-only execution（2026-09-01）

使用者授權續接後，DEV-032 的 production migration runner 以 private VPC／Cloud SQL proxy／IAM migration user
執行一次性 read-only Cloud Run execution；沒有 migration、DDL、DML、BOM writer 或 seed。完整收據：
`output/qa/dev-109-capa-production/2026-09-01T0315Z/p01-readonly.json`。

正式讀回結果如下：

- `pdm_schema_migrations` 目前只到 `052`；`053` 與 `054` 尚未套用，unified BOM 的新增欄位與 constraints 也不存在。
- SLDASM reconcile dry-run 的 `activePrimarySldasmEvidence=0`、`exactTargetCount=0`、ambiguous/cross-company/terminal
  均為 `0`，`scopeFingerprint` 與 `planHash` 均為
  `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`。這是合法的 no-target 結果，不得 seed。
- 正式 `A0044-P01` 讀回為 `Draft / single_part`；`A0044-M01` 為 `Draft / drawing_preparation`，current data layer
  為 `drawing_rd`，formal relation 雖存在但 active primary exact `.SLDASM` file rows 為 `0`。不得以使用者截圖或
  local fixture推定 production 已有可回補 target。

因此：P01 已完成 read-only observation 但不能標完整 PASS（054 schema 尚未 ready）；P02 僅為
`NO_OP_ELIGIBLE_NOT_APPLIED`，沒有正式資料 mutation；P03 因缺少本 CAPA 的 immutable artifact/inactive candidate
且沒有 production-equivalent active SLDASM row而未執行；P04 必須等待 P03 activation 後排程。這些正式 read-only
execution 不構成 migration 054 apply、deploy、activation 或 CAPA closure。

### 34.9 Rollback、停止條件與失敗回送

Application rollback與Cloud SQL restore沿用DEV-032。Part promotion是單向domain evidence，不因application rollback自動
降級；只有row在exact apply ledger、無後續mutation／BOM、row version與audit一致，且人工review確認原值確為錯誤時，
才可依before snapshot補償，否則保留assembly並進manual recovery。

任一條件成立即停止並回送RD／Release Owner：

- 任一caller仍以data layer／lifecycle作SLDASM結構證據的必要條件，或current revision／active file選擇不一致。
- candidate action不是Part authority、candidate GET產生write，或reason projection與固定語意不變量不一致。
- dry-run出現cross-company／multiple／不明target，scope／plan hash／count漂移或超出核准範圍。
- 需要filename／root猜Part、第二writer／queue／trigger，或production需要seed才能通過。
- backup／rollback target不明，apply／audit／rerun、FK／schema／identity、artifact provenance或feature smoke任一異常。

### 34.10 CAPA 關閉與責任

- `CAPA Local Corrected`：CAPA-L01～L08與歷史54案PASS；不代表正式環境已改善。
- `CAPA Production Corrected`：CAPA-P01～P03 PASS；正式資料、artifact與canonical feature smoke已驗證。
- `CAPA Effective / Closed`：再加CAPA-P04 PASS。若scheduled audit沒有可觀察自然事件，仍可用全量read-only invariant
  audit判定資料與候選correctness，但必須明載樣本限制，不得偽造事件。

Owner：RD負責RC-1～RC-3程式與runner；QA維護fixed cases；QC獨立readback與effectiveness判定；DEV-032 Release Owner
負責正式release gate；使用者／正式資料Owner核准live apply與activation。本文件不是正式操作授權。

ADR：`No new ADR required`。既有structure ADR已明定`.SLDASM`充分證據與exact Part authority；本CAPA只修正實作覆蓋、
資料轉換與驗證／release控制，沒有建立新的domain authority或外部決策。

Evidence落在`output/qa/dev-109-capa/<releaseId>/`或DEV-032 Release Capsule引用的位置，至少包含source／artifact identity、
dry-run plan、backup reference、apply／rerun、audit／FK、inactive candidate、activation、canonical smoke與scheduled
effectiveness receipt；不得存secret或完整credential。
