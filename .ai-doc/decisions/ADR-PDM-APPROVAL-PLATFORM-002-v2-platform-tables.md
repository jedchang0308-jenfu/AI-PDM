# ADR-PDM-APPROVAL-PLATFORM-002 - V2 approval platform tables

Status: Accepted for local implementation
Date: 2026-07-08
Owner: RD
Related Spec: `.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-001-shared-core-domain-handlers.md`
Related DEV: `DEV-PDM-APPROVAL-PLATFORM-001`
Amended by: `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-003-drawing-revision-lifecycle-only-retention.md`

## Context

The user authorized `DEV-PDM-APPROVAL-PLATFORM-001` after confirming the stability-first direction:

- `1C`: run a no-migration architecture spike before choosing the approval table strategy.
- `2B`: platform core, numbering/root/drawing/part and submission/BOM are pre-launch blockers; cost and supplement may start as adapters.
- `3C`: all known historical approval-like records must be physically migrated into the canonical platform model before launch readiness.

Phase 1A reviewed the current local code and schema without changing runtime data.

## Inventory

Current approval-like persistence:

| Area | Table | Current owner | Notes |
|---|---|---|---|
| Numbering/root/drawing/part | `approval_requests`, `approval_batches`, `approval_batch_items`, `approval_decisions` | `numbering-repository` / `numbering-async-repository` | `request_type` is constrained to `numbering`; `entity_type` is constrained to numbering entities. |
| Numbering delegation | `approval_delegations` | numbering/access control | Delegation is keyed by `project_code` and `action_code`; can be reused as input to platform eligibility. |
| Submission obsolete | `submission_lifecycle_requests` | submission lifecycle repository | Separate request and decision columns; no shared inbox model. |
| BOM release/obsolete review | `bom_review_requests` | BOM workbench repository | Status vocabulary uses `PendingReview` / `Approved` / `Rejected` / `Cancelled`. |
| Part cost review | `part_cost_change_requests` | numbering part-cost repository | Status vocabulary uses `pending` / `approved` / `rejected` / `cancelled`. |
| Drawing package supplement | `drawing_revision_package_supplements` | drawing revision package repository | Status vocabulary uses `Pending` / `Approved` / `Rejected` / `Cancelled`. |

Current formal approval entry routes include:

- `/api/numbering/approval-requests`
- `/api/numbering/approval-batches`
- `/api/lifecycle/obsolete-requests`
- `/api/submissions/[id]/obsolete-request`
- `/api/submission-lifecycle-requests/[requestId]/approve`
- `/api/submission-lifecycle-requests/[requestId]/reject`
- `/api/bom/drafts/[draftId]/submit-review`
- `/api/bom/drafts/[draftId]/obsolete-request`
- `/api/bom/reviews/[reviewId]/approve`
- `/api/bom/reviews/[reviewId]/reject`
- `/api/parts/[partNumber]/cost-change-requests/[requestId]`
- `/api/numbering/drawing-revision-packages/[packageId]/supplements`
- `/api/numbering/drawing-revision-packages/supplements/[supplementId]/decision`

Current apply paths are domain-owned:

- Numbering apply side effects live in `applyApprovedNumberingRequest`.
- Submission obsolete approval updates `submissions.status` to `Obsolete`.
- BOM review approval updates BOM review/release records through the BOM workbench repository.
- Part cost approval updates cost request state and standard-cost related records through the numbering repository.
- Supplement approval updates supplement status and audit through the drawing revision package repository.

## Coupling Analysis

Generalizing the existing numbering tables would require schema and code changes that are larger than they appear:

- `approval_requests.request_type` is constrained to `numbering`.
- `approval_batches.request_type` is constrained to `numbering`.
- `approval_requests.entity_type` is constrained to `part_root`, `part_number`, `drawing_number`, and `same_drawing_variant`.
- Numbering request creation, batch creation, decision and apply behavior are private to the numbering repository.
- Existing UI is `/numbering/approvals`, so the mental model remains numbering-specific.
- Other domains already use separate tables with different status vocabulary and different apply invariants.

The coupling is therefore structural, not just naming debt.

## Options Considered

### Option A - Generalize Existing `approval_requests` / `approval_batches`

Benefits:

- Fewer new tables.
- Existing numbering records stay in their original table.
- Existing numbering tests have fewer read-path changes.

Risks:

- Requires CHECK constraint expansion in multiple DB targets.
- Forces a numbering-owned schema into system-wide ownership.
- Makes rollback harder because legacy numbering code and new platform code would mutate the same tables.
- Encourages platform apply logic to reach into numbering internals before handler boundaries are stable.

### Option B - Add `approval_platform_*` V2 Tables

Benefits:

- Additive and reversible for local development.
- Avoids weakening existing numbering constraints before parity is proven.
- Gives the platform a neutral target model, immutable impact snapshots, event log and decision ledger.
- Supports compatibility adapters during Phase 1B-4.
- Gives Phase 5 a clear physical migration target for all historical approval-like records.

Risks:

- Requires adapter/read-through code while migration is incomplete.
- Creates temporary duplication until Phase 5 closes legacy historical records.
- Requires governance QC to prevent new formal approvals from bypassing the platform.

## Decision

Use additive `approval_platform_*` v2 tables as the canonical approval platform target.

The existing numbering approval tables remain operational as legacy/domain tables during compatibility phases. New platform work must use registered action handlers and fail closed when an action is unknown or has no handler.

Phase 1B may expose numbering approvals through the unified inbox by adapter/read model before all numbering records are physically migrated. Phase 5 must physically migrate known historical approval-like records before launch readiness, subject to explicit data/release authorization for live targets.

## Migration-Risk Matrix

| Area | Generalize existing tables | V2 platform tables | Selected mitigation |
|---|---|---|---|
| Numbering approvals | High risk of breaking existing CHECK constraints and private apply logic | Low runtime risk; adapter/read-through needed | Keep numbering behavior intact; add platform mirror/adapter and later migrate. |
| Root/drawing/part obsolete | Existing tables can store only numbering entities but not aggregate root intent cleanly | Platform package/targets can model aggregate intent | Use platform package and targets for root obsolete impact/whole-root intent. |
| Submission lifecycle | Would require non-numbering request type and target model in numbering tables | Platform can reference submission target and legacy request id | Adapter first, physical migration in Phase 5. |
| BOM review | Different status vocabulary and release invariants | Platform can normalize status and preserve legacy detail | Adapter first, handler-owned apply path. |
| Part cost review | Existing cost flow has procurement/domain-specific side effects | Platform can normalize decision while keeping domain detail | Transitional adapter allowed by user decision `2B`. |
| Drawing package supplement | Existing supplement table also owns supplement files | Platform can point to supplement as domain detail | Transitional adapter allowed by user decision `2B`. |

## Implementation Rules

- Platform tables are additive in local schema and migration planning files only.
- No production or live Supabase migration is authorized by this ADR.
- Legacy approval routes may remain as friendly entrypoints, but new formal approvals must delegate to the platform or have an ADR exception.
- Handler dispatch must fail closed for unknown action codes and missing handlers.
- Decision history and platform events must be append-only except for the explicit DEV-053 Phase 1H `lifecycle_only` retention class in ADR-003. Its guarded terminal cleanup must be additive, exact-workflow-scoped and limited to fresh or 8B adopted-active rows; completed/unknown and other-domain rows remain undeletable.
- Impact snapshots must be immutable after submit.
- Platform apply must be idempotent and domain-handler owned.

## Consequences

Required next:

- Add platform schema and runtime bootstrap.
- Add action registry, handler contract and fail-closed dispatch.
- Add platform repository/service APIs.
- Add unified inbox/detail/decision routes.
- Add fake QC handler for submit/decide/apply idempotency.
- Add adapters for existing numbering, submission, BOM, cost and supplement records.
- Add migration dry-run/parity tooling before launch readiness.

This completes Phase 1A and authorizes Phase 1B local implementation under the user's explicit development authorization. It still does not authorize production deploy, live Supabase migration, direct data repair/deletion, merge, PR, rollback or release artifacts.
