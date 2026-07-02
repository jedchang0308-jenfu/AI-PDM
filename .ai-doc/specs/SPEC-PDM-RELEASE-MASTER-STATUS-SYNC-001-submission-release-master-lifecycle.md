# SPEC-PDM-RELEASE-MASTER-STATUS-SYNC-001 - 送審發布與主資料狀態同步

Status: Phase 1 Implemented / Verification Passed; Phase 2+ RD Contract Ready / Not Authorized
Date: 2026-07-02
Owner: Dev PM
Related DEV: `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001`
Related specs:

- `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-003-ui-self-recovery.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
- `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`

Spec governance note:

- Governance trigger: this spec affects lifecycle state, release gate, audit and cross-module data flow.
- ADR decision: no new ADR is created in this pass because the accepted ADR already defines drawing/part/root ownership and submission snapshot boundaries. This spec is an implementation contract that closes a missing release lifecycle synchronization rule under that ADR.
- Cross-spec consistency: this spec does not change same-revision blocker behavior, submission snapshot immutability, `/upload` retirement, ReleaseFailed recovery or drawing/part owner-domain write rules. It amends only what must happen after release success.
- Backlog registration: tracked in `.ai-doc/dev_task.md` as `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001`.

## 1. Human Decision Brief

Confirmed user problem:

- When sending D-0014-MA1 for review, the submission workbench says the drawing revision has already been released.
- The drawing module list still shows D-0014-MA1 as `Draft`.
- This is confusing and blocks user trust because two first-class UI surfaces disagree about the same drawing.

Confirmed diagnosis from local evidence:

- `submissions` contains `SUB-20260702-F2853DA6` for `D-0014-MA1`, revision `0.1`, status `Released`, released at `2026-07-02T11:27:41.280Z`.
- `drawing_numbers.record_status` for `D-0014-MA1` remains `Draft`.
- The linked `part_numbers.record_status` and `part_roots.record_status` also remain `Draft`.
- Drawing module list displays `drawing_numbers.record_status`.
- Submission workbench blocks same-revision send-review because it correctly sees a `Released` submission.

Confirmed product rule:

- A successful formal submission release must not leave the source drawing master data in `Draft`.
- `submissions.status = Released` and source master lifecycle status must be made consistent by the release workflow, not patched visually by the UI.
- The UI may temporarily warn about detected inconsistency, but the durable fix is release transaction synchronization.

Rejected options:

- Do only a UI label workaround that maps `Draft + Released submission` to `Released`.
- Allow users to re-send the same drawing + revision just because drawing master still says `Draft`.
- Silently ignore master-data sync failure after a release.
- Directly edit D-0014-MA1 or other historical records without a reviewed repair path.

AI assumptions based on existing project conventions:

- Existing numbering release approval already updates part, root and related drawing records to `Released`; submission release should not be weaker than that lifecycle rule.
- Phase 1 may implement local code and local tests only. Production deployment, production migration and direct production data repair remain unapproved.
- Historical repair needs explicit Admin/PM authorization because it changes existing master-data statuses.
- If a released submission has no resolvable source drawing/part/root, the system must treat master sync as failed and show a human-readable recovery message rather than inventing ownership.

Re-entry triggers:

- User wants a released submission to remain separate from drawing/part master lifecycle status.
- User wants root status to become a new mixed/partial lifecycle state instead of existing `Released` / `Active` / `Draft` values.
- RD discovers source drawing/primary part ownership cannot be resolved without ambiguous data choices.
- Any implementation requires production migration, production data repair, data deletion or provider cutover.

## 2. Problem

The release workflow currently updates the submission lifecycle but does not update the source master lifecycle.

Current mismatch:

```text
submission D-0014-MA1 / 0.1 -> Released
drawing_numbers D-0014-MA1 -> Draft
part_numbers P-0014-001 -> Draft
part_roots 0014 -> Draft
```

This creates three user-facing failures:

- Drawing module and submission workbench contradict each other.
- Draft-only edit rules may remain available for an already released drawing.
- Users cannot tell which state is authoritative.

The bug is not the same-revision blocker. The blocker is correct because the released submission exists. The missing behavior is master lifecycle synchronization at release success.

## 3. End-State Architecture

### 3.1 Authoritative ownership

| Domain | Owns | Required release behavior |
|---|---|---|
| Submission domain | Review/release workflow record and frozen evidence package | Marks the submission `Released` only after release package and lifecycle transaction complete. |
| Drawing domain | Drawing number master lifecycle | Source drawing becomes `Released` / `Release` when its submission releases. |
| Part domain | Primary part master lifecycle | Resolved primary part becomes `Released` / `Release` when the released drawing package represents that part. |
| Root domain | Aggregate root lifecycle | Root cannot remain `Draft` when the released primary drawing/part is formal; Phase 1 sets the resolved root to `Released` / `Release` following existing numbering release convention. |
| Audit domain | Traceability of lifecycle changes | Records before/after master statuses tied to the released submission. |

### 3.2 Release transaction boundary

```text
Approve submission
-> external release / release package creation
-> DB transaction:
   1. mark submission Released
   2. obsolete prior Released submissions for same item
   3. resolve related ReleaseFailed submissions
   4. sync source drawing / primary part / root to Released
   5. update item current_revision
   6. write lifecycle sync audit
-> return Released
```

If step 1-6 inside the DB transaction fails:

- The submission must not be left as `Released`.
- The UI must show `發行未完成` with a Chinese message explaining that master-data status synchronization failed.
- Existing external file movement cannot always be physically rolled back; the system must preserve the failure as a recoverable release-incomplete state.

## 4. Phase Roadmap

### Phase 1 - Release-time master lifecycle sync

Authorization: User authorized local RD implementation on 2026-07-02. Historical repair and production work remain unauthorized.
Document status: Implemented / Verification Passed locally.

Scope:

- Extend `markSubmissionReleasedAndObsoletePrevious` or equivalent release lifecycle service.
- Resolve the release source context from `submissions.source_entity_type`, `submissions.source_entity_id`, `drawing_number`, current company and linked primary part.
- In the same DB transaction that marks the submission `Released`, update:
  - source `drawing_numbers.development_phase = 'Release'`;
  - source `drawing_numbers.record_status = 'Released'` unless the drawing is `Obsolete`, `Merged` or `EVTDisabled`;
  - resolved primary `part_numbers.development_phase = 'Release'`;
  - resolved primary `part_numbers.record_status = 'Released'` unless protected by obsolete/merged rules;
  - resolved `part_roots.development_phase = 'Release'`;
  - resolved `part_roots.record_status = 'Released'` unless protected by obsolete/merged rules.
- Write an audit log action such as `submission.release.master_status_synced` with before/after status for every updated master record.
- Add a visible inconsistency guard in drawing list/detail or workbench when a released submission exists but master status is not released, until existing data is repaired.

Out of scope:

- Directly repairing existing D-0014-MA1 data.
- Production migration or production repair.
- Creating a new mixed root lifecycle state.
- Bulk releasing unrelated drawings under the same root unless existing owner-domain release flow explicitly does so.
- Changing the same-revision blocker rule.

Implementation contract:

- Add a release master-context query that returns source drawing id, root id, primary part id, current statuses and protected lifecycle flags.
- Do not trust frontend-provided source ids during release.
- Company scope must be enforced server-side.
- If source context is missing or ambiguous, fail the release lifecycle transaction and mark the submission `ReleaseFailed` through the existing release recovery path.
- Master sync must be idempotent:
  - already `Released` source records remain `Released`;
  - repeated retry does not create duplicate audit spam beyond the actual retry action;
  - protected terminal states are not overwritten.
- `submission.release.master_status_synced` audit must include:
  - submission id;
  - drawing number;
  - revision;
  - actor id;
  - drawing before/after;
  - part before/after;
  - root before/after;
  - skipped records with reason.

Required implementation surfaces:

- `src/lib/repositories/submission-status-async-repository.ts`
- `src/lib/repositories/numbering-async-repository.ts`
- `src/lib/repositories/numbering-repository.ts`
- `src/app/numbering/drawings/page.tsx`
- focused QC script: `scripts/qc-pdm-release-master-status-sync.mjs`
- package script: `qc:pdm-release-master-status-sync`

Acceptance:

- A newly released drawing-source submission cannot leave source drawing master status as `Draft`.
- The source drawing, resolved primary part and root are `Released` / `Release` after the release transaction.
- Same drawing + same revision remains blocked after release.
- Draft-only edit controls do not remain available because master status is no longer `Draft`.
- If master sync fails, submission is not reported as `Released`; UI shows `發行未完成` with Chinese recovery text.
- No raw SQL, internal status code or `/api/...` error is visible to users.

QA/QC gate:

- Create a disposable local fixture with draft root, draft primary part, draft MA drawing and a Pending submission.
- Approve/release through the normal service or route.
- Assert:
  - `submissions.status = Released`;
  - `drawing_numbers.record_status = Released`;
  - `part_numbers.record_status = Released`;
  - `part_roots.record_status = Released`;
  - all three development phases are `Release`;
  - lifecycle sync audit exists;
  - prior same item released submissions are obsoleted as before;
  - related unresolved ReleaseFailed rows are resolved as before.
- Negative test: ambiguous/missing source context causes release incomplete, not half-released data.
- Browser/UI check: drawing module list no longer shows `Draft` for the newly released fixture.

Evidence required:

- `npx tsc --noEmit --pretty false`
- `npm run lint`
- `npm run qc:pdm-release-master-status-sync`
- `npm run qc:pdm-drawing-submission-workbench-recovery`
- `npm run qc:pdm-drawing-submission-ui-operation`
- screenshot or DOM evidence that the released fixture does not display as `Draft` in drawing module.

Latest local evidence:

- `npm run qc:pdm-release-master-status-sync`: passed 23/23.
- `npx tsc --noEmit --pretty false`: passed.
- `npm run lint`: passed.
- `npm run qc:pdm-drawing-submission-workbench-recovery`: passed 27/27.
- `npm run qc:pdm-drawing-submission-ui-operation`: passed 14/14.
- Browser smoke: `output/playwright/pdm-release-master-status-sync-guard-d0014.png` confirms the historical D-0014 mismatch is now visibly flagged instead of silent.

Stop conditions:

- RD needs to mutate existing user data to prove Phase 1.
- RD needs production migration, provider switch or production repair.
- Source drawing to primary part/root relation is ambiguous in a way that cannot be blocked safely.
- The existing status model cannot represent released master status without destructive schema change.

### Phase 2 - Historical inconsistency scanner and Admin repair

Authorization: Not authorized.
Document status: RD Contract Ready / Not Authorized.

Scope:

- Add a read-only scanner for historical mismatches:
  - released submission exists;
  - source drawing/part/root remains `Draft`, `NeedInfo` or `PendingReview`;
  - source ids are missing or ambiguous.
- Generate an Admin review list with recommended status changes.
- Add an Admin-only repair action that applies selected fixes inside a transaction and writes audit trail.
- Include D-0014-MA1 in scanner evidence but do not change it without Admin/PM authorization.

Out of scope:

- Automatic repair without review.
- Production data repair.
- Deleting failed submissions or release packages.
- Repairing unrelated lifecycle defects not tied to a released submission.

Implementation contract:

- Scanner is safe by default and read-only.
- Repair requires explicit selected records and Admin permission.
- Repair writes before/after audit tied to the released submission.
- Repair must skip protected terminal states unless Admin override is explicitly designed in a later spec.

Acceptance:

- Scanner reports D-0014-MA1 style mismatch with human-readable reason.
- Repair preview shows exactly which drawing/part/root statuses will change.
- Admin repair updates only selected records and leaves full audit trail.

QA/QC gate:

- Run scanner against local DB and capture mismatch report.
- Run repair only on disposable fixture unless user explicitly authorizes D-0014-MA1 repair.
- Verify audit and UI consistency after repair.

Evidence required:

- scanner report JSON/MD;
- Admin repair preview screenshot or report;
- post-repair DB/UI evidence for disposable fixture.

Stop conditions:

- User has not authorized historical repair.
- Scanner cannot unambiguously map released submission to source master records.
- Production data is involved.

### Phase 3 - Production cutover / migration

Authorization: Not authorized.
Document status: Release Gate Contract Ready / Not Authorized.

Scope:

- Prepare production migration/release plan only after Phase 1 and Phase 2 pass locally.
- Run backup, dry-run scanner, repair preview, rollback plan and production smoke plan.
- Coordinate with deployment-release-gate before any production action.

Out of scope:

- Any immediate production deploy or production data mutation from this spec.

Acceptance:

- Production plan identifies affected records before mutation.
- Rollback and audit plan are approved.
- Post-deploy smoke proves no released drawing is displayed as Draft.

## 5. Architecture Memory Capsule

- `submissions.status` and master `record_status` have different owners but must converge at formal release.
- Submission snapshot remains immutable evidence; syncing master status must not mutate the snapshot.
- A released submission is enough to block same drawing + revision reuse even if master status is currently wrong.
- The durable fix belongs in release lifecycle transaction, not in drawing list presentation.
- Historical repair is a separate authorization boundary because it mutates existing master data.
- Production repair is a release-gated operation.
- All UI copy for mismatch or repair must be user-understandable Traditional Chinese.

## 6. Deferred Scope Audit

| Deferred item | Classification | Handling |
|---|---|---|
| Historical D-0014-MA1 repair | Same Spec Phase: Phase 2 | Scanner/Admin repair contract included; not authorized. |
| Production migration / production repair | Same Spec Phase: Phase 3 | Release-gate contract included; not authorized. |
| New mixed root lifecycle status | Blocked Human Re-entry | Would change product semantics and schema/status model; not part of Phase 1. |
| Bulk release of unrelated drawings under same root | Blocked Human Re-entry | Existing numbering approval flow can do bulk root release, but drawing-source submission Phase 1 updates only source drawing and resolved primary part/root unless explicitly changed. |
| Direct DB cleanup or data deletion | No Tracking | Rejected direction for normal recovery; existing records must be lifecycle-closed or repaired with audit. |

## 7. All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 1 / `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001` | User authorized local RD on 2026-07-02 | Implemented / Verification Passed | Release-time source drawing/primary part/root status sync, transaction boundary, audit, inconsistency guard | Historical repair, production, mixed root status | Done locally | New release cannot leave source master Draft | `tsc`, lint, focused QC 23/23, recovery QC 27/27, UI operation QC 14/14, browser guard screenshot |
| Phase 2 / Historical repair | Not authorized | RD Contract Ready / Not Authorized | Read-only scanner and Admin-selected repair | Automatic repair, production repair | Phase 1 implemented and verified; user authorizes repair tooling | D-0014-like mismatch can be found and repaired with audit on selected records | scanner report, repair preview, fixture repair QC |
| Phase 3 / Production cutover | Not authorized | Release Gate Contract Ready / Not Authorized | Production dry-run, backup, repair plan, smoke, rollback | Direct production mutation without release gate | Phase 1/2 verified locally and release gate approved | Production shows no released-as-Draft mismatch after approved cutover | deployment gate evidence, production smoke, rollback readiness |

## 8. RD Readiness Review

Phase 1 readiness:

- DB schema: no required schema change expected; uses existing `record_status`, `development_phase`, `audit_logs`.
- API/service contract: extend existing release lifecycle service.
- Transaction: required; master sync is in the same DB transaction as marking submission `Released`.
- Permission: release path already requires reviewer/manager/admin; no new user permission for Phase 1.
- Idempotency: repeated release retry must be safe for already Released master records.
- Failure recovery: failed master sync routes to existing `ReleaseFailed` / `發行未完成` recovery language.
- UI gate: mismatch guard prevents silent contradiction until historical records are repaired.
- QA/QC: focused local fixture gate plus existing recovery/UI gates.

Readiness conclusion:

- Phase 1 has no known P0/P1 readiness gaps and is implemented / verification passed locally.
- Phase 2 and Phase 3 are contract-ready only and require separate human authorization.
