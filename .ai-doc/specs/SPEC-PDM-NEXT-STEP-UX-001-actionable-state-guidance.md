# SPEC-PDM-NEXT-STEP-UX-001: 全系統可行動狀態提示與下一步 UX

Status: Phase 1 implemented / verification passed locally
Current authorized phase: Phase 1 local UI implementation complete
Phase 2 state: RD Contract Ready / Not Authorized
Created: 2026-07-04
Owner: Dev PM
Related DEV: `DEV-PDM-NEXT-STEP-UX-001`

## Human Decision Brief

使用者真正要知道的不是系統狀態本身，而是「那我現在要幹嘛」。

Decisions captured:

- Normal user UI must answer the next action within the first visible message.
- Correct next action may be `不用處理`, but it must be explicit.
- Main UI prompts must not lead with raw backend code, SQL, HTTP status, enum names, internal IDs, audit payloads or implementation details.
- High-risk states must show the responsible role and a recovery path, for example `請 R&D Manager 補齊發布包`.
- Technical detail may remain in secondary details, support/debug panels, audit logs or developer evidence, but not as the primary user-facing answer.
- This DEV is a UX presentation and QA gate package. It does not authorize state-machine, permission, schema, data repair or production changes.

## Problem Statement

Several pages already have Chinese status wording, but still fail the user task because the UI explains what happened instead of telling the user what to do next. The recent drawing submission blocker showed this clearly: `已發布，不能取消送審` is technically correct, but the user's real question was `我不送審了，下一步要做什麼？`

Target behavior:

- If no action is needed, say `這版已完成，不用再送審` and offer the safe next place to go.
- If action is needed by someone else, say who owns it and where to send the user.
- If the user can recover, put the recovery CTA next to the message.
- If the state is terminal, avoid inviting unavailable actions.

## UX Principle

Use the 5-second check:

1. Can a non-developer understand whether they must act?
2. Can they identify the next action without opening details?
3. Can they see the owner when they are not the owner?
4. Can they reach the next screen from the same state?
5. Can they ignore the state safely when no action is required?

Every blocker, empty state, disabled action, toast, alert and detail-page failure must pass this check.

## Scope

In scope for Phase 1:

- User-facing blockers and confirmation panels.
- Empty states and no-result states.
- Disabled-row and disabled-button reasons.
- Toasts, alerts and submit/action failure messages.
- Detail-page `not_found`, unauthorized and restricted states.
- Sidebar/right-panel summary states that currently list status facts without action guidance.
- Shared components that shape these states, especially `NextStepState`, lifecycle panels and status display helpers.

Out of scope:

- Database enum/schema rename.
- Backend lifecycle/state-machine redesign.
- Permission model changes.
- Production deploy or migration.
- Historical data repair.
- Admin/debug/audit raw payload full localization.
- Full platform navigation redesign.

## End-State Architecture

The system should have a small, shared UX contract for user-facing state guidance:

- `status-display` remains the vocabulary source for status labels and severity.
- `NextStepState` or an equivalent shared component becomes the default shape for actionable blockers, empty states and failure states.
- Page-level states provide a short `answer`, a `nextStep`, optional `owner`, optional `why`, optional `details`, and one or more CTAs.
- Main message order is always:
  1. What this means for the user.
  2. What to do now.
  3. Who owns it, if not the current user.
  4. Secondary details only if needed.
- Existing domain services and APIs can keep structured/raw error codes for machine handling; UI maps them before rendering.

## Architecture Memory Capsule

This DEV extends, but does not replace, the current status UX work:

- `SPEC-PDM-STATUS-UX-001` governs Chinese status vocabulary and raw-code shielding.
- `SPEC-UX-RD-LIFECYCLE-001` governs object lifecycle UX and role-aware action placement.
- `SPEC-UX-PLATFORM-001` governs object-centered routing and task navigation.
- This spec adds the missing layer: every state must tell the user the next action.

Memory rule for future RD:

> A state message is incomplete if it only says what happened. It is complete only when it tells the user what to do, who should do it, or that no action is required.

## Implementation Contract

Phase 1 must apply the following contract to each selected surface.

### Message Model

Each actionable state should be expressible as:

- `title`: short answer to the user situation.
- `nextStep`: direct instruction, including `不用處理` when applicable.
- `owner`: responsible role when the current user is not expected to act.
- `primaryAction`: the safest next click.
- `secondaryActions`: optional alternatives.
- `reason`: short user-readable explanation.
- `technicalDetail`: hidden or secondary support/debug detail.

### Copy Rules

- Use verbs first when action is needed: `補齊`, `建立新版次`, `回圖號模組`, `查看正式紀錄`, `請 R&D Manager 處理`.
- Use completion language when no action is needed: `這版已完成，不用再送審`.
- Avoid main-copy patterns such as `不能重複建立`, `發生錯誤`, `not_found`, `duplicate_active_submission`, `SQLITE_CONSTRAINT`.
- Internal IDs can appear only as supporting evidence, not as the primary answer.
- The first CTA must match the recommended next action.

### Component Rules

- `NextStepState` default body placement must not hide the next step inside help/details.
- Lifecycle panels may keep `why` content, but the main panel must still show `現在要做` or equivalent direct action.
- Disabled controls must include a nearby next step, not only a tooltip with the reason.
- Empty states must include at least one recovery/search/create/back action unless the safe answer is explicitly `不用處理`.
- Alerts/toasts must map known errors to actionable copy; unknown errors must fail closed to a safe support message and preserve raw detail only for diagnostics.

## Phase Roadmap / RD Handoff Contract

| Phase | Authorization | Target | Required output | Stop conditions |
|---|---|---|---|---|
| Phase 0 - Documentation | Authorized by `寫成開發文件` | Capture QA inventory, spec, PM routing and future contracts | This spec, `dev_task` row, `documentation_map` read order | None |
| Phase 1 - Product UI implementation | Authorized by `執行開發` and implemented locally on 2026-07-04 | Fix the high-priority UI surfaces so they answer `那我現在要幹嘛` | Code changes, focused screenshots, lint/typecheck/build or justified equivalent | Requires API/schema/permission/state-machine change; needs production/data repair; copy cannot be mapped safely |
| Phase 2 - Regression scanner and new-module checklist | Not authorized | Add QC guard for raw/non-actionable states and PM/RD checklist for new UI states | Scanner script, checklist, baseline evidence | Scanner creates excessive false positives without review owner |
| Phase 3 - Production release gate | Not authorized | Release only after Phase 1/2 verified and deployment approval exists | Release-gate evidence, post-deploy smoke | Any production/cutover approval missing |

## Current QA Inventory Evidence

Good patterns to preserve:

- `src/app/upload/page.tsx`: formal same-revision blocker was simplified toward `這版已完成，不用再送審`, with actions such as `回圖號模組`, `建立新版次`, `查看正式紀錄`.
- `src/app/bom/reviews/page.tsx`: empty state uses `NextStepState` with actions.
- `src/app/handoff/page.tsx`: empty list uses `NextStepState`.
- `src/app/numbering/tasks/page.tsx`: empty task and notification states use `NextStepState`.

High-priority gaps to fix in Phase 1:

| Area | Evidence | Problem | Expected direction |
|---|---|---|---|
| Dashboard action failures | `src/components/dashboard.tsx` repeated `alert(body.error ?? "...失敗")` around action handlers | User sees failure text, not recovery | Replace with actionable mapped states/toasts: retry, owner, destination, or support path |
| Unknown status/error fallback | `src/lib/status-display.ts` fallback | Raw or technical text may leak | Unknowns should show safe Chinese action copy and keep raw detail secondary |
| Shared next-step component | `src/components/next-step-state.tsx` | Default body placement can hide the real next step behind help | Make the direct next step visible by default |
| Lifecycle UX | `src/components/lifecycle-ux.tsx` | `nextStep` can be treated as help text instead of main guidance | Surface `現在要做` in the main panel |
| Drawing revision blockers | `src/app/numbering/revisions/page.tsx` | Same-revision formal blockers still sound like system rules | Reuse `這版已完成，不用再送審`; show create-new-revision path only when content changed |
| DVT candidate states | `src/app/numbering/dvt/page.tsx` | Disabled/missing reasons do not tell the user what to do | Add role and remediation CTA |
| Dashboard missing release/BOM | `src/components/dashboard.tsx` | State report without recovery path | Show owner and route to source workbench or responsible role |
| Submission detail failures | `src/app/submissions/[id]/page.tsx` | `not_found`, restricted and error states lack CTA | Back to workbench/source list, role hint, support/debug detail secondary |
| Handoff missing package | `src/app/handoff/page.tsx` | `缺發布包` badge is not enough | Say manufacturing cannot use it yet; route to submission/release owner |
| Search/parts empty results | `src/app/numbering/search/page.tsx`, `src/app/parts/page.tsx` | Empty results are passive | Offer clear/create/back/reset-filter actions |
| Master attachment panel | `src/components/master-attachment-panel.tsx` | Generic empty and raw backend errors | Map to upload/select/retry/owner actions |
| Part drafts/reports empty states | `src/app/numbering/part-drafts/page.tsx`, `src/app/numbering/reports/page.tsx` | Passive wording | Add action-oriented empty states |

## QA/QC Gate

Phase 1 acceptance:

- Every changed blocker/empty/error/disabled state answers `現在要做什麼`.
- No normal UI main message starts with raw backend code, SQL/constraint text, HTTP status or internal enum.
- Terminal states explicitly say no further action is needed when that is the answer.
- At least one visible CTA or safe owner instruction appears for each recoverable state.
- Desktop and mobile screenshots show no overlap, clipping or hidden CTA in the changed surfaces.
- Focused browser evidence covers at least one blocker, one empty state, one error state and one disabled action.

Suggested checks:

- `npx tsc --noEmit --pretty false`
- `npm run lint`
- `npm run build`, unless local-dev guard correctly blocks `.next` cleanup while the dev server is running.
- Existing focused QC relevant to touched modules.
- New Phase 2 scanner when authorized.

## Spec Governance Result

Existing spec compatibility:

- Compatible with `SPEC-PDM-STATUS-UX-001`: status dictionary remains the status vocabulary and raw-code shielding source.
- Compatible with `SPEC-UX-RD-LIFECYCLE-001`: lifecycle panels remain the foundation; this spec strengthens inline next-step visibility.
- Compatible with `SPEC-UX-PLATFORM-001`: object-centered task routing remains the navigation model.

ADR result:

- No new ADR is required for Phase 0 or the planned Phase 1 UI presentation work because no identity, ownership, permission, schema, lifecycle-state or data-contract change is intended.
- If RD discovers that a fix requires state-machine, permission, API contract, database schema, migration or production data repair changes, stop and create/update an ADR before implementation continues.

## Deferred Scope Audit

| Scope | Classification | Reason |
|---|---|---|
| Product RD implementation | Same Spec Phase 1 / Completed locally | Authorized by `執行開發` and implemented locally on 2026-07-04 |
| Regression scanner hardening | Same Spec Phase 2 / Not Authorized | Useful after copy/component rules are implemented |
| Production deploy/release | New DEV or release gate / Not Authorized | Requires deployment approval and release evidence |
| DB/API/permission/state-machine changes | Blocked Human Re-entry | Higher-risk product decision outside UI copy contract |
| Admin/debug/audit raw payload full localization | No Tracking in this DEV | Normal UI is the target; debug/admin payload localization is a different objective |
| Full platform navigation redesign | No Tracking in this DEV | Covered by `SPEC-UX-PLATFORM-001`; this DEV is state guidance only |

## All-Phase Coverage Matrix

| User problem | Phase 0 | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|---|
| User cannot tell what to do next | Specified | Fix selected UI surfaces | Scanner/checklist prevents recurrence | Release smoke confirms |
| Raw/technical message becomes main answer | Specified | Map known errors and safe unknown fallback | Scanner flags raw main-copy patterns | Production smoke confirms |
| Terminal state still invites action | Specified | Terminal copy says `不用處理` and hides invalid actions | Checklist covers terminal states | Production smoke confirms |
| Owner is unclear | Specified | Add owner/role guidance | Checklist covers owner field | Production smoke confirms |
| CTA does not match message | Specified | Align first CTA with recommended next step | Browser/QC coverage | Production smoke confirms |

## RD Readiness Review

Phase 1 local RD is implemented and locally verified.

Ready inputs:

- Problem statement and human decisions are captured.
- High-priority file inventory is captured.
- Existing spec relationships are identified.
- Stop conditions are explicit.
- QA acceptance gates are defined and focused gates passed.

Phase 1 implemented surfaces:

- `src/components/next-step-state.tsx`
- `src/lib/status-display.ts`
- `src/components/lifecycle-ux.tsx`
- `src/components/dashboard.tsx`
- `src/app/numbering/revisions/page.tsx`
- `src/app/numbering/dvt/page.tsx`
- `src/app/submissions/[id]/page.tsx`
- `src/app/handoff/page.tsx`
- `src/app/numbering/search/page.tsx`
- `src/app/parts/page.tsx`
- `src/components/master-attachment-panel.tsx`
- `src/app/numbering/part-drafts/page.tsx`
- `src/app/numbering/reports/page.tsx`
- `src/app/globals.css`
- Focused QC maintenance: `scripts/qc-pdm-numbering-search-ui.mjs`, `scripts/qc-pdm-numbering-dvt-ui.mjs`, `scripts/qc-pdm-drawing-submission-ui-operation-scenarios.mjs`

Verification evidence:

- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm.cmd run qc:pdm-status-ui-vocabulary`: passed 44/44.
- `npm.cmd run qc:pdm-numbering-search-ui`: passed 28/28 with `PDM_BASE_URL=http://127.0.0.1:3000`.
- `npm.cmd run qc:pdm-numbering-dvt-ui`: passed 24/24 with `PDM_BASE_URL=http://127.0.0.1:3000`.
- `npm.cmd run qc:pdm-numbering-report-center-ui`: passed 22/22 with `PDM_BASE_URL=http://127.0.0.1:3000`.
- `npm.cmd run qc:master-attachments`: passed 93/93.
- `npm.cmd run qc:pdm-drawing-submission-ui-operation`: passed 14/14 with `PDM_BASE_URL=http://127.0.0.1:3000`.
- `npm.cmd run dev:local:check`: passed; AI_PDM healthy on `http://127.0.0.1:3000/`.
- `npm.cmd run build`: not run to completion because `prebuild` correctly refused to clean `.next` while AI_PDM was listening on port 3000; no bypass was used.

Not authorized yet:

- New QC scanner implementation.
- Production deploy.
- Schema/API/permission/state changes.
- Historical data repair.
