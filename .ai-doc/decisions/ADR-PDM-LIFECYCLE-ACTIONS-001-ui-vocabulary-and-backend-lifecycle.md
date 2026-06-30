# ADR-PDM-LIFECYCLE-ACTIONS-001: 前端刪除詞彙與後端生命週期分層

日期：2026-06-29
狀態：Accepted for planning
關聯任務：`DEV-PDM-LIFECYCLE-ACTIONS-001`
關聯規格：

- `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-delete-restore-obsolete.md`
- `.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md`
- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
- `.ai-doc/decisions/ADR-PDM-CHANGE-CONTROL-001-reserved-draft-number-policy.md`

## Context

AI_PDM 目前已有多種資料失效語意：

- `file_assets` 已有 `deleted_at/deleted_by/deleted_reason`，附件刪除實際為 soft delete。
- 料號草稿已有 `voided_at/recycle_available_at/recycled_at`，用來處理預留草稿號作廢與回收。
- 正式圖號、料號、BOM release、submission 已使用 `Obsolete`、`Archived` 或 `obsolete_at` 類型語意。
- `audit_logs` 是 append-only，不允許 update/delete。

若前端直接暴露 soft delete、void、recycle、archive、obsolete、revoke、purge 等後端名詞，使用者會誤解不同按鈕的責任與結果。PDM 系統需要保留嚴謹後端生命週期，但前端應以最低必要詞彙呈現。

使用者已確認下列決策：

1. 正式資料不在 UI 使用「刪除」；正式資料主按鈕顯示「申請作廢」，完成狀態顯示「已作廢」。
2. 一般刪除需支援還原。
3. 只有正式資料作廢需要審核；草稿與附件由權限直接處理。
4. 資料階段需精簡到 PDM 最低必要 UI 模型，採 `草稿 / 審核中 / 正式 / 歷史` 四階段，後端完整狀態只作為輔助標籤或明細。
5. 主工作清單只服務日常資料，tab 採 `全部 / 草稿 / 審核中 / 正式`；`全部` 不包含已刪除、已作廢或封存資料。
6. 狀態欄每列只顯示一個主狀態 badge；狀態意義與輔助標籤說明放在欄位 title 的 `?` popover。
7. `已刪除資料` 與 `受控歷史` 必須分開。未列管草稿、暫存與未受控附件屬已刪除資料復原區；正式資料作廢、舊版、被取代與審核紀錄屬受控歷史追溯區。

## Decision

採用「前端三個主操作詞、四個生命週期階段、三個日常工作階段、兩個非日常入口、後端多狀態」架構。

前端只允許三個主操作詞：

| 前端詞 | 使用者語意 | 適用資料 |
|---|---|---|
| 刪除 | 從一般畫面移除，仍可依規則還原 | 草稿、附件、暫存資料、未正式生效資料 |
| 還原 | 將已刪除資料恢復為有效可見 | soft-deleted 且未衝突的資料 |
| 申請作廢 | 正式資料不再可用，需保留追溯；送出後依審核流程成為 `已作廢` | 正式料號、圖號、BOM、已發行文件、受控資料 |

後端可依資料類型使用不同狀態與欄位：

- `deleted_at/deleted_by/deleted_reason`
- `voided_at/recycle_available_at/recycled_at`
- `obsolete_at/obsolete_by`
- `Archived` / `Obsolete` / `MainDrawingInvalid`
- `revoked_at` for external access, if a module already uses revoke semantics

但這些名詞不得成為一般使用者操作按鈕。

前端生命週期主階段只允許四個：

| 前端階段 | 使用者心智模型 | 後端狀態映射範例 |
|---|---|---|
| 草稿 | 我還在整理，可編輯，通常可刪除 | temporary, staged, draft, need_info, pending_admin_confirm, needs_reconfirmation |
| 審核中 | 已進流程，等待決策，不可隨便刪 | pending_review, approval_requested, obsolete_requested, releasing |
| 正式 | 可被系統引用，是有效或發行資料 | active, effective, released |
| 歷史 | 不在日常工作清單使用，只進入復原或追溯入口 | deleted, obsolete, archived, rejected terminal, revoked |

後端狀態、稽核事件與技術生命週期仍可更細，但前端列表、主 badge、篩選與工作台摘要不得把後端狀態全部攤開。

前端資訊架構分成三個入口：

| 入口 | 目的 | 包含資料 | ISO/PDM 追溯定位 |
|---|---|---|---|
| 主工作清單 | 日常建立、審核、使用 | `草稿`、`審核中`、`正式` | 依目前狀態管制 |
| 已刪除資料 | 誤刪復原與工作區清理 | 未列管草稿、暫存匯入、未受控附件 | 不納入受控追溯，但保留基本操作 audit |
| 受控歷史 | 追溯曾經正式或受控的資料 | 已作廢、舊版、被取代、正式審核紀錄、release evidence | 納入 ISO/PDM 追溯 |

## Boundaries

### UI Boundary

- 一般清單中，草稿與附件顯示 `刪除`。
- 已刪除資料清單中，符合條件者顯示 `還原`。
- 正式資料顯示 `申請作廢`；審核完成後狀態顯示 `已作廢`。
- 主工作清單只顯示 `全部`、`草稿`、`審核中`、`正式` tab；`全部` 不包含歷史或已刪除資料。
- 主工作清單的主狀態 badge 只顯示 `草稿`、`審核中`、`正式`。
- `歷史` badge 只出現在 `已刪除資料` 或 `受控歷史` 入口內，不出現在日常主工作清單。
- `待補`、`已發行`、`可還原`、`不可還原`、`被引用`、`需審核` 只能作為輔助標籤或 detail metadata，不得升為主階段。
- 狀態欄 title 必須提供 `?` popover，說明主狀態、輔助標籤、已刪除資料與受控歷史的差異。
- 前端不得同時出現 `封存`、`停用`、`註銷`、`回收`、`軟刪除`、`硬刪除` 等同類操作詞，除非是管理員稽核明細或技術診斷畫面。

### Backend Boundary

- 後端不得把使用者的 `刪除` 直接等同 SQL `DELETE`。
- 所有刪除、還原、作廢必須經 domain/service 層判斷資料類型、狀態、權限、公司範圍、引用關係與稽核責任。
- `audit_logs`、審核決策、release snapshots 原則上不可刪除或還原。
- 真正物理刪除只允許在 retention / purge job 或管理員維運工具中處理孤兒暫存檔、過期暫存資料，且需另有 runbook 與 evidence。

## Alternatives Considered

### A. 前後端都使用完整生命週期名詞

不採用。雖然精準，但會把後端狀態機複雜度轉嫁給使用者，導致「刪除、作廢、回收、封存」混用。

### B. 所有資料都只叫刪除

不採用。正式 PDM 資料若顯示刪除，使用者會以為資料消失或可完全復原，不符合主資料追溯與審核責任。

### C. 前端三詞、後端多狀態

採用。此方案讓使用者只理解動作結果，讓後端維持嚴謹生命週期、審核與稽核。

## Consequences

正面：

- 使用者只需學會 `刪除 / 還原 / 申請作廢`。
- 使用者在主工作清單只需辨識 `草稿 / 審核中 / 正式` 三種日常狀態。
- 使用者需要復原或追溯時，才進入 `已刪除資料` 或 `受控歷史`。
- 正式資料追溯性不被「刪除」語意破壞。
- `已刪除資料` 與 `受控歷史` 分離，避免把未列管草稿清理誤認為 ISO 受控追溯。
- 現有附件 soft delete、料號草稿 void/recycle、正式資料 obsolete 可共存。
- 後續新模組可接入同一 lifecycle policy，而不是各自命名。

代價：

- 需要建立共用 lifecycle policy/service 或等效 domain 邊界。
- 既有 UI 中的 `void/recycle/obsolete/archive` 類文案需逐步收斂。
- 既有 UI 中細碎狀態需映射到四階段與三個 UI 入口，否則清單與工作台仍會讓使用者過度判斷。
- 還原時需做衝突檢查，不能只清掉 `deleted_at`。
- 正式資料作廢與還原需要和既有 approval matrix 保持一致。

## Compatibility

本 ADR 不取代 `ADR-PDM-CHANGE-CONTROL-001`。該 ADR 仍管制預留草稿號與受控料號的回收政策。

本 ADR 將其使用者介面語意收斂為：

- 使用者按 `刪除`，後端可執行草稿 void 或 soft delete。
- 使用者按 `還原`，後端可將尚未回收、未衝突的草稿或附件恢復。
- 使用者按 `申請作廢`，後端建立或沿用正式資料作廢審核流程；核准後 UI 狀態顯示 `已作廢`，並進入 `受控歷史`。
- 料號草稿底層的 `recycle` 仍為後端/管理員生命週期，不作為一般使用者主操作詞。

2026-06-29 cross-spec UI rule: existing module/domain statuses such as `待審核`、`已發行`、`需重新確認`、`作廢` remain valid backend or module states. Main daily UI badges are governed by lifecycle `visibleStage/stageLabel`; module states should be mapped into `草稿 / 審核中 / 正式` plus `detailTags`, while obsolete/deleted terminal records move to `已刪除資料` or `受控歷史`.

## Superseded / Amended Documents

本 ADR 補充下列文件的 UI 命名邊界：

- `.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md`
- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-implementation-contract.md`
