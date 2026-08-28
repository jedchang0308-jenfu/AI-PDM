# SPEC-PDM-APPROVAL-CANONICAL-REVIEW-WORKSPACE-001：審核套件快照與共用 Drawing／Part Renderer

Status：`Independent Local QA/QC Completion Candidate / Fixed QA 48 of 48 PASS / Human Release Sign-off and Production Release Gated`

Date：2026-08-26

DEV：`DEV-101` / `DEV-PDM-APPROVAL-CANONICAL-REVIEW-WORKSPACE-001`

Owner：Dev PM；RD readiness reviewer：RD 主管；QA authority：`.ai-doc/qa/qa-dev-101-approval-canonical-review-workspace-validation-plan-2026-08-26.md`

Amends：

- `.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`
- `.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`
- `.ai-doc/decisions/ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001-composer-and-policy.md`

Preserves：`DEV-070` inbox mechanics／exact return、`DEV-079／083` full-page workspace、`DEV-087` exact reviewer／decision／formalization authority、`DEV-090` Relation review retirement。

## 0. Authority、成熟度與執行限制

本文件是 DEV-101 Current Phase 的直接實作 authority。19項 Human Confirmed Decisions 已關閉，RD不需再詢問版面、矩陣、marker、比較方式或decision scope。若實作需要改變本文件的snapshot truth、request-level atomic decision、Relation退役、Part附件生命週期或零domain write邊界，必須停止並回到人類決策，不得由RD自行擴張。

2026-08-27因正常`/approvals`入口無法列出A0002-M01的pending canonical request，以及v2 package只保存
recognition meta、無法證明editor→review immutable parity，DEV-101依兩份CAPA重開。既有focused smoke只保留為
歷史direct-detail supporting evidence；現行RD矯正已補canonical inbox與full recognition projection，固定48案也已由獨立oracle runner完成local completion candidate；這仍不代表production ready。現況為：

- branch=`持續優化2`，assessment HEAD=`818db82a`；工作樹含大量既有未提交變更。
- canonical inbox adapter、正常v1／v2入口、v2 package、shared Drawing／Part renderer、full recognition projection／inner hash／owner fail-closed與immutable reviewer read已在目前工作樹邊界內形成；同source RD aggregate 11/11 PASS，manifest=`output/qa/dev-101-aggregate/DEV101-AGGREGATE-RD-2026-08-27T10-55-37-882Z/manifest.json`。target-file hash與touched ledger須保留，不得清理、覆寫或納入無關dirty changes。
- fixed registry `QA-101-001..048`已由data、normal-entry browser、disposable PostgreSQL與completion gate四個runner在同一parent/source完成48/48；最終同源run與child hash由`.ai-doc/qc/qc-dev-101-independent-qa-qc-closure-2026-08-27.md`索引。這是local automated completion candidate；primary／staging／production、actual runtime readback與release sign-off仍維持gated。
- schema migration、primary data repair、stage、commit、merge、PR、deploy與release未授權。
- 本期資料庫分類為`none`：使用既有immutable `pdm_work_review_requests.snapshot_payload` JSON／JSONB與`snapshot_hash`，不新增table／column／trigger，不backfill歷史request。

## 1. Human Decision Record（Closed）

1. Covered PDM request從`/approvals`直接進入canonical Drawing／Part review workspace；不維護approval-only domain detail body。
2. 完整資訊可達，審核者自行決定深度；不追蹤閱讀、不要求逐target／section確認、不增加風險gate。
3. edit／review共用domain section、view model、順序、preview與file位置；review唯讀，editor dock換成decision dock。
4. immutable submitted snapshot是decision truth；live只在drift comparison中出現。
5. 多目標採上方完整同根Drawing × Part矩陣，下方一次只mount一個active target完整workspace。
6. 矩陣只讀；不恢復Relation workbench／Relation review。
7. decision dock固定可操作，active target與瀏覽軌跡不改decision scope。
8. 只有Drawing／Part identity名稱可切target；relation cell不可點、不可編輯。
9. 矩陣保存送審當下完整同根資訊；submitted與context-only身份必須可區分。
10. `activeTarget`是URL state；合法值還原，失效值回request primary；risk不搶選取。
11. submitted／change／risk只用非文字、非color-only UI marker；文字統一由hover／focus／tap overlay揭露。
12. 只有live與snapshot不同時顯示drift marker；比較在同頁，snapshot永遠是truth。
13. decision dock沿用editor底部sticky空間位置，全頁只出現一組decision actions。
14. marker overlay hover／focus暫時、click／tap固定；同時一個，外點／Escape關閉並回復焦點。
15. 窄版保留矩陣自身水平pan、sticky axes與active-target auto-reveal；頁面不可水平overflow。
16. desktop比較為snapshot左／current右；窄版預設snapshot，以swipe或兩態控制切換，兩側證據身份可見。
17. decision是request-level package atomic；不建立per-target decision／partial publication。
18. comparison changed-first；unchanged預設收合但完整內容可達。
19. submitted／change／risk為固定順序獨立marker slots，可同時存在；不合成highest-severity glyph或共用整列背景。

## 2. RD 主管批判與架構裁定

方案在下列條件下足夠優雅：

- 共用單位是`domain renderer + normalized domain view model`，不是共用一個塞滿Drawing／Part／approval條件的巨型component。
- `ReviewPackageWorkspace`只擁有request context、矩陣、target selection、drift compare與decision；Drawing／Part內容與排序仍由各自domain renderer擁有。
- editor mutation authority、review snapshot read authority、approval decision authority保持三條清楚邊界；UI共用不得變成權限共用。
- review不從live master補缺欄位。無法從送審快照取得的資料只能顯示明確unavailable，不可冒充送審事實。
- matrix是導航與scope map，不是第三個domain editor，也不是per-target approval controller。

若只在審核頁複製editor JSX、直接掛整個owner page、或把完整snapshot與formalization drift共用同一hash，方案皆判定不夠優雅且不可合併。

## 3. Repository Fact Baseline 與差距分類

| 現況事實 | 差距 | 分類／處置 |
|---|---|---|
| `/api/approvals/inbox`只合併`approval_platform_requests`與五種legacy來源，未讀`pdm_work_review_requests` | canonical state已是`review_owner`且request=`pending`，exact reviewer仍看到0筆；正常入口不可發現 | `CAPA Gap`：新增actor-scoped canonical PDM inbox adapter；v1／v2都必須列出，direct URL不得替代 |
| `/approvals/[requestId]`先由`ApprovalRequestWorkspace`辨識PDM，再mount`CanonicalChangeWorkspace` | canonical request目前會GET兩次；且只依單一`entityType`選workspace | `Gap`：PDM首次GET需成為package shell initial DTO，不得二次抓同request |
| review GET只回單一`entityId/payload/identity/files/attachments` | 無同根矩陣、target manifest、package hash、submitted time、完整target snapshots | `Gap`：新增v2 package envelope與shell／target read contract |
| Drawing identity／files、Part identity／attachments由review GET即時query | live facts混入review，無法證明送審當下內容 | `Conflict`：v2全部改讀snapshot；live只進comparison |
| `snapshot_hash`目前同時是request snapshot與核准時work drift hash | 擴大snapshot後會使current work永遠無法與package hash相等 | `Gap`：拆成column package hash與envelope內`decisionBasis.hash` |
| `snapshot_payload`是immutable TEXT／JSONB，DB trigger禁止request scope／snapshot變更 | 可保存versioned envelope | `Compatible preservation`：schema=`none` |
| Drawing／Part submit writer只建立single-target narrow payload | 不含完整root context與shared renderer view model | `Gap`：transaction內建立v2 package；現行primary target仍為唯一submitted target |
| 現行production command沒有多target submit writer | 不可假造多target business scope | `Bounded compatibility`：contract與UI支援多submitted target；本期既有writers產生1 submitted + N context targets |
| `RelationMatrixTable`已有identity button與readonly cells | 缺activeTarget、三marker slots、overlay semantics | `Additive reuse`：擴充presentation props；cell mutation path保持只在DEV-090 owner edit使用 |
| Part attachments可獨立即時增刪，且DEV-087 review顯示live list＋常駐note | 與snapshot truth及quiet UI衝突 | `Intentional replacement`：v2保存送審manifest；附件仍不鎖、不納入decision basis，變更只顯示drift |
| PDM decision POST已是exact reviewer、request-level且只接受`approve|return_for_correction` | 與package atomic相容 | `Compatible preservation`：不新增per-target route或decision row |
| Relation current review已由DEV-090退役 | matrix易被誤作Relation review入口 | `Preserve retirement`：Relation request仍fail closed；cell永遠不成為decision target |

## 4. End-state Architecture

```text
/approvals list (DEV-070)
  └─ /approvals/[requestId]?returnTo=...&activeTarget=type:id
      └─ ApprovalRequestWorkspace
          ├─ generic approval fallback (unchanged, only when PDM GET = 404)
          └─ CanonicalReviewPackageWorkspace
              ├─ ReviewPackageHeader
              ├─ ReviewTargetRelationMatrix
              │   └─ RelationMatrixTable(readonly navigation presentation)
              ├─ ActiveTargetWorkspace
              │   ├─ CanonicalDrawingWorkspaceContent(surface=review)
              │   └─ CanonicalPartWorkspaceContent(surface=review)
              ├─ SnapshotDriftCompare
              └─ ReviewDecisionDock

Drawing editor ─┐
                ├─ CanonicalDrawingWorkspaceContent
Drawing review ─┘

Part editor ────┐
                ├─ CanonicalPartWorkspaceContent
Part review ────┘
```

責任不變量：

- package shell不得知道Drawing／Part欄位；只依discriminated `workspace.kind`選domain renderer。
- domain renderer不得POST decision或解讀review assignment。
- decision dock不得讀active target決定scope。
- editor wrapper負責live fetch／mutation；review wrapper只接收snapshot view model與readonly capabilities。
- generic approval案件保留現有approval platform body，本DEV只涵蓋`pdm_work_review_requests` Drawing／Part descriptor。

## 5. Versioned Review Package Contract

### 5.1 Exact persisted envelope

新增`src/lib/pdm-review-package-contract.ts`，不得以`Record<string, unknown>`作為v2 domain boundary：

```ts
export const PDM_REVIEW_PACKAGE_V2 = "pdm-review-package-v2" as const;
export type ReviewEntityType = "drawing" | "part";
export type ReviewTargetKey = `${ReviewEntityType}:${string}`;
export type ReviewScope = "submitted" | "context_only";

export type ReviewFileEvidence = {
  assetId: string;
  bindingId: string;
  displayName: string;
  role: string | null;
  mimeType: string | null;
  fileSize: number | null;
  contentHash: string | null;
  ordinal: number;
};

export type ReviewTargetMarkerFacts = {
  submitted: boolean;
  change: null | { kind: "field" | "file" | "lifecycle"; paths: string[] };
  risk: null | { level: "attention" | "high"; codes: string[] };
};

export type ReviewPreviewEvidence = {
  slot: "drawing_2d" | "drawing_3d" | "part";
  sourceFileAssetId: string;
  sourceBindingId: string;
  sourceContentHash: string | null;
  fileName: string;
  mimeType: string | null;
};

export const DRAWING_RECOGNITION_REVIEW_PROJECTION_SCHEMA =
  "pdm-recognition-review-projection-v1" as const;

export type CanonicalDetailRecognitionProjection = null | {
  schemaVersion: typeof DRAWING_RECOGNITION_REVIEW_PROJECTION_SCHEMA;
  session: {
    id: string;
    sourceContextType: string;
    sourceContextId: string;
    drawingId: string | null;
    drawingRevisionId: string | null;
    sourceSetFingerprint: string;
    status: string;
    rowVersion: number;
    warningCount: number;
    conflictCount: number;
    unclassifiedCount: number;
    createdAt: string;
    updatedAt: string;
    formalizedAt: string | null;
  };
  sources: CanonicalRecognitionSource[];
  candidateDecisions: CanonicalRecognitionCandidateDecision[];
  fields: Array<CanonicalRecognitionField & {
    scopes: CanonicalRecognitionScope[];
    ownerResolution: "not_required" | "resolved" | "unresolved" | "ambiguous";
    effectiveOwnerId: string | null;
    blockingReason: null | "part_owner_required" | "part_owner_ambiguous";
  }>;
  projectionHash: string;
};

export type ReviewTargetWorkspaceSnapshot =
  | {
      kind: "drawing";
      entityId: string;
      revisionId: string | null;
      identity: { code: string; name: string | null; revision: string | null };
      payload: DrawingRevisionWorkPayload;
      fields: CanonicalDetailField[];
      recognition: CanonicalDetailRecognitionProjection;
      history: CanonicalDrawingHistory[];
      files: ReviewFileEvidence[];
      previewSources: ReviewPreviewEvidence[];
    }
  | {
      kind: "part";
      entityId: string;
      identity: { code: string; name: string | null; revision: string | null };
      payload: PartChangePayload;
      fields: CanonicalDetailField[];
      recognition: CanonicalDetailRecognitionProjection;
      bomContext: CanonicalPartBomContext;
      attachments: ReviewFileEvidence[];
      previewSources: ReviewPreviewEvidence[];
    };

export type ReviewPackageTarget = {
  targetKey: ReviewTargetKey;
  axisId: string;
  scope: ReviewScope;
  markers: ReviewTargetMarkerFacts;
  evidenceHash: string;
  workspace: ReviewTargetWorkspaceSnapshot;
};

export type PdmReviewPackageV2 = {
  schemaVersion: typeof PDM_REVIEW_PACKAGE_V2;
  submittedAt: string;
  requestKind: "drawing_revision" | "drawing_rd_void" | "part_change";
  primaryTargetKey: ReviewTargetKey;
  decisionBasis: {
    version: 1;
    kind: "drawing_revision_work" | "drawing_rd_void" | "part_change_work";
    hash: string;
    payload: unknown;
  };
  root: { id: string; code: string };
  matrix: {
    evidenceHash: string;
    drawings: Array<{ axisId: string; targetKey: `drawing:${string}`; code: string; revision: string | null }>;
    parts: Array<{ axisId: string; targetKey: `part:${string}`; code: string; revision: string | null }>;
    cells: CanonicalRelationMatrixCell[];
  };
  targets: ReviewPackageTarget[];
};
```

`DrawingRevisionWorkPayload`需由`drawing-revision-work-payload.ts`新增export，型別為JSON-safe domain payload加required normalized `DrawingChangeImpact`；它不得把branch／company／actor／reviewer等system fields重新納入。`targets`、axes、cells、fields、files與marker paths在hash前使用固定排序；同一`targetKey`、axis pair或file binding重複時builder fail closed。`primaryTargetKey`必須存在且`scope=submitted`。每個matrix identity必須恰有一個target；無法映射canonical Drawing的axis不得靜默省略。

Persisted workspace snapshot是evidence model，不是現行detail DTO：它不保存`downloadHref`、preview media href、signed URL、surface、capability或relationMatrix複本。Target API通過request membership後，才把evidence model hydrate成供shared renderer使用的`CanonicalDrawingWorkspaceViewModel | CanonicalPartWorkspaceViewModel`，並建立request-scoped read href。這個runtime view model不可再寫回snapshot或參與package hash。

### 5.2 Hash semantics

三種hash不得混用：

1. `pdm_work_review_requests.snapshot_hash`：`SHA-256(canonicalJson(full v2 envelope))`，證明整份submitted package未被變造；GET、target read與decision鎖定後都先重算，失敗=`WORKBENCH_REVIEW_PACKAGE_INTEGRITY_FAILED` 409。
2. `decisionBasis.hash`：沿用現有Drawing／Part primary mutable work的狹義payload算法；approve時只以它重驗formalization input。context-only資料、Part附件、preview derivative與live relation drift不得讓核准誤判成primary work drift。
3. `target.evidenceHash`／`matrix.evidenceHash`：只供live drift判斷；包含穩定domain facts、file IDs／content hashes與relation facts，排除download URL、signed URL、contract token、polling status、heartbeat、correlation ID與render time。
4. `recognition.projectionHash`：`SHA-256(canonicalJson(recognition body excluding projectionHash))`，獨立證明exact session、sources、candidate decisions、observations、fields/scopes與owner resolution未被局部替換。驗證順序固定為inner recognition hash → target evidence hash → outer package hash；即使mutant重算target與outer hash，錯誤inner hash仍須fail closed。

Drawing v1既有兩種sanitized／raw hash相容只存在legacy parser。新v2 writer只能產生canonical sanitized `decisionBasis.payload`。Part同理。`drawing_rd_void`的basis固定為exact branch、latest approved revision ID／revision、canonical drawing ID；approve前必須重驗仍是同一idle open branch target。

### 5.3 Snapshot completeness 與 derivative rule

- snapshot保存所有同根Drawing／Part的identity、revision、domain fields、recognized read model、history、BOM context、file／attachment manifest、preview source identity／content hash及relation matrix。
- Drawing recognition只可按`company + drawingId + drawingRevisionId + source_context_type=drawing_revision + source_context_id=exact revisionId`取得送審當下exact session；不得按Drawing code或updated time抓latest。projection保存session、sources、candidate decisions、observations、canonical fields/scopes、ownerResolution、effectiveOwnerId、blockingReason與projectionHash，所有timestamp在hash前正規化為ISO字串，確保SQLite TEXT與PostgreSQL JSONB round-trip一致。
- editor owner API與review package builder共用`projectDrawingRecognitionReviewFields`；UI不得從raw candidate members自行重算第一層owner validity。reviewer只渲染package projection，不輪詢、不呼latest／session GET補主畫面。後續新session只可進明確comparison，不得改變decision truth。
- submitted Drawing若只有legacy recognition meta，或任一非空Part-domain field為`unresolved／ambiguous`，approve須分別以`WORKBENCH_RECOGNITION_BASIS_INCOMPLETE`／`WORKBENCH_RECOGNITION_OWNER_UNRESOLVED` fail closed且zero formal effect；`return_for_correction`仍可用。v1不backfill、不live-fill、不假裝完整v2 recognition basis。
- 不保存signed URL或storage secret。API回傳時以active request、exact reviewer、company、target membership與asset/hash重新產生read href。
- preview derivative是同一immutable source的presentation，不是新的decision fact。送審時若尚未ready，review可沿用既有polling；只有derivative source content hash等於snapshot source hash才能顯示。
- Part附件仍可由owner獨立維護，且不進`decisionBasis`。v2 review顯示送審時manifest；live新增／刪除／改名只造成drift。既有常駐文字`附件獨立維護，不屬於本次資料核准`在v2 review移除，scope語意由snapshot marker／overlay與comparison表達。
- 若snapshot asset稍後soft-delete，`review_package`file context可在active request內依exact asset ID＋binding ID＋content hash讀取；不得只因current `deleted_at`排除。若實體object不存在，顯示局部unavailable與重試，不可用current replacement冒充。

### 5.4 Size and complexity guard

builder hard limits固定為：總targets `<=200`、matrix cells `<=2,500`、canonical JSON UTF-8 `<=8 MiB`。任一超限時在建立request前回`REVIEW_PACKAGE_LIMIT_EXCEEDED` 422，transaction zero request／zero state transition。不得截斷、分頁後宣稱完整或改用live lazy fill。

## 6. Submit、Read 與 Decision Algorithm

### 6.1 V2 submit transaction

Drawing revision、Drawing RD void與Part change的既有submit transaction在鎖定primary work／branch並通過row-version後：

1. 建立狹義`decisionBasis.payload/hash`。
2. 由primary canonical entity解析exact same-company root；root缺失或不一致即409，不能建立single-target降級package。
3. 以batch query讀完整matrix axes／cells，固定natural code＋stable ID排序。
4. 對每個axis建立同一domain view-model projector的snapshot；primary target使用proposed work，其他target使用送審transaction讀到的current canonical state。
5. 以batch zero-write reader讀每個Drawing target的exact revision recognition projection，先計inner projection hash，再納入target與outer package hash；無exact session時保存`null`，不得以latest補值。
6. 標記primary為submitted；本期既有writer不自動把相關context升成submitted。contract允許未來同一transaction提供多個submitted targets，但本DEV不新增multi-target authoring command。
7. 計算target／matrix evidence hashes、套用size guard、canonicalize envelope並計算package hash。
8. 使用既有`PdmWorkReviewAsyncRepository.create`原子寫入request，才切換existing workbench handling／revision state。

任何target投影、file membership、matrix、hash或size失敗時全transaction rollback。不得先建立request再背景補snapshot。

### 6.2 Legacy v1 compatibility and rollout

- parser為discriminated dual read：只有`schemaVersion=pdm-review-package-v2`走新shell；既有narrow payload走legacy v1 adapter。
- 不從live data回填v1成假v2，不backfill pending request，不變更其`snapshot_hash`。
- 新writer由default-off `PDM_REVIEW_PACKAGE_V2_WRITE`控制；reader與v2 decision support不受kill switch關閉，確保已建立v2 request仍可處理。
- flag off：新submit維持v1；v2 pending仍可讀／決策。flag on：新submit只產v2；v1 pending走現行single-target相容面。
- production final convergence前需`pending_v1=0`；若非0，必須自然完成或由owner/reviewer正常return/resubmit，不得自動轉換、核准或刪除。

### 6.3 Decision transaction

`POST /api/pdm/review-requests/[requestId]/decisions`保持唯一writer與exact body：

```ts
type Body = { decision: "approve" | "return_for_correction"; expectedRowVersion: number; contractToken: string };
```

v2流程先在locked request重驗package hash。`return_for_correction`保持request-level原子return，不要求current drift／file可用。`approve`再重算primary `decisionBasis.hash`與existing lifecycle guard；不相等才回`WORKBENCH_SNAPSHOT_DRIFT`。activeTarget、target load、marker pin、compare pane、scroll與已讀狀態一律不進request body、idempotency hash、trace或formalization input。

## 7. API and Wire Contract

### 7.1 Existing shell endpoint（replace PDM response only）

`GET /api/pdm/review-requests/[requestId]`

```ts
type ReviewPackageShellDto = {
  data: {
    requestId: string;
    requestKind: PdmReviewPackageV2["requestKind"];
    schemaVersion: "pdm-review-package-v2" | "legacy-v1";
    submittedAt: string | null;
    packageHash: string;
    rowVersion: number;
    primaryTargetKey: ReviewTargetKey;
    root: { id: string; code: string } | null;
    matrix: PdmReviewPackageV2["matrix"] | null;
    targets: Array<{
      targetKey: ReviewTargetKey;
      entityType: ReviewEntityType;
      entityId: string;
      code: string;
      revision: string | null;
      scope: ReviewScope;
      markers: ReviewTargetMarkerFacts;
    }>;
    actions: Array<{ key: "approve" | "return_for_correction"; label: string }>;
    interaction: DrawingRevisionInteraction | null;
  };
  meta: { contractToken: string; correlationId: string };
};
```

v2 shell只由snapshot JSON投影，不query live identity／file／matrix。非assigned reviewer、cross-company、缺`decide`、terminal或relation request均404且不洩漏target facts。GET為`private, no-store`。

### 7.2 Active target endpoint

`GET /api/pdm/review-requests/[requestId]/targets/[entityType]/[entityId]`

- path必須恰好對應package target membership；不接受client只傳`targetKey`後任意查master。
- response=`{ snapshot, drift: { exists, changedSections, currentEvidenceHash }, meta }`。
- `snapshot`完全由package取出；live query只用於重算目前stable evidence hash／changed section keys，不回填snapshot。
- context-only target也能載入完整snapshot，但scope仍不可變。

### 7.3 Lazy comparison endpoint

`GET /api/pdm/review-requests/[requestId]/targets/[entityType]/[entityId]/comparison`

- 只有active request exact reviewer可呼叫。
- drift不存在時回200 `{ drift:false, current:null, changedSections:[] }`，避免target load與click間race被誤報錯誤。
- drift存在時回snapshot provenance、current captured time、完整current domain view model與stable semantic diff；changed section排序先於unchanged，但兩側完整內容可達。
- current response不得含mutation contract token、owner-only actions或attachment management capability。

### 7.4 File read contract

`src/lib/pdm-file-read-contract.ts`新增`review_package`context；`GET /api/pdm/file-assets/[fileAssetId]`必須驗：request pending／applying可讀、exact reviewer、same company、target membership、asset＋binding＋content hash存在於v2 snapshot。任一不符404；不得以一般view permission或client role代替package membership。

## 8. UI Entry Contract

### 8.1 Actor、入口與成功結果

- actor：被指派且具`numbering.approvals` decision capability的reviewer。
- normal entry：`/approvals`既有row → server-owned `/approvals/[requestId]`。
- primary object：一份immutable submitted package；active target只是單一檢視焦點。
- success：reviewer以和editor相同的資訊位置理解Drawing與Part，必要時比較current，最後對整包核准或退回。

### 8.2 URL state

canonical syntax=`activeTarget=drawing:<canonicalDrawingId>|part:<partNumberId>`，URL encode後傳遞。shell載入後：

1. 合法membership值優先。
2. 缺值／錯型／不存在／cross-request值回`primaryTargetKey`，並以`router.replace`正規化，不新增Back history。
3. identity click使用`router.push`或等價history update，保留`returnTo`及其他合法query；Back／Forward重新選取而不重建request。
4. target切換只卸載／載入domain content，不卸載matrix、decision dock或package context；快速切換需取消或忽略stale response。

Next 16.3邊界：`page.tsx`的`params/searchParams`皆視為Promise；互動URL state保留在Suspense內client component，route handlers使用awaited params。不得沿用Next 14同步假設。

### 8.3 Matrix and marker behavior

- matrix視覺資料只來自snapshot；不顯示live relation。
- identity名稱是button；relation cell為readonly text／glyph，無`onClick`、tab stop、menu或edit state。
- identity每列固定順序三個marker slots：submitted、change、risk。slot保留layout軌道但absent時不畫裝飾placeholder。
- marker不得含常駐`送審／變更／風險`文字；形狀／輪廓／pattern＋accessible name區分，移除色彩仍能辨識。
- selected target用另一獨立channel（例如inset outline＋`aria-current`），不得借用marker或row background。
- marker button與identity button是分離hit targets。hover／focus開transient overlay，click／tap pin；一次一個，outside／Escape關閉，focus回trigger。
- overlay文字只命名當前marker事實，不放流程教學或常駐legend。

### 8.4 Active workspace parity

- Drawing edit／review必須render同一`CanonicalDrawingWorkspaceContent`；Part同理。靜態source scan與rendered DOM section-order evidence都要成立，視覺仿製不算共用。
- review capabilities固定`canMutateContent=false`、`canManageAttachments=false`、`canSubmit=false`、`canCancel=false`；preview／download按snapshot membership可用。
- editor action dock與review decision dock使用`PdmEditPageFrame`同一actionDock slot／CSS geometry；review頁header、content或aside不得再放第二組decision。
- normal熟悉流程不顯示目的說明、操作教學、成功卡或Part附件scope常駐note。

### 8.5 Drift compare

- target read回`drift.exists=true`才在active-target header顯示無常駐文字的drift marker；marker仍有accessible name。
- desktop `>=768px`：snapshot左、current右；兩pane均有持續可見的證據身份名稱。
- narrow `<768px`：同一comparison region水平切換，預設snapshot；提供可click／keyboard的二態control，swipe只是補充。手勢只在comparison region，不能攔matrix pan或browser back。
- changed section先展開；unchanged section收合但可展開。關閉後保留active target、原workspace scroll anchor與matrix位置。

### 8.6 Viewport、scroll and decision dock

- target viewport：1440×900、1024×768、768×1024、390×844與200% zoom。
- matrix有唯一自身horizontal scroll owner、sticky first row／column；選取offscreen identity時以`scrollIntoView({block:"nearest", inline:"nearest"})`或等價方式auto-reveal。
- document body無horizontal overflow；matrix pan與workspace vertical scroll不形成未標示雙scroll。
- sticky decision dock保留safe-area／content bottom padding，不能遮最後一欄、overlay、focused control或mobile browser chrome。

## 9. Permission、Security、Failure and Recovery

| 狀態 | 可見／可做 | Server result |
|---|---|---|
| exact assigned reviewer、pending v2 | shell、snapshot targets、comparison、合法decision | 200 |
| reviewer非assigned、cross-company、缺decide | 不hydrate任何package facts | 404 |
| terminal／另一tab已完成 | 回清單並可重新整理 | 409 stale或404；無第二trace/effect |
| package hash mismatch／parser invalid | 顯示單一完整性錯誤；不以live補畫 | 409，decision zero effect |
| target不屬package | 保留shell，回primary target | target API 404 |
| live drift | snapshot仍可讀，drift marker可比較 | 不自動disable decision；existing drawing lifecycle stale guard除外 |
| snapshot file unavailable | 該file局部unavailable／retry | decision dock不因閱讀／file gate失效；不可替換成current asset |
| target fetch error | matrix／dock保留，target區可retry | 不整頁reload、不丟activeTarget |

mutation security不得只靠hidden buttons。Authenticated browser network ledger除decision POST與read GET外，不得出現Drawing／Part PATCH、file upload/delete、attachment manage、relation matrix PATCH、recognition mutation或owner submit/cancel。

## 10. Query、Performance and Concurrency Budget

- `PdmReviewPackageBuilder.buildV2`：在primary work已鎖後，review package資料SQL `<=18`，與target數量無關；axis、files、history、recognition、preview source必須batch load，禁止per-target N+1。
- shell service：1次request row read；snapshot投影0 live domain query。actor／contract-token queries另記帳但不可隨target數增加。
- active target drift：單target live projector `<=14` domain queries；不得讀其他199 targets。
- comparison：重用同一single-target projector，`<=14`；同一次HTTP不得先做target drift再完整重做兩次。
- UI只mount active target與必要preview；matrix可以virtualize body，但sticky axes、screen-reader table semantics與identity buttons不得消失。
- decision在existing request row lock內重驗package／basis。PostgreSQL與SQLite provider結果一致；不新增background apply或outbox。

## 11. Exact Product File Plan

### 11.1 Add

- `src/lib/pdm-review-package-contract.ts`：v2 types、strict parser、canonical sort/hash、v1 discriminator。
- `src/lib/repositories/pdm-review-package-async-repository.ts`：batch snapshot builder與current single-target projector。
- `src/lib/pdm-review-package.ts`：shell／target／comparison application service、authorization-neutral domain errors。
- `src/lib/drawing-recognition-review-projection.ts`：owner editor與review package共用的versioned recognition DTO、canonical field/scopes projector與owner resolution truth。
- `src/lib/drawing-recognition-review-snapshot.ts`：server-only、provider-neutral、batch、zero-write exact revision recognition reader與inner projection hash。
- `src/components/canonical-review-package-workspace.tsx`：package orchestration、URL selection、target loading、compare與dock composition。
- `src/components/canonical-drawing-workspace-content.tsx`：Drawing shared domain renderer；不fetch、不decision。
- `src/components/canonical-part-workspace-content.tsx`：Part shared domain renderer；不fetch、不decision。
- `src/components/review-target-relation-matrix.tsx`：snapshot navigation＋marker slots／overlay adapter。
- `src/components/review-snapshot-compare.tsx`：desktop／narrow complete-pane compare。
- `src/components/review-decision-dock.tsx`：request-level actions only。
- `src/app/api/pdm/review-requests/[requestId]/targets/[entityType]/[entityId]/route.ts`。
- `src/app/api/pdm/review-requests/[requestId]/targets/[entityType]/[entityId]/comparison/route.ts`。
- QA scripts listed in QA plan §5。

### 11.2 Modify

- `src/lib/repositories/pdm-work-review-async-repository.ts`：retain raw snapshot、v2 typed read helper；physical columns不變。
- `src/lib/drawing-revision-work-payload.ts`：export JSON-safe `DrawingRevisionWorkPayload`與normalized parser contract；既有retired／system field deny保持。
- `src/lib/drawing-revision-work.ts`：v2 package builder submit、v2 decision basis validation；existing lifecycle／idempotency不變。
- `src/lib/part-change-work.ts`：同上；attachment仍非formalization input。
- `src/app/api/pdm/review-requests/[requestId]/route.ts`：改為shell DTO；移除v2 live identity／file／attachment queries。
- `src/components/approval-request-workspace.tsx`：首次PDM response直接傳給package shell，避免double fetch；generic fallback不變。
- `src/lib/repositories/approval-platform-async-repository.ts`：新增`pdm_work_review` inbox source與單次batch projection；在source內先依company、exact `reviewer_user_id`、actionable status與query過濾再limit，v1／v2使用同一row contract。不得把`applying`映射成reviewer待辦。
- `src/lib/pdm-approval-owner-route.ts`：辨識canonical PDM review action codes，server-owned href固定進`/approvals/[requestId]`。
- `src/app/approvals/page.tsx`：只補canonical action filter label與direct full-page row navigation；不建立第二套PDM decision drawer或domain detail body。
- `src/components/canonical-drawing-change-workspace.tsx`：保留editor／legacy wrapper，domain JSX移入shared content。
- `src/components/drawing-recognition-workspace-panel.tsx`：同一panel接受live owner API或immutable snapshot projection；snapshot mode停用ensure、polling與所有recognition network mutation。
- `src/app/api/numbering/recognition-sessions/[sessionId]/route.ts`：owner API回傳同一server-projected`reviewFields`，禁止client另算owner validity。
- `src/components/canonical-change-workspace.tsx`：收斂為Part editor／legacy wrapper，domain JSX移入shared content；移除v2 live attachment note。
- `src/components/relation-matrix-table.tsx`：additive active identity／marker presentation hooks；owner edit props與cell semantics regression必須不變。
- `src/components/pdm-edit-page-frame.tsx`：只在需要時加shared shell slot／geometry，不加入domain／approval condition。
- `src/lib/pdm-review-navigation.ts`：activeTarget strict parse／membership normalize與returnTo preservation。
- `src/lib/pdm-file-read-contract.ts`、`src/app/api/pdm/file-assets/[fileAssetId]/route.ts`：`review_package`exact snapshot membership read。
- `src/app/globals.css`：matrix、markers、overlay、compare、sticky dock、RWD／high-contrast／reduced-motion；不得靠文字label修補。
- `package.json`：新增DEV-101 fixed commands。

### 11.3 Delete／retire

- 不刪generic approval workspace。
- covered v2 PDM不得再render `CanonicalChangeWorkspace(reviewRequestId)`的單目標live response或Part live attachment note。
- `ApprovalRequestWorkspace`不得為covered v2 PDM維護approval-only domain cards／decision controls。
- 不新增或恢復Relation review service、route、workspace、decision caller。

### 11.4 No-touch unless a proved blocker reopens contract

- `db/schema.sql`、`db/postgres/*.sql`、`src/lib/db.ts`。
- generic `approval_platform_*` decision／apply handlers；`approval-platform-async-repository.ts`的inbox read composition已由CAPA證明是必要modify target，但不得改generic decision語意。
- `drawing_part_links` formal writer與DEV-090 matrix PATCH authority。
- permanent `pdm_review_traces` retention shape。

任一no-touch檔若需改動，RD須停止，記錄原因與migration／spec impact，再由PM重新審核；不可邊做邊擴張。

## 12. Acceptance Criteria

- `AC-01` Covered v2 PDM只有full-page package review path；generic approval不受影響。
- `AC-02` edit／review共用Drawing與Part domain renderer及section order，差異只在source／capability／dock。
- `AC-03` snapshot package完整保存同根matrix與每個identity完整target view model；不讀live補缺。
- `AC-04` package hash、decision basis hash與evidence hash分責，approve仍正確防primary work drift。
- `AC-05` matrix只有identity可切target；submitted／change／risk三slot可同時辨識且無常駐文字、非color-only。
- `AC-06` activeTarget URL可share、reload、Back／Forward；失效值安全回primary。
- `AC-07` snapshot／current只在drift時同頁比較，desktop／narrow均可完成且完整內容可達。
- `AC-08` Part附件顯示submitted manifest；live變更只形成drift，仍不鎖、不進decision basis。
- `AC-09` decision dock只有一組、固定可達且request-level atomic；active target與閱讀狀態不改scope。
- `AC-10` review surface對domain mutation為零；server assignment／company／membership／file scope fail closed。
- `AC-11` matrix、compare、overlay、focus與dock在目標viewport／200% zoom無遮擋、頁面overflow或手勢衝突。
- `AC-12` v1 dual read、v2 writer kill switch、zero-v1 convergence與no-schema rollback可操作。
- `AC-13` query／payload caps、provider transaction、idempotency與isolated invariants通過固定QA分母。
- `AC-14` exact reviewer從正常`/approvals`可發現所有assigned actionable canonical PDM v1／v2 request；summary count、搜尋／篩選／cursor與rendered rows一致，點列直接進full-page review並可exact return。direct URL可用但不能作入口驗收替代。
- `AC-15` v2 Drawing package保存exact、versioned、inner-hashed full recognition projection；unresolved／ambiguous owner與legacy incomplete basis在approve前fail closed，return仍可用。
- `AC-16` owner editor API、submit package與review renderer共用同一canonical recognition projector／panel；review zero live recognition access，較新的不同revision／lineage session不得改變snapshot或decision basis。

## 13. Verification Integrity Matrix

| Claim | UI evidence | API／contract evidence | Raw state evidence | Independent oracle／mutant |
|---|---|---|---|---|
| snapshot是truth | snapshot identity、files、matrix、compare標示 | target DTO與package hash | request JSON/hash readback | live-field leak mutant必FAIL |
| renderer真正共用 | edit／review DOM section順序 | discriminated VM types | source import graph | duplicated JSX mutant必FAIL |
| target不改decision scope | 切換後dock不變 | POST無target字段 | single request／trace／formalization | target-key injected POST必FAIL |
| Part附件例外正確 | submitted list＋drift，無常駐note | comparison current list | attachment mutate、basis hash不變 | live-list-as-snapshot mutant必FAIL |
| zero mutation | review UI無write controls | network只read＋decision | work／file／relation before=after | hidden-button-only mutant必FAIL |
| accessibility／RWD | keyboard、AT、viewport PNG | semantic DOM／aria snapshot | geometry／overflow ledger | color／hover-only CSS mutant必FAIL |
| canonical request可發現 | 從`/approvals`看見row、正確count並點入full page | actor-scoped inbox DTO與server href | pending request／reviewer／canonical state一致 | 移除PDM inbox adapter但保留direct page時aggregate必FAIL |

SUT輸出的`drift`、markers、scope或PASS summary不得直接作QC expected；oracle從primitive snapshot JSON、current raw rows、request membership與network methods獨立計算。

## 14. Rollout、Rollback and Release Gate

1. `101-A` contract/parser/projector與QA runners。
2. `101-B` v2 writer＋hash split＋repository tests，flag預設off。
3. `101-C` shared Drawing／Part renderers與package shell。
4. `101-D` matrix markers／URL／compare／file read。
5. `101-E` canonical PDM inbox adapter、normal submit→list→page→return journey、disposable PostgreSQL、authenticated browser與affected regression。
6. `101-F` local handoff；production activation另行授權。

Rollback：關閉`PDM_REVIEW_PACKAGE_V2_WRITE`只停止新v2 request；不可關閉v2 reader／decision。程式rollback前必須確認`pending_v2=0`，否則保留reader compatibility。由於schema=`none`，無DDL rollback；snapshot JSON不得改寫成v1。

Production release minimum：fixed QA 48/48、P0/P1=0、independent QC、provider parity、build/source provenance、`pending_v1=0` convergence plan、flag activation／rollback rehearsal與release authorization。Local RD PASS不得推論production ready。

## 15. Stop Conditions

出現任一項立即停止實作並回報：

- 無法在同一submit transaction建立完整snapshot，必須背景補資料。
- 需要schema／migration／backfill或永久保留完整review package。
- 任一context target只能靠review時live query才能補齊送審欄位。
- 需要新增multi-target authoring、per-target decision、Relation review或改decision semantics。
- Part附件必須實體複製／鎖定才能符合storage provider，而不再只是snapshot manifest read。
- shared renderer必須吸收Drawing／Part domain branching或使owner editor regression不可隔離。
- package hard limits會阻擋現有正式root，且無可接受的batch／size方案。
- target files與當前dirty work發生無法安全合併的重疊。
- canonical inbox adapter需要新增schema／backfill，或必須把`applying`／`apply_failed`重新定義為reviewer可決策狀態。

## 16. Readiness Result

P0產品決策缺口=`0`。2026-08-27兩份CAPA所屬DEV-101矯正切片已完成：canonical inbox adapter與正常v1／v2入口、full versioned recognition projection／inner hash、shared owner-review projection、latest-session isolation及approve fail-closed均已落地。固定`QA-101-001..048`的independent local completion candidate為48/48 PASS；結論：`Local Corrective Implementation and Automated Effectiveness Candidate Complete / Production Release Gated`。DEV-079另有SQLite／PostgreSQL invariant證據，但primary reconciliation尚未apply；本結論不構成production ready或release授權。
