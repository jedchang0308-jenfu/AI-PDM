# SPEC-PDM-WORKBENCH-PREVIEW-GALLERY-001：圖號／料號預覽圖模式

Status: `Phase 1 Drawing RD Implemented / Phase 2 Part RD Implemented Locally / SQLite + Browser QA Passed / PostgreSQL Shadow Blocked / Capability Default Off / Production Release Gated`
Date: 2026-08-11
Last updated: 2026-08-24
Owner: Dev PM
Related DEV: `DEV-065`
Source ID: `DEV-PDM-WORKBENCH-PREVIEW-GALLERY-001`
Related QA: `.ai-doc/qa/qa-dev-065-workbench-preview-gallery-validation-plan-2026-08-11.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-PART-PREVIEW-AUTHORITY-001-part-setting-and-shared-projection.md`
Current architecture authority: `.ai-doc/specs/SPEC-PDM-STATUS-DATA-REBUILD-001-canonical-workbench-state-and-branching.md`
Historical related authority: `.ai-doc/specs/SPEC-PDM-WORKBENCH-CORE-001-shared-read-and-controller-contract.md`; `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-AGGREGATE-001-single-data-layer.md`; `.ai-doc/specs/SPEC-PDM-FILE-OWNERSHIP-001-contextual-drawing-part-files-and-3d-reuse.md`; `.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`

## 0. Phase 1 RD Implementation Contract：Canonical 圖號工作台恢復預覽圖模式

本節是 DEV-065 Phase 1 在 DEV-087 新架構下的 Drawing product、engineering 與 RD handoff authority。使用者於 2026-08-23 明確要求升級到 RD 可實作；local Phase 1A～1D 已完成，repository、DTO、query、file-read、UI、QA 與 dirty boundary 均有可重現證據。此狀態代表 Drawing 本機產品切片已實作並通過 focused QA/QC，不代表下方 Part Phase 2 已實作，也不代表 staging／production、deploy 或 release 已就緒。

下方 `Historical baseline marker` 後的 2026-08-11 舊架構契約只保留 provenance。舊 `drawing:`／`:production`／`:rd` row parser、lane／projection token、`humanStatus` chain、preview child route、feature flag、Part resolver、舊 QA PASS／BLOCKED 與 Phase 1A～1D 均被本節 intentional-replace，不得作為 current implementation instruction。

使用思考習慣：#差距分析、#可驗證性、#當責

### 0.1 問題、交付結果與 UX Intent

- 問題：canonical Drawing 工作台只有清單；雖然 exact row drawer 已有 3D／2D 預覽，使用者仍須逐筆開 drawer 才能用外形辨識圖號。
- 結果：同一批 Drawing rows 可在 `清單／預覽圖` 間切換；清單適合欄位比較，預覽圖適合外形掃視，兩者共享完全相同的 row identity、排序、篩選、分頁、選取與 drawer。
- 主物件／主焦點：一個 `cw_<UUID>` canonical Drawing row；一個 row 固定一張卡，同圖號的量產版與每個 RD branch 不合併。
- 預設刪除：卡片內下載、mutation、第二個行動入口、helper、教學、成功宣告、raw file/status/internal ID與重複 revision 文案。
- 保留舉證：3D 圖、圖號、品名、`layerLabel`及非空 `handlingLabel` 是避免選錯 exact row與漏掉待處理列的最小資訊。
- 非語言修復：4:3 `contain`、pressed／selected／focus 輪廓、卡片順序與就地 placeholder表達模式、選取及 preview state；不新增頁首說明或額外面板。

### 0.2 Human decisions 與 AI engineering decisions

Human-confirmed：

1. `HD-065-N1`：current phase 只恢復 Drawing；Part 留在 Future Phase Capsule，Relation 維持清單唯一模式。
2. `HD-065-N2`：清單保留；預覽圖是第二種瀏覽方式，不取代清單。
3. 無偏好時預設 `list`；有效 URL `layout=list|preview` 優先於 Drawing local preference；無效值安全正規化為 `list`。

AI engineering decisions：

1. List transport 使用 top-level `preview3dByRowKey` map，不把 domain-specific preview 欄位塞進共用 row，也不建立 per-card endpoint。
2. Drawing list 每次都在既有 read snapshot內批次投影 preview summary；layout切換不重新 fetch list。Part／Relation response不回此 map。
3. current gallery不受舊 `PDM_WORKBENCH_PREVIEW_GALLERY_V1`控制，也不新增另一個 feature flag；rollback/release rollout留給後續 release gate，不以長期雙 authority完成本 DEV。
4. 新增 canonical gallery component；只復用純 presentation 的 `PdmWorkbenchLayoutSwitch`與必要視覺語言，不匯入舊 `PdmWorkbenchPreviewGallery`、`HumanStatusBadge`、lane或projection token。
5. URL deep link本身不覆寫local preference；只有使用者實際切換模式才寫入 preference。模式變更使用`replaceState`，不增加back stack。

### 0.3 Scope 與 Out of Scope

Scope：

- `/numbering/drawings` 的 `CanonicalPdmWorkbench`，只在 `entityType="drawing"` 顯示模式切換。
- Drawing list DTO 的 exact-row 3D summary map、same-snapshot bounded bulk read與list/detail共用的source/state mapper。
- `layout` URL／`pdm-canonical-drawing-layout-v1` local preference、invalid-storage fallback與append/race處理。
- canonical gallery/card、lazy protected image、preview states、selection／drawer／keyboard parity、RWD與accessibility。
- current DEV-087 contract/repository/browser/file-read regression及新的 DEV-065 focused QA。

Out of Scope：

- Part／Relation gallery、Part代表圖resolver、group-level合併卡。
- 2D fallback、其他 revision／branch fallback、互動式3D、旋轉、量測、爆炸圖。
- gallery下載、上傳、編輯、刪除、送審或任何mutation。
- 新API route、新table/cache/index/schema/migration/backfill、preview批次重生、worker或permission/lifecycle改寫。
- 清除所有舊 gallery 原始碼；只要求 current caller=0。若要物理移除仍有歷史contract runner引用的檔案，另依直接consumer治理，不在本期猜測刪除。
- staging／production、deploy、release、merge、PR與release artifacts。

### 0.4 Current architecture facts 與 impact

- Current list owner：`src/components/canonical-pdm-workbench.tsx` → existing Drawing list route → `PdmCanonicalWorkbenchService.list` → `PdmCanonicalWorkbenchAsyncRepository.list`。
- Repository已以`withPdmWorkbenchReadSnapshot`建立SQLite transaction／PostgreSQL `REPEATABLE READ READ ONLY` snapshot，並回傳exact `CanonicalWorkbenchStateRecord.revisionId`。
- Drawer的3D／2D來源已由`PdmCanonicalWorkbenchService.previewSlots`使用`drawing_revision_files`、`file_assets`、`file_derivatives`、`preview_jobs`與`pdmFileReadHref`；current list尚未投影preview。
- Bytes authority固定為`GET /api/pdm/file-assets/[fileAssetId]`；route已驗context、company、binding、revision／work、review scope、hash與derivative，並以`private, no-store`回應。Next.js 16.3 route handler預設dynamic/no-cache，此案不新增route或`use cache`。
- 舊`src/lib/pdm-workbench-preview-gallery.ts`會重新選global latest revision並組舊preview child URL，無法接受opaque canonical row；不得接到current UI。
- Architecture impact為`Compatible extension + Intentional replacement`：延伸DEV-087 list read DTO與UI mode，刻意取代DEV-065舊wiring；identity、state、permission、file-read、preview worker與mutation authority不變。

### 0.5 Exact DTO 與 API contract

在`src/lib/pdm-canonical-workbench-contract.ts`新增：

```ts
export type CanonicalDrawingPreviewState =
  | "ready" | "pending" | "delayed" | "missing" | "failed" | "unavailable";

export type CanonicalDrawingPreviewSummary = {
  state: CanonicalDrawingPreviewState;
  fileName: string | null;
  mediaHref: string | null;
};

// Drawing response必有；Part/Relation省略。
type CanonicalWorkbenchListData = {
  groups: CanonicalWorkbenchGroupDto[];
  nextCursor: string | null;
  totalGroups: number;
  totalRows: number;
  preview3dByRowKey?: Record<string, CanonicalDrawingPreviewSummary>;
};
```

Transport rules：

1. Drawing response的map key set必須與本頁所有`groups[].rows[].rowKey`完全相等；每列即使missing/failed也有一筆summary。Part／Relation不得回此欄位。
2. `ready`才允許非null `mediaHref`；其他state固定`null`。`fileName`只回display/file name，不回asset、binding、storage、hash、job或raw error。
3. `mediaHref`只能由`pdmFileReadHref`產生並指向`/api/pdm/file-assets/{fileAssetId}`：production context=`drawing_revision`；RD context=`candidate_revision`；`contextId`=row exact revision、`bindingId`=exact binding，review中保留exact`reviewRequestId`，再附`previewDerivative=<exact derivativeId>`。
4. List route維持`GET /api/numbering/drawings/workbench`及`cache-control: private, no-store`；不新增preview child route，不把`layout`送進API或cursor hash。
5. Existing list envelope、row/action、contractToken、correlationId與retired-field ban不變；`assertCanonicalDtoHasNoRetiredFields`仍須通過。

### 0.6 Exact source、state 與 query contract

1. Source identity只取每個Drawing state record的exact nonnull`revisionId`；禁止以drawing id、code、branch或revision字串再選global latest。
2. Source bulk query一次查完本頁revision IDs的active`drawing_revision_files`＋`file_assets`。3D選取順序固定：role=`cad_3d`優先，其次既有3D extension allowlist；同層依`is_primary DESC, sort_order ASC, binding.id ASC`。List與drawer必須呼叫同一pure selector。
3. 第二個bulk statement以`UNION ALL`一次取得selected asset的derivative與latest job資料。Ready derivative必須company相同、asset相同、source hash相同、status=`ready`、kind依`model_preview_png`優先於`thumbnail_png`，且拒絕`fake_preview_worker`／`fake-local-pipeline`。
4. State mapping固定：無3D source=`missing`；matching ready derivative=`ready`；matching queued/running job=`pending`；heartbeat超過30秒=`delayed`；failed/skipped/cancelled job=`failed`；source存在但hash缺漏、只有stale/fake derivative或沒有可用derivative/job=`unavailable`。
5. List read是side-effect-free；不得enqueue job、更新heartbeat或寫receipt。bytes request後由既有file-read route決定202/enqueue行為。
6. Preview resolver位於repository既有`withPdmWorkbenchReadSnapshot` callback內；identities、rows、count、source與derivative/job都使用同一snapshot。0 rows不執行preview query，無asset時跳過第二個statement。
7. Drawing list總statement count仍須符合DEV-087 `<=12`，且1／20／50 rows與1／2／4 row-per-group fixtures的count delta=`0`；禁止per-row/per-revision/per-file query及client detail N+1。
8. 缺source、stale/fake derivative與job狀態只降級該row。DB/provider/snapshot本身失敗仍沿用existing list error，不以不一致的第二次read偽裝成功。

### 0.7 URL、preference、request race 與 append contract

- Storage key固定`pdm-canonical-drawing-layout-v1`，合法值只有`list|preview`。讀寫須`try/catch`；disabled/corrupt storage不顯示錯誤並回list。
- Mount precedence：valid URL → valid storage → `list`。解析完成後以`replaceState`正規化目前URL；invalid `layout`改為`layout=list`。Part／Relation移除`layout`且永遠list。
- 使用者切換時同步state、URL與storage；切換不得清除`query/layer/handling/detail/cursor之外的既有安全query`，不得reload或重新fetch list。
- 非append list request加入`AbortController`＋monotonic request id；只有latest response可替換groups、totals、cursor、contract token與preview map。Abort不顯示error。
- `載入更多`沿用同一cursor；成功時groups按原順序append，preview map以新rowKey merge。重複rowKey、缺map key或map extra key視為contract error，不渲染錯配卡。
- 切換模式保持`selectedRowKey/detailKey/detail/drawer`；selected row在另一模式仍為同一row。關閉drawer後焦點回目前mode的region，不跳到不存在的舊table。

### 0.8 Gallery、keyboard、RWD 與 quiet UI contract

- 新建`CanonicalPdmPreviewGallery`，輸入只有current rows、`preview3dByRowKey`、selected key、loading及現有select/open/close callbacks；不得接受舊status/lane DTO。
- Container使用可聚焦region/list語意；每張卡以原生button作唯一入口，roving tabindex。Accessible name依序包含code、name、layerLabel、非空handlingLabel及preview state，不含rowKey/entityId/revisionId/file id。
- ArrowLeft/Right/Up/Down、Home/End、PageUp/PageDown移動selection；drawer關閉時不自動開，drawer已開時切到next exact row；Enter/Space開drawer，Escape關閉，Ctrl/Cmd+C複製code。不得新增write shortcut。
- Card只顯示3D media、code、name、layerLabel與非空handlingLabel。Image使用Next`Image`、`unoptimized`、`loading="lazy"`、4:3 contain；button已提供完整name時image避免重複朗讀。
- Placeholder固定：pending=`預覽產生中`、delayed=`預覽服務未回應`、missing=`無 3D 預覽`、failed/unavailable/image error=`預覽暫時無法顯示`。Placeholder仍是可開drawer的button，不得disabled。
- Switch置於`.canonical-list-meta` trailing action scope；同時只突出active mode，不新增helper。Gallery使用獨立canonical class，舊`.pdm-workbench-preview-*`僅作視覺參考，避免歷史元件互相污染。
- Grid用`auto-fill`＋可讀min width；390px不得把桌面多欄壓成不可讀小卡。1440×900、1024×768、768×1024、390×844均不得產生page-level horizontal overflow、卡片重疊、drawer遮蔽或雙scroll owner。
- Loading只在結果區就地回饋；empty只顯示`沒有符合條件的資料`；ready不顯示成功badge。Focus/selected/state不可只靠顏色；reduced-motion下移除非必要transform/animation。

### 0.9 Failure、security 與 recovery

- 未登入、無page permission、cross-company或錯context/binding/revision/review scope由existing list／file-read fail closed；client不得由403/404推測檔案是否存在。
- `mediaHref` image回202/204/404/409/5xx、非image bytes或解碼失敗時，只把該card轉`unavailable`；保留row、selection及drawer，不自動無限重試、不顯示broken-image icon或raw response。
- 快速搜尋／篩選／重新整理的stale list response不得覆蓋新資料；detail既有abort/sequence contract保留。
- Gallery metadata不可改變row actions、handling、layer、rowVersion、contractToken或mutation payload；current list mode完全維持。
- Old preview child routes、`pdm-workbench-preview-gallery.ts`、projection token與舊feature flag的current source/runtime caller必須為0。其是否暫存於repo不得被當成new authority或current PASS。

### 0.10 Exact repository／file impact

| Action | File | RD responsibility |
|---|---|---|
| Modify | `src/lib/pdm-canonical-workbench-contract.ts` | 新增Drawing preview summary/map contract；保留base row與retired-field ban。 |
| New | `src/lib/pdm-canonical-preview.ts` | Shared pure 3D source selector、derivative/job state mapper、list summary sanitizer；供list與detail共用。 |
| Modify | `src/lib/repositories/pdm-canonical-workbench-async-repository.ts` | 在existing snapshot內以2個bounded statements hydrate exact Drawing preview map；Part/Relation不執行。 |
| Modify | `src/lib/pdm-canonical-workbench.ts` | List輸出map；drawer改用shared selector/state mapper並維持2D contract；移除重複pure mapping，不改detail envelope。 |
| Modify | `src/components/canonical-pdm-workbench.tsx` | Drawing-only layout state、URL/storage、race guard、append map merge、mode render與selection/drawer parity。 |
| New | `src/components/canonical-pdm-preview-gallery.tsx` | Current DTO card、lazy image、local image-failure state、roving keyboard與accessible names。 |
| Reuse | `src/components/pdm-workbench-layout-switch.tsx` | 可原樣復用；只有current accessibility需缺參數時才做additive prop，不匯入old gallery。 |
| Modify | `src/app/globals.css` | Canonical-scoped switch/gallery/card/state/focus/RWD/reduced-motion；不重做drawer或全域token。 |
| Replace current DEV-065 checks | `scripts/qc-dev-065-workbench-preview-gallery.mjs` | 移除舊Part/lane/flag/031 assertions，建立current contract/repository/query/security fixture suite。 |
| New | `scripts/qc-dev-065-canonical-preview-gallery-browser.mjs` | Isolated Next/Chromium四viewport、URL/preference、keyboard、network、drawer、quietness與cleanup evidence。 |
| Modify | `package.json` | 新增`qc:dev-065:contract`、`qc:dev-065:browser`；既有`qc:dev-065-workbench-preview-gallery`改為兩者aggregate。 |
| Regression-only | `scripts/qc-dev-087-contract.mjs`、`scripts/qc-dev-087-repository.mjs`、`scripts/qc-dev-087-browser.mjs`、`scripts/qc-dev-087-file-read-retirement.mjs` | 只有既有exact allowlist/assertion需要接受additive map時做最小更新；不得放寬retired/security expected。 |

No-touch unless a focused failing test proves direct impact：schema／migration、file-read route、Drawing/Part/Relation page routes、owner editors、worker、permission、mutation services與old preview routes。

### 0.11 RD execution slices 與 phase gates

#### Phase 1A — Contract與shared preview mapper

- 實作DTO/map與shared pure mapper；用disposable fixtures封口exact revision、source priority、state mapping、fake/stale拒絕。
- Exit：current contract test PASS；Part/Relation DTO不變；P0/P1 open=0。

#### Phase 1B — Same-snapshot repository projection

- 在repository existing transaction加入2個bounded statements，service輸出complete map；detail改用shared mapper。
- Exit：1/20/50與多RD rows query count constant且`<=12`；A0002-M01 production 1／RD 1.1各自指向exact context；file-read negative與DEV-087 repository regression PASS。

#### Phase 1C — Drawing-only switch與gallery

- 完成URL/storage/race/append、gallery/card/states、selection/drawer、keyboard/a11y與canonical CSS。
- Exit：focused component/browser flow在四viewport PASS；Part/Relation無switch/gallery/layout residue。

#### Phase 1D — Regression與QC handoff

- 完成current QA `CPG-001`～`CPG-024`、typecheck、affected lint、isolated build、DEV-087 aggregate與source/runtime zero-caller scan。
- Result：所有required local evidence已記錄於§0.11A，productionConnected/Writes=false、task-owned runtime/port/temp cleanup removed；舊10/10不得取代current CPG evidence。

### 0.11A 2026-08-23 Local Implementation Result 與 Evidence

- 實作已落地：`src/lib/pdm-canonical-preview.ts` 統一 exact revision 3D source／hash／derivative/job state；`src/lib/repositories/pdm-canonical-workbench-async-repository.ts` 在既有 read snapshot 以 bounded bulk read 投影來源；`src/lib/pdm-canonical-workbench.ts` 與 `src/lib/pdm-canonical-workbench-contract.ts` 提供 list/detail 共用 DTO；`src/components/canonical-pdm-workbench.tsx`、`src/components/canonical-pdm-preview-gallery.tsx`、`src/app/globals.css` 完成 Drawing-only 清單／預覽圖模式、drawer、keyboard、a11y、RWD；新增 `scripts/qc-dev-065-canonical-preview-contract.mjs` 與 `scripts/qc-dev-065-canonical-preview-gallery.mjs`。
- Focused evidence：`npm.cmd run qc:dev-065:contract`=`24/24 PASS`；`npm.cmd run qc:dev-065:browser`=`35/35 PASS`（1440×900、1024×768、390×844，含 Part／Relation list-only sibling check、card drawer、roving focus、URL／storage、overflow、console/page error）。
- Static/build evidence：`npm.cmd run typecheck:app` PASS；受影響檔 ESLint 0 error／0 warning；`npm.cmd run build:isolated` PASS（125/125 static pages）；`git diff --check` PASS。
- Parent regression evidence：`qc:dev-087:contract`=`31/31`、`qc:dev-087:repository`=`29/29`、`qc:dev-087:commands`=`39/39`、`qc:dev-087:file-read-retirement`=`193/193`、latest canonical workbench browser=`118/118`。
- Known baseline disposition：舊 `qc:pdm-entity-detail-drawer` runner 仍期待已退役的 `src/lib/pdm-entity-detail.ts`，因此不能作為 current DEV-065 PASS denominator；current canonical drawer 已由 DEV-065 browser 35/35 與 DEV-087 browser 118/118 覆蓋，未以重建 legacy source 或放寬 expected result 處理。
- Boundary：本次未新增 schema／migration／API route／feature flag，未寫入 primary SQLite／production，未執行 stage、commit、merge、PR、deploy 或 release；task-owned runtime port 與暫存目錄均已清理。

### 0.12 Final acceptance criteria

1. List/gallery的rowKey序列、數量、順序、layer、handling、cursor append結果完全一致。
2. A0002-M01 production 1與RD 1.1及disposable multi-RD fixture各自呈現exact revision 3D；無跨row／global latest／舊版fallback。
3. Ready/pending/delayed/missing/failed/unavailable/image-error皆可辨識且card仍能開exact drawer。
4. URL/storage precedence、invalid fallback、reload、switch replaceState、query/filter/detail preservation符合§0.7。
5. Bounded query、no detail/API N+1、lazy image與single file-read符合§0.5～0.6。
6. Auth/company/context/binding/hash/derivative/review scope fail closed，DTO/DOM/log不洩漏raw authority。
7. Mouse、keyboard、focus restore、screen reader、reduced motion與四viewport完成主要流程；沒有quietness、overflow或遮擋缺陷。
8. List default/current actions/drawer、Part與Relation、DEV-087 retired contract及file-read regressions均不退化。
9. Schema/data/migration/worker/permission/mutation/production均無變更；source manifest與cleanup evidence可重現。

### 0.13 Stop conditions 與 required evidence

立即停止並回Dev PM，不自行擴張：需要新table/index/cache/migration；exact revision無法批次決定；只能per-row query；需要新file-read／permission／preview worker authority；Part/Relation scope；interactive3D；需改mutation/lifecycle；dirty same-hunk無法保留；或任何production/deploy/release操作。

RD handoff evidence至少包含：touched-path ledger；current `CPG-001`～`024` manifest；1/20/50及multi-RD query counts；row→revision→binding→asset→derivative安全化對帳；A0002 production/RD與negative fixtures；四viewport screenshots/DOM widths；keyboard/a11y/network/console/server summary；old-route/flag current caller=0；typecheck/lint/build/regression結果；`productionConnected=false`、`productionWrites=false`與cleanup status。

### 0.14 Migration 與 release feasibility

- Migration：`Not required`。Existing `idx_drawing_revision_files_revision`及DEV-087/file derivative/job indexes足以支援本期bulk read；不得重新套用歷史031 artifact。若實際query plan需要新index，停止回PM重新分類Medium local migration。
- Runtime/build：只新增client component與existing route response欄位，無新env、worker、port或hosting能力。Next.js 16.3使用existing Route Handler/native Response/no-store contract。
- Release：`Not requested`。Local QA/QC通過後才可進deployment release gate；本文件不產生deploy、rollback、production smoke或release report。

### 0.15 Spec governance、ADR 與 Deferred Scope Audit

- Spec impact：對DEV-065 historical wiring=`Intentional replacement`；對DEV-087 canonical list/drawer/file-read=`Compatible extension`；對DEV-066 old topbar placement只復用segmented presentation，不恢復old status/filter semantics。
- DEV-087直接spec需amend canonical list additive preview map與single file-read，舊preview child route不再列為current authority；不得改其identity、state、permission、retirement或release contract。
- ADR：`Not required`。本期是local、可逆、bounded read/UI extension，沒有新data owner、external contract或難回復選擇。若命中新cache/table/authority/permission才re-entry。
- Blockers：無P0/P1 human或engineering readiness缺口。Open questions為0；RD不得把implementation choice反向升成人類決策。

### 0.16 Phase 2 RD Handoff Contract：料號本身的預覽圖模式

Status: `Local RD Implemented / SQLite + Browser QA Passed / PostgreSQL Shadow Blocked / ADR Accepted / Capability Default Off / Production Release Gated`

本節是DEV-065 Phase 2唯一RD authority：產品方向、高風險語意、逐檔責任、provider migration、函式邊界、影像依賴、切片順序、fixture／runner與dirty boundary均已封口並落地。Local SQLite／browser已通過，PostgreSQL shadow仍BLOCKED；本機RD完成不代表production migration、capability activation、deploy或release已授權。

使用思考習慣：#設計思考、#批判、#可驗證性、#來源品質

#### 0.16.1 問題、結果與已確認決策

- Preview 主物件是 Part。卡片與 drawer 必須回答「這個料號用哪張圖辨識」，不是列出關聯圖面。
- 預設 `auto` 來源只取該 Part 直接且唯一的 `primary_manufacturing` Drawing，再依 best-available 規則選一張可辨識預覽：先取 canonical production ready 3D；沒有量產 ready 時，取最近更新且仍 active 的 canonical RD ready 3D。這承接約九成情境且不複製 Drawing 資產。
- 有 `numbering.attachments.manage`、same-company scope 且未被既有 review/write lock 阻擋者，可上傳 PNG／JPEG 作 `custom_image`。有效 custom 永遠優先。
- custom 遺失、被竄改或不可讀時顯示「自訂圖片無法顯示」，不得 silent fallback。只有明確執行「恢復使用主要製造圖」後才回 auto。
- Part list、gallery、drawer、formal／work／history row 使用同一 Part identity 設定與同一 server projection。
- 歷史 root-min、最近附件、reference Drawing、terminal RD branch、2D與任意附件 fallback 全部 intentional-replace。唯一允許的 auto fallback 是「同一 direct primary manufacturing Drawing：production ready → latest active RD ready」；它只協助外形辨識，不代表工程版本或製造依據。

#### 0.16.2 Scope、out of scope 與唯一來源決策樹

Scope：

- canonical Part 工作台的 `清單／預覽圖`、獨立偏好、list/detail一致性。
- auto、custom set/replace、explicit reset、active asset delete guard、audit／receipt／readback。
- additive Part preview setting、Part-owned image asset、bounded bulk projection與single canonical file-read。
- entity-neutral gallery、shared media/panel、Part drawer單一主要預覽、keyboard/a11y/RWD與Phase 1回歸。

Out of scope：

- 圖片裁切、去背、AI生成、相簿、輪播、從既有附件挑圖或自動猜圖。
- CAD upload作custom image、互動3D、2D fallback、將custom升格為Drawing／approval evidence。
- Part revision、BOM、tech transfer、export、replacement lifecycle、關聯編修、舊custom自動GC或production backfill。

```text
Part preview setting
├─ mode=custom_image
│  ├─ active asset合法且可讀 → 自訂圖片 / ready
│  └─ asset缺失、deleted、wrong binding或不可讀 → 自訂圖片無法顯示 / unavailable
└─ row不存在或mode=auto
   ├─ direct primary_manufacturing恰好一筆
   │  ├─ canonical production 3D ready → 量產預覽 {code} · {revision}
   │  ├─ 否則 latest active canonical RD 3D ready → 研發預覽 {code} · {revision}
   │  └─ production／active RD均無ready 3D → 已連結主要製造圖，但無可用3D預覽
   ├─ 0筆 → 未設定主要製造圖
   └─ >1筆或company/identity異常 → 主要製造圖資料異常
```

#### 0.16.3 Durable data authority

建立唯一 `part_preview_settings` authority；不要建立 `part_preview_overrides` 加另一張mode表，也不要在 `part_numbers`、`drawing_part_links` 或最近附件時間上藏選擇規則。

| Field | Contract |
|---|---|
| `id` | application-generated stable ID。 |
| `company_id`、`part_number_id` | same-company Part owner；`UNIQUE(company_id, part_number_id)`。 |
| `source_mode` | `auto \| custom_image`；無row等價初始 `auto`。 |
| `file_asset_id` | auto為NULL；custom必填且指向同Part active `file_assets`。 |
| `row_version` | 正整數；每次set／replace／reset遞增。row不存在的read token為0。Reset保留setting row，避免版本回0的ABA競態。 |
| `created_by`、`updated_by`、timestamps | actor與時間證據；不保存storage path、hash或Drawing ID。 |

約束：

1. `source_mode='custom_image'` iff `file_asset_id IS NOT NULL`；`auto`不得保存Drawing pointer，永遠動態解析目前direct primary manufacturing Drawing。
2. custom檔為既有 `file_assets` 的 Part-owned live attachment：`linked_entity_type='part_number'`、`linked_entity_id=part_number_id`、`document_category='part_preview_image'`。Category是分類／guard訊號，setting row才是唯一active authority。
3. custom asset必須same Part、same company、未soft-delete、content hash與storage read一致；違反任一條只回unavailable，不改setting、不借圖。
4. set／replace／reset不自動刪除舊asset。舊圖離開active pointer後仍是一般Part附件，可由既有附件生命週期另行管理；restore舊asset也不會自動重新指定。
5. additive migration同時支援SQLite與Cloud SQL PostgreSQL；沒有backfill。未曾設定的所有Part由「row不存在=auto」安全運作。

#### 0.16.4 Safe read contract

Drawing與Part收斂到同一個safe shape；Phase 2實作時 `previewByRowKey` 原子取代內部Drawing-only `preview3dByRowKey`，所有current caller與test在同一切片搬遷，不保留兩個長期DTO authority。Relation仍省略preview map。

```ts
type CanonicalPreviewProjection = {
  state: "ready" | "pending" | "delayed" | "missing" | "failed" | "unavailable";
  media: null | {
    mode: "image" | "document";
    href: string;
    fileName: string | null;
  };
  sourceType: "custom_image" | "primary_manufacturing_drawing" | "none";
  sourceLabel: string;
  sourceDrawingNumber: string | null;
  sourceRevision: string | null;
  alt: string;
};
```

- list response為top-level `previewByRowKey`；Drawing／Part啟用preview時key set必須與visible rowKey set完全相等。不得把preview塞進共用base row。
- Part detail presentation帶同一 `CanonicalPreviewProjection`；Part-only `previewSourceControl:{settingRowVersion:number,canManage:boolean,disabledReason:string|null}` 另帶mutation token與server capability，避免污染Drawing／gallery projection。List hydrate與detail只可呼叫同一 `PartPreviewResolver`，不得各寫來源SQL。
- auto branch重用Drawing canonical exact-3D resolver與 `/api/pdm/file-assets/{fileAssetId}`。Production候選永遠優先；只有production沒有`ready`投影時才掃描同一Drawing的active RD候選。Custom也只產生同一canonical file-read href與 `part_attachment` binding context。
- DTO／DOM／accessible name禁止raw asset ID、binding ID、hash、storage key、job error、permission code。`media.href`只在可安全讀取時存在。
- Part list新增固定 `<=4` statements，總上限 `<=14`；0／1／20／50 rows與多group delta=0。Part detail總上限 `<=14`。SQLite與PostgreSQL的量測方法與runner已在§0.16.15固定，RD必須在Phase 2C exit用實際實作量測；超標、per-card endpoint或N+1均為P1，不得把目標改寬來通過。

#### 0.16.5 Command、permission、audit 與 concurrency contract

| Command | HTTP contract | Required input | Success |
|---|---|---|---|
| set／replace custom | `POST /api/parts/[partNumber]/preview-image`，multipart | `file`、`expectedRowVersion`、`Idempotency-Key` | `{preview, settingRowVersion}` |
| reset auto | `POST /api/parts/[partNumber]/preview-image/reset` | `expectedRowVersion`、`Idempotency-Key` | `{preview, settingRowVersion}` |

- 兩route需authenticated、same-company、`numbering.attachments.manage`，並重用 `assertPdmEntityWriteAllowedAsync` 類型的active-review/write-lock guard；UI capability不是權限邊界。
- `expectedRowVersion`不符回409 fixed conflict；同idempotency key＋同request重播相同result，不同request回422。沿用existing canonical `platform_command_receipts`，command namespace固定 `dev065:part-preview.set-custom`／`dev065:part-preview.reset-auto`，不得另建第二套receipt table。
- audit沿用append-only `audit_logs`，action固定 `numbering.part_preview.set_custom`、`numbering.part_preview.replace_custom`、`numbering.part_preview.reset_auto`；detail只留Part identity、old/new source mode、old/new asset reference、row version、correlation id，不留bytes、path、hash或raw error。
- mutation成功後server在同一request readback唯一resolver projection；client不得自行把剛上傳檔案拼成committed state。

圖片contract固定：只接受單一PNG／JPEG，1 byte以上且 `<=10 MiB`，decoded width/height各 `64..8192`；extension、declared MIME、magic bytes與decode結果必須相符。Server在activation前校正orientation並移除非必要metadata；SVG、GIF、WebP、APNG、CAD、空檔、解碼失敗與oversize一律422。Client預檢只改善體驗，server仍須完整重驗。

#### 0.16.6 Atomicity、delete 與 recovery

1. Set／replace先完成bytes驗證與task-owned storage staging，再開DB serializable transaction：lock Part／setting、驗permission／company／expected version／receipt，insert `file_assets`、upsert setting、increment row version、write audit、complete receipt。
2. DB未commit前舊來源與舊setting保持有效；任何validation/storage/DB/audit失敗均不得清空原來源。
3. DB失敗時新staged object需best-effort compensation delete；若cleanup失敗，必須留下不含敏感資料的operational evidence供storage reconciliation，且該object沒有 `file_assets`／setting binding、永遠不可被使用者讀到。
4. response loss由相同Idempotency-Key replay或detail readback判定；不得再建第二張active setting或第二份新asset。
5. generic Part附件soft-delete命中active custom `file_asset_id`時，唯一語意固定為block：回409 `PART_PREVIEW_ACTIVE_ASSET`與「請先恢復使用主要製造圖或更換預覽圖」。不得silent reset、silent fallback或留下dangling pointer。
6. reset只把setting改為auto、清 `file_asset_id`、increment row version；不刪檔。成功readback目前主要製造圖狀態後，原custom才可由一般附件流程刪除。
7. replace後舊custom同樣保留為一般附件；restore任何歷史preview asset不改setting。自動GC、reset-and-delete composite action留在future phase。

#### 0.16.7 Minimal shared component contract

```text
DrawingPreviewResolver ───────────────────────────────┐
                                                      ├─ CanonicalPreviewProjection
PartPreviewResolver                                  │          │
├─ part_preview_settings + custom asset               │          ├─ CanonicalEntityPreviewGallery
└─ direct primary manufacturing Drawing ─────────────┘          └─ PreviewPanel
       └─ reuse Drawing exact 3D resolver；production ready優先              └─ PreviewMedia
          否則latest active RD ready

PartPreviewSourceControl ── set custom / reset auto commands only
```

| Boundary | Owns | Must not own |
|---|---|---|
| `CanonicalPreviewProjection` | safe media/source/state；list與drawer同shape。 | DB/storage/raw authority。 |
| `PreviewMedia` | protected image/document load、state、retry、cleanup、a11y。 | entity resolver、upload/reset。 |
| `PreviewPanel` | single/tabs/grid composition。 | fetch、permission、domain branching。 |
| `CanonicalEntityPreviewGallery` | Drawing／Part rows、roving keyboard、selection、drawer、lazy card、RWD。 | mutation、per-card API、來源選擇。 |
| `DrawingDetailPreview` | thin compatibility adapter，把3D／2D slots交給shared panel/media。 | Part custom kind、第二份loader、boolean soup。 |
| `PartPreviewSourceControl` | authorized set／replace／reset、busy/error/readback。 | 一般附件管理、gallery renderer、CAD authority。 |

Part drawer只保留一個主要「料號預覽」，下方顯示來源與可選的「查看主要製造圖」；不常駐第二個相同3D／2D board。只有真實task evidence證明需直接閱讀2D時，才另建清楚標為「主要製造圖」的區塊。Component composition不另立ADR；durable source authority由相關ADR治理。

#### 0.16.8 Acceptance contract

| ID | Acceptance |
|---|---|
| `PPC-001` | 無setting／mode=auto只解析direct unique primary manufacturing Drawing；canonical production ready優先，否則選latest active canonical RD ready，且多RD分支結果 deterministic。 |
| `PPC-002` | 無link與「已連結但無可用3D」文案可區分；production／active RD的六種preview state正確；不得跨Drawing、terminal RD、2D或附件fallback。 |
| `PPC-003` | 合法PNG／JPEG set custom成功、reload後仍一致；非法格式／尺寸／bytes全被server拒絕。 |
| `PPC-004` | custom失效顯示unavailable且不silent auto。 |
| `PPC-005` | replace commit前舊來源不消失；成功後新來源唯一，舊asset仍是非active附件。 |
| `PPC-006` | reset增版、回auto、不刪檔；restore舊asset不重新指定。 |
| `PPC-007` | active custom遭generic delete固定409；reset後可依既有附件policy刪除。 |
| `PPC-008` | validation、storage、DB、audit失敗與response loss均有atomic rollback／receipt／readback。 |
| `PPC-009` | viewer唯讀；authorized same-company正向；unauthorized、cross-company、wrong Part/binding/asset fail closed。 |
| `PPC-010` | formal/work/history同Part共用setting；不同Part/company/root不互借。 |
| `PPC-011` | list/gallery/detail投影一致；filter/sort/page/load-more/selection/drawer parity。 |
| `PPC-012` | 0／1／20／50 rows與多group query constant且符合 §0.16.4 cap，無per-card preview endpoint。 |
| `PPC-013` | Drawing／Part共用同一gallery與media/state renderer；source scan無Part copy、雙resolver或boolean mega-component。 |
| `PPC-014` | Part drawer只有一個主要料號預覽；source label與查看主要製造圖入口正確。 |
| `PPC-015` | Drawing／Part layout preference隔離；keyboard/focus/screen reader與1440×900、1024×768、768×1024、390×844無overflow／遮擋。 |
| `PPC-016` | DTO／DOM／log無raw storage/hash/asset/binding/error；bytes只走canonical file-read。 |
| `PPC-017` | Phase 1 `CPG-001..024`、DEV-087 drawer/file-read與一般Part附件／replacement flows不退化。 |
| `PPC-018` | feature off時Part保持list-only、mutation route fail closed、Drawing Phase 1不受影響；schema與assets保留可再啟用。 |

#### 0.16.9 Compatibility、migration、feature gate 與 rollback

- `Intentional replacement`：歷史root-min與current `representativeDrawingRevisionId` 未限定primary的選圖；Drawing-only `preview3dByRowKey`；Part drawer重複Drawing 3D／2D board。
- `Compatible extension`：DEV-087 Part identity／drawer、Phase 1 Drawing gallery、Part附件、canonical file-read、append-only audit與canonical command receipt。
- `No change`：Drawing exact revision source、Relation無preview、CAD／DrawingRevisionFile／approval／BOM／release authority。
- 新增server capability `PDM_PART_PREVIEW_V1`，default off，且必須同時滿足既有 `PDM_WORKBENCH_PREVIEW_GALLERY_V1` 與 unified Part workbench dependency。RD Contract階段暫名的 `PDM_PART_PREVIEW_OVERRIDE_V1` 在任何程式實作前退役，current caller必須為0；新名稱涵蓋auto gallery與custom source，不誤稱只有override。Off時不顯示Part layout switch/source control、不讀settings、不回Part preview map，兩mutation route 404；Drawing既有gallery保持。
- Forward migration只add `part_preview_settings`、constraints／indexes與DB guards；no backfill、no data rewrite。`file_assets.document_category`目前沒有DB enum/check，因此不做虛假的category migration；`part_preview_image`改由TypeScript read type認得、generic attachment upload仍拒絕，只有dedicated preview route可寫。Rollback關capability並保留table／asset／audit／receipt，不做down migration或刪資料。
- Production apply、capability activation、deploy與release不屬本contract，仍需deployment release gate與representative data／query plan／storage compensation smoke。

#### 0.16.10 Dependencies、stop conditions 與 evidence

Dependencies：

- DEV-087 canonical Part list/detail與single file-read可用；direct `primary_manufacturing` link uniqueness保持。
- 現行Part attachment owner、`numbering.attachments.manage`、review lock、file storage、audit與canonical receipt可被transaction service重用。
- Server image decoder固定為direct runtime dependency `sharp@0.35.3`（exact pin）。目前lockfile雖因Next optional dependency已有0.35.3，但`package.json`未宣告；Phase 2A必須直接加入dependency與更新lockfile，禁止依賴transitive availability。Route維持Node runtime，不得移至Edge。

Stop：

- 無法在generic attachment delete的同一transaction驗active setting；無法做row-version／receipt exactly-once；需公開storage URL或複製auto Drawing bytes；需要修復production關聯資料；兩provider無法守住query cap；storage failure無補償／reconciliation；或dirty same-hunk無法隔離。
- 任何需變更permission、CAD／approval authority、增加既有附件挑圖／GC、production migration、stage/commit/merge/PR/deploy/release，停止回PM重新切scope。

RD handoff evidence最低要求：current caller/source scan、SQLite/PostgreSQL schema parity與re-run、query count 0/1/20/50、transaction fault injection、idempotency replay、active-delete conflict、file-read security、component convergence、四viewport/a11y、Phase 1／DEV-087／attachment regression、source/dirtiness manifest及task-owned runtime cleanup。

#### 0.16.11 Readiness 結論

- 風險：`Medium`。新增additive schema、file mutation與list projection，但沒有既有資料backfill、CAD或approval authority變更。
- Human decisions open：`0`。Engineering contract decisions open：`0`；active delete已固定block-until-reset，persistent setting row已避免reset ABA，asset retention已固定非破壞。
- ADR：`Accepted`。`part_preview_settings` 是跨list／drawer／API的唯一Part preview source authority；component composition仍由本SPEC管理。
- 成熟度：`Local RD Implemented`。P0/P1產品決策gap=0；provider SQL、migration編號、decoder、route/service boundary、exact files、fixture、runner、dirty ledger與切片已依§0.16.12～0.16.17落地。
- 本機驗證：SQLite／contract／Chromium／feature-off／typecheck／affected lint／isolated build與focused regressions已通過；PostgreSQL runner已實作fail-closed preflight、046 first/re-run、constraint/trigger、serializable concurrency與query instrumentation，但本機沒有`PDM_POSTGRES_SHADOW_URL`，結果依法為`BLOCKED`，不列PASS。
- 下一步：若要啟用capability或進staging／production，先在安全disposable PostgreSQL shadow完成同一runner，再另走release gate；不得因本機產品切片完成而直接套用production migration、開flag、deploy或release。

#### 0.16.12 Exact provider schema／migration contract

Migration編號固定為 `db/postgres/046_part_preview_settings.sql`；不得重用歷史重複的038或修改已發布001～045。SQLite authority放在 `db/schema.sql` 的 `-- BEGIN/END DEV-065 part preview settings.` marker，`src/lib/db.ts::ensureDev065PartPreviewSchema`只讀取該marker並在 `initDatabase` 的file-assets與DEV-087 schema完成後執行。兩provider均為additive、transactional、re-runnable、no backfill。

```sql
CREATE TABLE part_preview_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  part_number_id TEXT NOT NULL REFERENCES part_numbers(id) ON DELETE CASCADE,
  source_mode TEXT NOT NULL CHECK (source_mode IN ('auto', 'custom_image')),
  file_asset_id TEXT REFERENCES file_assets(id) ON DELETE RESTRICT,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (company_id, part_number_id),
  CHECK (
    (source_mode = 'auto' AND file_asset_id IS NULL)
    OR (source_mode = 'custom_image' AND file_asset_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX uq_part_preview_settings_active_asset
  ON part_preview_settings(file_asset_id)
  WHERE source_mode = 'custom_image' AND file_asset_id IS NOT NULL;
```

Provider差異只限timestamp型別、trigger語法與PostgreSQL advisory lock：

1. PostgreSQL 046以`BEGIN`、`pg_advisory_xact_lock(hashtext('ai_pdm:dev065:part-preview-v1'))`、table/index/function/trigger、`COMMIT`包覆；不得執行data update。
2. SQLite marker使用`TEXT` ISO timestamp與`datetime('now')`；`CREATE ... IF NOT EXISTS`＋stable trigger/index names，可對既有DB重跑。
3. Insert／update setting trigger必須驗證Part存在且`part.company_id=setting.company_id`；custom asset必須live、`linked_entity_type='part_number'`、`linked_entity_id=part_number_id`、`document_category='part_preview_image'`。Storage/hash可讀性由service驗證，不塞進DB trigger。
4. `file_assets` soft-delete final guard：當`deleted_at`由NULL變非NULL且asset仍被active custom setting引用，DB固定拒絕並帶`PART_PREVIEW_ACTIVE_ASSET`。Repository不另建第二份authority；API response mapper把此碼固定為409與既定提示。
5. Hard delete由`ON DELETE RESTRICT`封鎖；reset／replace先移動pointer後，原asset才回到一般附件生命週期。DB guard與service precondition均需fault test，禁止只靠UI。
6. `part_preview_image`是reserved write category：兩個master-attachment repository的read type／label可辨識，但generic POST normalization set不包含它；dedicated preview service直接寫入經正規化的asset row。

Migration驗收：fresh SQLite、existing SQLite re-run、fresh PostgreSQL shadow、046 re-run、invalid company/Part/asset/category/deleted pointer、active soft-delete、reset後soft-delete、no-row auto全數有deterministic result。Production apply與down migration不在本期。

#### 0.16.13 Exact image、storage 與 command algorithm

`src/lib/part-preview-image.ts`只負責不帶DB狀態的bytes contract：

```ts
type NormalizedPartPreviewImage = {
  bytes: Buffer;
  format: "png" | "jpeg";
  mimeType: "image/png" | "image/jpeg";
  extension: ".png" | ".jpg";
  width: number;
  height: number;
  sha256: string;
};

normalizePartPreviewImage(input: {
  bytes: Buffer;
  fileName: string;
  declaredMimeType: string;
}): Promise<NormalizedPartPreviewImage>;
```

- Input與normalized output都必須`1..10 MiB`；先驗extension／declared MIME／magic，再用`sharp(...,{limitInputPixels:8192*8192,failOn:'warning'})` decode。`metadata.pages ?? 1`必須等於1，APNG／多頁PNG拒絕。
- Decode後與auto-orient後width／height各為`64..8192`；呼叫`autoOrient()`，不呼叫`withMetadata()`，因此移除EXIF／ICC等非必要metadata並輸出sRGB。JPEG固定quality 90；PNG固定compression level 9；保持原format family，不作PNG↔JPEG轉換。
- normalized bytes與SHA-256才是asset／idempotency request hash的authority；client hash、MIME與尺寸永遠不可信。

`src/lib/pdm-part-preview.ts::PartPreviewService`擁有orchestration，route不得直接SQL／storage：

```ts
setCustom(input: { companyId; partNumber; actorId; expectedRowVersion; idempotencyKey; correlationId; file }): Promise<PartPreviewMutationResult>
resetAuto(input: { companyId; partNumber; actorId; expectedRowVersion; idempotencyKey; correlationId }): Promise<PartPreviewMutationResult>
```

Set／replace exact順序：authenticate與resolve company/Part → read bytes upper bound → normalize/hash → 以`{partId,expectedRowVersion,normalizedSha256}`查terminal receipt → 以deterministic command-scoped key stage storage → `runCanonicalIdempotentCommand(...,{command:'dev065:part-preview.set-custom',effectKey:'part-preview:'+partId})`開serializable transaction → lock Part/setting → review-lock與version recheck → insert reserved `file_assets` → upsert setting／increment version → append audit → complete receipt → commit → 用同一resolver readback。Reset使用相同command helper與`dev065:part-preview.reset-auto`，沒有storage步驟。

Storage compensation不得刪到現有deduplicated object：stage前先對deterministic requested key做metadata preflight；只有`preexisting=false`且`putObject`回傳的key等於requested key時，DB失敗後才可best-effort delete。若adapter重用另一key或cleanup失敗，只留operational reconciliation evidence，不得刪shared object。Capability activation前，target storage adapter必須實際證明put/read/hash/delete；目前disabled GCS／S3 adapter不算production-ready。

HTTP boundary：route只做auth、feature、company、header/form parsing、size early reject與typed error mapping。Missing/invalid input=400或422；feature/Part not found=404；row version/review lock/active asset=409；idempotency key reused=422；storage unavailable=503；所有response `private,no-store`且只回safe projection、settingRowVersion與correlationId。

#### 0.16.14 Exact resolver、DTO 與 component impact

Read boundary固定如下，不允許list/detail各自另寫SQL：

```ts
resolvePartPreviewsAsync(client, {
  companyId,
  partIds,
  rowKeysByPartId
}): Promise<Record<string, CanonicalPreviewProjection>>;
```

Resolver以最多四個bulk statements依序取得settings/custom assets、direct primary links、canonical production＋open active RD exact revision files、derivative/jobs；可合併但不得拆成per-row。Custom invalid保持unavailable；auto對每個候選委派既有Drawing exact resolver後，依`production ready > active RD ready > production non-ready state > active RD non-ready state > linked missing`投影一張。Active RD同時要求branch=`open`且revision lifecycle屬`preparing|in_review|correction_required|rd_controlled`；ready候選依有效ready derivative、binding、revision、state更新時間的最大值DESC，再以revision natural DESC、canonical row ID ASC破同分。List DTO原子改為`previewByRowKey?: Record<string, CanonicalPreviewProjection>`；Part detail新增`preview`與`previewSourceControl`，Drawing detail沿用同projection但沒有mutation token。

UI composition固定為：`CanonicalPreviewMedia`（load/state/a11y）→`CanonicalPreviewPanel`（single/tabs/grid）→`CanonicalEntityPreviewGallery`（entity-neutral cards/navigation）；`DrawingDetailPreview`只保留thin adapter；`PartPreviewSourceControl`只做upload/reset與server readback。`canonical-pdm-workbench.tsx`只持有layout、selection與mutation refresh，不可長出entity-specific media loader。Part與Drawing preference keys分離；CSS沿用flat gallery/card language，不新增drawer內框中框或重複標題。

#### 0.16.15 Exact file manifest 與 no-touch boundary

| Action | Exact files | Responsibility |
|---|---|---|
| Add | `db/postgres/046_part_preview_settings.sql`; `src/lib/part-preview-image.ts`; `src/lib/pdm-part-preview.ts`; `src/lib/repositories/pdm-part-preview-async-repository.ts`; `src/app/api/parts/[partNumber]/preview-image/route.ts`; `src/app/api/parts/[partNumber]/preview-image/reset/route.ts`; `src/components/canonical-preview-media.tsx`; `src/components/canonical-preview-panel.tsx`; `src/components/part-preview-source-control.tsx`; `scripts/qc-dev-065-part-preview.mjs`; `scripts/qc-dev-065-part-preview-postgres.mjs` | Schema、image、service/repository、routes、shared UI與focused runners。 |
| Modify data/config | `db/schema.sql`; `src/lib/db.ts`; `db/postgres/README.md`; `package.json`; `package-lock.json`; `.env.example`; `src/lib/number-state-flow-feature.ts` | SQLite marker/ensure、046 registry、direct `sharp@0.35.3`／`server-only@0.0.1`、Part capability。 |
| Modify read | `src/lib/pdm-canonical-preview.ts`; `src/lib/pdm-canonical-workbench-contract.ts`; `src/lib/pdm-canonical-workbench.ts`; `src/lib/repositories/pdm-canonical-workbench-async-repository.ts` | Neutral projection、Part resolver hydration、DTO rename、query instrumentation。 |
| Modify attachment/error | `src/lib/repositories/master-attachment-repository.ts`; `src/lib/repositories/master-attachment-async-repository.ts`; `src/lib/master-attachment-response.ts`; `src/components/master-attachment-panel.tsx`; `src/app/api/parts/[partNumber]/attachments/[attachmentId]/route.ts` | Reserved category可讀但generic upload不可寫；active custom delete 409 mapping／label。 |
| Modify UI | `src/components/canonical-pdm-preview-gallery.tsx`; `src/components/canonical-pdm-workbench.tsx`; `src/components/drawing-detail-preview.tsx`; `src/app/globals.css`; only if viewport test proves必要才改`src/app/styles/responsive.css` | Entity-neutral gallery、shared panel/media、Part source control與RWD。 |
| Modify QA/script registry | `scripts/qc-dev-065-canonical-preview-contract.mjs`; `scripts/qc-dev-065-canonical-preview-gallery.mjs`; `package.json` | Extend CPG regression、PPC runner與commands。 |

Expected no-touch：canonical file-read route、CAD/preview worker、Drawing revision file mutation、approval/BOM/replacement snapshot、permission definitions、production config/data。`src/lib/pdm-canonical-command.ts`與`src/lib/file-storage.ts`預期只重用；若concurrency／compensation focused test證明現有helper不足，停止切片並先以其authority DEV開additive修正，不得在DEV-065順手重寫共用基礎設施。

#### 0.16.16 RD execution slices、估工與 gates

| Slice | Owner / estimate | Entry | Exit evidence |
|---|---|---|---|
| Phase 2A — schema + image domain | Backend RD / 1.0–1.5d | 本SPEC與ADR Accepted | SQLite/PostgreSQL migration re-run、trigger negatives、sharp normalize matrix、direct dependency與no primary write。 |
| Phase 2B — mutation + delete guard | Backend RD / 1.5–2.0d | 2A PASS | set/replace/reset、row-version、receipt replay/concurrency、fault compensation、active-delete 409與security PASS。 |
| Phase 2C — read + shared UI | Full-stack RD / 1.5–2.0d | 2B PASS | neutral DTO原子遷移、query cap、list/gallery/detail parity、Drawing thin adapter、四viewport與a11y PASS。 |
| Phase 2D — regression + handoff | RD + QA / 1.0–1.5d | 2C PASS | PPC-001..018、CPG、DEV-087、attachment/replacement、typecheck/lint/build/diff、manifest/cleanup PASS。 |

總RD估工=`5.0–7.0 engineer-days`，QA/QC=`2.0–3.0 days`；不含production migration/deploy、target storage adapter enablement或既有資料修復。不得平行合併2A/2B transaction authority與2C UI；同一slice可在獨立測試fixture上平行寫runner。

#### 0.16.17 Dirty boundary、implementation commands 與 handoff

2026-08-24盤點時worktree非clean。DEV-065重疊且已modified：`db/schema.sql`、`db/postgres/README.md`、`package.json`、`src/app/globals.css`、canonical workbench contract/service/repository/component；Phase 1新增檔`src/lib/pdm-canonical-preview.ts`與`src/components/canonical-pdm-preview-gallery.tsx`仍untracked。另`src/lib/pdm-canonical-command.ts`與兩個master-attachment repositories已有其他切片未提交變更。RD開始前必須保存`git status --short`、targeted `git diff --binary`／SHA-256 manifest與owner/source attribution；只可在本節manifest檔續作，same-hunk不明即停止，不得reset、checkout或把DEV-087／其他dirty成果計入DEV-065。

Focused commands在實作時加入並固定為：

```powershell
npm.cmd run qc:dev-065:contract
npm.cmd run qc:dev-065:part-preview
npm.cmd run qc:dev-065:postgres
npm.cmd run qc:dev-065:browser
npm.cmd run qc:master-attachments
npm.cmd run qc:dev-087:contract
npm.cmd run qc:dev-087:repository
npm.cmd run qc:dev-087:commands
npm.cmd run qc:dev-087:file-read-retirement
npm.cmd run typecheck:app
npm.cmd run build
git diff --check
```

`qc:dev-065:postgres`要求explicit disposable `PDM_POSTGRES_SHADOW_URL`且拒絕production-like host/database；缺shadow時結果是BLOCKED，不是假PASS。Affected ESLint由runner manifest列出§0.16.15所有TS/TSX檔並執行。Browser沿用`qc-next-app-runner.mjs`、random port、isolated Next dist/temp SQLite/repository/invalid actors；finally只停止task-owned process tree並確認port release。

Evidence manifest至少記錄run ID、git SHA、dirty file hashes、Node/Next/sharp版本、feature flags、DB/storage provider、productionConnected/Writes=false、fixture IDs、query counts、fault point、HTTP/DB/DOM結果、screenshots、console/network、cleanup與port release。任一PPC expected被改寬、primary DB被寫、PostgreSQL target不安全、storage object無法判定ownership、query超cap、shared component source scan失敗或P0/P1 open，即FAIL/STOP，不得宣告完成。

#### 0.16.18 2026-08-24 Local RD implementation result

- Phase 2A～2C產品與runner已實作：additive SQLite marker／ensure、PostgreSQL 046、DB guards、PNG／JPEG normalization、Part preview repository／service／routes、idempotent set／replace／reset、active-delete guard、neutral `previewByRowKey`、same-snapshot Part list hydration、shared media／panel／gallery與Part source control均已落地。
- Feature boundary：`PDM_PART_PREVIEW_V1`預設off；off時Part不顯示switch、不回preview map、mutation回404，Drawing Phase 1保持可用。未改production config，也未執行migration／deploy／release。
- Focused evidence：contract `28/28`、SQLite Part preview `30/30`、authenticated Chromium `112` checks；query evidence為Part list 0 rows=`2` statements、1/20/50 rows=`7` statements、detail=`13`、list transaction=`1`，低於本契約上限且row count delta=0。
- Browser evidence：1440×900、1024×768、768×1024、390×844均通過list／gallery／drawer parity、A0005 active RD `0.1` auto source、custom upload/reload、active delete 409、generic reserved POST 400、reset/readback/delete、unauthenticated 401、shared component與no-overflow；feature-on port `64346`、feature-off port `58568`均釋放，task-owned Next dist與temp DB/repository均移除。
- Regression evidence：DEV-087 contract `31/31`、repository `29/29`、commands `30/30`、file-read retirement `193/193`；DEV-088 replacement contract `40/40`、repository `29/29`、HTTP `15/15`；typecheck、affected 22-file ESLint、`git diff --check`與isolated build `126/126`通過。
- Provider boundary：`qc:dev-065:postgres`在缺少explicit disposable `PDM_POSTGRES_SHADOW_URL`時安全停止，`productionWrites=false`。因此本節只宣告`Local RD Implemented / SQLite + Browser QA Passed`，不宣告PostgreSQL parity、full QA/QC、activation或release ready。
- Build／baseline disposition：標準`npm run build`因工作區已有非本任務port 3000／PID 35664而被clean-next安全阻擋，未停止或繞過；`npm run build:isolated`完整通過。`qc:master-attachments`命中DEV-065前即存在的dirty Drawing attachment route字串差異，依`.tmp/dev065-baseline/targeted-before.patch`歸類為non-attributable；本DEV的Part active-delete、reserved upload、file-read與replacement paths均有direct evidence。
- Canonical local execution report：`.ai-doc/qc/qc-dev-065-part-preview-local-execution-2026-08-24.md`。若要把本DEV升為雙provider QA PASS，唯一下一個必要證據是安全disposable PostgreSQL shadow runner PASS；不需重寫已通過的SQLite／UI產品切片。

#### 0.16.19 2026-08-24 Best-available auto source amendment result

- 使用者確認此preview只協助外形辨識，不應因同Drawing有多個RD branch而空白或要求人工指定。Spec Impact=`Intentional replacement`：取代Phase 2原production-only auto條款；setting/custom、permission、file-read、schema、command與shared component authority均`No change`。
- Repository以同一bulk statement保留direct primary link identity，讀取production與open active RD canonical states；linked-but-no-state不再被誤投影成unlinked。RD branch必須`status='open'`，revision lifecycle必須為`preparing|in_review|correction_required|rd_controlled`。
- Resolver固定`valid custom > production ready > latest active RD ready > production non-ready state > active RD non-ready state > linked missing > unlinked missing`；active custom unavailable仍不silent auto。Ready RD依valid derivative／binding／revision／state更新時間DESC、revision natural DESC、row ID ASC deterministic選一張。Production ready日後出現時自動反超，不寫Part setting。
- UI沿用同一`CanonicalPreviewProjection`、gallery、panel與media；來源標示`自訂圖片／量產預覽／研發預覽`，並區分「尚未連結主要製造圖」與「已連結但無可用3D預覽」。沒有新增table、branch preference、API、permission或第二套preview元件。
- Fresh evidence：A0005-P01實際readback=`ready / 研發預覽 / A0005-M01 / 0.1`；focused SQLite `30/30`含production priority、multi-RD deterministic、historical branch exclusion與production promotion；Chromium `112/112`含四viewport A0005、custom lifecycle與feature-off；typecheck與affected lint PASS。PostgreSQL shadow、activation、migration、deploy與release邊界不變。

### 0.16H Superseded Phase 2 Brief（2026-08-24）

原 `Brief Ready` 內容已完整升級並吸收到 §0.16；需求演進保留於 `.ai-doc/dev_task.md` 2026-08-24 changelog與Git歷史，不再於current SPEC保留一份可被誤讀的平行契約。

---

## Historical baseline marker：2026-08-11 舊架構契約

以下原 §§0H～12 保留舊版產品決策、實作與 QA 證據，但其 component、DTO、row key、route、feature flag與完成狀態均非 DEV-087 current runtime authority；不得直接執行舊 Phase 1A～1D。

## 0H. Historical RD handoff

本文件是 DEV-065 的唯一產品與工程契約。RD 可直接執行 Phase 1A～1D，不需再向 PM 詢問版型、預覽來源、缺圖 fallback 或模式記憶規則。

執行前先讀：

1. 本 SPEC。
2. `.ai-doc/qa/qa-dev-065-workbench-preview-gallery-validation-plan-2026-08-11.md`。
3. `.ai-doc/specs/SPEC-PDM-WORKBENCH-CORE-001-shared-read-and-controller-contract.md`。
4. `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-AGGREGATE-001-single-data-layer.md`。
5. `.ai-doc/specs/SPEC-PDM-FILE-OWNERSHIP-001-contextual-drawing-part-files-and-3d-reuse.md`。
6. `.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`。

開始條件：

- `DEV-064` canonical `Drawing / DrawingRevision / DrawingRevisionFile` identity 可讀。
- 既有 Drawing、Part workbench list 與 detail drawer baseline 可運作。
- RD 先記錄工作樹既有變更，只修改 DEV-065 範圍，不覆蓋使用者的平行工作。

完成定義：Phase 1A～1D、QA acceptance `PG-001`～`PG-014`、typecheck、affected lint、focused regression、真實 Chromium 四 viewport 全部通過，且 production connection/write 皆為 false。未經明確 release 指令，不得套用正式 migration、deploy、merge、PR 或 release。

使用思考習慣：#目的、#限制條件、#可驗證性、#批判、#設計思考、#非語言溝通

## 1. Problem and outcome

### 1.1 真正問題

現行圖號與料號工作台以文字列為主，適合精確比較欄位，但使用者在辨識零件外形、快速掃視一組圖號或料號時，必須逐筆開啟明細。Windows 檔案總管式縮圖瀏覽可降低辨識成本，但不能犧牲既有清單能力，也不能讓代表性圖片被誤認為料號本身的精確幾何。

### 1.2 交付結果

- 圖號工作台與料號工作台各新增 `預覽圖` 模式；既有模式命名為 `清單`。
- 切換器採圖料工作台 `關係樹／矩陣` 的 segmented-control 視覺與互動語言。
- 預覽主體為既有 native SolidWorks pipeline 產生的靜態 PNG；瀏覽器不解析 `.SLDPRT/.SLDASM`，也不新增互動式 3D viewer。
- 圖號卡片顯示該 canonical drawing 最新有效版次的 primary 3D 預覽。
- 料號卡片顯示同主根號下、最小圖號流水號之代表圖的最新有效版次 primary 3D 預覽，並明示 `代表圖`。
- 沒有可用 3D 時保留卡片並顯示狀態；不可改用 2D、舊版或下一個圖號掩蓋缺口。

## 2. Human-confirmed decisions

2026-08-11 使用者在引導模式確認：

| Decision | Confirmed rule |
|---|---|
| `HD-065-1 / 1A` | 料號預覽來源固定為「同根號下，圖號流水號最小者」的最新版 3D 預覽；不是料號一般附件。 |
| `HD-065-2 / 2A` | 代表來源沒有 3D 時仍保留卡片並顯示 `無 3D 預覽`；不做 2D fallback。 |
| `HD-065-3 / 3A` | 首次進入預設 `清單`；之後每個模組各自記住最後模式，URL 明確指定時優先。 |

PM 對 1A 的可執行解讀：`根號` 對應 canonical `part_root_id`；`最小流水號` 對應同根號 canonical drawing 的數值 `sequence_no ASC`，不是字串最小、不是最近更新、也不是有預覽者優先。若資料異常出現同一流水號，依 `drawing_number` natural ascending、`drawing.id ASC` 決定唯一代表圖。

## 3. Scope boundary

### 3.1 In scope

- `/numbering/drawings` 與料號工作台現行 canonical route。
- 清單／預覽圖切換、URL 正規化、per-module local preference。
- Drawing、Part list BFF 的 preview summary bulk projection。
- 受權限保護的 thumbnail stream route。
- 可重用的 view switch、preview gallery、preview card 與 placeholder。
- additive SQLite schema index、PostgreSQL forward migration artifact。
- 本機 fixture、focused test、real Chromium UI/UX/a11y/performance 驗證。

### 3.2 Out of scope

- 圖料／Relation 模組的預覽圖模式。
- 互動式 3D、旋轉、量測、爆炸圖、preview size slider。
- 多選、拖放、重新命名、搬移、刪除或其他檔案總管 mutation。
- 新的 upload window、改變檔案 ownership、lifecycle、permission 或 approval authority。
- 2D fallback、舊版 3D fallback、跨根號 fallback、下一順位圖號 fallback。
- 歷史資料回填、批次重生 derivative、live migration、staging/production、deploy/release。

## 4. UX and non-verbal contract

### 4.1 Mode switch

建立共用 `PdmWorkbenchLayoutSwitch`；優先抽取圖料工作台既有 `關係樹／矩陣` segmented-control primitive，不複製另一套近似 CSS。

- 選項固定為 `清單`、`預覽圖`；順序不可交換。
- 使用真正的 button 或等價 radio semantics，具可辨識 selected state、focus ring、`aria-pressed` 或 radiogroup state。
- active state 不只靠顏色；必須同時有底色／邊界／字重或 indicator 差異。
- 桌面版位於 filter footer 左側；既有 `顯示歷程` 等控制留在右側。空間不足時整組換行，不拆散 segmented control。
- 切換不 reload、不重新送出 filter；保留搜尋、排序、分頁、選取列與已開啟 detail drawer。

### 4.2 URL and persistence

新增 query `layout=list|preview`。

解析優先序：

1. 有效 URL `layout`。
2. 當前模組的 localStorage preference。
3. `list`。

Storage key：

- Drawing：`pdm:drawing-workbench:layout:v1`
- Part：`pdm:part-workbench:layout:v1`

規則：

- 首次進入一定是清單。
- Drawing 與 Part 不共用最後模式。
- 使用者切換時以 `history.replaceState` 更新 URL 並寫入當前模組 preference；不可污染 back stack。
- 無效值或舊值正規化為 `list`，不得 crash、白屏或清除其他 query。
- SSR/初次 hydration 不直接存取 `window/localStorage`；避免 hydration mismatch。

### 4.3 Gallery/card anatomy

- gallery 使用 `repeat(auto-fill, minmax(184px, 1fr))` 或經視覺驗證的等價規則；不得固定欄數。
- thumbnail canvas 固定 4:3、neutral surface、`object-fit: contain`，不得裁切模型；image 使用 `loading="lazy"`、`decoding="async"`。
- 整張卡片是選取／開啟既有 detail drawer 的目標；不在 grid 新增下載或檔案 mutation 意義。
- 第一層資訊：預覽圖、編號、名稱、既有人類狀態 badge。
- Drawing secondary identity：最新有效 revision；無 revision 時顯示明確缺口。
- Part secondary identity：必須顯示 `代表圖 {drawingNumber}`；可再顯示 revision。tooltip/accessible label 說明「依同主根號最小圖號流水號選取」，避免誤認成料號精確幾何。
- 過長編號／名稱可視截斷，但 `title` 或 accessible name 必須可取得完整值；status 不得只靠 tooltip。
- selected card 延用工作台既有 teal selection 語意；hover、selected、keyboard focus 三態不可混淆。

### 4.4 Preview states

| State | Visible behavior | Card behavior |
|---|---|---|
| `ready` | 顯示 PNG thumbnail。 | 可開 detail drawer。 |
| `pending` | skeleton/compact progress indicator + `預覽產生中`。 | 可開 detail drawer。 |
| `delayed` | clock/low-motion state + `預覽處理較久`。 | 可開 detail drawer。 |
| `missing` | neutral placeholder + `無 3D 預覽`。 | 可開 detail drawer。 |
| `failed` | error-neutral placeholder + `預覽暫時無法顯示`。 | 可開 detail drawer 查看檔案狀態。 |
| `unavailable` | neutral placeholder + `預覽暫時無法顯示`。 | 可開 detail drawer；不得洩漏權限或內部原因。 |

不可把 raw worker error、storage key、asset ID、hash 或 permission code 顯示給使用者。動畫遵守 `prefers-reduced-motion`。

### 4.5 Keyboard and responsive parity

- `Arrow` 移動 card focus/selection；`Home/End` 到首尾；`PageUp/PageDown` 依 viewport 前後移動；`Enter` 開 drawer；`Escape` 關 drawer；`Ctrl/Cmd+C` 複製目前顯示編號。
- 不新增任何 write keyboard shortcut。
- 1440×900、1024×768、768×1024、390×844：無 horizontal overflow、切換器不斷裂、卡片不互疊、底部內容可達。
- 若 gallery virtualization 造成 keyboard 或 screen-reader 順序失真，Phase 1 不採 virtualization；先用 server pagination + lazy image 控制成本。

## 5. Exact read contract

### 5.1 Shared types

在 `src/lib/pdm-workbench-contract.ts` 新增純 projection type；不可把 preview 加進 `PdmWorkbenchRowBase`，避免 Relation 被迫承擔 3D domain 欄位。

```ts
export type PdmWorkbenchPreviewState =
  | "ready"
  | "pending"
  | "delayed"
  | "failed"
  | "unavailable"
  | "missing";

export type PdmWorkbenchPreviewSummary = {
  state: PdmWorkbenchPreviewState;
  href: string | null;
  sourceKind: "drawing_latest_3d" | "root_representative_latest_3d";
  sourceDrawingNumber: string | null;
  sourceRevision: string | null;
  alt: string;
};
```

`DrawingWorkbenchRow` 與 `PartWorkbenchRow` 各加 `preview: PdmWorkbenchPreviewSummary | null`。`null` 只允許 feature flag off 的完整 rollback；flag on 時每列必須回 summary（包含 missing/unavailable），不得以 `null` 逃避狀態判定。Relation row 不變。`href` 只能是同站受權限保護 route，不得回 raw storage URL 或 asset ID。

### 5.2 Drawing source resolver

對每個 canonical Drawing row：

1. 以 row 對應 `drawings.id` 作 source；不得以 display code 重新猜 identity。
2. 從同一 drawing 的 revision 排除 `cancelled`、`superseded`，以 `compareRevisionCodes(..., { allowLegacy: true })` 取 revision code 最大者；相同或不可比較時依 `updated_at DESC, id ASC` 決定。
3. 只讀該最新版次 `drawing_revision_files` 中 `role='cad_3d' AND is_primary=1 AND removed_at IS NULL` 的檔案。
4. 最新版次沒有 primary 3D 時回 `missing`；禁止回到較舊 revision。
5. derivative 必須 `status='ready'`、`source_file_asset_id` 相同、`source_content_hash` 與 source asset 當前 hash 相同，且 generator 不是 `fake_preview_worker`。不合條件的 ready row 不可顯示。
6. 若沒有 ready derivative，state priority 固定為：primary 3D 不存在=`missing`；同 source hash 最新 job 為 `queued/running` 且距 `updated_at` 不超過既有 `previewHeartbeatStaleAfterMs`=`pending`；超過該既有 30 秒門檻=`delayed`；同 source hash job或derivative為failed/skipped/cancelled=`failed`；有source但狀態互相矛盾、bytes遺失或resolver非安全性例外=`unavailable`。不可另建第二個時間門檻。整張 list不得因單筆preview例外500；permission、company或source-integrity違反則fail closed。

### 5.3 Part representative resolver

正式 Part row 以 `part_numbers.part_root_id`；尚無 formal number 的 canonical draft row 以既有 workbench domain adapter 已解析的 canonical root context。不得從 display string 截 root code。

代表圖演算法：

1. candidate set 限同 `company_id`、同 `part_root_id` 的 canonical `drawings`。
2. 排除 terminal drawing：`obsolete`、`merged`、`cancelled`；排除 `sequence_no IS NULL` 或沒有 `drawing_number` 的 row。
3. 依 `sequence_no ASC` 選最小值；tie-break 為 `drawing_number` natural ascending、`drawing.id ASC`。
4. 對唯一代表圖套用 5.2 的最新版次與 primary 3D 規則。
5. 代表圖存在但無可用 3D 時回該代表圖的 `sourceDrawingNumber` 與 `missing/pending/failed`；不得跳到下一個 drawing。
6. 沒有候選 drawing 時回 `missing`、`sourceDrawingNumber=null`；不得查其他根號、料號附件或 2D。

上述演算法必須有 server-side unit/contract test；前端不得自行重算。

### 5.4 Endpoint and cache

新增 domain route：

- `GET /api/numbering/drawings/workbench/[rowKey]/preview`
- `GET /api/parts/workbench/[rowKey]/preview`

兩 route 使用同一 server resolver，但各自從 rowKey 解析 domain source。每次 request 必須重驗 session、company membership、workbench read permission、row/source ownership、source hash 與 derivative readiness。未授權時沿用現有 security policy 回 403/404，且不同公司不得從 status、timing 或 error body得知 preview 是否存在。

成功回應：

- 正確 `Content-Type: image/png`、`X-Content-Type-Options: nosniff`。
- `ETag` 由 derivative content hash 產生；支援 `If-None-Match -> 304`。
- `Cache-Control: private, max-age=300` 或更嚴格；不可 `public`。
- list BFF 維持 `private, no-store`。
- route 只 stream derivative，不把 storage path 或 signed cloud URL寫入 HTML／JSON。

`rowKey` 含冒號時 route client 必須 `encodeURIComponent`；server 使用既有 canonical row-key parser，不可手寫 split 後略過驗證。

## 6. Query, schema and performance contract

### 6.0 Feature flag and rollback

- flag：`PDM_WORKBENCH_PREVIEW_GALLERY_V1`，default `false`；local focused/real-browser test明確設為true。
- 只有目前相應 Drawing/Part unified workbench能力已啟用時才能生效；相依缺少時fail closed到完整既有清單，不顯示半套switch/gallery。
- flag off：不顯示切換器；`layout=preview`正規化為list；row `preview=null`且不執行preview bulk queries；兩個thumbnail routes回404；既有list/drawer/API capability維持。
- rollback只關flag，不刪index、不清local preference、不改資料。production flag activation另走release gate。

### 6.1 Bulk projection

禁止逐 row 查 revision/file/derivative/job。建議分層 bulk read：

1. 由當頁 row IDs/root IDs 一次取得 drawing source／Part representative mapping。
2. 一次取得候選 drawing 的 revision rows，在 application 層用 canonical revision comparator 決定最新版。
3. 一次取得最新版 revision 的 primary `cad_3d` file。
4. 一次取得 derivative + latest preview job summary。

Part list 在 Workbench Core 現有上限 15 queries 之外，preview projection 最多增加 4 個常數 queries，總數 `<=19`，rows 1/20/50 時不可成長。Drawing preview projection最多增加 4 個常數 queries。單一 image stream request 建議 `<=6` queries，且只在 viewport lazy load 時發生。

Projection 的非安全性資料缺口必須回 state，不得讓一筆缺圖拖垮整頁。server log 可記 structured diagnostic，但不得包含 secret、raw signed URL 或完整 storage path。

### 6.2 Additive index/migration

在 canonical SQLite schema 與 PostgreSQL forward migration `db/postgres/031_workbench_preview_gallery.sql` 加：

```sql
CREATE INDEX IF NOT EXISTS idx_drawings_company_root_sequence
ON drawings(company_id, part_root_id, sequence_no, drawing_number, id);
```

只允許 additive index，不改資料、不 backfill、不建立第二份 preview authority。PostgreSQL 031 只產生 artifact；本 DEV 不 apply staging/production。RD 若發現實際 execution plan 不使用此索引，可在不改 product rule 前提下調整欄位順序，但必須在 self-check 記錄 SQLite/PostgreSQL plan evidence；若需新 table、materialized cache 或資料修復，停止並回 PM。

## 7. Component and file ownership

預期修改面；RD 可依現況小幅調整名稱，但不得改變 authority：

| Area | Expected files / responsibility |
|---|---|
| Pure contract | `src/lib/pdm-workbench-contract.ts`：preview summary type；base row 不加 domain 欄位。 |
| Drawing adapter | `src/lib/drawing-workbench.ts`、`src/lib/repositories/drawing-workbench-async-repository.ts`：bulk source projection。 |
| Part adapter | `src/lib/part-workbench.ts`、`src/lib/repositories/part-workbench-async-repository.ts`：root representative projection。 |
| Shared server | 新增 bounded preview resolver；重用 `src/lib/preview-derivatives.ts` 的 hash/readiness policy。 |
| API | `src/app/api/numbering/drawings/workbench/**`、`src/app/api/parts/workbench/**`：list summary 與 stream route。 |
| Shared UI | 新增 view switch、preview gallery/card；重用 `src/components/use-pdm-workbench-controller.ts` selection/detail behavior。 |
| Domain UI | `src/components/drawing-workbench.tsx`、`src/components/part-workbench.tsx`：layout wiring、domain labels。 |
| Style | `src/app/globals.css`：抽取既有 relation segmented switch visual token，gallery/card/RWD/focus/state。 |
| Schema | `db/schema.sql`、`db/postgres/031_workbench_preview_gallery.sql`：additive index only。 |
| Tests | 新增 DEV-065 focused scripts/tests；更新必要 regression，不改 unrelated expected value。 |

禁止：在 shared component 以 `if (module === ...)` 重做 domain selection；Drawing/Part source規則必須由 adapter 提供 preview summary。

## 8. Failure and security behavior

- `401/403/404`：沿用現有 error envelope；前端不可顯示 preview existence。
- invalid/tampered rowKey：400 或現有 canonical 404；不可 fallback 以 displayCode 搜尋。
- stale derivative hash、fake generator、missing file bytes：絕不 stream；列表顯示 `unavailable/failed` 並留下 server diagnostic。
- image load 404/409/5xx：card 轉 neutral `預覽暫時無法顯示`；不得無限 retry 或 broken-image icon。
- request race：快速切 filter/layout 時只接受最新 response；沿用 controller abort/sequence policy。
- localStorage disabled/corrupt：以 list mode 正常運作，不顯示 blocking error。
- 任何 preview failure 不得改變 workbench row identity、selection、human status、primary action 或 detail capability。

## 9. Delivery phases

### Phase 1A — Contract and resolver

- 加 preview types，但不污染 base/Relation。
- 完成 Drawing 與 Part deterministic source resolver、state mapping、bulk read、security tests。
- 加 SQLite index 與 PostgreSQL 031 artifact；只做 local/disposable verification。
- 加 default-off feature flag與flag-off complete rollback contract。

Exit：source algorithm fixtures、cross-company、stale/fake derivative、query count通過。

### Phase 1B — API projection and stream

- Drawing/Part list response加入 preview summary。
- 新增兩個 protected stream routes、ETag/private cache、content validation。
- list projection degradation 與 image error handling通過。

Exit：HTTP contract/permission/cache/hash tests通過，無 raw storage disclosure。

### Phase 1C — Shared switch and gallery

- 抽取 segmented switch visual primitive。
- 完成 URL/storage precedence、gallery/card/states、drawer/keyboard parity。
- Part card明示代表圖；Drawing card顯示 revision。

Exit：兩模組 manual flow與a11y contract通過，清單 mode能力不退化。

### Phase 1D — Regression and real browser gate

- typecheck、affected lint、DEV-053/061/062/064/native-preview focused regression。
- isolated Chromium 1440×900、1024×768、768×1024、390×844。
- 記錄 network/query count、console/page/server errors、overflow、screenshots與source manifest。

Exit：QA `PG-001`～`PG-014` 全 PASS；production connection/write false；cleanup removed。

## 10. Stop conditions

RD 遇到任一條件立即停止並回報，不自行擴張：

- 無法從 canonical `part_root_id` 或 `drawings.sequence_no` 決定代表圖。
- 現況需要改 file ownership、permission、lifecycle 或 preview worker authority。
- 需要新 table/materialized cache、歷史 backfill、正式資料修復或批次重生 preview。
- query budget只能靠 per-row query達成，或 preview failure會破壞整頁。
- 需要 interactive 3D、Relation gallery、檔案 mutation、staging/production、merge/PR/deploy/release。
- 現有未提交變更與 DEV-065 同檔衝突，且無法保留使用者變更。

## 11. Spec impact and ADR decision

- `Compatible extension`：延伸 DEV-062 Workbench Core 的 shared mechanism，但 preview 不進 base row、不影響 Relation。
- `Compatible extension`：使用 DEV-064 canonical Drawing aggregate，不建立平行 drawing identity。
- `Compatible extension`：遵守 DEV-061 file ownership，料號只引用同根號代表 drawing 的受控 3D，不複製檔案。
- `Compatible extension`：只消費 DEV-056 native PNG derivative；interactive 3D 仍未授權。
- ADR：`Not required`。此案未改 architecture authority、data ownership、permission 或 irreversible choice；本 SPEC 足以治理 bounded read projection/UI extension。若實作發現需新 preview authority 或 materialized cache，必須先停下並新增 ADR。

## 12. RD self-check handoff

### 12.1 Current local implementation evidence (2026-08-11)

- Product files implemented: `src/lib/pdm-workbench-preview-gallery.ts`; `src/lib/pdm-workbench-contract.ts`; `src/lib/drawing-workbench.ts`; `src/lib/part-workbench.ts`; `src/lib/preview-derivatives.ts`; the two protected preview route trees; `src/components/pdm-workbench-layout-switch.tsx`; `src/components/pdm-workbench-preview-gallery.tsx`; Drawing/Part workbench components; `src/app/globals.css`.
- Schema/flag: `db/postgres/031_workbench_preview_gallery.sql`, additive SQLite index, `.env.development.local` local enable, `.env.example` default-off.
- Focused evidence: `npm run qc:dev-065-workbench-preview-gallery` PASS 10/10, including an executable numeric-minimum/natural-tie representative fixture. Affected ESLint has 0 errors; dynamic protected previews use `next/image` with `unoptimized` to preserve the protected stream boundary.
- Focused TypeScript sees no DEV-065 source error; the workspace-wide check remains blocked by the pre-existing `src/lib/status-scope-display.ts` missing `importCenter` definition and generated `.tmp/.next` stale references.
- Chromium smoke: BLOCKED at managed `/login` because this local environment has no bootstrap user. No `PG-*` UI case is declared PASS from that blocked run; four viewport/query-count/source fixture evidence remains the next QA action.
- Safety: no live migration, production connection/write, data repair, derivative batch regeneration, deploy, merge, PR or release was performed.

RD 完成後在 DEV-065 記錄：

- 實際修改檔、migration artifact、feature flag（若有）與 default state。
- 每項 `PG-*` 對應 test/evidence 路徑。
- query count：Drawing/Part 各以 1、20、50 rows驗證為常數。
- representative fixture：最小流水號無 3D、下一張有 3D，結果仍為 missing。
- latest revision fixture：新版無 3D、舊版有 3D，結果仍為 missing。
- fake/stale/cross-company negative evidence。
- 4 viewport 截圖、DOM/a11y、network、console/page/server error、horizontal overflow。
- `productionConnected=false`、`productionWrites=false`、cleanup result。

思考習慣檢查：#目的—縮短外形辨識時間；#限制條件—不虛構料號精確幾何；#可驗證性—代表選取、fallback、權限與效能都有 fixture/門檻；#非語言溝通—active、focus、preview state與代表來源不用閱讀長說明即可辨識。
