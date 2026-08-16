# ADR-PDM-STATUS-UX-004：採用任務導向的人類狀態投影

狀態：Accepted
日期：2026-08-07
關聯：`DEV-055`、`SPEC-PDM-STATUS-UX-004`

## Context

AI PDM 已有中央狀態字典與狀態軸，但清單仍把 domain model 的多個欄位逐一顯示為 badge。這讓資料模型的完整度直接變成 UI 的閱讀負擔，也讓「關聯完整／未發布／可作業／草稿確認」同時競爭主要結論。

使用者的任務不是閱讀全部狀態，而是快速判斷：能否使用、是否有問題、下一步是什麼。

## Options

### A. 維持一個資料欄位一個 badge

- 優點：實作直接，容易追溯 raw field。
- 缺點：每新增欄位就增加視覺負擔；使用者必須自行解讀優先序。

### B. 只擴充中央狀態字典

- 優點：文案一致，改動小。
- 缺點：只能改善「怎麼叫」，無法決定「此刻最重要的是哪一個」。

### C. Domain projector 產生唯一 human status view model

- 優點：資料層保留完整，UI 依任務輸出一個結論；list、drawer、filter 可共用同一結果。
- 缺點：必須建立明確優先序、完成證據與 domain-specific tests。

## Decision

採用 C。

架構固定為：

`Entity → status sources → domain projector → HumanStatusProjection → responsibility resolver → ViewerHumanStatusProjection → list/drawer/filter`

- 字典與狀態軸繼續存在，但不再直接決定一列要顯示幾個 badge。
- 每個 domain 有自己的 projector，不使用無 domain 的 generic projector。
- 主要狀態的優先序固定為：終止 → 失敗/阻擋 → 缺少條件 → 等待 → 可執行 → 可使用/完成。
- 完成語言必須有證據；不得由 `Draft`、`NeedInfo` 或「沒有 blocker」推論成「已確認」。
- human status 是 read projection，不寫回 domain status。
- projector 在 server/domain read path 執行；API additive 回傳 projection，client 只 render，不得自行由 raw status 推導。
- drawing／part owner module與圖料工作台共用同一 projection及 detail component；drawer外殼統一使用既有 `PdmDetailDrawer`。
- `HumanStatusProjection` 保留客觀業務結論；`ViewerHumanStatusProjection` 只回答「對目前登入者而言誰要動作」。兩者不得互相覆寫。
- 個人 assignee/reviewer 是第一責任證據；沒有個人指派模型時才使用 role capability。此為 deterministic rule engine，不使用生成式 AI 猜測。
- 所有 viewer-specific read API 使用 `private, no-store`；server filter 依 viewer category 執行。
- 可用範圍另以 `AvailabilityScopeProjection` 表示：`研發可用` 與 `生產可用` 是使用資格，不是新的 workflow status；只在 `usable` 的第一層 badge 中情境化呈現。
- `生產可用` 必須有正式發布與依賴證據；料號 `Active`、沒有 blocker 或存在 primary drawing number 都不能單獨推出生產資格。證據不足時 fail closed 為 `可用範圍待確認` 或不可用。

## Consequences

- 清單可維持一列一個主要狀態，drawer 只呈現同一結論與下一步。
- filters 若使用 human status，必須在完整結果集的 server/repository projection 上運作。
- 有 limit/cursor 的清單必須 scan → project → filter → fill page；禁止先截斷再做 client-only filter。
- 新 domain 需註冊 projector、priority matrix、fixtures 與 QC；不能只加 page-local label map。
- 狀態明細、raw values、audit 與技術證據仍可查閱，但預設降層。
- Phase 1 不需 schema migration；若未來新增獨立 relation confirmation，需另建 evidence model 與 migration contract。
- part/relation 尚無個人 assignee 欄位，因此 `role_capability` 表示共享工作佇列，不宣稱唯一負責人；若產品日後要求具名責任，必須另開 assignment schema／audit 變更。
- part/relation/drawing owner DTO 同時回傳客觀狀態、viewer 狀態與可用範圍；通用搜尋頁只用一個 badge，避免用兩個綠色 badge 造成重複判讀。

## Compatibility

- 保留 `SPEC-PDM-STATUS-UX-001～003` 的字典、context、axis 與 help 契約。
- 修正 `SPEC-PDM-DRAWING-PART-RELATION-VIEW-001` 的多 badge root summary。
- 延續 `SPEC-PDM-NEXT-STEP-UX-001` 的 actionable copy 與 recovery 原則。
