# SPEC-PDM-REVISION-TIMING-UX-001：保留號首版圖面版次預告與建立入口

Status: RD Complete / QA-QC Passed / Local Only
Date: 2026-07-18
Owner: Dev PM
Related DEV: `DEV-051` / `DEV-PDM-REVISION-TIMING-UX-001`
Related QA: `.ai-doc/qa/qa-pdm-revision-timing-ux-validation-plan-2026-07-18.md`

Related authority:

- `.ai-doc/specs/SPEC-PDM-REVISION-POLICY-002-release-gate-and-suggestion-engine.md`
- `.ai-doc/qa/qa-pdm-revision-policy-release-gate-validation-plan-2026-07-17.md`
- `.ai-doc/specs/SPEC-PDM-NUMBER-STATE-FLOW-001-unified-numbering-draft-and-transfer-functional-spec.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`

## 1. Human Decision Brief

Source:

- User screenshot on 2026-07-18 showed a newly created reserved-number row with `新圖料 · v2`.
- User asked why a newly reserved number appears to be already `V2`, where version editing happens, and whether the revision-adjustment timing should be earlier.
- User then asked to supplement the package to `RD可開發`.

Decision captured:

- Move revision awareness earlier, but keep formal revision commitment later.
- A reserved number must not itself become a controlled drawing revision.
- The reserve-number surface may show an early server-derived suggested drawing revision after a drawing candidate exists.
- The actual editable revision field remains in the first drawing / drawing revision workbench, and selected revision is frozen at submission snapshot according to `DEV-050`.
- Phase 1 must not open emergency-use, `ConditionalUse` or `TrialApproved`.

Chosen UX rule:

```text
提示提前，正式承諾延後。
```

## 2. Problem

The current reserve-number list can show `v{rowVersion}` next to `新圖料`. This is an internal optimistic-lock record version, not a drawing revision. In a PDM context, `v2` is likely to be interpreted as engineering revision `V2`, causing users to believe that a fresh reserved number has already skipped its first version.

The current formal revision edit point is also late for the operator's mental model:

1. User creates and reserves root/drawing/part candidates.
2. The row immediately displays `新圖料 · v2`.
3. User expects to prepare the first drawing and title block.
4. The actual revision decision is only visible when entering drawing revision / upload / submission surfaces.

This creates two gaps:

- `rowVersion` is exposed as if it were a business revision.
- Users do not get a clear "what revision should I put on the first drawing" answer at the moment they start using the reserved drawing number.

## 3. Utility Decision

| Criterion | Weight | Design implication |
|---|---:|---|
| Prevent revision misunderstanding | 0.30 | Remove or relabel `v{rowVersion}` from visible reserve-number list rows. |
| Protect formal revision correctness | 0.25 | Do not persist or lock drawing revision on the reserved-number record. |
| Operator speed | 0.20 | Show suggested first drawing revision and provide one CTA into the correct workbench. |
| Implementation reversibility | 0.15 | Prefer UI/API handoff and existing suggestion engine over new tables. |
| Audit quality | 0.10 | Keep durable revision evidence in submission snapshot, not in the reservation row. |

Selected approach:

- Early hint: reserve-number detail shows `建議研發版次 0.1` or the current policy-derived suggestion when a drawing candidate is available.
- Late commitment: `/numbering/revisions` or equivalent controlled drawing workbench owns editing, override reason and submission snapshot.
- Internal record version remains available only as audit / debug detail with a clear label, such as `系統紀錄版本 2`.

Rejected approaches:

- Force users to select a formal revision during reserve-number creation. This over-commits before a drawing package exists.
- Keep `v2` in list rows. This keeps the highest-confusion surface unchanged.
- Store a revision on the reservation row. This creates a second revision authority outside `DEV-050`.

## 4. Scope

### Phase 1：保留號到首版圖面的版次入口 UX

Status: RD Complete / QA-QC Passed / Local Only.

In scope:

- Reserve-number list row display cleanup.
- Reserve-number detail panel revision-preparation section.
- Early server-derived suggested drawing revision for reserved drawing candidates.
- `建立首版圖面` CTA from reserve-number detail to `/numbering/revisions`; it remains disabled while the number is only a candidate and becomes actionable only after publication promotes the drawing number to formal master data.
- Query/context handoff so the drawing revision workbench can preselect drawing number and workflow intent.
- Clear copy that the shown suggestion is not yet a created revision.
- Focused QC command plus QA browser plan covering desktop and mobile visible-error / overflow checks.

Out of scope:

- Production deploy, production migration, live data repair or historical mutation.
- New independent revision policy table.
- Changing minor/major release policy or allowing minor `Released`.
- Emergency-use, conditional-use or trial-approved status.
- CAD title-block automation, SolidWorks add-in, native file metadata parsing or file storage authority changes.
- Formal release handoff, manufacturing handoff or dashboard current-revision consumer changes.

## 5. Current Architecture Findings

RD pre-read result from current codebase:

| Surface | Current fact | DEV-051 implication |
|---|---|---|
| `src/components/number-state-workspace.tsx` | `NumberingDraftWorkspace` already exposes `rowVersion`, `drawings`, `reservations`, `capabilities` and candidate drawing codes. | No schema/API migration is required to know whether the workspace has a drawing candidate. |
| `src/components/number-state-workspace.tsx` | Primary list row currently renders `draftModeLabel(workspace.draftMode) · v{workspace.rowVersion}`. | This is the immediate P0 UX defect to remove or relabel. |
| `src/components/number-state-workspace.tsx` | Drawer header currently exposes `v{workspace.rowVersion}` near updated time. | Relabel as `系統紀錄版本 {n}` if retained. |
| `src/app/numbering/revisions/page.tsx` | Page already accepts `drawingNumber`, `partNumber` and `drawingNumberId` for initial lookup. | CTA handoff can reuse existing query entry with minimal routing change. |
| `src/app/numbering/revisions/page.tsx` | Revision input is visible and editable before submission. | This remains the formal revision-edit point. |
| `src/app/api/submissions/revision-suggestion/route.ts` | Existing endpoint computes server-created suggestions and supports `workflowIntent`. | DEV-051 must reuse this policy behavior and not create another policy engine. |
| `src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts` | Route already reads `revision` and `workflowIntent` query params and calls submission context. | Receiving workbench should pass `workflowIntent=rd_workspace`; do not rely on URL `revision` as authority. |
| `src/lib/drawing-submission-workbench.ts` | Submission context creates `revisionPolicySuggestion` with normalized intent and stale-basis safeguards. | This remains durable policy evidence for submit/freeze. |
| `src/lib/drawing-revision-workbench.ts` | Resolve context currently derives suggestion through older revision helper behavior. | RD should centralize or align this path with `DEV-050` suggestion engine so prefill and submit context agree. |
| Candidate reservation vs formal drawing | Reserved drawing candidates live in `numbering_draft_drawings` / `number_candidate_reservations`, while `/numbering/revisions` resolves formal `drawing_numbers`. | The detail may preview a server-derived suggestion early, but the CTA must remain disabled until workspace publication and drawing reservation promotion; otherwise the receiving workbench would fail lookup. |

## 6. RD Implementation Contract

### 6.1 Product files to change

| File | Required change | Must not do |
|---|---|---|
| `src/components/number-state-workspace.tsx` | Remove raw `v{workspace.rowVersion}` from reserve-number primary rows; relabel drawer/internal metadata as `系統紀錄版本 {workspace.rowVersion}`; add revision-preparation projection and an authority-gated CTA. | Do not add a revision input to reserve create/edit forms. Do not persist drawing revision on the workspace. Do not link a candidate-only drawing into the formal workbench. |
| `src/app/numbering/revisions/page.tsx` | Parse `workflowIntent`, `workflow_intent` or `lifecycleStage` from query; default to `rd_workspace`; pass it to resolve/submission-context calls; preserve user manual edits after prefill. | Do not trust `revision=` query as policy evidence. Do not overwrite a user-edited revision after async suggestion refresh. |
| `src/app/api/numbering/drawings/resolve/route.ts` | Accept `workflowIntent`/`workflow_intent`/`lifecycleStage` and pass through to the revision context resolver. | Do not default this route to `release_area` for the reservation-to-RD-workspace flow. |
| `src/lib/drawing-revision-workbench.ts` | Accept workflow intent and derive `suggestedRevision` through the central `DEV-050` suggestion engine or exactly equivalent normalized engine path. | Do not keep two different suggestion formulas for initial resolve vs submit context. |
| `src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts` | Existing support for `workflowIntent` must remain; focused QC should assert it. | Do not remove server permission checks. |
| `src/lib/drawing-submission-workbench.ts` | Existing `revisionPolicySuggestion`, override reason and stale-basis behavior should remain unchanged. | Do not weaken snapshot, stale-basis or override validation. |
| `scripts/qc-pdm-reservation-revision-timing-ux.mjs` | Add a focused static QC script for this DEV. | Do not make it require production, live data, credentials or a running external service. |
| `package.json` | Register `qc:pdm-reservation-revision-timing-ux`. | Do not remove existing `DEV-050` or `DEV-048` QC scripts. |

### 6.2 `src/components/number-state-workspace.tsx` contract

Add small local helpers near existing workspace display helpers. Suggested names are implementation guidance; RD may rename if the behavior remains testable:

```ts
function getReservedDrawingCandidates(workspace: NumberingDraftWorkspace): DraftDrawing[] {
  return workspace.drawings.filter((drawing) => Boolean(drawing.candidateCode));
}

function getPrimaryReservedDrawingCode(workspace: NumberingDraftWorkspace): string | null {
  return getReservedDrawingCandidates(workspace)[0]?.candidateCode ?? null;
}

function buildFirstDrawingRevisionHref(workspace: NumberingDraftWorkspace, drawingNumber: string): string {
  const params = new URLSearchParams({
    drawingNumber,
    workflowIntent: "rd_workspace",
    source: "number_state_workspace",
    workspaceId: workspace.id
  });
  return `/numbering/revisions?${params.toString()}`;
}
```

Required UI behavior:

- Primary list metadata should render `draftModeLabel(workspace.draftMode)` without `· v{workspace.rowVersion}`.
- Drawer/internal metadata may render `系統紀錄版本 {workspace.rowVersion} · 更新於 ...`.
- Add a compact section titled `圖面版次準備` in the drawer near `後續動作`.
- If at least one reserved drawing candidate exists, show:
  - `建議研發版次`
  - suggestion value from server/workbench policy context when available, or `0.1` only as policy-backed first-drawing display if the receiving workbench will recompute immediately;
  - `尚未建立版次；建立首版圖面時可確認或調整。`
  - CTA `建立首版圖面`.
- The CTA is actionable only when `workspace.lifecycleStatus === "published"` and the matching drawing reservation state is `promoted`.
- Before that authority gate is satisfied, render the CTA disabled with `先完成保留號審核與正式發布，再進入圖面進版工作台。` or equivalent explicit reason.
- If no drawing candidate exists, show no fake revision. The message must be `尚未有圖號，先取得候選圖號。` or equivalent.
- If the workspace is locked for review, do not present reservation edit as a revision edit shortcut.

Implementation note:

- The implemented drawer calls the existing `DEV-050` suggestion endpoint for preview semantics. Formal drawing lookup and revision creation authority still come from the receiving workbench after publication.

### 6.3 `/numbering/revisions` contract

Add an initial workflow-intent parser:

```ts
function getInitialWorkflowIntent(searchParams: URLSearchParams): RevisionWorkflowIntent {
  const value =
    searchParams.get("workflowIntent") ??
    searchParams.get("workflow_intent") ??
    searchParams.get("lifecycleStage");
  return normalizeRevisionWorkflowIntent(value ?? "rd_workspace");
}
```

Required behavior:

- On actionable CTA entry after publication/promotion, initial lookup preselects the formal drawing by `drawingNumber`.
- Resolve and submission workbench requests carry `workflowIntent=rd_workspace`.
- The visible editable revision field is prefilled from the server suggestion.
- Once the user manually edits the revision field, async refresh must not overwrite that manual value unless the user explicitly reloads/reselects the drawing.
- If `source=number_state_workspace`, the page may show source context such as `從保留號建立首版圖面`; this is helpful but not authority.
- Submit still sends server-returned `revisionPolicySuggestion` and override reason behavior from `DEV-050`.

Recommended URL from reservation detail:

```text
/numbering/revisions?drawingNumber={candidateDrawingNumber}&workflowIntent=rd_workspace&source=number_state_workspace&workspaceId={workspaceId}
```

Rules:

- `drawingNumber` may preselect the drawing in the receiving page.
- `workflowIntent=rd_workspace` tells the revision workbench which suggestion lane to request.
- `workspaceId` may support a return link or source context, but it must not become revision authority.
- Do not trust a query string revision value as policy evidence.
- The receiving page must call the server suggestion/submission context and render the returned suggestion.

### 6.4 Resolve route and workbench context contract

`src/app/api/numbering/drawings/resolve/route.ts` should pass workflow intent into `resolveDrawingRevisionContext`.

`src/lib/drawing-revision-workbench.ts` should extend input as:

```ts
type ResolveDrawingRevisionContextInput = {
  drawingNumber?: string | null;
  drawingNumberId?: string | null;
  partNumber?: string | null;
  workflowIntent?: RevisionWorkflowIntent | string | null;
};
```

Required invariant:

- The initial `suggestedRevision` returned by resolve route and the later `revisionPolicySuggestion.suggestedRevision` returned by submission workbench must agree for the same drawing revisions and same workflow intent.
- If implementation keeps resolve as lookup-only, then `/numbering/revisions` must treat resolve suggestion as provisional and replace it with submission-workbench suggestion before submit is enabled.

### 6.5 Focused QC script contract

Add `scripts/qc-pdm-reservation-revision-timing-ux.mjs` and package script:

```json
"qc:pdm-reservation-revision-timing-ux": "node scripts/qc-pdm-reservation-revision-timing-ux.mjs"
```

Focused QC must statically inspect at least:

- `src/components/number-state-workspace.tsx`
- `src/app/numbering/revisions/page.tsx`
- `src/app/api/numbering/drawings/resolve/route.ts`
- `src/lib/drawing-revision-workbench.ts`
- `src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts`
- `package.json`

Minimum assertions:

- `number-state-workspace.tsx` no longer contains reserve primary-row copy equivalent to `· v{workspace.rowVersion}`.
- The UI contains `系統紀錄版本`, `圖面版次準備`, `建議研發版次`, `尚未建立版次` and `建立首版圖面`.
- CTA source includes `/numbering/revisions`, `drawingNumber`, `workflowIntent=rd_workspace`, `source=number_state_workspace` and `workspaceId`.
- `/numbering/revisions` reads `workflowIntent` and passes it to server context.
- Resolve route/context no longer uses an unaligned suggestion path for the same workflow intent.
- No `ConditionalUse`, `TrialApproved`, `條件使用`, `試用核准` or emergency-use CTA is introduced by this DEV.
- No reservation-row `revision`, `selectedRevision`, `suggestedRevision` persistence field is added as authority.
- Candidate-only CTA state is disabled and carries a publication/promotion reason; an actionable link is rendered only for a published workspace with a promoted drawing reservation.

## 7. Behavior Contract

### 7.1 Reserved-number list

Required:

- Do not show raw `v{rowVersion}` in the first-line or second-line list row near `新圖料`, `新圖號`, `新料號` or item name.
- If internal row version must remain visible, relabel it as `系統紀錄版本 {n}` and place it in detail/audit metadata, not in the primary list row.
- The list row may still show draft mode, application status, number effectiveness, candidate codes and next step.

Fail condition:

- A newly created and auto-acquired reserved-number row displays `新圖料 · v2`, `v2`, `V2` or any other unlabeled version text that can be mistaken for drawing revision.

### 7.2 Reserve-number detail revision preparation

When the workspace contains at least one reserved drawing candidate and no controlled drawing revision package exists for that drawing:

- Show a compact section titled `圖面版次準備` or equivalent.
- Show `建議研發版次 0.1` for a first drawing before any major release, using the server revision suggestion contract from `DEV-050`.
- Show a secondary line: `尚未建立版次；建立首版圖面時可確認或調整。`
- Show CTA `建立首版圖面`.
- While the drawing remains candidate-only, keep the CTA disabled and explain that review and formal publication must finish first.
- After publication promotes the drawing reservation, enable the CTA and hand off the formal drawing number to `/numbering/revisions`.

When the workspace has a drawing candidate but the suggestion API cannot compute a reliable basis:

- Show an actionable recovery state, not a silent blank.
- The user-facing conclusion must answer now-what, for example `無法取得建議版次，請重新整理或進入圖面進版頁確認。`

When the workspace has no drawing candidate:

- Do not show a fake revision suggestion.
- Show a disabled or absent first-drawing CTA with the reason `尚未有圖號，先取得候選圖號。`

When a controlled drawing revision package already exists:

- Show the latest controlled revision summary from the drawing revision authority.
- CTA becomes `進入圖面進版` or equivalent, not `建立首版圖面`.

### 7.3 Editing point

Revision editing point matrix:

| Stage | UI surface | Editable revision? | Contract |
|---|---|---:|---|
| Reserve-number creation | Create numbering / reserve-number form | No | Do not ask for drawing revision before a drawing candidate exists. |
| Reserved-number detail after candidate exists | Reserve-number drawer | No, preview only | Show server-derived suggestion; keep CTA disabled until publication/promotion. |
| First controlled drawing creation | `/numbering/revisions` or equivalent drawing revision workbench | Yes | Prefill from server suggestion; user may override within allowed lane. |
| Submission create | Drawing revision submission route | Frozen after submit | Store suggested / selected / override / policy metadata snapshot per `DEV-050`. |
| Review / final approval | Review and release surfaces | No direct edit | Reject, withdraw or return to correction path. Minor cannot become `Released`. |

## 8. Suggestion Algorithm Placement

This DEV does not replace the `DEV-050` suggestion engine. It only decides when and where to call/display it.

Decision function:

```ts
function deriveReservationRevisionPrompt(workspace) {
  if (!workspace.hasReservedDrawingCandidate) {
    return { kind: "not_available", reason: "no_drawing_candidate" };
  }

  if (workspace.hasControlledDrawingRevisionPackage) {
    return { kind: "existing_revision", action: "open_revision_workbench" };
  }

  if (!workspace.isPublished || !workspace.hasPromotedDrawingReservation) {
    return { kind: "suggest_first_drawing", action: "await_publication" };
  }

  return {
    kind: "suggest_first_drawing",
    workflowIntent: "rd_workspace",
    action: "create_first_drawing"
  };
}
```

Required invariant:

- `rowVersion` must never be an input to revision suggestion.
- Reservation status must never be treated as evidence that a drawing revision exists.
- A candidate code alone must never be treated as a resolvable formal drawing number; actionable handoff requires publication plus reservation promotion.
- Suggestion display has no durable effect until a controlled drawing package is created or submitted.

## 9. Data / API / Permission Impact

Expected Phase 1 implementation impact:

| Area | Contract |
|---|---|
| Reserve-number UI | Relabel or hide row version; add revision-preparation section and CTA. |
| Revision suggestion API | Reservation preview uses read-only `GET /api/submissions/revision-suggestion?drawingNumber=...&workflowIntent=rd_workspace`; do not widen production-slice mutation allowlists for this calculation. |
| Drawing revision workbench | Accept `drawingNumber`, `workflowIntent` and source context query params; recompute suggestion server-side. |
| Persistence | No new table required. No reservation-row revision field required. |
| Submission snapshot | Existing `DEV-050` snapshot remains the durable policy evidence. |
| Permissions / authority | Candidate viewers may see the suggestion preview. The actionable CTA requires a published workspace and promoted drawing reservation; receiving route/API permissions remain authoritative. |

No schema migration should be required for Phase 1. If persistence is proposed, it must be additive, separately justified and stopped for PM review before RD changes schema.

## 10. Failure Modes

| Failure | Required handling |
|---|---|
| Suggestion API unavailable | Show actionable retry / go-to-workbench state; no fake revision. |
| Candidate drawing number missing | Explain that a drawing candidate is needed before first drawing revision can be prepared. |
| Candidate basis changes before submission | Use existing stale suggestion 409 recovery from `DEV-050`. |
| User overrides suggestion without reason | Existing submission route rejects with actionable Traditional Chinese message. |
| User attempts to release minor revision | Existing release gate blocks `minor_revision_cannot_be_released`. |
| User lacks revision workbench permission | CTA hidden or disabled with role-based reason; no direct URL authority bypass. |
| Workspace is locked in review | Do not offer edit-reservation path; show review / withdraw / correction path according to current capabilities. |
| Candidate-only drawing is sent to formal workbench | Prevent handoff by disabling CTA until publication and drawing reservation promotion; direct route/API still fails closed. |

## 11. RD Slices

### Phase 1A：rowVersion 誤讀修正

Entry:

- `src/components/number-state-workspace.tsx` currently shows raw `v{workspace.rowVersion}` in reserve-number UI.

Implementation:

- Remove raw `v{workspace.rowVersion}` from primary list row.
- Relabel drawer/internal value as `系統紀錄版本 {workspace.rowVersion}` if kept.

Done when:

- Static QC finds no raw row-version business-revision display.
- Manual UI check on a row whose `rowVersion` is 2 no longer appears as `V2`/`v2` drawing revision.

### Phase 1B：reserve detail revision-preparation panel

Entry:

- Workspace already exposes `drawings` and candidate codes.

Implementation:

- Add `圖面版次準備` panel in the drawer.
- Show first-drawing suggestion state only when at least one drawing candidate exists.
- Keep no-drawing-candidate and locked-review states explicit.
- Keep the CTA disabled while the drawing is candidate-only; enable it only after publication/promotion.

Done when:

- Detail panel answers `現在有沒有建立版次` and `下一步按哪裡`.
- No reserve form contains a revision input.

### Phase 1C：CTA handoff and workbench prefill

Entry:

- `/numbering/revisions` already supports initial drawing lookup.

Implementation:

- CTA opens `/numbering/revisions?drawingNumber=...&workflowIntent=rd_workspace&source=number_state_workspace&workspaceId=...`.
- Receiving page reads workflow intent and requests server suggestion.
- Preserve manual edits in the revision field.

Done when:

- Workbench opens with the drawing selected, `rd_workspace` suggestion displayed and editable revision field available before submit.
- No query-string revision is treated as policy evidence.

### Phase 1D：focused QC and browser QC

Entry:

- Phase 1A-1C implementation is locally complete.

Implementation:

- Add `scripts/qc-pdm-reservation-revision-timing-ux.mjs`.
- Register `qc:pdm-reservation-revision-timing-ux`.
- Run static, TypeScript, lint, existing DEV-050 regression and browser visible-error/RWD checks.

Done when:

- Focused QC passes.
- Required browser viewport evidence shows no visible error, overlap, clipping or horizontal overflow.

## 12. Acceptance Criteria

- A newly created and auto-acquired reserved-number row no longer displays unlabeled `v2`.
- Reserve-number detail shows a clear distinction between `系統紀錄版本` and drawing revision.
- A reserved drawing candidate shows `建議研發版次 0.1` before first controlled drawing creation.
- The same detail state says the revision is not yet created and can be confirmed or adjusted in the first drawing workbench.
- `建立首版圖面` opens the drawing revision workbench with the reserved drawing number and `rd_workspace` intent preselected.
- Before publication/promotion, `建立首版圖面` is disabled with an explicit reason; it becomes a link only after the candidate drawing is formal.
- The drawing revision workbench recomputes the server suggestion; query params are not trusted as policy evidence.
- Users can edit selected revision only in the drawing revision workbench before submission snapshot is frozen.
- Override still requires reason and minor revision still cannot become `Released`.
- No new emergency-use / conditional-use / trial-approved UI appears in Phase 1.
- Browser checks show no visible errors, no raw internal errors and no horizontal overflow at required viewports.

## 13. QA / QC Gate

Required QA plan:

- `.ai-doc/qa/qa-pdm-revision-timing-ux-validation-plan-2026-07-18.md`

Minimum expected evidence after implementation:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint
npm.cmd run qc:pdm-revision-policy-suggestion
npm.cmd run qc:pdm-revision-policy-release-gate
npm.cmd run qc:pdm-number-state-flow-phase1b
npm.cmd run qc:pdm-number-state-flow-ui
npm.cmd run qc:pdm-reservation-revision-timing-ux
```

Browser evidence after implementation:

- 1440x900 reserve-number list and drawer.
- 1024x768 reserve-number drawer.
- 390x844 reserve-number list and drawer.
- 320x740 reserve-number drawer.
- 1440x900 `/numbering/revisions` opened from `建立首版圖面`.

Implemented evidence directory:

- `output/playwright/dev051-reservation-revision-timing-ux/`

## 14. Stop Conditions

Stop and return to PM/user if implementation would:

- Persist drawing revision directly on the reservation workspace as a second authority.
- Trust query-string revision as policy evidence.
- Allow minor revision to become production `Released`.
- Require production migration, live data repair, historical data mutation or deploy.
- Open `ConditionalUse`, `TrialApproved` or emergency-use manufacturing authority.
- Hide the revision edit point so users cannot tell where and when revision can be changed.
- Remove existing `DEV-050` suggestion snapshot or release gate safeguards.

## 15. Spec Governance Result

Preflight classification:

- `No conflict` with `DEV-050`: this DEV reuses server-created suggestion and submission snapshot.
- `Compatible exception` with existing reserve-number row version behavior: internal `rowVersion` remains valid for optimistic locking, but visible copy must no longer use raw `v{rowVersion}` where it can be read as drawing revision.
- `No conflict` with `DEV-048`: reserved candidates remain non-official until publication. Implementation corrected the initial CTA assumption by keeping candidate-only handoff disabled and enabling it only after publication/promotion.

ADR decision:

- ADR not required for Phase 1. The long-lived policy decision already lives in `DEV-050`; this DEV is a UX/API handoff contract and is reversible without schema authority change.

RD completion gate:

- Phase 1A-1D are implemented locally and QA/QC passed.
- The receiving workbench recomputes the server suggestion, preserves manual edits, and candidate-only handoff is fail-closed until publication/promotion.
- No schema or reservation revision authority was introduced.

Release boundary:

- This document does not authorize merge, PR, deploy, production smoke, rollback or release report.

## 16. Implementation Result

Implemented product boundary:

- Removed raw reserve-row `v{rowVersion}` and relabelled drawer metadata as `系統紀錄版本`.
- Added server-derived `圖面版次準備` preview, loading/retry/no-drawing states and publication-gated `建立首版圖面` behavior.
- Reused `numbering.draft.update` action permission to keep the actionable CTA disabled for users who cannot create drawing revision submissions; server route/API guards remain authoritative.
- The reservation drawer uses the suggestion route's read-only `GET` interface so production-slice middleware does not misclassify suggestion calculation as a mutation; the old `POST` remains blocked by the slice allowlist.
- While the official-numbering production slice is configured, the panel may show the read-only suggestion but keeps `/numbering/revisions` CTA disabled because formal drawing revision workflow is outside that slice.
- Added workflow-intent aliases and server context propagation across resolve and submission workbench routes.
- Aligned resolve suggestion with the central `DEV-050` policy engine and protected manual revision edits from async overwrite.
- Added `qc:pdm-reservation-revision-timing-ux`; focused QC passed 13/13.

Local verification result:

- TypeScript and lint passed.
- `DEV-050`, drawing submission and `DEV-048` focused regressions passed.
- Browser QC passed at 1440x900, 1024x768, 390x844 and 320x740 with no visible error or horizontal overflow.
- Candidate detail showed suggestion `0.1` with disabled CTA; after review/publication/promotion the CTA became actionable and opened the formal workbench.
- Manual revision edit `0.2` remained intact after server context refresh, while the policy suggestion remained `0.1`.
- Viewing suggestions created zero submissions and zero drawing revision packages in the disposable fixture database.
