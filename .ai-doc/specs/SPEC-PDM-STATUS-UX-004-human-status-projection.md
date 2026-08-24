# SPEC-PDM-STATUS-UX-004：任務導向的人類狀態投影

狀態：`Phase 1 + Phase 2 Local RD Implemented / Human Confirmed / Full Aggregate QC Passed / Production Release Gated`
日期：2026-08-07
關聯 DEV：`DEV-055` / `DEV-PDM-HUMAN-STATUS-PROJECTION-001`；現行責任語彙 amendment：`DEV-078` / `DEV-PDM-RESPONSIBILITY-STATUS-VOCABULARY-001`；生命週期依賴：`DEV-052`、`DEV-053`
風險：Medium
目前執行邊界：DEV-078 Phase 1A～1D與Phase 2 P2-A～P2-D本機／隔離runtime產品實作與QA/QC均已完成；不含schema、migration、正式／staging資料、production、deploy、release、commit或PR。
DEV-078 文件邊界：Phase 1與Phase 2均為`Local RD Implemented / Full Aggregate QC Passed`，詳見§18與§19.7；Phase 1歷史證據仍不得單獨取代Phase 2證據。

> **2026-08-22 DEV-087 target supersession（RD Implementation Ready）**
>
> DEV-087的新決策優先。現有`humanStatus／viewerStatus／responsibilityStatus／availabilityScope`投影只保留為activation前runtime與歷史驗證證據；activation後三工作臺只讀`canonical_workbench_states.handling`並映射固定角色文字。舊projector、reason tooltip、status filter與API欄位必須依DEV-087 retirement gate移除，不得保留compatibility fallback。其他非三工作臺domain若仍需舊投影，必須在inventory明確證明為獨立domain evidence，不能再驅動三工作臺。

> **2026-08-20 DEV-086 lane-row target amendment（RD Implementation Ready / Not Implemented）**
>
> `量產最新版`與`研發最新版`是同一 canonical group 內兩種使用目的／效力 lane，不是競爭的 workflow status。每個實際 lane row 仍必須且只能顯示一個主要 `humanStatus`；lane label、目標量產版、reference kind、availability 與用途說明不得偽裝成第二／第三個狀態 badge。兩 lane 必須以可見文字、icon／位置與 row grouping 區分，不得只靠顏色。完整 authority 與 UI 契約見 `SPEC-PDM-WORKBENCH-PRODUCTION-RD-LANES-001`；現行 runtime 尚未實作。

## 1. 問題與產品目標

目前清單把 workflow、master record、usage、relation health、warning 等不同資料軸直接堆成多個 badge。使用者必須自行判斷哪個最重要，且「草稿確認」等文案無法分辨已完成或待完成。

Phase 1 的產品結果固定為：

- 圖號、料號、圖料清單的每個可選物件最多一個主要狀態。
- 使用者不讀說明即可分辨 viewer 狀態：待你處理、等他人處理、系統處理中、具體可用範圍、已結束；責任缺口必須明確標示為負責人待確認。
- 使用者需要原因時，滑過、聚焦或點擊主狀態即可看到同一個人類語言說明層；說明層回答「現在發生什麼、誰要處理、會不會自動完成、下一步」。
- 同一物件從 owner module 或圖料工作台開啟時，狀態、主要 CTA 與 drawer 核心內容一致。
- drawer 維持覆蓋式，開著時可連續點清單切換，不推擠清單。
- 完成語法只由可追溯證據產生；不得由 `Draft`、`NeedInfo` 或「沒有 blocker」推論已確認。

## 2. Human Decisions

- 維持覆蓋式 drawer，不改成清單與 drawer 並排。
- drawing、part 必須共用 owner detail；圖料工作台不得維護第二套內容。
- drawer 關閉鈕屬 header inline action，不得另做浮動 X 或上一筆／下一筆控制盒；快速查閱直接點背景清單列。
- list 第一層只顯示一個主要狀態；counts、分類與識別資訊不得偽裝成競爭狀態。
- 移除「草稿確認」。若未來需要獨立關聯確認，必須先建立確認人、時間與 relation version/fingerprint evidence。
- 客觀 `humanStatus` 不因登入者而改變；第一層另由 `viewerStatus` 根據 assignee、reviewer 或角色責任呈現。不得讓實際負責人看到無行動方向的「等待中」。
- 圖號總表只保留圖號、品名、工作狀態三欄；刪除重複的「下一步」欄。主要操作留在明細抽屜，狀態 popover 只提供可發現的下一步說明。

## 3. 第一性原則與資訊層級

列表只回答三件事：能不能用、是否有問題、下一步是什麼。

| 層級 | 顯示規則 | 例子 |
|---|---|---|
| 決策 | 一定顯示，且只有一個 viewer 分類 | 待你處理、等他人處理、系統處理中、生產可用／研發可用、已結束 |
| 例外 | 只有發生時顯示，併入主要狀態或展開明細 | 發布失敗、資料衝突 |
| 識別 | 跟名稱／編號放一起，非狀態 badge | M 製造圖、3D CAD、系列 |
| 數量 | 低強度文字，不使用狀態色 | 1 圖號・3 料號 |
| 原始狀態／稽核 | 預設收合，只在明細或第二層說明顯示 | recordStatus、workflow、usage、source code |

## 4. Architecture Decision

權威資料流固定為：

`Entity → status sources → domain projector → HumanStatusProjection → responsibility resolver → ViewerHumanStatusProjection + AvailabilityScopeProjection → API DTO → list / drawer / filter`

規則：

1. projector 是 server/domain read projection；client component 只能 render API 回傳結果。
2. drawing、part、relation root 各有 projector；禁止使用 `generic` projector 或 page-local label map。
3. list 與 drawer 必須取得同一 projector 的輸出；不得各自用 raw status 推導。
4. human status 只讀、不寫回 domain status，不成為新的 lifecycle authority。
5. `SPEC-PDM-STATUS-UX-001～003` 繼續治理字典、axis、help 與 raw-code shielding；本規格只治理第一層決策投影。
6. assignee／reviewer 證據優先於角色權限；沒有個人指派欄位時才允許以 role capability 表示共享工作佇列。禁止用生成式 AI 猜負責人。
7. viewer-specific API 必須回傳 `Cache-Control: private, no-store`，避免跨帳號狀態污染。
8. `availabilityScope` 是可使用範圍，不是另一套 workflow status；不得用 `研發可用／生產可用` 取代待處理、等待或終止狀態。

## 5. Shared Contract

### 5.1 Types

建立 `src/lib/human-status-projection.ts`：

```ts
export const HUMAN_STATUS_PHASES = [
  "action_required",
  "waiting",
  "ready",
  "usable",
  "terminal"
] as const;

export type HumanStatusPhase = (typeof HUMAN_STATUS_PHASES)[number];
export type HumanStatusTone = "danger" | "warning" | "info" | "success" | "neutral";
export type HumanStatusIcon = "alert" | "clock" | "play" | "check" | "archive";

export type HumanStatusAction = {
  kind: string;
  label: string;
  enabled: boolean;
  href: string | null;
  disabledReason: string | null;
};

export type HumanStatusProjection = {
  schemaVersion: 1;
  key: HumanStatusKey;
  phase: HumanStatusPhase;
  label: string;
  tone: HumanStatusTone;
  icon: HumanStatusIcon;
  nextAction: HumanStatusAction | null;
};
```

`HumanStatusKey` 是封閉 union，Phase 1 至少包含：

```ts
type HumanStatusKey =
  | "cancelled" | "obsolete" | "merged"
  | "formalization_failed" | "release_status_mismatch" | "data_conflict" | "main_drawing_invalid"
  | "missing_manufacturing_drawing" | "missing_part" | "correction_required"
  | "data_needs_review"
  | "waiting_review" | "finalizing" | "preparing"
  | "ready_to_submit"
  | "usable" | "rd_controlled" | "released" | "relation_complete";
```

禁止 API 回傳未註冊 key、raw enum label 或自由字串 phase。`schemaVersion` 供 additive contract 演進；Phase 1 固定為 `1`。

### 5.2 Viewer-specific contract（2026-08-07 additive）

API DTO 在 `humanStatus` 旁新增 `viewerStatus: ViewerHumanStatusProjection`：

```ts
type ViewerHumanStatusProjection = {
  schemaVersion: 1;
  category: "current_user" | "other_user" | "system" | "usable" | "terminal" | "unknown";
  label: "待你處理" | "等他人處理" | "系統處理中" | "可使用" | "已結束" | "負責人待確認";
  tone: HumanStatusTone;
  icon: HumanStatusIcon;
  basis: "assignee" | "reviewer" | "role_capability" | "system" | "objective" | "unknown";
  canAct: boolean;
  actorLabel: string;
  nextStep: string | null;
};
```

決策規則：

1. `assignee/reviewer === current user` → `待你處理`；即使缺權限仍不得降為等待，detail 必須說明權限阻擋。
2. 已知由他人負責 → `等他人處理`。
3. 只有可證明為背景 job 的 `finalizing` → `系統處理中`；不得把人工工作包裝成系統等待。
4. 無個人 assignment model 的 part/relation，以 `role_capability` 判定共享佇列：有權限者 `待你處理`，其他人 `等他人處理`。
5. `usable/terminal` 只依客觀 evidence；使用者介面不以模糊的 `可使用` 作為獨立篩選或主要列表標籤，改顯示具體可用範圍或資格待確認。
6. 無法辨識責任時 fail closed 為 `負責人待確認`，不得猜測姓名或責任。

### 5.3 Availability scope contract（2026-08-07 additive）

`humanStatus` 的 `usable` 只回答「目前可使用」；API 另回傳 `availabilityScope`：

```ts
type AvailabilityScopeProjection = {
  schemaVersion: 1;
  scope: "none" | "rd" | "production" | "unknown";
  label: "研發可用" | "生產可用" | "可用範圍待確認" | null;
  basis: "lifecycle" | "release_evidence" | "dependency" | "record" | "conflict" | "none";
  summary: string;
};
```

規則：

1. `official_controlled / rd_controlled` → `rd / 研發可用`。
2. `released` 且無發布衝突 → `production / 生產可用`。
3. 料號只有在必要製造圖存在，且料號與主要製造圖都具正式發布證據時，才可輸出 `production`；圖料根號還要確認關聯料號與製造圖依賴全部正式發布。
4. 圖料關係不完整、主要製造圖未正式發布或發布資料衝突時，不得顯示「生產可用」；輸出 `none` 或 `unknown`。
5. `availabilityScope` 只在第一層主狀態為 `usable` 時改寫 badge 文案；若沒有具體範圍，顯示 `可用範圍待確認`，其他狀態仍顯示 viewer responsibility label。
6. generic search 可顯示 `研發可用／生產可用`；詳細說明補一句人類語言，不新增第二個 badge。
7. 工作狀態篩選器必須使用共用 `HumanStatusFilterSelect`，選項文字與總表 `HumanStatusBadge` 共用同一套 `humanStatusDisplayLabel`／display vocabulary；`可使用` 不得作為獨立篩選項，改由 `生產可用`、`研發可用` 與 `可用範圍待確認` 呈現可用範圍，責任未知則使用 `負責人待確認`。

### 5.4 Priority

唯一優先序：

1. terminal：取消、作廢、合併。
2. failed / blocker：發布失敗、主圖失效、資料衝突、需修正。
3. missing：缺製造圖、缺料號、缺必要條件。
4. waiting：審核中、正式化中、準備中。
5. ready：可送審、可發布。
6. usable / completed：研發受控、已發布、關聯完整。

同一優先層有兩個互斥證據時，輸出 `data_needs_review / 資料需確認`，不得任選一個較樂觀狀態。

### 5.5 Completion Evidence Gate

| 可見文案 | 最小證據 |
|---|---|
| 已發布 | drawing lifecycle `released` 或既有 publication/release evidence；不能只看 `recordStatus=Active` |
| 研發受控 | drawing lifecycle `rd_controlled` 或現有 drawing workbench usage authority |
| 關聯完整 | relation blocker 為 0，且必要 part、primary manufacturing drawing 與唯一性條件成立 |
| 已作廢／已合併／已取消 | terminal record/lifecycle event |
| 可送審 | 現有 drawing workbench `bundle_ready` 與 enabled capability；relation root 不得自行推論 |

`Draft`、`NeedInfo`、無 blocker、按鈕存在或 client local state 都不是「已確認」證據。

## 6. Domain Projectors

### 6.1 Drawing

權威輸入：`DrawingWorkbenchRow` 的 `stage`、`usage`、`terminal`、`warning`、`releaseStatusMismatch`、`primaryAction` 與 lifecycle overlay。

`src/lib/drawing-workbench-status.ts` 改為 server projection authority；`DrawingWorkbenchRow` 新增 `humanStatus`，由 `src/lib/drawing-workbench.ts` 建 row 時一次產生。

| 輸入 | human status |
|---|---|
| `history_only` + cancelled / obsolete / merged | 已取消／已作廢／已合併，terminal |
| `releaseStatusMismatch` | 發布狀態異常，action_required |
| `recovery_required` | 正式化失敗，action_required |
| `correction_required` | 待修正，action_required |
| `building` / `drawing_preparation` | 建立中／準備中，waiting |
| `bundle_ready` | 可送審，ready |
| `in_review` / `revision_in_review` | 待審核，waiting |
| `auto_finalizing` | 發布中，waiting |
| `official_controlled` | 研發受控，usable |
| `released` | 已發布，usable |

`nextAction` 必須直接轉接現有 `primaryAction`；不得另猜 permission 或建立第二套 action label。

### 6.2 Part

建立 `src/lib/part-human-status.ts`。權威輸入：`recordStatus`、`itemKind`、`primaryDrawingNumber` / `hasManufacturingDrawing`。

| 條件 | human status |
|---|---|
| `Obsolete` / `Merged` | 已作廢／已合併，terminal |
| `MainDrawingInvalid` | 主圖失效，action_required |
| manufactured 且無 primary manufacturing drawing | 缺製造圖，action_required |
| `Rejected` / `NeedInfo` | 待修正，action_required |
| `PendingReview` / `PendingAdminConfirm` | 待審核，waiting |
| `Draft` | 準備中，waiting |
| `Released` | 已發布，usable |
| `Active` | 可使用，usable；key=`usable`，且只有前述 blocker 均不存在才可輸出 |

`pendingCostRequestCount`、標準成本與 variant completeness 是 detail domain，不得覆蓋本 Phase 的 PDM 主要狀態；有成本任務時保留為低強度次要提醒。

### 6.3 Relation Root

建立 `src/lib/drawing-part-relation-status.ts`。權威輸入：root terminal state、`relationshipHealth`、blockers 與現有 `nextStep`。

| 條件 | human status |
|---|---|
| root `Obsolete` / `Merged` | 已作廢／已合併，terminal |
| root `MainDrawingInvalid` | 主圖失效，action_required |
| `ambiguous` | 檢查主圖，action_required |
| `blocked` | 關聯受阻，action_required |
| `missing_manufacturing_drawing` | 缺製造圖，action_required |
| `missing_part` | 缺料號，action_required |
| `draft` 且無 blocker | 準備中，waiting；禁止「草稿確認」 |
| `complete` | 關聯完整，usable；不得等同已發布或可製造 |

relation drawing／part child node 必須使用 drawing／part owner projector。relation API 需批次取得 drawing lifecycle overlay；禁止只用 child `recordStatus` 產生另一套狀態。

## 7. API Contract

全部是 additive read contract；既有 raw fields、query parameters、write API 與 permission gate 不變。

### 7.1 Drawing Workbench

- `GET /api/numbering/drawings/workbench`
- `GET /api/numbering/drawings/workbench/[rowKey]`

每個 `row` 新增客觀 `humanStatus`、登入者專屬 `viewerStatus` 與 `availabilityScope`。list/detail 對同一 `rowKey`、同一 actor 必須完全相同。

list query：`humanStatus=all|needs_action|waiting|system|production|rd|availability_unknown|needs_confirmation|history`；舊 `usable`／`ready` URL 僅保留相容解析，不再作為第一層選項。

映射：

- `needs_action` → viewer `current_user`
- `waiting` → viewer `other_user | unknown`
- `system` → viewer `system`
- `production` / `rd` / `availability_unknown` → viewer `usable` 且依 `availabilityScope` 精確比對
- `needs_confirmation` → viewer `unknown`，顯示 `負責人待確認`
- `history` → viewer `terminal`

`humanStatus` 必須加入 opaque cursor 的 `filterHash`。既有 `DrawingWorkbenchAsyncRepository.readListPage()` 已支援 scan → project → filter → fill page；把 phase filter放在 callback 內、slice 之前，不得只 filter 當頁。

### 7.2 Parts

- `GET /api/parts`
- `GET /api/parts/[partNumber]`

list/detail DTO 新增 `humanStatus`、`viewerStatus`、`availabilityScope`。`/api/parts` 接受同一 `humanStatus` query；本輪以 bounded read 後 server project/filter 再套 response `limit`，不新增 client pagination 或 `nextCursor`。若後續開放分頁，必須以 `(root_code, sequence_no, part_number, id)` 建立穩定 keyset cursor，並把 filter hash 綁定 query、series、company、human status 與 availability scope。

禁止把 human status 寫入 `PartNumberRecord` 或 DB；repository 回 raw record，route/service adapter 附加 projection。

### 7.3 Drawing-Part Relations

- `GET /api/numbering/relations`

root、drawing child、part child DTO 都新增 `humanStatus`、`viewerStatus`、`availabilityScope`。root row 只 render root projection；child node 只 render各自 owner projection。

API 接受同一 `humanStatus` query，語意是篩 root 的主要狀態。本輪先以 bounded read 載入候選 root、逐筆 detail project/filter 後套 response `limit`；不新增 client pagination 或 `nextCursor`。若後續開放分頁，必須先建立 stable root identity scan，並將 query、entityType、recordStatus、series、company 與 human status 綁入 cursor。

drawing child 的 owner projection由 `DrawingWorkbenchService.projectDrawingsByIds()` 批次產生；workbench routes 與 relation route 共用 `resolveDrawingWorkbenchActorAsync()`，不得複製九組 capability 判斷或擴權。

### 7.4 Error Shape

- 未知或互斥 domain evidence：200，單筆投影為 `data_needs_review / 資料需確認`。
- query/cursor 無效：400，沿用使用者可理解訊息，不回顯 raw query internals。
- source read 或 projector infrastructure failure：500，route 回既有安全錯誤；不得回部分舊資料冒充成功。
- permission：沿用既有 401/403；human status 不得改變資料可見性。

## 8. Shared UI Contract

### 8.1 Component

新增 `src/components/human-status-badge.tsx`：

- 輸入是 `HumanStatusProjection`、可選 `ViewerHumanStatusProjection` 與 `AvailabilityScopeProjection`。
- 第一層只 render icon + 四分類主標籤，不能只靠顏色。
- hover、focus、click 開啟同一個說明層；`Escape` 可關閉，click 不得觸發父列選取或導覽。
- 說明層只使用人類語言，固定回答：`目前狀況`、`誰要處理`、`是否會自動完成`、`下一步`。
- `usable` 狀態主標籤顯示 `研發可用`、`生產可用` 或 `可用範圍待確認`；不得以模糊的 `可使用` 作為列表篩選項或主要 badge。
- DOM 固定 `data-human-status-key`、`data-human-status-phase`，供 QC 讀取。
- 不接受 raw status，不內建 label map，不呼叫 projector。

主標籤投影固定為：`action_required/ready → 待你處理`、`waiting → 等他人處理`、`usable → 依 availability scope 顯示生產可用／研發可用／可用範圍待確認`、`terminal → 歷史`；責任無法辨識時顯示 `負責人待確認`。原本的細分文案保留在投影資料與第二層說明，不在清單重複顯示。

### 8.2 Lists

- `src/components/drawing-workbench.tsx`：`WorkbenchStatusCell` 改用 `row.humanStatus`，移除同格的 master record、usage、pending、mismatch、warning 多 badge；阻擋原因只在主狀態或展開 detail 出現。
- `src/app/parts/page.tsx`：狀態欄只 render `HumanStatusBadge`。成本審核可保留為無狀態色的次要文字；不得與主要狀態並列成 badge。
- `src/app/numbering/search/page.tsx`：root header 只 render root `HumanStatusBadge`；刪除 `RelationHealthChip + StatusBadge` 雙狀態與 `draft: 草稿確認` map。drawing／part child 各最多一個 owner status。
- counts 使用低強度文字；分類跟 identity 放一起；正常列不加解釋句。
- 桌面目標 row 高度 52～60px；selected state 只用左側 accent + 淡底，不再複製狀態。

### 8.3 Drawers

- drawing 沿用 `PdmDetailDrawer` + `DrawingDetailContent`。
- part owner page 刪除自製 `.pdm-detail-drawer-backdrop/aside/floating-actions` shell，改用 `PdmDetailDrawer` + `PartDetailPanel`。
- relation drawing/part target 繼續 render相同 `DrawingDetailContent` / `PartDetailPanel`；不得新增 forked summary card。
- drawer header：identity + 同一 human status + 一個 primary CTA + inline X。
- 不顯示獨立浮動 X、上一筆／下一筆控制盒；使用者直接點清單切換。
- drawer body 是唯一 scroll owner；切換 entity 後 scrollTop 回 0，loading state綁定新 identity，不得顯示上一筆內容。
- 低風險次要操作可以存在，但不能與 primary CTA 同視覺權重。

### 8.4 Client Race and Recovery

- 每次 drawer 切換 abort 前一個 detail request，並以 target identity/request sequence 拒絕過期 response。
- detail 失敗時 header 保留被點選 identity，body 顯示「載入失敗」與重試／關閉；不得保留上一筆 detail。
- filter／reload 後 selected entity 不在結果時關閉 drawer並清除 URL detail。
- Escape 關閉 drawer，焦點回原列；背景清單保持可點。

## 9. Exact File Impact

### 9.1 New

| File | Responsibility |
|---|---|
| `src/lib/human-status-projection.ts` | shared closed contract、filter mapping、assertions |
| `src/lib/part-human-status.ts` | part projector |
| `src/lib/drawing-part-relation-status.ts` | relation root projector |
| `src/components/human-status-badge.tsx` |唯一 status renderer |
| `scripts/qc-dev-055-human-status-projection.mjs` | projector matrix/evidence/precedence |
| `scripts/qc-dev-055-human-status-contract.mjs` | additive DTO、list/detail parity、filter ordering、one badge、shared authority static guard |
| `scripts/qc-dev-055-human-status-browser.mjs` | real browser flow、viewport、drawer switching、visible errors |

### 9.2 Modify

| File | Required change |
|---|---|
| `src/lib/drawing-workbench-status.ts` | replace multi-badge presentation with drawing projector |
| `src/lib/availability-scope.ts` | derive R&D/production usability from lifecycle and dependency evidence |
| `src/lib/drawing-workbench.ts` | attach projection、humanStatus query/filterHash、batch project by IDs |
| `src/lib/repositories/drawing-workbench-async-repository.ts` | reuse scan/project/filter; no schema change |
| `src/lib/repositories/numbering-repository.ts` | expose optional primary drawing record status；future pagination cursor must preserve SQLite compatibility |
| `src/lib/repositories/numbering-async-repository.ts` | expose primary drawing record status in async bounded read contracts |
| `src/lib/numbering-async.ts` | expose bounded projection list adapters |
| `src/app/api/numbering/drawings/workbench/route.ts` | existing actor guard、additive projection/filter |
| `src/app/api/numbering/drawings/workbench/[rowKey]/route.ts` | existing actor guard、detail parity |
| `src/app/api/parts/route.ts` | list projection/filter；future pagination must preserve cursor contract |
| `src/app/api/parts/[partNumber]/route.ts` | detail projection parity |
| `src/app/api/numbering/relations/route.ts` | root/child projection、root filter、remove draft completion language |
| `src/components/drawing-workbench.tsx` | render one server projection in list/drawer |
| `src/app/parts/page.tsx` | one status、shared drawer shell、race recovery |
| `src/app/numbering/search/page.tsx` | one root status、owner child status、remove local status maps |
| `src/components/pdm-detail-drawer.tsx` | only if shared header/body data hooks are required; no new floating controls |
| `src/app/globals.css` | compact badge/row/drawer rules; retire obsolete floating-action rules when unreferenced |
| `package.json` | register three focused commands and aggregate `qc:dev-055` |

`src/app/numbering/drawings/page.tsx` 的 flag-off legacy UI 不在 Phase 1 修改；本機驗收必須在既有 unified drawing workbench flag-on contract 執行。不得為 DEV-055 新增第二個 feature flag。

## 10. Data, Migration, Permission and Compatibility

- DB/schema/index/migration：無；只增加 read projection 與既有查詢的主要製造圖 record status 欄位。
- historical data backfill：無。
- write API、transaction、idempotency：無變更；此功能只讀。
- permission：沿用現有 page/action capability；共用 resolver 只能去重，不能擴權。
- backward compatibility：raw fields 與既有 filters 保留；`humanStatus` 與 query 是 additive。Drawing workbench 的既有 `nextCursor` 不變；parts/relations 本輪不新增 cursor。
- cache：三個 list/detail read API維持 private/no-store；projection不得跨 company／actor capability共用。
- availability：不得只以料號 `Active` 或無 blocker 推論生產可用；必須保留主要製造圖發布證據。
- feature rollout：直接替換 active UI presentation，不建立 parallel UI 或新 toggle。

## 11. RD Execution Slices

依序執行；前一 slice gate 失敗即停止，不跨 slice 掩蓋。

### Phase 1A — Contract and Projectors

- 建立 shared contract、badge component與三個 domain projector。
- drawing projector沿用 workbench row/action authority。
- 完成 HS-01～HS-21 與 availability scope matrix tests，涵蓋正式發布、研發受控、缺製造圖、主要製造圖未發布與衝突 fallback。

Gate：`qc:dev-055:projection`、TypeScript、scoped lint 通過；P0/P1 mapping gap 為 0。

### Phase 1B — Server Projection and Filtering

- drawing list/detail attach同一 projection。
- part list/detail attach同一 projection並在 response limit 前完成 server filter；pagination cursor列為 future capsule。
- relation root/child attach owner projection並在 response limit 前完成 server filter；root scan/cursor列為 future capsule。
- 抽出 shared workbench actor resolver；確認 permission parity。

Gate：`qc:dev-055:contract` 通過；同 entity list/detail projection parity；filter ordering、permission 與 additive DTO 無失真。Drawing workbench 的 opaque cursor 維持既有 scan/project/filter/fill-page；parts/relations 本輪未新增 client pagination，採 bounded read + server projection，後續若開放分頁必須沿用同一 filter-before-limit 規則。

### Phase 1C — Lists and Shared Drawers

- 三 route 改用 `HumanStatusBadge`。
- 刪除「草稿確認」、多 badge、page-local human label map。
- part owner page 改用 `PdmDetailDrawer`；relation target維持 owner content reuse。
- 完成 loading、stale response、retry、Escape、focus return。

Gate：`qc:dev-055:contract` 及既有 drawer/layout regressions 通過。

### Phase 1D — Browser QA/QC

- 固定專案本地入口，執行三 route、三 viewport、HS fixtures與快速查閱。
- 跑 full focused suite與 visible-error sweep，產生 evidence report與截圖。

Gate：`qc:dev-055:browser`、`qc:dev-055`、既有 regression、TypeScript、lint 全部通過；P0/P1 finding 為 0。

## 12. Acceptance Criteria

- `AC-01` 三個總表與可選 child node 每個物件最多一個主要狀態 badge。
- `AC-02` 主畫面找不到「草稿確認」，且完成詞均通過 evidence gate。
- `AC-03` 完成、等待、可執行、阻擋、終止不用顏色也能分辨。
- `AC-04` 同一 entity 的 list、owner drawer、relation drawer `schemaVersion/key/phase/label/nextAction` 一致。
- `AC-05` drawing／part 從圖料與 owner module 開啟時共用 detail component；無 forked content。
- `AC-06` drawer 覆蓋清單、可連續點列、只有 header inline X，無 floating control box。
- `AC-07` 正常狀態無同義重複；counts 與分類不偽裝成 status。
- `AC-08` human status filter 在 response limit 前由 server 執行；drawing workbench 跨頁 cursor 仍維持既有 scan/project/filter/fill-page。Parts/relations 尚無 client pagination，不能宣稱跨頁 cursor 已交付。
- `AC-09` 1440x900、1024x768、390x844 無水平 overflow、重疊、裁切或雙 scroll owner。
- `AC-10` stale detail、unknown evidence、API error 有安全 fallback，不顯示上一筆或 raw code。
- `AC-11` 既有 permission、lifecycle、publication、relation write與 production-slice gate 無退化。
- `AC-12` raw status與狀態軸仍可在收合 detail/help 查閱，但不回到 list 第一層。

## 13. QA/QC Commands and Evidence

RD 必須在 `package.json` 註冊：

```powershell
npm.cmd run qc:dev-055:projection
npm.cmd run qc:dev-055:contract
npm.cmd run qc:dev-055:browser
npm.cmd run qc:dev-055
```

既有 regression：

```powershell
npm.cmd run qc:pdm-status-ui-vocabulary
npm.cmd run qc:pdm-status-scope-coverage
npm.cmd run qc:pdm-drawing-part-relation-view
npm.cmd run qc:pdm-entity-detail-drawer
npm.cmd run qc:pdm-master-workbench-layout
npm.cmd run typecheck
npm.cmd run lint -- --quiet
```

證據根目錄固定為 `output/qc-pdm-human-status-projection/`，至少包含 projector matrix JSON、API/filter report、static authority report、browser metrics、visible-error report與 1440／1024／390 截圖。

完整計畫：`.ai-doc/qa/qa-pdm-human-status-projection-validation-plan-2026-08-06.md`。

## 14. Failure Recovery and Stop Conditions

Failure recovery：

- projector對未知資料回 `data_needs_review`，不丟 raw enum給 UI。
- API/load failure保留清單，drawer可重試或關閉；過期 response丟棄。
- 任一 focused gate失敗，回送目前 slice RD修正；不得以改 expected text掩蓋產品語意錯誤。
- 因 additive DTO不涉及持久資料，本機回復方式是 revert DEV-055 scoped source changes；不需 data rollback。

立即停止並重新進入規劃：

- 正確判斷「已確認」需要新增 confirmation schema或正式資料回填。
- 同一完整證據在同一 domain 得出互斥 primary status。
- 需要 `generic` fallback 或 client-side projector才能覆蓋主要物件。
- filter只能套用目前頁，無法在 limit/cursor 前完成。
- 需要改權限、lifecycle、approval/publication authority或 production data。
- 精簡會隱藏 P0 安全阻擋，或使使用者誤以為可製造／可發布。

## 15. Spec Governance and RD Readiness Review

Spec Impact Preflight：

- `Compatible exception`：`STATUS-UX-001～003` 繼續治理 raw字典、context、axis、help；primary projection由本規格治理。
- `Intentional replacement`：`DRAWING-PART-RELATION-VIEW-001` 原 root多 badge summary改為一個 human status；counts保留為低強度文字。
- `Compatible exception`：`NEXT-STEP-UX-001` 的 Now What、visible error與 recovery規則持續適用。
- `Compatible exception`：`DEV-053` 的單一 lifecycle/primary CTA與共用 drawing owner drawer持續是 authority；DEV-055只替換 presentation projection，不改 lifecycle。
- ADR：`ADR-PDM-STATUS-UX-004` Accepted，無新 ADR缺口。

RD Readiness Gate：

- repo/module/file impact：已固定。
- API/I/O/filter：已固定為 additive、server projection；drawing workbench 維持 scan-before-limit，parts/relations 以 bounded read 後 server filter-before-limit 交付，尚未宣稱新增 cursor。
- schema/migration/data：確認無影響。
- permission/cache/compatibility：已固定，不擴權、不建立新 flag。
- failure recovery/stop conditions：已固定。
- RD slices、QA/QC commands、evidence：已固定。
- P0/P1 open question：0。

結論：Phase 1A～1D 已完成 `Local RD / QA-QC Passed / Production Release Gated`。本機實作與 focused evidence 已完成；正式 release 前仍須依 release gate 在 disposable DB 重跑受保護的關聯操作 suite。

## 16. Future Phase Capsule

Phase 2：擴展 approval、task、file、import、report、settings與 dashboard。

- 依 Phase 1 contract逐 domain擴展，不一次重寫全部狀態 surface。
- re-entry trigger：Phase 1 QC通過，且使用者要求全系統 rollout或指定下一模組。
- 狀態：`Future Phase Captured / Not Requested`。

Phase 3：若業務需要獨立圖料關聯確認。

- 必須有 `confirmedAt`、`confirmedBy`、relation version/fingerprint；關係改動後進 `needs_reconfirmation`。
- re-entry trigger：使用者確認這是獨立業務 gate，而不只是送審 readiness。
- 狀態：`Future Phase Captured / Not Requested`。

## 17. 2026-08-14 DEV-073 CAPA Amendment — Responsibility Requires Actionability

本節有意收窄原本「assignee／reviewer等於current user即可顯示待你處理」的過寬解讀；完整authority為 `SPEC-PDM-STATUS-ACTIONABILITY-CAPA-001`。

- `current_user` 必須同時有目前責任證據與至少一個適用的domain responsibility action；history／refresh／return等查閱或utility action不能單獨產生待辦。
- `rd_controlled`／`released` 的客觀usable狀態優先於owner投影，依availability顯示研發可用／生產可用。
- active review只有exact reviewer可為`current_user`；送審者的可選撤回不等於必辦責任。
- `in_review`缺active request/workflow時必須fail closed為`unknown / 負責人待確認`，並提供可達的精確恢復原因，不得顯示phantom「待你處理」。
- DEV-078本機實作與完整aggregate QA/QC已通過；DEV-073 browser由read-only fixture preflight與隔離source runner完成，未修改資料或放寬expected；production release仍gated。

## 18. 2026-08-18 DEV-078 Amendment — Stable Responsibility Vocabulary

狀態：`RD Implemented / Full Aggregate QC Passed / Production Release Gated`。

本節是現行責任語彙authority，對§1、§2、§3、§5.2、§7及§8.1中以`待你處理／等他人處理`作為第一層主要文案與工作狀態篩選的規則構成`Intentional replacement`。DEV-055既有projector、單一badge、server filter、availability、drawer與QA/QC完成證據仍有效；DEV-073 actionability gate維持authority。

### 18.1 Product and role boundary

- 本流程直接涉及的組織角色是RD與RD主管；`負責人／審核負責人／系統管理員`是流程責任稱謂，不是三個新RBAC role。
- 工作負責人、送審負責人、圖料管理人及主圖維護人統一為`負責人`；審核人員統一為`審核負責人`；自動化異常恢復責任統一為`系統管理員`，現階段由具既有恢復權限的RD主管承擔。
- `DEV-052／053`現行統一整包流程在審核完成後自動正式化；正常正式化顯示`系統處理中`。只有存在可證明的formalization/release failure與適用recovery action時，才顯示`待系統管理員處理`。DEV-048既有number-only legacy approval相容語意不由本amendment改寫。
- 同一帳號同時具有編輯與審核能力時，主要責任由流程階段與active work item決定，不由permission聯集決定。

### 18.2 Architecture end-state

權威資料流修訂為：

`Entity → status sources → domain projector → HumanStatusProjection → responsibility resolver → ResponsibilityStatusProjection + ViewerActionabilityProjection + AvailabilityScopeProjection → API DTO → list / drawer / filter`

分工：

1. `HumanStatusProjection`：客觀業務狀態與evidence，不因觀看者改變。
2. `ResponsibilityStatusProjection`：所有合法觀看者一致的第一層責任／可用／終止結論。
3. `ViewerActionabilityProjection`：目前actor是否屬於自己的待辦、是否可執行及阻擋原因；可因觀看者不同。
4. `AvailabilityScopeProjection`：沿用研發／生產可用證據。
5. 既有`ViewerHumanStatusProjection`可在相容期保留，但只作舊consumer與viewer actionability adapter；client不得再以其`label`渲染主要狀態。

`ResponsibilityStatusProjection`最小read contract：

```ts
type ResponsibilityStatusCategory =
  | "owner"
  | "review_owner"
  | "system"
  | "system_admin"
  | "usable"
  | "terminal"
  | "unknown";

type ResponsibilityStatusProjection = {
  schemaVersion: 1;
  category: ResponsibilityStatusCategory;
  label:
    | "待負責人處理"
    | "待審核負責人處理"
    | "系統處理中"
    | "待系統管理員處理"
    | "可使用"
    | "已結束"
    | "負責人待確認";
  basis:
    | "assignee"
    | "active_review"
    | "automatic_finalization"
    | "recovery_action"
    | "objective"
    | "unknown";
  actorRole: "owner" | "review_owner" | "system" | "system_admin" | null;
  actorLabel: string;
  autoCompletes: boolean;
  nextStep: string | null;
};

type ViewerActionabilityProjection = {
  schemaVersion: 1;
  isMine: boolean;
  canAct: boolean;
  basis: "assignee" | "reviewer" | "role_capability" | "permission" | "none";
  disabledReason: string | null;
};
```

`actorLabel`與`nextStep`使用server-owned human language；不得包含raw status、permission code或API route。實際負責人姓名只在現有company／record visibility已允許且assignment evidence存在時於detail/popover顯示，不新增個資可見範圍。

### 18.3 Deterministic responsibility resolver

優先序固定為：

1. 客觀terminal evidence → `terminal`，沿用既有終止文案。
2. 客觀usable evidence → `usable`，第一層仍由availability顯示`研發可用／生產可用／可用範圍待確認`。
3. verified formalization/release exception + applicable system-admin recovery action → `system_admin / 待系統管理員處理`。
4. `auto_finalizing/finalizing`且未符合前項異常證據 → `system / 系統處理中`。
5. active review request/work item + 該domain既有review authority（exact assignment或既有role queue）→ `review_owner / 待審核負責人處理`。
6. 非終止、非可用且存在owner responsibility action／assignment evidence → `owner / 待負責人處理`。
7. 責任、active work item或適用動作無法證明 → `unknown / 負責人待確認`。

約束：

- DEV-073 invariant不變：`owner/review_owner/system_admin`都必須有相應責任證據與至少一個適用domain responsibility action；action可locked，但需有可理解原因。history、refresh、return、純navigation不得單獨產生待辦。
- active review缺request/work item時不得輸出`review_owner`。正式圖面採既有exact reviewer assignment；candidate bundle沿用既有RD主管role queue。具`canReview`但不符合該domain既有assignment／queue authority的actor，不得因此改變責任類別或取得決策能力；不得為本DEV新增reviewer schema。
- `role_capability`只計算`ViewerActionabilityProjection`；不得以「目前actor有權限」反向決定`ResponsibilityStatusProjection`。
- 送審者的可選撤回不改變`review_owner`主責任；審核負責人執行退回後，下一個projection才切換為`owner`。
- 發布較久、worker heartbeat延遲或未知錯誤不得直接輸出`system_admin`；必須同時有failure evidence與可適用recovery action。

### 18.4 API and filter compatibility

- drawing、part、relation list/detail DTO additive新增`responsibilityStatus`與`viewerActionability`；本phase不刪`viewerStatus`、raw fields或既有routes。
- list/detail對同一entity/version/company的`responsibilityStatus`必須deep-equal且跨actor相同；`viewerActionability`與actions可依actor不同。
- 穩定工作狀態filter新增machine values：`owner | review_owner | system | system_admin`；UI顯示文字與badge共用同一vocabulary。`production | rd | availability_unknown | needs_confirmation | history`維持既有語意。
- `我的待辦`／`view=mine`依`viewerActionability.isMine`與DEV-073 evidence gate在response limit／cursor fill前由server篩選；它是viewer utility，不是第一層status filter。
- 舊`needs_action | waiting | ready`僅保留隱藏相容解析，實作前須inventory現有URL、tests與consumer；未完成inventory不得移除，也不得把`needs_action`直接改成`owner`。
- DTO仍含viewer-specific fields與actions，故相關response繼續`Cache-Control: private, no-store`。responsibility vocabulary不改401／403、company scope或command permission。

### 18.5 Shared UI contract

- `HumanStatusBadge`第一層改讀`responsibilityStatus`與`availabilityScope`；禁止以`viewerStatus.label`改寫文案。
- 圖號、料號、圖料root／child、preview card及共用drawer對同一entity只顯示一個主要badge。A0002與A0003若同為首版準備，不論觀看者皆顯示`待負責人處理`。
- `你可處理`、實際姓名與disabled reason只放在可及的popover/detail/action control，不建立第二個viewer badge，也不重複成每列固定教學句。
- popover在待辦／阻擋／異常時顯示目前狀況、處理責任、既有可見的實際負責人、是否自動完成與可發現的處理／恢復方式；正常usable／terminal保持安靜，不強制每個狀態都有下一步CTA。
- status filter顯示stable responsibility vocabulary；`我的待辦`保留在workbench view或等效viewer filter，不混進工作狀態選項。
- icon＋文字共同表意，hover／focus／click可達，Escape可關閉；三viewport不得截斷或使popover超出viewport。

### 18.6 Data, permission, migration and execution boundary

- DB/schema/index/migration/backfill：無。
- write API、transaction、approval decision、publication/retry strategy：不變。
- permission：沿用既有owner、exact reviewer、publish/recovery capability；顯示`系統管理員`不新增或放寬RBAC role。
- rollout：本輪已完成文件並升至`RD Implementation Ready`；RD可依§18.9做本機／隔離runtime實作。production deploy、live data與release仍不在本DEV授權內。

### 18.7 Stop conditions and evidence

立即停止並回Dev PM：

- 正確責任需要新增assignment schema、擴大姓名可見性、改permission或改approval/publication authority。
- 同時存在兩個不可排序的合法主要責任、平行會簽需要多責任顯示，或system exception沒有唯一recovery responsibility。
- 正常auto-finalization實際仍要求人工發布，與已確認產品流程衝突。
- 舊consumer把`viewerStatus.label`當穩定外部contract，且無法以additive欄位相容。

QA authority：`.ai-doc/qa/qa-dev-078-responsibility-status-vocabulary-validation-plan-2026-08-18.md`。完成證據需包含resolver matrix、API/additive/compatibility/filter/cache contract、同fixture跨actor parity、A0002／A0003及三viewport rendered browser；P0／P1 finding必須為0。

### 18.8 Governance

- ADR：amend既有`ADR-PDM-STATUS-UX-004`，不建立新ADR。
- `SPEC-PDM-STATUS-ACTIONABILITY-CAPA-001`保留evidence/actionability authority，並以DEV-078 amendment將`current_user/other_user`降為viewer utility，不再治理第一層文案。
- viewerStatus退役列為`Future Phase Captured / Not Requested`；re-entry trigger是consumer inventory、雙欄位parity通過且使用者要求cleanup。
- Auto-finalization authority沿用`SPEC-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001`與`SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001`：對DEV-052新整包流程有意取代DEV-048「approval永不自動publication」，但legacy number-only approval仍保留既有compatibility。其他approval domain不得未經確認套用本責任狀態。

### 18.9 Repository-specific RD implementation contract

Readiness：`READY`；P0 gap=`0`、P1 gap=`0`。既有owner ID、active approval request、正式圖面reviewer IDs、candidate review role queue、canonical stage與action descriptors足以完成投影；DB/schema/migration/backfill、新套件、env與feature flag均為`none`。

#### 18.9.1 Required source boundary

- 新增`src/lib/responsibility-status-projection.ts`，作為唯一責任resolver、viewer actionability、legacy viewer adapter與stable／legacy filter matcher authority。
- 修改`src/lib/human-status-projection.ts`、`src/lib/pdm-workbench-contract.ts`、`src/lib/pdm-entity-detail-contract.ts`、`src/lib/pdm-detail-status-actionability.ts`；新欄位在workbench row、detail header、drawing／part projection為required，`viewerStatus`保留。
- 修改`src/lib/drawing-workbench.ts`、`src/lib/part-workbench.ts`、`src/lib/relation-workbench.ts`、`src/lib/pdm-entity-detail.ts`；順序固定為objective status → actor-independent responsibility evidence/status → viewer actionability → legacy viewer adapter。
- 修改自行組DTO的legacy adapters：`src/app/api/parts/route.ts`、`src/app/api/parts/[partNumber]/route.ts`、`src/app/api/numbering/relations/route.ts`、`src/app/api/numbering/roots/[rootCode]/route.ts`。workbench route wrappers維持pass-through與`private, no-store`，無需要不得改碼。
- 修改`src/components/human-status-badge.tsx`、`src/components/human-status-filter.tsx`及所有已盤點consumer：drawing／part／relation workbench、preview gallery、unified drawer、drawing／part projections、part detail、`src/app/numbering/search/page.tsx`。主要文字不得讀`viewerStatus.label`。
- 更新DEV-055 projection／contract／browser與DEV-073 actionability regression；新增`qc-dev-078-responsibility-status-{projection,contract,browser}.mjs`、`qc-dev-073-browser-runner.mjs`及`package.json`的`qc:dev-078*`命令。歷史QC報告不得重寫；DEV-073 runner只做read-only fixture preflight與OS temp copy，不修改source DB。

#### 18.9.2 Exact mapping and compatibility

Resolver依§18.3順序，並將owner action限制在`missing_manufacturing_drawing`、`main_drawing_invalid`、`missing_part`、`correction_required`、`data_conflict`、`data_needs_review`、`preparing`、`ready_to_submit`及canonical等價state。`system_admin`必須同時有客觀failure與非navigation recovery descriptor；目前actor的publish permission只能決定viewer actionability，不能決定共享類別。

Candidate bundle的active request使所有actor共享`review_owner`；具既有`candidateReview`且有適用review action者可`isMine=true`。正式圖面則只有既有exact reviewer可`isMine=true`。兩者都不得把role capability寫回共享責任。

舊query相容固定為：`needs_action`＝人工責任且`isMine=true`；`waiting`＝人工責任且`isMine=false`；`ready`＝`isMine=true`且objective phase=`ready`。它們保留解析但從visible options移除；stable values為`owner | review_owner | system | system_admin`，availability與history values不變。client遇到缺少新欄位不得fallback至viewer-relative label，只能fail closed為`負責人待確認`並讓contract gate失敗。

#### 18.9.3 Slices, commands and recovery

1. Phase 1A：shared projector、types、mapping、filter與legacy adapter；RS-01～15、跨actor parity、DEV-055／073 regression先PASS。
2. Phase 1B：drawing／part／relation／detail DTO與legacy adapters；additive shape、list/detail parity、filter-before-limit、cache與permission PASS。
3. Phase 1C：shared badge／filter與全部consumer切換；source scan禁止主要surface舊詞與第二viewer badge。
4. Phase 1D：隔離DB＋free port做四actor、三viewport rendered QC，輸出`output/qa/dev-078-responsibility-status/<runId>/`並清理task-owned runtime。

精確命令：`npm run qc:dev-078:projection`、`npm run qc:dev-078:contract`、`npm run qc:dev-055:projection`、`npm run qc:dev-055:contract`、`npm run qc:dev-073:contract`、`npm run typecheck:app`、`npm run qc:dev-078:browser`、`npm run qc:dev-055:browser`、`npm run qc:dev-073:browser`（由runner先做read-only fixture preflight）、`npm run build:isolated`，最後`npm run qc:dev-078`。聚合命令需含前述新舊回歸與build，任一步失敗即非PASS。

無資料rollback。失敗時停止於當前slice，保留manifest並重跑該slice及後續gate；回復僅能最小回退DEV-078 source／scripts／package command，不得整檔覆寫或清理其他dirty worktree變更。server DTO與client切換必須同一build完成，部分route／部分surface完成不得handoff。

## 19. 2026-08-19 DEV-078 Phase 2 Amendment — Six-State UI Vocabulary

狀態：`Local RD Implemented / Human Confirmed / Full Aggregate QC Passed / Production Release Gated`。

本節是現行可見工作狀態與篩選語彙authority，對§1、§2、§3、§8、§18.2～§18.5及§18.9中以角色責任作為第一層badge／filter文字的部分構成`Intentional replacement`。§18已完成的資料分類、責任證據、viewer actionability、API相容與QA/QC結果保留為Phase 1基線；Phase 2已完成P2-A～P2-D實作與驗證，證據見§19.7。

### 19.1 Human decisions and product boundary

- 唯一可見工作狀態集合固定為：`全部／編輯中／審核中／待確認／研發版可使用／量產版可使用`，順序不得調整。
- `全部`只存在於篩選器，不是資料列badge；非終止資料列只顯示其餘五種之一。終止資料不新增第七個工作狀態，由既有`包含歷史`控制；被納入清單時顯示中性的歷史結果chip，文字沿用`humanStatus.label`的`已取消／已作廢／已合併`等精確結果，但不得成為可選work-status filter。
- `我的待辦`是viewer scope，由`viewerActionability.isMine`決定，不是工作狀態；`歷史`是時間範圍，也不是工作狀態。
- 負責人、審核負責人、系統管理員等當責資訊保留在popover／drawer說明與可用動作中，不再成為第一層badge名稱。
- 同一entity/version/company在不同合法觀看者的主要狀態、說明與篩選歸類必須一致；只有可執行動作、`isMine`與disabled reason可依觀看者不同。

### 19.2 Canonical data-to-UI mapping

資料層category與availability evidence不改名、不回寫；UI以同一個shared presentation projector產出唯一名稱與說明。由上而下第一個命中即停止：

| 資料層條件 | UI層名稱 | UI層說明內容（canonical copy） |
|---|---|---|
| 篩選器無工作狀態限制 | `全部` | 顯示目前所有工作資料；歷史資料需另外開啟「包含歷史」。 |
| `responsibilityStatus.category = owner` | `編輯中` | 資料尚在建立、補件或修正，由負責人處理。 |
| `responsibilityStatus.category = review_owner` | `審核中` | 已送審，等待審核負責人完成審核。 |
| `responsibilityStatus.category = system` | `審核中` | 審核已完成，系統正在自動發布，不需人工操作。 |
| `responsibilityStatus.category = system_admin` | `待確認` | 自動化處理異常，由系統管理員確認並執行恢復。 |
| `responsibilityStatus.category = unknown` | `待確認` | 系統無法確認目前責任或有效工作項，請由管理者查核。 |
| `category = usable`且`availabilityScope.scope = unknown | none` | `待確認` | 已符合可使用階段，但用途範圍證據不足，需確認研發版或量產版。 |
| `category = usable`且`availabilityScope.scope = rd` | `研發版可使用` | 已受控，可用於研發、試作與設計驗證；不可作為量產依據。 |
| `category = usable`且`availabilityScope.scope = production` | `量產版可使用` | 已正式發布，可作為採購、製造與量產依據。 |
| `responsibilityStatus.category = terminal`或客觀phase為terminal | `humanStatus.label`精確歷史結果 | 由「包含歷史」控制是否顯示；以neutral／archive結果chip呈現，明細保留終止原因，且不歸入五種row work status。 |

`審核中`是「人工審核到自動正式化完成前」的流程傘狀態；不得因兩個資料category共用同一名稱，就讓`system`產生人工審核待辦。`待確認`是需要查核的風險傘狀態；說明必須區分系統管理員恢復、責任證據不足與可用範圍不足。

### 19.3 UI and filter contract

```ts
type WorkStatusFilter =
  | "all"
  | "editing"
  | "reviewing"
  | "needs_confirmation"
  | "rd_available"
  | "production_available";

type WorkStatusPresentation =
  | {
      kind: "work_status";
      filterValue: Exclude<WorkStatusFilter, "all">;
      label: "編輯中" | "審核中" | "待確認" | "研發版可使用" | "量產版可使用";
      description: string;
      tone: "info" | "warning" | "success";
      icon: "play" | "clock" | "alert" | "check";
    }
  | {
      kind: "terminal_result";
      filterValue: null;
      label: string;
      description: string;
      tone: "neutral";
      icon: "archive";
    };
```

- visible option只允許上述六個machine values及§19.2精確文字；badge、popover title、filter option與drawer summary必須共用同一presentation authority，不得各頁維護label map。
- `editing`匹配`owner`；`reviewing`匹配`review_owner | system`；`needs_confirmation`匹配`system_admin | unknown | usable+availability unknown/none`；兩種available依scope精確匹配。
- `all`在`includeHistory=false`時只含目前資料；勾選`包含歷史`後才加入terminal資料。server仍須先project → filter → fill limit/cursor，禁止client先截斷再篩選。
- 主badge只顯示一個名稱。角色、實際姓名、異常原因、是否需人工及下一步放在可hover／focus／click／touch的說明層；說明不得只靠顏色或icon傳達。
- `審核中/system`的說明必須明示「不需人工操作」；`待確認/system_admin`必須有verified failure與適用recovery action，否則沿用`unknown`說明，不得製造phantom task。

固定視覺語意為：`editing=info/play`、`reviewing=info/clock`、`needs_confirmation=warning/alert`、`rd_available=success/check`、`production_available=success/check`、`terminal_result=neutral/archive`。icon必須與可見文字並存；tone不得被viewer capability改寫。

Shared projector採fail closed：`status=null`回傳`null`；terminal evidence優先於其他分類；責任資料缺失／不合法回`待確認/unknown`；usable但availability為`null/none/unknown`回`待確認/availability`；`system`只有`basis=automatic_finalization`且客觀key為`finalizing`時成立；`system_admin`只有`basis=recovery_action`、客觀key為`formalization_failed | release_status_mismatch`且`nextStep`非空時成立。任何不完整組合都回`待確認/unknown`，不得聲稱系統管理員已有恢復責任。primary label、canonical description、tone與icon不得讀viewer identity、permission或`isMine`。

### 19.4 Compatibility and data boundary

- `responsibilityStatus.category`、`viewerActionability`、`availabilityScope.scope`、raw lifecycle、write API、route、permission、assignment與DB schema全部不變；本phase只替換read projection的可見label、description與filter grouping。
- 新增純read的`WorkStatusPresentation`，由`responsibilityStatus + availabilityScope + terminal humanStatus`計算，不新增API欄位。既有`responsibilityStatus.label`與`availabilityScope.label`保留作compatibility／detail evidence，primary UI不得直接render；這可避免為UI改名破壞Phase 1 DTO。
- canonical URL仍以`humanStatus=<six-state machine value>`及`history=include|exclude`表示；client state名稱可用`includeHistory`，不得另創第二個URL key。舊query正規化：`owner→editing`；`review_owner|system→reviewing`；`system_admin|availability_unknown|needs_confirmation→needs_confirmation`；`rd→rd_available`；`production→production_available`；`humanStatus=history→humanStatus=all + history=include`。
- viewer-relative舊值採明確降級而非隱藏篩選：`needs_action→all`，在具既有`view=mine`的drawing／part／relation頁同時正規化為`view=mine`；`waiting|ready→all`。所有頁面在首次parse後以`replaceState`寫回canonical URL；API接受舊值但依同一規則正規化，不回400、不保留使用者看不見的active predicate。
- invalid／空值一律正規化為`all`，不得讓`<select>`出現沒有option的空白選取狀態。相容模式不得產生第七種主要badge文字或第二個「舊連結條件」UI。
- drawing／part／relation既有workbench與`numbering/search`、legacy parts頁共用同一page-query normalizer；五個host在初始載入、reload、deep link與`popstate`都要同步`humanStatus/history/view`，正規化時只用`replaceState`，使用者主動改篩選才沿用既有URL更新策略。`numbering/search`與legacy parts頁須新增「包含歷史」toggle並把`history`傳給對應list API。
- 無schema、migration、backfill、新permission、新env、新dependency或資料rollback。production deploy與release繼續由既有gate管控。

### 19.5 Repository-specific RD implementation contract

Readiness：`IMPLEMENTED after QA correction`；P0 gap=`0`、open P1 gap=`0`。2026-08-19 QA re-audit補入舊DEV-062 query consumer、兩個repository query builder及`package.json` aggregate後，盤點確認：9個UI consumer檔共有13個`HumanStatusBadge`掛載點；5個UI檔掛載`HumanStatusFilterSelect`；5個server query入口執行工作狀態解析，兩個repository在SQL `LIMIT`前執行history scope。Phase 2 focused與完整aggregate證據已通過，詳見§19.7。

#### 19.5.1 Modification count

| 類別 | 數量 | 是否預期改碼 | 說明 |
|---|---:|---|---|
| Shared presentation／compatibility／UI component | 5 files | 是 | 1個新shared projector＋4個既有authority/component |
| Client filter hosts／visible cleanup | 5 files | 是 | 5個filter掛載點；search另移除2處重複availability文字 |
| Server filter entrypoints | 5 files | 是 | drawing／part／relation service＋2個legacy list API |
| Repository query builders | 2 files | 是 | sync／async path在SQL limit前套用history scope，保持provider parity |
| Test／QC scripts | 12 files | 是 | Phase 2 focused＋DEV-055／073／062／053／drawer regressions |
| Package command | 1 file | 是 | 既有`qc:dev-078`聚合納入所有required regression，不新增命令名稱 |
| Badge-only consumers | 4 files | 原則否 | 由shared component自動收斂，只做source／rendered regression |

預計直接修改`30 files = 17 source + 12 test scripts + package.json`；另有4個source檔列為validation-only。若三viewport實測證明現行fluid CSS無法容納`研發版可使用／量產版可使用`，`src/app/globals.css`才作條件式第31個檔案，未重現不得預先製造CSS diff。

#### 19.5.2 Exact source impact — 17 required files

Shared authority與元件（5）：

1. 新增`src/lib/work-status-presentation.ts`：唯一`WorkStatusFilter`、六項options、五種row presentation、canonical descriptions、tone/icon、group matcher與legacy query normalizer authority。
2. 修改`src/lib/human-status-projection.ts`：既有`HumanStatusFilter`、display labels與viewer matcher降為legacy compatibility；visible consumer不得再import舊options。
3. 修改`src/lib/responsibility-status-projection.ts`：保留責任category/actionability；舊display/matcher只作adapter或委派給新projector，不再直接決定primary badge。
4. 修改`src/components/human-status-badge.tsx`：primary label、icon、tone與popover title／description改讀`projectWorkStatusPresentation()`；可用狀態保持安靜，角色、實際姓名、disabled reason與恢復方式才進第二層。禁止固定輸出每列「下一步」教學句。
5. 修改`src/components/human-status-filter.tsx`：props改為`WorkStatusFilter`，只render六項、具可及label，永不接收legacy raw value。

Client filter hosts與visible cleanup（5）：

6. `src/components/drawing-workbench.tsx`
7. `src/components/part-workbench.tsx`
8. `src/components/relation-workbench.tsx`
9. `src/app/numbering/search/page.tsx`
10. `src/components/part-detail-content.tsx`

五檔一律使用shared page-query normalizer，初始／reload／back-forward不得以type cast接受raw value；URL只寫六個canonical values。`numbering/search/page.tsx`另移除root與drawing旁直接render的`availabilityScope.label`兩處，避免同一可用事實同時出現在primary badge與secondary文字。

Server filter entrypoints（5）：

11. `src/lib/drawing-workbench.ts`
12. `src/lib/part-workbench.ts`
13. `src/lib/relation-workbench.ts`
14. `src/app/api/parts/route.ts`
15. `src/app/api/numbering/relations/route.ts`

五個入口改用同一normalizer與`workStatusMatchesFilter()`；順序維持`load/scan → objective/responsibility/availability projection → work-status projection → history/view/status filter → fill limit/cursor`。invalid與legacy query不得繞過company scope、private/no-store或filter-before-limit。

Repository query builders（2）：

16. `src/lib/repositories/numbering-repository.ts`
17. `src/lib/repositories/numbering-async-repository.ts`

在`NumberingSearchInput`與`PartModuleListInput`新增optional `includeHistory?: boolean`；`undefined`保留既有caller行為以維持相容，前述兩個legacy list API必須明確傳入`true/false`。`includeHistory=false`時，sync與async SQL builder都必須在`LIMIT`前排除`Obsolete/Merged`；`true`時保留terminal候選，再由shared projection/filter確認。禁止route先固定抓100筆再client-side篩選，亦不得以bounded scan造成underfill。此變更不新增schema、migration或index。

Badge-only validation consumers（不預期改碼）：`src/components/drawing-projection.tsx`、`src/components/part-projection.tsx`、`src/components/pdm-workbench-preview-gallery.tsx`、`src/components/unified-pdm-entity-detail-drawer.tsx`。連同前述5個client hosts，共9個consumer檔／13個badge掛載點全部納入source scan與rendered matrix。

#### 19.5.3 Exact test and command impact — 12 required scripts + 1 package file

- Phase 2 authority：`scripts/qc-dev-078-responsibility-status-projection.mjs`、`scripts/qc-dev-078-responsibility-status-contract.mjs`、`scripts/qc-dev-078-responsibility-status-browser.mjs`。
- Parent regression：`scripts/qc-dev-055-human-status-projection.mjs`、`scripts/qc-dev-055-human-status-contract.mjs`、`scripts/qc-dev-055-human-status-browser.mjs`。
- Actionability/CAPA：`scripts/qc-dev-073-status-actionability.mjs`、`scripts/qc-dev-073-browser.mjs`。
- Legacy relation query：`scripts/qc-dev-062-relation-workbench.mjs`；原`humanStatus=waiting&limit=1`案例改以canonical `editing`驗證filter-before-limit，另獨立驗證legacy `waiting`正規化為`all`且不殘留viewer predicate。
- Workbench/detail regression：`scripts/qc-dev-053-drawing-workbench-ui.mjs`、`scripts/qc-dev-053-drawing-workbench-real-operation.mjs`、`scripts/qc-pdm-entity-detail-drawer.mjs`。

修改`package.json`既有`qc:dev-078`內容但不新增或改名命令；以fail-fast `&&`依序包含`qc:dev-078:projection`、`qc:dev-078:contract`、`qc:dev-055:projection`、`qc:dev-055:contract`、`qc:dev-073:contract`、`qc:dev-062:relation`、`qc:dev-053:ui`、`typecheck:app`、`qc:dev-078:browser`、`qc:dev-055:browser`、`qc:dev-073:browser`、`qc:dev-053:real-operation`、`qc:pdm-entity-detail-drawer`、`build:isolated`。歷史QC report、run manifest與screenshots不得重寫；test expected只修改現行source contract與新run。

P2-A static prevention gate還必須掃描active source／tests中`humanStatus=`、query parser及matcher使用的舊值`owner/review_owner/system/system_admin/needs_action/waiting/ready/production/rd/availability_unknown/needs_confirmation/history`；每個命中都須列為required-edit或附理由列為validation-only。另解析`package.json`並斷言`qc:dev-078`包含本節全部可執行命令，避免文件test list與aggregate command DAG再次分離。

#### 19.5.4 Slices, gates and recovery

1. `P2-A — shared presentation + compatibility`：新增projector，完成全部mapping、tone/icon、terminal result、fail-closed與new/legacy/invalid query matrix；執行舊query consumer與aggregate DAG static gate。Gate：focused projection＋DEV-055／073 contract PASS。
2. `P2-B — server filter convergence`：完成5個server入口與2個repository builder的filter-before-limit。Gate：五入口new values、legacy normalization、invalid、history、mine、private/no-store、sync/async provider parity與pagination contract PASS。
3. `P2-C — shared UI + five hosts`：badge／filter與5個host切換，移除search重複availability；4個badge-only consumer不得新增local map。Gate：source inventory、13 badge points、5 filter points、accessible copy與typecheck PASS。
4. `P2-D — rendered aggregate`：四actor×drawing／part／relation／preview／search／drawer×1440／1024／390；重跑DEV-055、073、062、053及drawer regressions，最後只以更新後`npm run qc:dev-078`整體PASS作交付證據。

Phase間fail-fast；前一gate未PASS不得進下一slice。server matcher與client visible options必須在同一build收斂，不得交付「UI已有新值但部分API當all」或「API已分組但select仍舊詞」的部分狀態。

Failure／recovery：本phase無資料寫入與migration，無DB rollback。projection／query／UI gate失敗時保留evidence，最小回退Phase 2新projector imports、matcher與consumer patch；Phase 1 DTO與legacy data fields仍在，因此可回到舊read rendering。不得使用`git reset --hard`、整檔覆寫或清理其他dirty changes。browser只用temp DB＋free port，完成後停止task-owned process tree並確認port釋放。

Git boundary：目前17個預定source中多數已有DEV-077／DEV-078 Phase 1等未提交diff；`package.json`與relation相關檔案亦可能重疊。RD必須先保存scoped diff inventory，再用最小patch修改，不stage／commit／回退無關檔案。開始產品碼前依project `AGENTS.md`讀`node_modules/next/dist/docs/`中與Client Components、URL/search params、Route Handlers相關的現行Next文件。

### 19.6 Acceptance criteria and stop conditions

1. 可見工作狀態下拉選單恰為六項、順序與文字完全符合§19.1；不存在`歷史`或舊角色責任選項。
2. 所有主要surface不再顯示`待負責人處理／待審核負責人處理／系統處理中／待系統管理員處理／負責人待確認／研發可用／生產可用／可用範圍待確認`作為主badge或visible filter文字。
3. `owner→編輯中`；`review_owner|system→審核中`；`system_admin|unknown|usable+scope unknown/none→待確認`；`usable+rd→研發版可使用`；`usable+production→量產版可使用`。
4. 跨actor的名稱與canonical description一致；`viewerActionability`可不同，但不得增加第二個個人化狀態badge。
5. `全部`預設不含terminal；`包含歷史`與`我的待辦`分別維持時間／viewer scope，不混入工作狀態。terminal列以neutral歷史結果chip顯示精確`humanStatus.label`，不得空白或冒充五種工作狀態。
6. 舊query可依§19.4解析，filter-before-limit、`private, no-store`、401／403、company scope與command permission無退化。
7. 1440×900、1024×768、390×844真實browser無文字截斷、popover越界、水平溢位、visible／console／network unexpected error；P0/P1 finding為0。
8. Repository inventory保持`17 required source + 12 required tests + package.json = 30 direct files`全部收斂；4個validation-only consumer若因型別或UI差異需改碼，須在manifest說明原因並更新計數，不得靜默漏改。
9. `qc:dev-078` command DAG包含§19.5.3全部命令；舊query static gate無未分類命中，sync／async repository在`includeHistory=false`時都於SQL `LIMIT`前排除terminal，且兩個legacy list頁的history toggle、URL、API與back-forward一致。

立即停止並回Dev PM：資料層無法唯一投影到五種列badge、`審核中`會掩蓋必須人工發布的domain、`待確認`無法提供可區辨說明、legacy consumer把舊label當外部穩定契約，或實作需要改schema、permission、assignment、approval/publication authority。

### 19.7 Phase 2 execution result — 2026-08-19

狀態：`Local RD Implemented / Human Confirmed / Full Aggregate QC Passed / Production Release Gated`。

- `npm.cmd run qc:dev-078`以fail-fast聚合完整通過：DEV-078 projection 42/42、contract 53/53；DEV-055 projection 71/71、contract 13/13、browser；DEV-073 contract與8-case browser；DEV-062 relation；DEV-053 UI 24/24與real-operation 15/15；PDM entity-detail drawer、typecheck與isolated build（124/124 static pages）均PASS。
- Rendered evidence：DEV-078 browser為`output/qa/dev-078-responsibility-status/20260819041629-90ff3789/`（parts 1、relations 1、drawings 20、actors 4）；DEV-073 browser為`output/qa/dev-073-status-actionability/DEV073-20260819T041838Z-f6a83fac/`（8 cases）；DEV-053 real-operation為`output/playwright/dev053-real-operation/DEV053-20260819-041911-local-isolated/`（15/15，productionConnected=false、productionWrites=false、cleanupStatus=removed）。
- Cross-cutting evidence：`npm.cmd run qc:doc-paths` 23/23、`npm.cmd run qc:dev-task-evidence-sync` 13/13、`npm.cmd run qc:dev-task-completion-audit` 8/8。無P0/P1 finding，無schema／migration／正式或staging資料變更；production deployment／release仍由既有gate控管。

## 20. 2026-08-19 DEV-080 Visibility Amendment

狀態：`RD Implementation Ready / Human Confirmed / RD Not Started / Production Release Gated`。

`SPEC-PDM-STATUS-UX-005`是第一層狀態可見性authority。本規格的六狀態主要投影、跨actor一致性、責任／actionability／availability、filter-before-limit與單一primary badge均保留；新規格只補上secondary signal的surface-aware分層：正常、成功、重複與技術細節降到可及popover／drawer，阻擋、錯誤、資安與缺必要條件仍固定可見。`缺製造圖`不得hover-only，`關聯完整`預設不與主要工作狀態並列。

本amendment不改schema、API、permission、assignment、lifecycle或DEV-078已完成證據；DEV-080需另以全系統inventory與rendered QA/QC證明，不能用DEV-078歷史PASS替代。

2026-08-19 QA scope re-audit：DEV-080新增`recognitionStatus`與`recognitionReviewStatus`只補display context，不新增第七種work status或domain axis；派工數量、42-route disposition與scope繼承以`SPEC-PDM-STATUS-UX-005` §5.1／§9.1／§10為唯一authority，舊42-file初盤不得再作依據。
