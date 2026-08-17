# SPEC-PDM-STATUS-UX-004：任務導向的人類狀態投影

狀態：`Local RD Implemented / QA-QC Passed / Production Release Gated`
日期：2026-08-07
關聯 DEV：`DEV-055` / `DEV-PDM-HUMAN-STATUS-PROJECTION-001`
風險：Medium
目前執行邊界：Phase 1A～1D 本機產品與 QA/QC；不含 schema、migration、正式資料、production、deploy、release、commit 或 PR。

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
| manufactured / outsourced / custom 且無 primary manufacturing drawing | 缺製造圖，action_required |
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
- 本機實作與DEV-073 QA/QC已通過；production release仍gated。
