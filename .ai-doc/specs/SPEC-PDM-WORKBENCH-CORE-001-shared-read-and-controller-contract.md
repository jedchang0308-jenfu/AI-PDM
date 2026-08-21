# SPEC-PDM-WORKBENCH-CORE-001：共用讀取、游標與 Controller 開發契約

Status: `DEV-062/067/070 Local RD Implemented / QA-QC Passed; DEV-083 RD Implemented / Focused Contract+API+Authenticated Browser+Disposable Mutation+Typecheck+Affected Lint+Isolated Build Passed / Latest completed aggregate 29/30 PASS with one accepted-superseded parent baseline / QA-083-01～24 PASS / QA-083-24 Closed by QC disposition / Release Gated`
Date: 2026-08-10; amended 2026-08-20
Owner: Dev PM
Related DEV: `DEV-062`; `DEV-PDM-UNIFIED-ENTITY-DETAIL-REVIEW-001` / `DEV-067`; `DEV-PDM-APPROVAL-INBOX-WORKBENCH-001` / `DEV-070`; `DEV-PDM-PART-RELATION-READONLY-DRAWER-FULLPAGE-EDITOR-001` / `DEV-083`; `DEV-085`
Related ADR: `.ai-doc/decisions/ADR-PDM-WORKBENCH-CORE-001-shared-mechanics-and-domain-adapters.md`; `.ai-doc/decisions/ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001-composer-and-policy.md`
Related QA: `.ai-doc/qa/qa-dev-062-unified-part-relation-workbench-validation-plan-2026-08-10.md`; `.ai-doc/qa/qa-dev-067-unified-pdm-entity-detail-validation-plan-2026-08-12.md`; `.ai-doc/qa/qa-pdm-approval-platform-validation-plan-2026-07-08.md` (`APW-001..028`); `.ai-doc/qa/qa-dev-083-part-relation-readonly-drawer-fullpage-workspace-validation-plan-2026-08-20.md`; `.ai-doc/qa/qa-dev-085-workbench-multiselect-filter-validation-plan-2026-08-20.md`

本規格只治理跨模組「機制」，不重複定義 Part／Relation 產品行為。料號單頁行為以 `SPEC-PDM-NUMBER-STATE-FLOW-001` 的 DEV-062 amendment 為準；圖料單頁行為以 `SPEC-PDM-DRAWING-PART-RELATION-VIEW-001` 的 DEV-062 amendment 為準。

> **2026-08-22 DEV-087 target supersession**：保留shared mechanics、server composition、group pagination、signed cursor與domain adapter邊界；取代DEV-086「最多雙列／production+單一RD lane」與舊status/filter/current-work adapter。Drawing group改為production 0/1＋open branch latest RD 0..3，Part／Relation為formal 0/1＋work 0/1。新決策優先，舊adapter/query/cursor interpretation能拆即拆，不得提供canonical→legacy fallback。

> **2026-08-20 DEV-086 group／lane target amendment（RD Implementation Ready / Not Implemented）**
>
> Workbench Core 的目標契約新增可選的 `groupKey`、`lane`、`group pagination`、lane query normalization 與 signed cursor v2 mechanics；同一 canonical group 最多輸出 production／RD 各一列且不得跨頁。Core 只治理 group identity、stable lane key、cursor encode/decode、URL/controller 與 selection reconciliation；Drawing／Part／Relation adapter 仍各自決定 production-effective reference、active RD reference、human status、availability、permission 與 action。禁止在 core 加入 domain switch、以 client join 雙 API，或用 updatedAt 猜 domain latest。
>
> Spec Impact：`Compatible extension + intentional cursor replacement`，完整契約以 `SPEC-PDM-WORKBENCH-PRODUCTION-RD-LANES-001` 與 `ADR-PDM-WORKBENCH-PRODUCTION-RD-LANES-001` 為準。現行 cursor v1／single-row runtime 在 umbrella flag 啟用前維持不變；第一次使用 v1 cursor 進入 v2 projection 只能安全 reset，不得誤解碼。

## 0. DEV-067 Compatibility Amendment：Detail Composer 仍採 shared mechanics + domain adapters（2026-08-12）

Status: `RD Implemented Locally / Human Confirmed / Focused Contract+API+Static Browser PASS / Independent Browser+Isolated Build Pending / Release gated`.

`UnifiedPdmEntityDetailDrawer`是本架構原則在detail surface的延伸，不是跨domain business service或巨型domain component：

- Core新增的責任只包含shared identity/status header、fixed projection slot order、overlay geometry、single scroll owner、focus/Escape、safe return、projection registry與single context action bar。
- `DrawingProjection`、`PartProjection`、`RelationProjection`是domain adapters；其model、preview/read authority、permission與commands不得進入core base type成為domain union欄位。
- Server `DetailSurfacePolicy`可共用policy envelope與`none/summary/full`語法，但每個domain允許欄位與hydrate規則由domain adapter提供。Client不得fetch all後hide。
- 多projection aggregate必須使用同一bounded read snapshot或等價一致性邊界；query budget與partial failure contract在`DEV-067`升級RD Contract Ready時定義。禁止projection component mount後各自發N+1 request。
- `ContextActionBar`只組合server-derived action descriptors；core不重寫candidate、Drawing revision、Part、Relation或approval command policy。

Spec Impact Preflight：`Compatible extension` ADR-PDM-WORKBENCH-CORE-001。它仍選擇shared mechanics + domain adapters，明確拒絕「one React component renders every domain」。若RD設計要求core理解domain status/fields、擁有跨domain mutation或建立新的cross-domain data owner，屬`Unresolved conflict`，必須停止並回Dev PM/ADR。

RD readiness update：shared core新增純型別`PdmEntityDetailResponse`、fixed registry、request race guard與single action bar mechanics；domain fields仍不進core。`PdmEntityDetailService`擁有一個`withPdmWorkbenchReadSnapshot`，各repository提供`...InClient` reader，不得nested transaction或component mount後自行fetch detail。Hard budgets為Drawing/Part `<=16`、Relation `<=24`、review `<=28`，且1/20/50 child/target query count不成長；required projection failure整體fail closed。

## 0A. DEV-070 Compatible Extension：Approval inbox 成為 shared workbench consumer（2026-08-12）

Status: `Local RD Implemented / Focused Contract + Query + Browser QC Passed / Full APW Matrix Pending / Production Release Gated`.

DEV-070 extends the same architecture rule from Drawing/Part/Relation lists to the approval inbox:

- Core owns list mechanics only: topbar/toolbar/result/pagination placement, query/location synchronization, request cancellation and latest-response guard, cursor history, selection, Back/Forward, loading/empty/error recovery, keyboard/focus and responsive behavior.
- Approval owns row/filter semantics: request status, domain/action filters, reviewer assignment, requester/time, decision capability and server-authorized owner href. These fields must not be added as approval branches inside a generic core component.
- Relation continues to use its root/tree/matrix row projection. Approval supplies a flat work-queue row projection and must not import or emulate `RelationRowCard`.

Implementation evidence: `qc:dev-070:contract`, `qc:dev-070:query`, `qc:dev-070:navigation`, `qc:dev-062:core`, `typecheck:app`, `build:isolated` and focused `qc:dev-070:browser` all pass locally. PostgreSQL runtime parity and the complete `APW-001..028` matrix remain release-gated.
- Existing `PdmWorkbenchList` and `usePdmWorkbenchController` are starting primitives, not proof that the full shell is already shared. RD must identify the smallest shell/collection extraction that removes parallel mechanics without forcing tree and table DOM into one renderer.
- Approval cursor/search requires a server contract compatible with the shared controller. A fixed merged `limit=100` response or client-only filtering cannot satisfy pagination correctness.
- The detail boundary remains DEV-067: the approval row navigates to the canonical owner route; close/Back/decision returns through a validated exact list context. Core does not render approval detail or decide owner routing.

Conceptual composition:

```text
SharedPdmWorkbenchMechanics
├─ WorkbenchTopbar / Toolbar
├─ URL + Search + Filter + Cursor Controller
├─ Collection / Selection / Keyboard / Pagination
├─ Loading / Empty / Error / Recovery
└─ RowProjection
   ├─ RelationRootRowProjection
   └─ ApprovalInboxRowProjection
```

This amendment does not change the DEV-062 non-goal that one React component must not render every domain. The target is one mechanical contract with domain adapters, not visual copying or a cross-domain conditional tree.

### DEV-070 shared-core delta contract

This is a compatible extension, not an approval rewrite inside core:

- The shared controller may accept an optional location-backed current cursor and server-returned `previousCursor`. Existing Drawing/Part/Relation consumers may continue using their in-memory cursor history until separately migrated; approval correctness must not silently change their ordering or URL shape.
- The shared list response may add optional `previousCursor` and summary metadata. Additions remain backward-compatible; domain-specific status, action, assignment, counts and owner routing do not enter `PdmWorkbenchListResponse` as required generic fields.
- Approval contributes `ApprovalWorkbenchFilters`, `ApprovalWorkbenchRow`, row renderer and owner-navigation adapter. Core contributes URL/search/filter/cursor/selection synchronization, abort/latest-response guard, keyboard/focus, list/pagination states and responsive mechanics.
- Approval cursor signing reuses the existing HMAC/filter-hash mechanism with namespace `approval-inbox-v1`. Its filter hash includes normalized status/domain/action/query plus company and actor scope. Cursor verification happens server-side before source reads.
- Approval's adapter-owned cursor reuses version 1 fields with `updatedAt` carrying requestedAt and adds optional `direction` plus `pageIndex`; namespace remains inside the signed filter hash. `after` uses the canonical descending-time/ascending-key predicate; `before` reverses the predicate/read and reorders the returned page canonically. Core only stores, restores and passes opaque signed cursors.
- Approval uses global `requestedAt DESC, rowKey ASC`; this domain order is provided to the adapter and must not replace the core ADR's existing Drawing/Part/Relation order.
- `returnTo` is canonical server output from approval state, not a client-built URL. The core can preserve/restore that location but cannot decide which Drawing/Part/Relation owner owns the request.
- Required-source failure is an error state. Shared mechanics expose retry/recovery; they do not merge partial approval rows or relabel them complete.

Implementation must preserve the architecture invariant: no `if (domain === approval)` or approval status/action interpretation inside a supposedly generic shell/controller/list primitive. If that invariant cannot be met, stop for ADR review instead of widening the core.

### DEV-070 implementation-ready core file delta

- `src/lib/pdm-workbench-contract.ts`: `PdmWorkbenchListResponse` receives optional `previousCursor?: string | null` and `pageIndex?: number`; `PdmWorkbenchCursorPayload` receives optional `direction?: "after" | "before"` and `pageIndex?: number`. Existing response/cursor producers require no change.
- `src/lib/pdm-workbench-cursor.ts`: only the filter-hash namespace union adds `approval-inbox-v1`; encoding, HMAC secret selection, signature and base validation remain shared.
- `src/components/use-pdm-workbench-controller.ts`: add optional `paginationMode?: "history" | "server-bidirectional"`, default `history`. `PdmWorkbenchLocationState` adds optional cursor/pageIndex. Only bidirectional mode reads/writes those values and consumes response previousCursor/pageIndex.
- `src/components/pdm-workbench-pagination.tsx`: optional `hasPreviousPage` overrides the existing `pageIndex > 0` derivation; default behavior is unchanged.
- `src/components/pdm-workbench-list.tsx` and `src/components/use-list-keyboard-shortcuts.ts` are reused without changes. If approval cannot render through those current contracts, RD stops before creating another generic list or approval-only keyboard controller.

Regression requirement: `qc:dev-062:core` must pass after the optional extension. Drawing/Part/Relation URL, cursor order, history pagination, detail selection and render behavior are not accepted collateral changes.

## 0B. DEV-083 Compatible Extension：唯讀drawer與canonical task workspace（2026-08-20）

Status: `RD Implemented / Human Confirmed / Focused Contract+API+Authenticated Browser PASS / Disposable Mutation PASS / Typecheck + Affected Lint + Isolated Build PASS / Latest completed aggregate 29/30 PASS with one accepted-superseded parent baseline / QA-083-01～24 PASS / QA-083-24 Closed by QC disposition / Production Release Gated`.

DEV-083延伸本規格的「shared mechanics＋domain adapters」到detail→edit task transition，不建立新的cross-domain business component：

- `PdmEditPageFrame`只共用safe return、stable identity/status header、loading／restricted／not-found／conflict／server-error、unsaved guard、focus與action-dock placement；不得import Part／Relation domain model或command route，也不得接受`domain`後在內部switch渲染。
- `NumberingWorkspaceEditor`是candidate aggregate唯一editor，stable owner為`candidate:{workspaceId}`。Part／Relation入口只提供allowlisted return與安全anchor；不得產生不同candidate mode、URL或command contract。
- Part與Relation formal editor各自由domain擁有。共用frame不是`UnifiedWorkbench<T>`，不把Part attributes、attachments、Relation tree／matrix或approval decision轉成generic schema。
- `UnifiedPdmEntityDetailDrawer`在DEV-083 covered surface變為read-only composer。`PdmEntityDetailResponse.actionBar`可共用descriptor schema，但drawer mutation intent只能navigate／locked／omitted；full-page command由既有domain API與server policy執行。
- Part／Relation工作台改用controller既有`server-bidirectional`能力與additive`previousCursor/pageIndex` envelope保存精確return。Core只保存opaque cursor；domain adapter仍決定filter/order與server query，不得client join。
- `/approvals/[requestId]`沿用Approval workbench／request owner adapter，擴為三domain reviewer workspace；core不判斷domain decision語意。

Compatible preservation：既有list route、cursor HMAC、bounded read snapshot、projection policy、permission、mutation payload、approval/publication transaction與schema不變。Spec Impact=`Compatible extension + action-placement intentional replacement`；ADR authority為`ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001`的DEV-083 amendment。

Static architecture gate：frame出現domain import／switch、candidate editor多份mount、Part／Relation page建立第二套cursor/controller、drawer保留`fetch` mutation／command runner，或需要新增relation／approval write endpoint時，停止回Dev PM，不得擴張core型別繞過。

Execution boundary：主SPEC已補exact file/function/test inventory、dirty hunk ledger規則與baseline；本compatible extension已在consumer與domain service/repository完成本機實作，focused contract/API、authenticated browser、disposable mutation、typecheck、lint與isolated build通過。最新browser evidence為22 runner checks／三viewport／zero-write network（`output/qa/dev-083-part-relation-fullpage-workspaces/DEV083-20260820T115715Z-6b9c5ec8/manifest.json`）；最新mutation runner manifest `output/qa/dev-083-mutation/DEV083-MUT-20260820T115907Z-a9063105/manifest.json`則以disposable fixture完成31/31 result rows PASS且cleanup=removed，證實candidate／Part／Drawing／Relation Engineer owner/non-owner與Manager／Admin同公司正向、Manufacturing fail-closed、cross-company denial、authority、readback與audit，直接關閉QA-083-11/12/13/17/18/19；最新完整aggregate manifest `output/qa/dev-083-aggregate/DEV083-aggregate-20260820T115712Z-15206e0d/manifest.json`為30 child／29 PASS／1 DEV-072 parent baseline FAIL（`accepted-superseded`），DEV-072 readiness probe每次2秒可取消、legacy marker wait限縮5秒但舊expected保留。DEV-067 parent browser最新18/18 PASS（`output/playwright/dev-067-unified-entity-detail/DEV067-20260820T120043Z-e58ce7cb/manifest.json`）；DEV-072 bounded runner manifest `output/qa/dev-072-pdm-action-discoverability/DEV072-20260820T120228Z-4a4dff7c/run-manifest.json`保留cleanup與obsolete marker觀測，依DEV-079 contract 22/22、layout 3/3與recognition layout 3/3標記`accepted-superseded`，原始failure與expected均保留；`.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md`已記錄QC disposition並關閉QA-083-24。未改產品expected。另在既有Part attachment與Drawing revision upload route補same-company resource guard，未新增schema／permission／lifecycle／write API。`typecheck:app`、DEV-079 contract與DEV-070 browser已重跑PASS。Core mechanics維持validation-only；Part／Relation已切到既有`server-bidirectional`能力。若後續必須把domain state塞進core，停止回Spec Impact。

Implementation delta固定為：Part／Relation client `readLocation`／`writeLocation`保存opaque cursor＋bounded pageIndex並設定`paginationMode: "server-bidirectional"`；兩domain query/service/repository增加signed before/after方向、first/last identity與canonical reverse；`use-pdm-workbench-controller.ts`、`pdm-workbench-pagination.tsx`、`pdm-workbench-contract.ts`、`pdm-workbench-cursor.ts`只做回歸驗證。invalid／scope-mismatch cursor仍fail closed，core不解碼cursor、不判斷domain order、不做client fetch-all或join。

## 0C. DEV-085 Compatible Core Extension：typed multi-selection mechanics（2026-08-20）

Status：`RD Implementation Ready / Human Confirmed / RD Not Started / Local Only / Production Release Gated`。

DEV-085 延伸 shared query/filter mechanics，不把三個 domain 的選項或 SQL 塞進 core：

- 共用 client-safe helper 定義 `{ mode: "all" } | { mode: "none" } | { mode: "some"; values: T[] }`，負責去重、canonical order、legacy scalar／repeated query parse與 URL serialization；共用 popover只擁有草稿、apply/cancel、全選、indeterminate、focus與viewport mechanics。
- domain adapter繼續提供 allowlist、option label/order、無值政策、query normalization、repository欄位與 projection。Core不得出現`if (domain === ...)`選項或 SQL switch。
- canonical URL：`all`省略該 key、`none`使用保留值`__none__`、`some`使用 repeated query keys；舊 scalar deep link仍視為單值 some。Browser遇到invalid value時安全 canonicalize該欄為 none；direct API回傳既有400 error envelope。
- filter hash必須接收正規化、去重、排序後的 arrays與mode，不能依 query key輸入順序變動；controller apply後清空cursor/page history並保留既有abort、latest-response guard與Back/Forward還原。
- repository同欄採 OR、跨欄採 AND，並在limit／projection scan／cursor page boundary之前篩選；none可在資料讀取前安全 short-circuit為零列。`all`須保持現行 scalar-omitted結果、排序與pagination parity。

這是既有 `ADR-PDM-WORKBENCH-CORE-001` 的 compatible extension；不新增domain switch、schema、mutation、permission或lifecycle owner。完整 wire、exact files、phase、acceptance與stop conditions以 `.ai-doc/specs/SPEC-PDM-WORKBENCH-MULTISELECT-FILTER-001-excel-style-filter-contract.md` 為準，驗證以 `.ai-doc/qa/qa-dev-085-workbench-multiselect-filter-validation-plan-2026-08-20.md` 為準。若實作需要client fetch-all、cursor解碼、domain欄位進core或另一套controller，停止回Dev PM／Spec Impact。

## 1. Goal and Non-goals

目標是讓 Drawing、Part、Relation workbench 共用已證明相同的 read/list controller contract，消除三套 URL、cursor、request race、selection 與鍵盤實作。

Non-goals：

- 不建立跨 domain business service。
- 不用同一個 React component 渲染表格、關係樹與 drawing lifecycle。
- 不改 mutation payload、approval/publication transaction、permission codes 或資料表。
- 不讓 core 解讀 Part 欄位、Drawing revision 或 Relation health。

## 2. Exact Shared Type Contract

新增 `src/lib/pdm-workbench-contract.ts`，只能匯入純型別／純 projection 型別，不得匯入 DB、React 或 domain repository。

```ts
export type PdmWorkbenchSourceKind = "candidate" | "formal";

export type PdmWorkbenchAction<ActionKind extends string = string> = {
  kind: ActionKind;
  label: string;
  enabled: boolean;
  disabledReason: string | null;
  href: string | null;
  permissionCode?: string | null;
  contactRole?: string | null;
  adminHref?: string | null;
};

export type PdmWorkbenchPermissionRequirement = {
  permissionCode: string;
  label: string;
  contactRole: string;
  adminHref: string | null;
};

export type PdmWorkbenchTerminalInfo = {
  kind: "cancelled" | "obsolete" | "merged";
  reasonLabel: string;
  nextStepLabel: string;
};

export type PdmWorkbenchRowBase<
  RowKind extends string,
  ActionKind extends string = string
> = {
  rowKey: string;
  rowKind: RowKind;
  sourceKind: PdmWorkbenchSourceKind;
  displayCode: string;
  displayName: string;
  updatedAt: string;
  humanStatus: HumanStatusProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: AvailabilityScopeProjection;
  primaryAction: PdmWorkbenchAction<ActionKind> | null;
  terminal: PdmWorkbenchTerminalInfo | null;
};

export type PdmWorkbenchListResponse<Row, Filters> = {
  rows: Row[];
  nextCursor: string | null;
  generatedAt: string;
  filters: Filters;
};

export type PdmWorkbenchCursorPayload = {
  version: 1;
  filterHash: string;
  updatedAt: string;
  rowKey: string;
};
```

Domain row 以 intersection/extends 加欄位；禁止在 base 加 `rootCode`、`partNumber`、`revision`、`stage`、`health` 或 `module`。

## 3. Signed Cursor Contract

新增 server-only `src/lib/pdm-workbench-cursor.ts`：

```ts
export class PdmWorkbenchCursorError extends Error {
  constructor(public code: "workbench_invalid_cursor", message: string) {}
}

export function pdmWorkbenchFilterHash(input: {
  namespace: "drawing-v1" | "part-v1" | "relation-v1";
  filters: Record<string, string | number | boolean | null>;
  companyId: string;
  actorId: string;
}): string;

export function encodePdmWorkbenchCursor(payload: PdmWorkbenchCursorPayload): string;
export function decodePdmWorkbenchCursor(value: string, expectedFilterHash: string): PdmWorkbenchCursorPayload;
```

不可變規則：

- encode wire format 與 Drawing 現行 `base64url(json).base64url(hmac)` 相同；新 filter hash 明確加入 domain namespace，因此不要求既有 ephemeral cursor bytes 相同。cursor 不在 URL/localStorage 持久化；若 hot reload 遺留舊 cursor，必須走單次400→第一頁復原。
- non-production fallback secret 為相容既有 Drawing local fixture，固定沿用 `ai-pdm-local-drawing-workbench-cursor-v1`；production不得使用fallback。
- production secret 缺失拋 `PDM_WORKBENCH_CURSOR_SECRET_REQUIRED`；local fallback 可用固定 non-production secret，但不得輸出至 response/log。
- malformed、tampered、expired-by-filter、cross-actor、cross-company、cross-domain 一律由 route 映射為 HTTP 400、code `workbench_invalid_cursor`、可行動訊息「清單位置已失效，請從第一頁重新查詢。」
- cursor 不含 display text、permission、company code 或 raw query；不得以 offset 補救。

## 4. Read Snapshot Helper

新增 `src/lib/repositories/pdm-workbench-read-snapshot.ts`：

```ts
export async function withPdmWorkbenchReadSnapshot<T>(
  client: AsyncDatabaseClient,
  read: (snapshot: AsyncDatabaseClient) => Promise<T>
): Promise<T>;
```

- PostgreSQL transaction 第一個 statement 設 `REPEATABLE READ READ ONLY`。
- SQLite 使用同 connection transaction。
- helper 不接受 domain/module 參數，不捕捉或降級錯誤，不回 partial data。
- Drawing repository 的 private `inReadSnapshot` 移除，改用此 helper；結果等價。

## 5. Client Controller Contract

新增 `src/components/use-pdm-workbench-controller.ts`。它只治理 list mechanics，不渲染 domain UI：

```ts
type PdmWorkbenchLocationState<QueryState> = {
  query: QueryState;
  detailKey: string | null;
  legacyDetail: string | null;
};

type UsePdmWorkbenchControllerOptions<Row, Detail, QueryState> = {
  initialLocation: () => PdmWorkbenchLocationState<QueryState>;
  readLocation: () => PdmWorkbenchLocationState<QueryState>;
  writeLocation: (state: PdmWorkbenchLocationState<QueryState>, mode: "replace" | "push") => void;
  buildListUrl: (query: QueryState, cursor: string | null) => string;
  buildDetailUrl: (rowKey: string) => string;
  getRowKey: (row: Row) => string;
  normalizeResponse: (value: unknown) => PdmWorkbenchListResponse<Row, unknown>;
  normalizeDetail: (value: unknown) => Detail;
  detailRowKey: (detail: Detail) => string;
  detailHistoryMode?: "replace" | "push";
};
```

Hook 回傳至少：

```ts
{
  rows, state, error, notice, query, selectedKey, detail,
  loading, detailLoading, nextCursor, pageIndex,
  loadFirstPage, refresh, goNext, goPrevious,
  setQuery, selectRow, openDetail, closeDetail
}
```

Behavior：

- list request 使用 `AbortController` + monotonic request sequence；只有最後一次 request 可 commit。
- detail request 使用獨立 sequence；關閉或切 row 後舊 detail response 不得重開 drawer。
- filter/query 改變：`replaceState`、cursor history 清零、page=1、selection 只在新 rows 仍存在時保留，否則關閉 detail。
- 使用者明確 open/close detail：Part/Relation default `pushState`；Drawing 在 Phase 1A 傳 `detailHistoryMode="replace"` 保持既有可見行為。`popstate` 必須重新解析 URL 並載入/關閉 detail，back/forward 不寫資料。
- next/previous page只更新controller內的cursor history，不寫入History API，因cursor刻意不放可分享URL；reload從第一頁重建。terminal deep link可在detail API成功時自動開啟對應history filter。
- 400 invalid cursor：清 cursor history、回第一頁、顯示一次 notice；不得無限 retry。
- 401：顯示登入復原並保留 same-origin `returnTo`；403 顯示 exact permission/contact role；404 關閉 stale detail 並保留清單；409 顯示重新整理；5xx 保留最後成功 rows 並提供 retry。

## 6. Shared UI Primitive Delta

現有 `src/components/pdm-workbench-list.tsx` 新增：

```ts
containerRef?: Ref<HTMLDivElement>;
onContainerKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
```

容器維持 `role="region"`、`tabIndex={0}`；由 domain 呼叫既有 `useListKeyboardShortcuts`，不得把鍵盤規則重寫進 controller 或各 page。Relation tree 可不用 table primitive，但仍必須使用同一 hook 與 controller。

既有 `PdmEntityDetailDrawer` 是唯一共用 overlay shell。Part/Relation 只能提供 body/content 與 action projection；不得 fork resize、Escape、focus return、mobile full-screen 或 outside-click 行為。

## 7. URL and Compatibility Matrix

umbrella flag off 時行為不變；flag on 時：

| Input | Canonical output | Notes |
|---|---|---|
| `/parts?tab=drafts` | `/parts?view=work` | remove `tab` |
| `/parts?tab=reserved&detail={workspaceId}` | `/parts?view=work&detail=candidate:{workspaceId}` | encoded value |
| `/numbering/part-drafts?...` | `/parts?view=work&legacyFrom=/numbering/part-drafts...` | preserve safe query/returnTo |
| `/numbering/search?tab=reserved` | `/numbering/search?view=work` | remove `tab` |
| `/numbering/search?tab=reserved&detail={workspaceId}` | `/numbering/search?view=work&detail=candidate:{workspaceId}` | source-root candidate detail may resolve to root container |
| `/numbering/request?...` | `/numbering/search?view=work&create=new_bundle&legacyFrom=/numbering/request...` | zero-write until explicit submit |
| `/parts?detail={partNumber}` | canonicalize after successful lookup to `detail=part:{partId}` | 404 keeps list and actionable notice |
| `/numbering/search?detail={rootCode}` | canonicalize after lookup to `detail=root:{rootId}` | no display-code authority after lookup |

`returnTo` 只保留 same-origin path/query；absolute URL、scheme-relative URL、control character 或跨 origin 必須丟棄。open/search/filter/deep-link/canonicalization 全程不得觸發 POST/PATCH/PUT/DELETE。

## 8. API Envelope and Cache Contract

所有新 workbench GET 成功：

- `cache-control: private, no-store`
- JSON envelope 使用 `rows/nextCursor/generatedAt/filters`；detail 使用 `row + source payload + capabilities`。
- error envelope 固定 `{ error: { code, message, retryable, permissionCode?, contactRole?, adminHref? } }`。
- 不回 cursor payload、filter hash、HMAC、company secret、未授權 candidate existence 或 raw DB status。
- route 先 resolve auth/company/permission，再建立 filter hash/read snapshot。
- `PDM_UNIFIED_PART_RELATION_WORKBENCH_V1` off時，Part workbench list/detail與Relation `projection=workbench_v1`/detail回404；legacy GET/UI維持。focused test必須明確開flag，不留暗中可用的新投影。

## 9. Exact Affected-file Boundary

### Phase 1A — Core extraction / Drawing parity

Add：

- `src/lib/pdm-workbench-contract.ts`
- `src/lib/pdm-workbench-cursor.ts`
- `src/lib/repositories/pdm-workbench-read-snapshot.ts`
- `src/components/use-pdm-workbench-controller.ts`
- `scripts/qc-dev-062-workbench-core.mjs`

Modify：

- `src/lib/drawing-workbench.ts`
- `src/lib/repositories/drawing-workbench-async-repository.ts`
- `src/components/drawing-workbench.tsx`
- `src/components/pdm-workbench-list.tsx`
- `scripts/qc-dev-053-drawing-workbench-read-model.mjs`
- `scripts/qc-dev-053-drawing-workbench-ui.mjs`

### Phase 1B — Part adapter

Add：

- `src/lib/part-workbench.ts`
- `src/lib/repositories/part-workbench-async-repository.ts`
- `src/app/api/parts/workbench/route.ts`
- `src/app/api/parts/workbench/[rowKey]/route.ts`
- `src/components/part-workbench.tsx`
- `src/components/part-detail-content.tsx`
- `scripts/qc-dev-062-part-workbench.mjs`

Modify：

- `src/app/parts/page.tsx`
- `src/components/number-state-workspace.tsx`
- `src/components/numbering-contextual-entrypoints.tsx`
- `src/lib/repositories/numbering-async-repository.ts`（新增 batch-by-id read；不得改 mutation）

### Phase 1C — Relation adapter

Add：

- `src/lib/relation-workbench.ts`
- `src/lib/repositories/relation-workbench-async-repository.ts`
- `src/app/api/numbering/relations/[rowKey]/route.ts`
- `src/components/relation-workbench.tsx`
- `scripts/qc-dev-062-relation-workbench.mjs`

Modify：

- `src/app/api/numbering/relations/route.ts`
- `src/app/numbering/search/page.tsx`
- `src/lib/repositories/numbering-async-repository.ts`（只加 bounded batch read）

### Phase 1D — Compatibility / gates

Modify：

- `src/lib/number-state-flow-feature.ts`
- `src/app/api/numbering/state-flow/status/route.ts`
- `src/lib/number-state-flow-legacy-route.ts`
- `src/middleware.ts`
- `.env.example`
- `package.json`
- affected DEV-048/053/055/QC scripts（改驗 public behavior，不保留 source-string coupling）

若 RD 需要超出上述邊界，先依 stop condition 判斷；單純 test fixture/helper 可在同 phase 新增，但不得藉此改 authority/schema/release。

## 10. Query Budget and Performance Gate

以 `limit=50` Part、`limit=60` Relation、單一 company、IDs 不超過 400 為測試上限：

| Read | Hard budget | N+1 rule |
|---|---:|---|
| Drawing lifecycle overlay parity | 3 queries | 0 per drawing |
| Part list（candidate + formal + filters/options，Lifecycle V2 on） | <= 15 queries | 0 per part/workspace |
| Part candidate detail | <= 13 queries | 0 per child item/file |
| Part formal detail | <= 6 queries | 0 per linked drawing/cost profile |
| Relation list（roots + narrow candidate summaries + drawing lifecycle + options） | <= 18 queries | 0 per root/drawing/part |
| Relation root detail | <= 10 queries | 0 per child node |
| Relation candidate detail | <= 13 queries | 0 per child item/file |

Query-budget test 必須使用 counting client 並比較 legacy/new output；只以 AST 找到 `IN (...)` 不足以通過。若 ID chunk 超過 400，budget 可按 chunk 線性增加，但仍不得按 row/root 增加。

代表性 local fixture（50 Part rows、60 roots、每 root 3 drawings/5 parts）之 BFF p95 應 <= 500 ms；真實 browser 搜尋 debounce 後可見更新 p95 <= 800 ms。這是本機 focused gate，不宣稱 production SLO。

## 11. Architecture Static Gates

`scripts/qc-dev-062-workbench-core.mjs` 必須 AST 驗證：

- core files 無 `module ===`、`switch(module)`、`"parts"|"search"|"drawings"` domain rendering branches。
- Part/Relation component 不宣告自己的 `AbortController`、cursor encode/decode 或 `popstate` controller；這些只能由共用 hook/core 提供。
- Part/Relation server adapter 使用共用 cursor/snapshot；不得 client merge candidate/formal。
- Relation 新增 route 中沒有 POST/PATCH/PUT/DELETE；mutation 仍只有 canonical parent route/owner APIs。
- `search/page.tsx` 不再 import `parts/page.tsx`；owner detail import 來自 `src/components/part-detail-content.tsx`。
- page 不再掛載 `NumberStateModuleTabs` 或依 `activeTab` 決定新單頁 UI。

## 12. Phase Exit Gates

### 1A

- Drawing cursor wire format、tamper/filter recovery行為相容，row/detail deep-equal，URL/history/permission/visible behavior parity；namespace導致的ephemeral cursor hash改變依400→第一頁契約驗證。
- core static gate、DEV-053 focused read/UI regression、typecheck 通過。
- 未完成時不得開始 Part/Relation 複製 core mechanics。

### 1B

- Part candidate/formal single list、server filter/cursor/detail、owner capability parity、legacy flag-off rollback 通過。
- 不得產生 Part Revision；Part list/detail cost redaction parity 通過。

### 1C

- Relation root unique、source-root overlay、source-less candidate、matrix/health/owner drawer parity通過。
- `/api/numbering/relations` 無 per-root detail N+1；POST contract不變。

### 1D

- compatibility matrix、browser race/back-forward/reload、responsive/accessibility、cross-role/cross-company、zero-write hashes、aggregate regression 全過。
- 兩個模組 capability parity matrix 無缺項，才能將 DEV-062 標成 Local RD Implemented；只完成 core 或單一模組不得結案。

## 13. RD Start / Stop Contract

RD 可依 1A → 1B → 1C → 1D 直接開始本機實作，phase 間不得跳過 exit gate。遇到 ADR re-entry trigger、schema/data mutation、permission/lifecycle/approval authority 變更、無法在 hard query budget 內正確投影、或需要 production/deploy/release 時立即停止並回 Dev PM。
