# QA：PDM 狀態語意分層與狀態混用修正驗證計畫

狀態：RD Contract Ready / Not Authorized  
建立日期：2026-07-07  
關聯 DEV：`DEV-PDM-STATUS-UX-002`  
關聯 SPEC：`.ai-doc/specs/SPEC-PDM-STATUS-UX-002-status-context-disambiguation.md`

## 1. QA Objective

驗證修正後的狀態欄與 `? 狀態說明` 是否只解釋使用者當下需要判斷的狀態，並避免把審核狀態、主檔狀態、匯入檢查、設定生命週期、報表 job、還原政策與 DVT 準備狀態混在一起。

成功標準：

- 使用者在 5 秒內能判斷該列現在能做、不能做、已完成、要補資料、還是要看明細。
- `?` popover 不顯示與該欄無關的狀態。
- 欄名能反映欄內資訊；混合欄不可只叫「狀態」或「其他」而不分層。
- Static QC 能攔下主要 context mismatch。

## 2. Test Scope

In scope routes:

- `/numbering/tasks`
- `/numbering/imports`
- `/settings`
- `/numbering/reports`
- `/numbering/approvals`
- `/numbering/dvt`
- `/bom/workbench`
- `/numbering/part-drafts`
- `/parts`
- `/numbering/drawings`
- `/numbering/search`

Out of scope:

- DB enum/schema migration。
- production deploy。
- historical data repair。
- audit/debug raw payload full localization。

## 3. Acceptance Matrix

| Area | Expected visible status model | Must not show in first-layer help |
|---|---|---|
| 圖號待辦 | `待處理 / 已處理 / 已取消` | `已核准`, `發行中`, `可處理`, full workflow enum |
| 通知中心 | read state and handled state are separated or clearly labeled | generic workflow approval explanation |
| 匯入列 | `待檢查 / 可匯入 / 待補資料 / 待管理員確認 / 衝突 / 保留既有` | submission approval statuses |
| 匯入批次 | `暫存中 / 已確認 / 已排除` | `審核中`, `已核准`, `已退回` unless actual review exists |
| 系統設定 | `啟用中 / 已退役 / 內建預設 / 停用` or no status help where unnecessary | release approval wording |
| 報表 job | `等待中 / 執行中 / 已完成 / 失敗` | import row/file-sync vocabulary unrelated to jobs |
| 發行審核 | `審核中 / 待補資料 / 阻擋 / 已核准 / 已退回` | internal-only workflow enum list |
| DVT | `可送審 / 需補資料或 Override / 阻擋` for DVT readiness; master status secondary | master-record-only help for the primary DVT readiness badge |
| 還原狀態 | `可還原 / 不可還原 / 受控邊界 / 已回收或已重用` | approval workflow explanation |
| master list mixed columns | column label reflects `狀態 / 階段 / 提醒` | a single `狀態` help that implies all chips are same context |

## 4. Static QC Requirements

Required static checks:

- Every `StatusColumnHeader context="X"` has adjacent or same-column primary `StatusBadge context="X"` unless the header label clearly declares mixed content.
- `task` context must not alias the full `workflowStatuses` list.
- `/numbering/reports` must not use `fileSync` context for report/export job statuses after Phase 1 implementation.
- `/numbering/imports` row check statuses must use an import-specific display context or an equivalent local helper with matching header/help text.
- `待補件` must not appear as approval status wording unless the specific subject is attachment supplementation.
- No normal UI route shows raw enum such as `PendingReview`, `MainDrawingInvalid`, `ReleaseFailed`, `staged`, `queued`, `running` as visible status text.

## 5. Browser QC Requirements

For each required route:

1. Login as Admin or appropriate demo user.
2. Open route at desktop viewport 1440x900 or 1680x768.
3. Open every visible status `?` popover.
4. Capture labels shown in the popover.
5. Verify labels match the route-specific acceptance matrix.
6. Verify popover is visible above table layers and not clipped.
7. Verify `ESC` closes the popover.
8. Verify outside click closes the popover.
9. Sweep for visible `.inline-error`, `[role=alert]`, `HTTP 4xx/5xx`, `Internal Server Error`, raw `/api/...`, raw SQL/constraint or raw enum.
10. Capture screenshot evidence for at least high-risk routes: tasks, imports, settings, reports, approvals, dvt.

Mobile / narrow viewport:

- If the route is in current desktop/default support scope, run one 390px sanity check on the most constrained surface: `/numbering/imports` or `/numbering/tasks`.
- Mobile-specific redesign is not required unless desktop/default surface becomes unusable.

## 6. Negative Tests

QA should require at least one deterministic negative check:

- A fixture or static assertion where `StatusColumnHeader context="fileSync"` is paired with a job status badge should fail.
- A fixture or static assertion where `task` help includes `已核准` should fail.
- A fixture or static assertion where an approval filter uses `待補件` should fail unless annotated as attachment supplement.

## 7. Evidence Required

Minimum evidence for Phase 1 completion:

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint -- --quiet` or equivalent touched-file lint
- Focused status context QC command result
- Playwright report JSON or console JSON listing route, opened popover labels, clipping status and visible error sweep
- Screenshots for high-risk routes under `output/playwright/status-context-disambiguation/`

## 8. Stop Conditions

- Any route requires backend state machine or DB schema changes.
- Any status cannot be safely mapped without changing workflow meaning.
- Browser check finds a runtime-visible error unrelated to this DEV and blocking route validation.
- Production deploy, production data repair, direct DB mutation or historical cleanup becomes necessary.

## 9. Deferred Scope Audit

| Deferred scope | Classification | Reason / recovery |
|---|---|---|
| production deployment | New DEV | Requires deployment-release-gate and explicit authorization. |
| DB/API enum rename | No Tracking | Not required for user-facing clarity. |
| audit/debug raw payload full localization | Same Spec Phase 2 or New DEV | Only needed if user expands scope to admin/debug surfaces. |
| historical data repair | Blocked Human Re-entry | Requires explicit data scope and repair approval. |
