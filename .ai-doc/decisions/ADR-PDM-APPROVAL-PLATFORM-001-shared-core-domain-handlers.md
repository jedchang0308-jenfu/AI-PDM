# ADR-PDM-APPROVAL-PLATFORM-001 - Shared approval core with domain handlers

Status: Accepted as pre-launch architecture direction; local implementation authorized and started
Date: 2026-07-08
Owner: Dev PM
Related Spec: `.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`
Related DEV: `DEV-PDM-APPROVAL-PLATFORM-001`
Amended by: `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-003-drawing-revision-lifecycle-only-retention.md`

> **2026-08-22 DEV-087 explicit ADR exception**：`ADR-PDM-STATUS-DATA-REBUILD-001`是本ADR所要求的正式例外。DEV-087沿用`/approvals`聚合入口與server reviewer boundary，但active request只存在`pdm_work_review_requests`，永久只留minimal trace，不寫`approval_platform_requests/decisions`。新資料最小化決策優先；不得以shared-platform原則建立dual storage。其他approval domains維持本ADR。

Implementation update on 2026-07-08:

- Phase 1A selected additive v2 platform tables in `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-002-v2-platform-tables.md`.
- Phase 1B local platform foundation was implemented with `approval_platform_*` schema, registry, handler dispatch, unified APIs, `/approvals` UI and legacy adapters.
- Production deploy, Supabase live migration, direct data repair/deletion, merge, PR, rollback and release artifacts remain unauthorized.
- 2026-08-06：DEV-053 Phase 1H取得drawing-revision-only `lifecycle_only` retention例外。shared core在active期間仍是唯一authority；guarded terminal cleanup後不保留fresh或8B adopted-active流程的durable approval history。既有completed/unknown與其他domain仍維持append-only。

## Context

The system already has multiple approval-like flows:

- Numbering approval requests and batches.
- Part/drawing obsolete approval action codes.
- Submission lifecycle requests.
- BOM review requests.
- Part cost change requests.
- Drawing revision package supplement approvals.

The user first identified missing UI entrances for adding `M02/R01`, adding `P02`, and applying obsolete to root/drawing/part. That led to `DEV-PDM-NUMBERING-004`.

Follow-up architecture review showed that numbering approvals are mostly centralized within numbering, but whole-system approvals are not yet platformized. The user then asked whether the architecture should be optimized and whether the refactor should happen before launch. Since launch timing is not urgent and stability is the priority, the user confirmed that full-system approval platformization before launch is acceptable.

## Decision

Build a system-wide approval platform before launch using:

- A shared approval core for request identity, package identity, status, decision, assignment, delegation, audit, impact snapshot, inbox and common APIs, subject only to explicit domain retention ADRs such as ADR-003.
- An approval action registry for domain/action metadata and handler binding.
- Domain-specific handlers for validation, impact preview and apply-approved side effects.
- Compatibility adapters for existing domain flows where immediate physical table migration is not necessary.

The shared core must not own all domain business rules. Domain handlers remain responsible for root/drawing/part lifecycle effects, submission release effects, BOM effects, cost effects and drawing package supplement effects.

RD supervisor review addendum on 2026-07-08:

- `1C`: Before schema or migration work, RD must run a no-migration architecture spike and record an ADR/implementation decision choosing either generalized existing approval tables or v2 platform tables.
- `2B`: Pre-launch platformization blocker scope is platform core plus numbering/root/drawing/part plus submission/BOM formal lifecycle. Part cost change and drawing package supplement flows may start as adapters.
- `3C`: Before launch readiness, all known historical approval-like records must be physically migrated into the canonical platform approval model. Read adapters are transitional only.

## Options Considered

### Option A - Keep Fragmented Approval Flows

Pros:

- Lowest short-term coding cost.
- Less migration planning.

Cons:

- Approval UX remains inconsistent at launch.
- Permission, delegation, audit and history rules will drift.
- Every future domain repeats approval mechanics.
- Root/drawing/part obsolete, submission release and BOM review may diverge in control strength.

Rejected because the user explicitly prefers stability before launch.

### Option B - One Monolithic Approval Module

Pros:

- One code location appears simple at first.
- Easy to build one inbox.

Cons:

- Domain rules collapse into a large conditional module.
- Any approval change risks unrelated domains.
- Domain side effects become harder to test.
- Root obsolete, submission release, BOM release and cost update have different invariants.

Rejected because it reduces visible fragmentation but increases hidden coupling.

### Option C - Shared Core + Domain Handlers

Pros:

- One approval experience for users.
- Shared audit, permission, delegation and decision mechanics.
- Domain invariants remain local and testable.
- Supports phased migration and adapters.
- Reduces future approval development cost without creating a god module.

Cons:

- Requires a clear handler contract.
- Requires migration/compatibility planning.
- Requires stronger QC to prevent bypass routes.

Selected.

## Consequences

Required:

- `approval_requests` / `approval_batches` must be generalized or replaced by v2 platform tables.
- `request_type` cannot stay numbering-only if the existing tables become the platform tables.
- The table strategy must be chosen through a no-migration spike before schema/migration implementation.
- A handler registry must fail closed for unknown actions.
- Existing numbering approval behavior must continue during migration.
- Unified inbox becomes the default user-facing approval work queue.
- New formal approval-like features must use the platform or document an ADR exception.
- Submission and BOM formal lifecycle approval coverage becomes a pre-launch blocker.
- Historical approval-like records must be physically migrated before launch readiness, subject to release/data authorization for live targets.

Allowed:

- Legacy domain tables may remain as compatibility/detail tables.
- Cost and supplement flows may use adapters before full physical migration, but adapters are not the final launch-readiness answer for historical approval-like records.
- Domain detail pages may retain contextual action buttons, but formal approval work must route through the platform.

Not allowed:

- Launching formal approvals as multiple unrelated active inboxes.
- Direct formal lifecycle mutation without platform authority when policy says approval is required. ADR-003 permits post-completion history cleanup, not bypass mutation.
- One generic apply function that mutates every domain by interpreting payload strings.
- Choosing approval platform table strategy without the required spike decision record.
- Claiming launch readiness while known historical approval-like records remain only in legacy approval tables without physical platform migration or explicit human exception.
- Production migration or historical rewrite without explicit release/data authorization.

## Implementation Boundary

This ADR is architecture direction only. It does not authorize:

- Product implementation.
- Schema migration.
- Supabase live migration.
- Production deployment.
- Direct data repair/deletion.
- Merge, PR, rollback or release artifacts.
