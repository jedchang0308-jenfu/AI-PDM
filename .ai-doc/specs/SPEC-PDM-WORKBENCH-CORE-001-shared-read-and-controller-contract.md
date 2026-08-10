# SPEC-PDM-WORKBENCH-CORE-001：共用讀取、游標與 Controller 開發契約

Status: `Local RD Implemented / QA-QC Passed / Release Gated`
Date: 2026-08-10
Owner: Dev PM
Related DEV: `DEV-062`
Related ADR: `.ai-doc/decisions/ADR-PDM-WORKBENCH-CORE-001-shared-mechanics-and-domain-adapters.md`
Related QA: `.ai-doc/qa/qa-dev-062-unified-part-relation-workbench-validation-plan-2026-08-10.md`

本規格只治理跨模組「機制」，不重複定義 Part／Relation 產品行為。料號單頁行為以 `SPEC-PDM-NUMBER-STATE-FLOW-001` 的 DEV-062 amendment 為準；圖料單頁行為以 `SPEC-PDM-DRAWING-PART-RELATION-VIEW-001` 的 DEV-062 amendment 為準。

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
