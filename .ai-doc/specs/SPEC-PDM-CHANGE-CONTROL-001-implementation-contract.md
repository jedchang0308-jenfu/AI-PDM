# SPEC-PDM-CHANGE-CONTROL-001 Implementation Contract

狀態：Draft / RD-ready after PM authorization
日期：2026-06-24
關聯 DEV：`DEV-PDM-CHANGE-CONTROL-001`
關聯規格：

- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
- `.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md`
- `.ai-doc/decisions/ADR-PDM-CHANGE-CONTROL-001-reserved-draft-number-policy.md`
- `.ai-doc/qa/qa-pdm-change-control-validation-plan-2026-06-24.md`

## 1. Purpose

This contract converts the change-control business specification into RD-facing implementation boundaries. It defines the minimum domain objects, state transitions, action APIs, permission rules, transaction boundaries, concurrency guards, and failure behavior required before development starts.

This file does not replace the business spec. It constrains how RD should implement it.

## 2. Authoritative Decisions

- New replacement part numbers are first written to an independent draft model: `part_number_drafts`.
- Formal controlled part numbers remain in `part_numbers`.
- Controlled-boundary checks are centralized in a domain service, not duplicated in route handlers.
- High-risk cross-object operations use action APIs.
- Confirmed FFF impact release is atomic: new part release, drawing revision release, replacement link, old-part replacement marker, and BOM draft reconfirmation flags must succeed or fail together.
- First version `料號管理員` behavior is fulfilled by existing `pdm_admin`; a separate `part_number_manager` role is deferred.

## 3. Domain Objects

### 3.1 `part_number_drafts`

Purpose: reserve and edit candidate part numbers before they become controlled.

Minimum fields:

| Field | Requirement |
|---|---|
| `id` | Stable draft ID |
| `reserved_part_number` | Reserved candidate number, unique among active drafts and formal parts |
| `draft_type` | `new_part`, `replacement_part`, `drawing_revision_generated` |
| `item_type` | `self_made`, `purchased`, `standard` |
| `status` | `draft`, `pending_review`, `released`, `needs_reconfirmation`, `voided` |
| `source_part_number_id` | Required for replacement flows |
| `source_drawing_number_id` | Required before self-made replacement submission |
| `source_revision` | Required when created from drawing revision |
| `use_type` | Required when same source part already has unfinished replacement drafts |
| `company_id` | Must follow existing PDM company scope |
| `created_by` | Creator user ID |
| `department_id` or equivalent | Used for department draft visibility if available |
| `version` | Optimistic-lock integer |
| `created_at`, `updated_at` | Audit and optimistic-lock support |
| `voided_at`, `recycle_available_at`, `recycled_at` | Reserved-number recycle lifecycle |

Allowed `draft_type`:

- `new_part`
- `replacement_part`
- `drawing_revision_generated`

Allowed `item_type`:

- `self_made`
- `purchased`
- `standard`

Allowed `status`:

- `draft`
- `pending_review`
- `released`
- `needs_reconfirmation`
- `voided`

No extra user-facing status should be introduced without updating the spec and QA plan.

### 3.2 `part_number_events`

Purpose: append-only event history for draft and controlled part-number transitions.

Minimum event types:

- `draft_created`
- `item_type_changed`
- `source_part_changed`
- `draft_voided`
- `draft_recycle_scheduled`
- `draft_recycled`
- `draft_reissued`
- `draft_submitted`
- `draft_reconfirmation_required`
- `part_released`
- `controlled_recycle_blocked`

Minimum fields:

- `id`
- `part_number_draft_id`
- `part_number_id` when formal part exists
- `event_type`
- `actor_user_id`
- `occurred_at`
- `metadata_json`

### 3.3 `part_replacement_links`

Purpose: formal link from old part to replacement part.

Minimum fields:

- `old_part_number_id`
- `new_part_number_id`
- `source_drawing_number_id`
- `source_revision`
- `reason_category`
- `fff_summary_json`
- `released_by`
- `released_at`

The pair `old_part_number_id + new_part_number_id` must be unique.

### 3.4 `drawing_revision_fff_assessments`

Purpose: record each submitted FFF judgement and each refilled judgement after reviewer return.

Minimum fields:

- `drawing_number_id`
- `revision`
- `submission_id` or review package ID
- `form_state`
- `fit_state`
- `function_state`
- `reason_category`
- `note`
- `assessed_by`
- `assessed_at`

Allowed FFF state:

- `no_impact`
- `suspected_impact`
- `confirmed_impact`

### 3.5 `review_confirmation_events`

Purpose: record required reviewer decisions.

Required action values:

- `confirm_bom_no_revision`
- `confirm_original_part_reuse`
- `return_for_replacement_part`
- `approve_replacement_part_and_drawing_release`

Minimum fields:

- `review_id`
- `action`
- `reviewer_user_id`
- `result`
- `occurred_at`
- `metadata_json`

### 3.6 `bom_reconfirmation_flags`

Purpose: prevent unreleased BOM drafts from being submitted when they still reference a replaced part.

Minimum fields:

- `bom_draft_id`
- `old_part_number_id`
- `new_part_number_id`
- `reason`
- `created_at`
- `resolved_at`
- `resolved_by`

## 4. State Transitions

### 4.1 Draft Lifecycle

| From | Action | To | Guard |
|---|---|---|---|
| none | reserve draft | `draft` | Reserved number is not active in formal parts or active drafts |
| `draft` | submit review | `pending_review` | Controlled-boundary check passes; self-made gate passes |
| `draft` | void | `voided` | No controlled-boundary reference exists |
| `voided` | schedule recycle | `voided` | `recycle_available_at = now + 7 days` |
| `voided` | immediate recycle | terminal recycled event | Actor is creator or `pdm_admin`; live boundary check passes |
| `draft` / `pending_review` | another same-source replacement releases | `needs_reconfirmation` | Same `source_part_number_id` |
| `draft` / `pending_review` | source drawing has newer released revision | `needs_reconfirmation` | Same `source_drawing_number_id` |
| `needs_reconfirmation` | RD reconfirms | `draft` | RD confirms context and version is current |
| `pending_review` | reviewer approves | `released` | All review confirmation guards pass |
| `pending_review` | reviewer returns | `draft` | Return event is recorded |

### 4.2 FFF Decision Outcomes

| FFF states | Part behavior | Review behavior |
|---|---|---|
| All `no_impact` | Original part allowed | Reviewer must perform `confirm_bom_no_revision` |
| Any `suspected_impact`, none `confirmed_impact` | Original part allowed, high-risk | Reviewer must choose `confirm_original_part_reuse` or `return_for_replacement_part` |
| Any `confirmed_impact` | Original part blocked | New part draft and matching drawing part number required before submit |

## 5. Controlled-Boundary Service

Implement a shared service, for example:

```ts
assertPartNumberDraftIsRecyclable(draftId, actorContext)
assertPartNumberDraftCanSubmit(draftId, actorContext)
getPartNumberControlBoundary(draftId, actorContext)
```

The service must check live data every time, not cached or stale flags.

Controlled-boundary reasons:

- `referenced_by_bom`
- `referenced_by_replacement_link`
- `drawing_uploaded_to_pdm`
- `submitted_for_review`

Routes may call this service; they must not reimplement the rules independently.

## 6. API Contract

Use CRUD only for low-risk draft editing. Use action APIs for high-risk transitions.

### 6.1 Draft CRUD

Allowed:

- `GET /api/numbering/part-number-drafts`
- `POST /api/numbering/part-number-drafts`
- `PATCH /api/numbering/part-number-drafts/{draftId}`

PATCH requirements:

- Must include `version` or equivalent optimistic-lock token.
- Must reject stale updates with conflict response.
- Must re-evaluate gates when `item_type`, `source_part_number_id`, or `source_drawing_number_id` changes.

### 6.2 Action APIs

Required actions:

- `POST /api/numbering/part-number-drafts/{draftId}/submit-review`
- `POST /api/numbering/part-number-drafts/{draftId}/void`
- `POST /api/numbering/part-number-drafts/{draftId}/recycle`
- `POST /api/numbering/part-number-drafts/{draftId}/reconfirm`
- `POST /api/numbering/reviews/{reviewId}/confirm-bom-no-revision`
- `POST /api/numbering/reviews/{reviewId}/confirm-original-part-reuse`
- `POST /api/numbering/reviews/{reviewId}/return-for-replacement-part`
- `POST /api/numbering/reviews/{reviewId}/approve-confirmed-impact-release`

High-risk actions must return:

- Result status.
- Human-readable blocked reason when rejected.
- Domain reason code for QC and UI mapping.
- Current version if optimistic conflict occurs.

## 7. Permissions

### 7.1 Creator

Creator can:

- Edit own draft while status is `draft`.
- Void own draft if it has not crossed controlled boundary.
- Immediately recycle own voided reserved draft if live controlled-boundary check passes.

### 7.2 `pdm_admin`

First version `料號管理員` maps to existing `pdm_admin`.

`pdm_admin` can:

- View department/company drafts according to existing company scope.
- Immediately recycle eligible voided reserved drafts.
- Resolve exceptional draft visibility or cleanup issues.

### 7.3 Reviewer

Reviewer can:

- Confirm BOM no-revision.
- Confirm original part reuse.
- Return for replacement part.
- Approve confirmed-impact release package.

Reviewer must not edit RD's FFF judgement directly.

### 7.4 Company Scope

All draft, part, drawing, BOM, review, event, and replacement-link actions must enforce existing PDM company scope.

## 8. Transaction Boundaries

### 8.1 Confirmed-Impact Release Transaction

The following must complete in one transaction:

1. Convert approved draft into formal `part_numbers` row or mark it released if already materialized by the implementation.
2. Release the drawing revision package.
3. Create `part_replacement_links`.
4. Mark old part as replaced by new part.
5. Create `bom_reconfirmation_flags` for unreleased BOM drafts using the old part.
6. Create reviewer confirmation and part-number events.

No partial success is allowed. If any step fails, the transaction rolls back.

### 8.2 Reserved Draft Recycle Transaction

The following must complete in one transaction:

1. Reload draft row with lock or transactional equivalent.
2. Run live controlled-boundary service checks.
3. Confirm actor permission.
4. Mark draft recycled or move number back to available pool.
5. Append recycle event.

If any controlled-boundary reference appears during the transaction, recycle is rejected.

## 9. Concurrency

Use optimistic locking for draft edits:

- `version` increments on every successful write.
- Client sends last observed `version`.
- Stale writes return conflict and do not overwrite data.

Use transactional locking or equivalent for:

- Number reservation.
- Recycle.
- Submit review.
- Confirmed-impact release.

Concurrent duplicate reservation must not create duplicate active draft numbers or duplicate formal part numbers.

## 10. Failure Behavior

| Failure | Expected behavior |
|---|---|
| Stale draft edit | Reject with conflict; ask user to refresh |
| Recycle after controlled boundary appears | Reject with reason code |
| Self-made replacement missing drawing | Reject submit with visible disabled reason/API error |
| Drawing part-number mismatch | Reject submit; allow corrected read value |
| Reviewer skips required confirmation | Reject approval |
| Confirmed-impact release partial failure | Roll back entire transaction |
| Same source replacement already released | Mark related unfinished drafts `needs_reconfirmation` |

## 11. UI Contract

### 11.1 Part Draft List

Must show:

- Reserved/new part number.
- Draft type label.
- Item type.
- Source part.
- Source drawing/revision when applicable.
- Status.
- Creator/department if available.
- Warning when same source has other unfinished replacement drafts.

### 11.2 Drawing Revision Flow

Must show:

- Reason category.
- Form / Fit / Function three-state controls.
- Current part number.
- Replacement-part creation action when any FFF is `confirmed_impact`.
- Disabled reason when submit is blocked.
- Drawing part-number read value and RD correction field when matching is required.

### 11.3 Review Flow

Must show required action based on FFF outcome:

- `確認 BOM 不進版`
- `確認沿用原料號`
- `退回補新料號`
- `核准新料號與新版圖面發行`

### 11.4 BOM Flow

Unreleased BOM drafts with replaced parts must show `需重新確認` and block direct submit.

Released BOMs must not be auto-modified.

## 12. Phase Gates

### Phase 1: Data Model And Domain Service

Can pass without UI if:

- Draft table/model exists.
- Controlled-boundary service exists.
- Recycle and submit guards have automated tests.
- Optimistic-lock conflict is testable.

### Phase 2: Part Draft Module

Can pass without drawing revision UI if:

- Single draft list exists.
- Three draft types exist.
- Reserved draft recycle works.
- Same-source warning and `needs_reconfirmation` are testable.

### Phase 3: Drawing Revision Flow

Can pass without BOM UI if:

- FFF three-state flow exists.
- Confirmed impact creates replacement draft.
- Self-made drawing part-number matching gate works.

### Phase 4: Review Flow

Can pass if:

- Required reviewer actions are enforced.
- Reviewer cannot edit RD FFF judgement.
- Confirmed-impact release transaction is atomic.

### Phase 5: BOM Impact

Can pass if:

- Unreleased BOM drafts are flagged.
- Released BOMs are unchanged.
- Replaced-part warning and confirmation work in BOM edit.

## 13. Compatibility And Migration

- Existing formal `part_numbers` remain controlled and non-recyclable.
- Existing active drafts from older numbering flows, if any, must be classified during migration or treated as controlled until explicitly migrated.
- This contract does not authorize production data migration.
- Supabase/Postgres migration planning remains under the existing runtime migration governance.

## 14. RD Stop Conditions

Stop and ask PM/user before implementation if:

- Existing schema cannot support independent `part_number_drafts` without broad migration.
- Existing authorization cannot distinguish creator from `pdm_admin`.
- Existing BOM draft model cannot reliably identify unreleased drafts using old parts.
- Drawing part-number extraction source is unavailable and no manual correction fallback exists.
- Confirmed-impact release cannot be made atomic with current repository pattern.

## 15. QA/QC References

RD must update or add focused QC commands for:

- Controlled-boundary recycle guards.
- Confirmed-impact submission block.
- Self-made drawing part-number match.
- Confirmed-impact release transaction atomicity.
- BOM draft reconfirmation flag.
- Reviewer confirmation audit events.

Primary QA plan:

- `.ai-doc/qa/qa-pdm-change-control-validation-plan-2026-06-24.md`
