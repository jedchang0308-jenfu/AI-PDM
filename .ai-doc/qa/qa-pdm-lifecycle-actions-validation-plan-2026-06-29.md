# QA Validation Plan: PDM Lifecycle Actions / UI Stage Model

Date: 2026-06-29
Task: `DEV-PDM-LIFECYCLE-ACTIONS-001`
Mode: Focused QA validation plan
Status: Prepared for RD implementation and QC execution
Source spec: `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-delete-restore-obsolete.md`
Source ADR: `.ai-doc/decisions/ADR-PDM-LIFECYCLE-ACTIONS-001-ui-vocabulary-and-backend-lifecycle.md`
Source implementation contract: `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-implementation-contract.md`

## 1. Purpose

This plan validates the minimum PDM lifecycle UX model for delete, restore, and obsolete actions.

The goal is to prove that users see a simple UI while the backend still enforces PDM control, approval, audit, restore safety, and ISO-relevant traceability.

## 2. QA Boundary

QA defines the required verification. QC executes after RD provides implementation evidence.

User decision `1A / 2A / 3A` authorizes Phase 1-6 as one local/staging delivery objective. This QA plan validates that delivery but does not authorize production deployment, Supabase production cutover, physical purge, retention jobs, or direct restore/modification of formal controlled-history evidence.

## 3. Scope

In scope:

- Lifecycle policy output: `visibleStage`, `stageLabel`, `uiSurface`, `traceabilityClass`, `detailTags`, and allowed actions.
- Main daily list tabs: `全部 / 草稿 / 審核中 / 正式`.
- Main row badge: one primary stage only.
- `狀態 [?]` popover explaining main stages, detail tags, deleted data, and controlled history.
- `已刪除資料` restore area for uncontrolled deleted drafts/temp/attachments.
- `受控歷史` traceability area for obsolete, replaced, released, reviewed, or approval evidence records.
- Attachment delete/restore and duplicate restore block.
- Draft delete/restore and controlled-boundary restore block.
- Formal data `申請作廢`, approval requirement, and `已作廢` controlled-history result.
- Existing review/approval queue pattern with lifecycle obsolete request type.
- Company scope, audit append-only behavior, and forbidden hard delete.
- Local/staging release-readiness evidence for the full lifecycle action package.

Out of scope:

- Physical purge UI or retention job.
- Direct restore of formally obsolete records.
- Full ISO retention-period SOP.
- Production deployment or Supabase production cutover.
- Rewriting every legacy backend status machine outside the supported lifecycle policy mapping.

## 4. Assumptions

- Existing module/domain states remain valid behind the lifecycle policy.
- Daily UI badges are governed by lifecycle mapping, not raw module status strings.
- `待審核` should map to `審核中`.
- `已發行` should map to `正式` with `已發行` as a detail tag.
- Approved obsolete records should map to `歷史` under `受控歷史`.
- `申請作廢` is the user-facing formal-data action; `已作廢` is the result state.
- `已刪除資料` is a restore area, not ISO/PDM controlled traceability.
- `受控歷史` is a traceability area, not a general restore area.

## 5. Entry Criteria

QC may start only when RD provides:

- Implementation branch or commit reference.
- Implemented entity types for the current slice.
- Lifecycle policy/service or equivalent domain boundary.
- Test data for at least one uncontrolled draft/temp/attachment and one formal record.
- App URL and required test roles.
- Static checks passing or explicit RD evidence for why a check is not applicable.

If any entry criterion is missing, QC result is `blocked`, not failed.

## 6. Acceptance Criteria

| ID | Acceptance criterion | Evidence required |
|---|---|---|
| `QA-LIFE-001` | Main daily list tabs are limited to `全部`, `草稿`, `審核中`, `正式` | Screenshot or DOM evidence |
| `QA-LIFE-002` | `全部` excludes deleted, obsolete, archived, old-version, and release-evidence records | UI/API comparison |
| `QA-LIFE-003` | Each main-list row shows only one primary stage badge | Screenshot or DOM evidence |
| `QA-LIFE-004` | `歷史` does not appear as a main daily-list tab | Screenshot or DOM evidence |
| `QA-LIFE-005` | `狀態 [?]` opens a popover and explains main stages, detail tags, deleted data, and controlled history | Screenshot or DOM evidence |
| `QA-LIFE-006` | Detail tags such as `待補`, `已發行`, `被引用`, `需審核`, `可還原`, `不可還原` do not become main tabs or primary badges | UI evidence |
| `QA-LIFE-007` | Uncontrolled draft/temp/attachment records show `刪除` when allowed by policy | Policy response + UI evidence |
| `QA-LIFE-008` | Deleting uncontrolled data does not hard-delete the row and records actor/time/reason or equivalent audit event | DB/API/audit evidence |
| `QA-LIFE-009` | Deleted uncontrolled data appears in `已刪除資料`, not the daily list | UI/API evidence |
| `QA-LIFE-010` | Restorable deleted data shows `還原` only when policy allows it | Policy response + UI evidence |
| `QA-LIFE-011` | Restore is blocked when duplicate, company-scope, parent-state, or controlled-boundary checks fail | Negative API/UI evidence |
| `QA-LIFE-012` | Formal records never show `刪除` as the main action | UI evidence |
| `QA-LIFE-013` | Formal records show `申請作廢` only when policy and permissions allow it | Policy response + UI evidence |
| `QA-LIFE-014` | Formal obsolete action creates or uses approval flow before final obsolete state | API/audit/approval evidence |
| `QA-LIFE-015` | Approved obsolete records show `已作廢` and appear in `受控歷史`, not `已刪除資料` | UI/API evidence |
| `QA-LIFE-016` | `受控歷史` shows traceability metadata: applicant/reviewer/time/reason/decision or available equivalents | UI/API/audit evidence |
| `QA-LIFE-017` | `audit_logs`, approval decisions, and release evidence are not deletable/restorable through general UI | UI/API negative evidence |
| `QA-LIFE-018` | Cross-company users cannot delete, restore, or obsolete another company's data | API/UI negative evidence |
| `QA-LIFE-019` | Backend policy returns `visibleStage`, `stageLabel`, `uiSurface`, `traceabilityClass`, and `detailTags` for supported entities | API/unit evidence |
| `QA-LIFE-020` | Raw backend terms such as `void`, `recycle`, `soft delete`, `archive`, `purge`, or `hard delete` do not appear as general user main buttons | Source/UI scan |
| `QA-LIFE-021` | Legacy change-control statuses map correctly into lifecycle UI: `待審核 -> 審核中`, `已發行 -> 正式`, `作廢 -> 歷史 / 受控歷史` | Policy/UI evidence |
| `QA-LIFE-022` | 320, 768, 1024, and 1440 px viewports have no critical overlap, clipping, unreadable controls, or horizontal page overflow in affected lists | Playwright screenshots or equivalent |
| `QA-LIFE-023` | Lifecycle obsolete request uses the existing review/approval queue pattern or a directly compatible extension; it does not create a conflicting second approval workflow | API/UI/source evidence |
| `QA-LIFE-024` | Obsolete approval/rejection preserves responsibility chain: requester, reviewer, time, reason, decision, company, and target entity are recorded | API/DB/audit evidence |
| `QA-LIFE-025` | Entity action matrix is honored across attachments, drafts, temp imports, not-submitted data, formal part/drawing/BOM/submission records, approval decisions, audit logs, and release evidence | Matrix-driven API/UI evidence |
| `QA-LIFE-026` | Controlled-history read surface never enables delete, restore, or obsolete actions for audit logs, approval decisions, or release evidence | UI/API negative evidence |
| `QA-LIFE-027` | Local/staging release-readiness evidence exists: regression command results, lifecycle QC summary, rollback notes, and no production target mutation | QC report + command evidence |
| `QA-LIFE-028` | Production and Supabase production cutover remain blocked unless a separate deployment-release gate explicitly approves them | dev_task/release-gate evidence |

## 7. Phase Gates

| RD slice | QC focus |
|---|---|
| Phase 1 policy foundation | `QA-LIFE-001` to `QA-LIFE-006`, `QA-LIFE-019`, `QA-LIFE-021` |
| Phase 2 attachment delete/restore | `QA-LIFE-007` to `QA-LIFE-011`, `QA-LIFE-018` |
| Phase 3 draft/temp delete/restore | `QA-LIFE-007` to `QA-LIFE-011`, controlled-boundary checks |
| Phase 4 formal obsolete request | `QA-LIFE-012` to `QA-LIFE-018`, `QA-LIFE-023`, `QA-LIFE-024` |
| Phase 5 controlled-history UI/QC hardening | `QA-LIFE-016`, `QA-LIFE-017`, `QA-LIFE-020`, `QA-LIFE-022`, `QA-LIFE-025`, `QA-LIFE-026`, regression against all supported lists |
| Phase 6 local/staging release readiness | `QA-LIFE-027`, `QA-LIFE-028`, full regression against `QA-LIFE-001` to `QA-LIFE-026` |

## 8. FMEA

| Failure mode | User impact | Priority | Required detection |
|---|---|---|---|
| Formal records show `刪除` | User may think controlled data can disappear | P0 | UI/source scan and formal-record test |
| Deleted drafts and obsolete records share one history bucket | Restore workflow and ISO traceability become confused | P0 | `已刪除資料` / `受控歷史` segregation test |
| Restore only clears `deleted_at` without conflict checks | Duplicate active records or broken references | P0 | Negative restore API tests |
| Raw module statuses become main UI badges | Users see too many stages and lose the simplified model | P1 | Main badge/tab vocabulary scan |
| Obsolete bypasses approval | Controlled records lose responsibility chain | P0 | Formal obsolete approval test |
| Audit/release evidence becomes deletable | Traceability evidence is damaged | P0 | Immutable evidence negative test |
| Cross-company restore/delete succeeds | Company data boundary breach | P0 | Company-scope negative test |
| `狀態 [?]` is hover-only or inaccessible | Meaning is hidden on touch/mobile | P1 | Keyboard/click/mobile UI test |
| A second incompatible obsolete approval workflow is created | Review ownership and user expectations split | P0 | Existing review/approval queue compatibility test |
| Phase 6 mutates production during lifecycle delivery | Production data risk outside approved gate | P0 | Production boundary and environment guard evidence |

## 9. No-Go Criteria

QC must fail the slice if any of these occur:

- SQL hard delete is used for supported lifecycle actions outside an approved purge/retention path.
- Formal records expose `刪除` as a general user action.
- Approved obsolete records appear in `已刪除資料`.
- Uncontrolled deleted drafts/temp/attachments are mixed into `受控歷史` as controlled traceability.
- Restore succeeds despite known duplicate or company-scope conflict.
- Approval decisions, audit logs, or release evidence can be deleted/restored through general UI.
- Main daily list contains more than the allowed lifecycle tabs.
- Formal obsolete bypasses the existing review/approval queue pattern or loses requester/reviewer responsibility evidence.
- Phase 6 touches production or Supabase production without a separate deployment-release gate.

## 10. Evidence Handoff

QC report should include:

- Implemented entity types and route mapping.
- Policy response samples for draft, in-review, formal, deleted, and obsolete records.
- UI screenshots for daily list, `狀態 [?]`, `已刪除資料`, and `受控歷史`.
- API/DB evidence for delete, restore, obsolete request, approval, audit, and blocked paths.
- Source or UI scan for forbidden action words.
- Viewport evidence for affected pages.
- Entity action matrix evidence for each supported entity group.
- Local/staging release-readiness summary and explicit production-exclusion proof.
- Explicit residual risk list and unsupported entity types.
