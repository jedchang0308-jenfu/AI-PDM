# ADR-PDM-DRAWING-PART-WORKBENCH-001 - 圖料模組資料 ownership 與送審 snapshot

Status: Accepted
Date: 2026-07-01
Owner: Dev PM
Related SPEC: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
Related DEV: `DEV-PDM-DRAWING-PART-WORKBENCH-001`

## Context

User reviewed the PDM drawing submission architecture and accepted the large module split:

- 圖號模組維持以圖為主。
- 圖料模組升級成主根號 / 圖料關聯 / 送審準備工作台。
- 舊上傳送審頁完全退役。

The risk is data safety. If 圖料模組 becomes a convenient aggregate editor but bypasses drawing/part owner rules, the system will create a second source of truth. If submission reads live master data during review, approval evidence can drift after later edits.

## Decision

Adopt the following architecture rules:

1. 圖料模組 is the aggregate workbench and submission-preparation entry, not the owner of all data.
2. 圖號資料 remains owned by drawing domain.
3. 料號資料 remains owned by part domain.
4. 主根號與圖料關聯 remain owned by root/link domain.
5. 圖料模組 may provide inline editing, but every write must route through the correct owner domain API, validation and audit.
6. Submission creation must freeze an immutable snapshot of the drawing, part, attachment selection, revision, note and source ids.
7. Same `file_role + original_filename` attachment duplicates are not allowed in one submission package.
8. Failed or blocked submit attempts must leave audit trail.
9. The old generic `/upload` submission page is retired from the formal product flow.
10. Submission readiness must be checked in three layers: frontend visibility, backend enforcement and DB constraints.

## Options Considered

| Option | Decision | Reason |
|---|---|---|
| Make 圖號模組 the main root workbench | Rejected | It overloads a drawing-focused module with part/root responsibilities. |
| Make 圖料模組 read-only and link out for every edit | Rejected | Safe but inefficient; users would bounce between modules for routine completion. |
| Allow 圖料 inline edit through owner APIs | Accepted | Best operator flow while preserving domain ownership and audit. |
| Read live master data during approval | Rejected | Approval evidence can drift if master data changes after submission. |
| Store submission snapshot | Accepted | Preserves what reviewers actually approved. |
| Auto-rename duplicate attachment filenames | Rejected | Hides data ambiguity and weakens traceability. |
| Block duplicate filenames with Chinese error | Accepted | Safer and transparent to users. |
| Keep generic `/upload` as auxiliary route | Rejected by 2026-07-01 decision | User explicitly chose full retirement. |

## Consequences

Positive:

- Clear data owner boundaries.
- Safer inline editing without duplicate sources of truth.
- Review evidence is stable and auditable.
- Users can complete readiness in one workbench.
- Raw DB errors should no longer leak into UI.

Costs / tradeoffs:

- RD must add or formalize owner APIs for any missing inline-edit field.
- Submission creation needs snapshot persistence and idempotency handling.
- QA scope increases because UI, API, DB and audit gates must all be validated.
- Existing completed `DEV-PDM-DRAWING-SUBMISSION-001` assumptions must be superseded, not silently overwritten.

## Migration / Compatibility Impact

- Existing generic upload implementation must be retired from user-facing formal flow.
- Existing submission records remain valid.
- Existing `submissions.source_entity_type`, `submissions.source_entity_id` and `submission_files.source_master_attachment_id` remain useful.
- Additive local schema may be required for `submission_snapshots` and optionally `submission_attempts`.
- Production migration is not authorized by this ADR.
- Direct data cleanup is not authorized by this ADR.

## Superseded / Amended Documents

This ADR amends:

- `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`

Specific supersession:

- The previous statement that generic `/upload` can remain as auxiliary/manual intake is no longer valid for the formal product flow.

This ADR extends:

- `.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md`
- `.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md`

## Amendment: RD Readiness Closure (2026-07-01)

RD review found that the first ADR version had the correct direction but left several implementation-critical boundaries too implicit. The following rules are now part of the accepted decision:

1. Generic formal submission creation is retired, not merely hidden.
   - `GET /upload` must not render the old generic upload/send-review form.
   - `POST /api/submissions` generic create must reject normal web/session formal submission with `GENERIC_SUBMISSION_RETIRED`.
   - Existing read/history/review access to old submissions remains allowed.
2. 圖料模組 inline edit requires explicit owner API contracts.
   - Root fields go through root/numbering record owner APIs.
   - Drawing fields go through drawing owner APIs.
   - Part and variant fields go through part owner APIs.
   - Root/drawing/part relationships go through link owner APIs.
   - All writes require company scope, permission, version/ETag conflict handling and audit.
3. 主根號 is an aggregation anchor, not an authority that can guess ambiguous data.
   - A drawing linked to zero or multiple active roots blocks submission.
   - Multiple primary drawings or multiple primary parts block submission.
   - The system must show Chinese recovery messages instead of choosing one silently.
4. Submission snapshot is canonical evidence.
   - Snapshot stores version, rules version, source route, captured actor/time, root, drawing, part, owner fields, selected attachments, readiness result and note.
   - Snapshot hash is a lowercase SHA-256 of recursively key-sorted canonical JSON.
   - Later master-data changes must not mutate snapshot JSON or hash.
5. Submission attempts are auditable.
   - Attempt state machine is `started -> blocked | failed | created`.
   - Same `company_id + actor_id + idempotency_key` is unique.
   - Same successful key returns the existing submission; a different key for the same active drawing/revision is blocked.
6. Attachment storage identity is not the display filename.
   - Business uniqueness remains `file_role + original_filename`.
   - Storage key must include `submission_id` and `submission_file_id` or an equivalent immutable id segment.
   - Storage collision must fail safely with Chinese domain error and audit, not overwrite.
7. Released or obsolete records are not patched inline to make submission pass.
   - Released master data must use controlled revision/change flows.
   - Obsolete/merged data is blocked except explicit admin recovery tooling.

These rules close the previous P0/P1 readiness gaps and make the ADR implementation-ready for local RD work. They do not authorize production deployment, production migration, direct DB cleanup, data deletion or automatic filename rewrite.

## Enforcement

RD must not mark implementation complete until:

- 圖料 inline edit writes are proven to hit owner APIs.
- Submission snapshot exists and is testable.
- Duplicate attachment filenames are blocked before DB failure.
- `/upload` retirement behavior is visible and tested.
- Audit trail exists for blocked/failed submit attempts.
- No raw DB constraint message appears in user-facing UI.
- Direct `POST /api/submissions` generic create bypass is blocked for formal submission.
- Ambiguous root, multiple-primary-drawing and multiple-primary-part states block submission.
- Snapshot version/hash and idempotency behavior are covered by QC.
- Storage-key collision handling is covered by negative test.
- Released-record inline edits are blocked or routed to controlled change flow.

## Amendment: Drawing Submission Workbench And Release-Incomplete Recovery (2026-07-02)

User clarified that the submission entry should remain in 圖號模組 / 圖料模組, while the drawing submission workbench itself may be an independent page.

This amends the earlier "old generic `/upload` submission page is retired" rule as follows:

1. Formal module entry points must no longer target generic upload as the primary flow.
   - 圖號 module `送審` should target `/drawings/[drawingNumber]/submission-workbench`.
   - 圖料 module must resolve/select the primary or MA drawing, then target the same workbench route.
2. Legacy `/upload?source=drawing&drawingNumber=...` may remain temporarily as a compatibility route during Phase 1.
   - It must not be treated as the canonical drawing submission workbench.
   - Future cleanup may redirect it to `/drawings/[drawingNumber]/submission-workbench`.
3. Same drawing + revision conflict handling is refined by status:
   - `Pending` / `Releasing`: in-progress same-revision blocker.
   - unresolved `ReleaseFailed`: `發行未完成`, handled by R&D Manager/Admin through retry or return-for-correction.
   - `Released` / `Obsolete`: formal record exists; same revision cannot be reused.
   - `Rejected`, `Cancelled` and resolved `ReleaseFailed`: non-blocking history.
4. `Cancelled` is introduced as a pre-release terminal state for user/manager/admin cancellation of Pending submissions.
5. A ReleaseFailed returned for correction creates a linked new working submission. When the linked submission releases successfully, the old ReleaseFailed is marked resolved and no longer blocks or appears in main todo.

The authoritative implementation contract for this amendment is:

- `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`

This amendment does not authorize production deployment, production migration, direct DB cleanup, historical repair, or data deletion.

## Amendment: Phase 2+ Workbench Writeback And Collaboration Boundary (2026-07-02)

Phase 2+ planning extends the accepted ownership rule without changing it.

Decision:

1. The drawing submission workbench may let users complete submission-required data, but it must not become the owner of drawing, part, root or link master data.
2. Workbench master-data edits must route through owner-domain APIs and owner-domain validation:
   - drawing fields through drawing/numbering owner APIs;
   - part fields through part owner APIs;
   - root and primary drawing/part relationship fields through root/link owner APIs;
   - attachments through the drawing attachment/file asset owner.
3. The workbench must show a writeback summary before send-review when it will save owner data:
   - old value;
   - new value;
   - owner domain;
   - whether the change is saved or blocked.
4. Submission snapshot remains the formal frozen evidence after writeback succeeds and submission is created.
5. Pre-submission collaboration is operational preparation, not a controlled release record.
6. Collaboration may be opened by the owner, R&D Manager or Admin, but collaborators still need owner-domain permission for every field they edit.
7. Operational edit history for collaboration is allowed for accountability and recovery, but it must not be presented as the formal controlled release history.
8. Resolved ReleaseFailed records should be removed from main todo/dashboard noise and remain available only as low-weight history.

Consequences:

- Phase 2 can improve user workflow without introducing a second master-data source.
- Phase 3 can support多人協作 while keeping permission and ownership boundaries intact.
- RD must implement stale-version protection so one collaborator cannot silently overwrite another user's update.
- The formal ISO-style controlled evidence remains the released submission/snapshot, not every pre-submission draft keystroke.

Authoritative Phase 2+ RD handoff contract:

- `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md` Sections 4.1-4.4

This amendment does not authorize Phase 2/3 RD implementation, production deployment, production migration, direct DB cleanup, historical repair, data deletion or external storage migration.
