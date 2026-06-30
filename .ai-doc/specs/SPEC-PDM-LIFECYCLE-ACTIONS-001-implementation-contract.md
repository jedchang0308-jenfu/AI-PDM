# SPEC-PDM-LIFECYCLE-ACTIONS-001 Implementation Contract

Status: Active RD contract, Phase 1-6 local/staging delivery in progress
Date: 2026-06-30
Related DEV: `DEV-PDM-LIFECYCLE-ACTIONS-001`
Source ADR: `.ai-doc/decisions/ADR-PDM-LIFECYCLE-ACTIONS-001-ui-vocabulary-and-backend-lifecycle.md`
Source SPEC: `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-delete-restore-obsolete.md`
Source QA: `.ai-doc/qa/qa-pdm-lifecycle-actions-validation-plan-2026-06-29.md`

## 1. User Decisions

This contract records the follow-up decisions from HCS guided mode:

| Decision | Selected option | Implementation meaning |
|---|---|---|
| Original follow-up document purpose | `1A` | Prepare an RD Phase 1 implementation continuation package; later superseded by full-scope authorization below. |
| First implementation slice | `2B` | Implement lifecycle policy foundation plus attachment delete/restore vertical slice. |
| Document strategy | `3B` | Add one RD implementation contract and sync `dev_task.md` / `documentation_map.md`. |
| Long-term planning placement | `1A` | Keep the long-term end-state and phase contract in this implementation contract instead of creating another roadmap file. |
| Full-scope authorization | `1A` | Authorize Phase 1-6 as one delivery objective, while keeping internal phase gates, QC gates, and stop conditions. |
| Release boundary | `2A` | Exclude production and Supabase production cutover; deliver local/staging release readiness only. |
| Formal obsolete approval | `3A` | Reuse the existing review/approval queue pattern with a lifecycle obsolete request type. |

## 2. Scope

This contract is the executable RD contract for the full lifecycle package: Phase 1-6 are authorized as one delivery objective, but RD must still preserve internal phase gates and QC gates. Sections 3-14 retain the detailed Phase 1 attachment foundation contract for implementation traceability; Sections 15-16 are the controlling full-scope local/staging lifecycle contract after the later `1A / 2A / 3A` authorization.

In scope:

- Shared lifecycle policy foundation for the first supported entity type.
- First supported entity type: master attachments stored in `file_assets` and exposed through existing part/drawing attachment routes.
- Existing attachment delete behavior alignment with lifecycle vocabulary.
- Attachment restore service/API with duplicate and parent checks.
- Minimal deleted-data surface for deleted attachments, either in the existing attachment panel or a dedicated low-weight `已刪除資料` entry.
- Full uncontrolled deleted-data UX for supported attachment entities.
- Draft, temp import, and not-submitted working-data delete/restore.
- Formal part/drawing/BOM/submission `申請作廢` using the existing review/approval queue pattern.
- Controlled-history UI and traceability for obsolete, superseded, review, approval, audit, and release-evidence records.
- Policy output fields required by the parent SPEC: `visibleStage`, `stageLabel`, `uiSurface`, `traceabilityClass`, `detailTags`, and allowed actions.
- Audit events for delete, restore, obsolete request, obsolete approval/rejection, and high-risk blocked lifecycle operations.
- Local/staging release-readiness evidence against the focused QA plan.

Out of scope:

- Physical purge, retention job, or external storage object deletion.
- Formal obsolete record restoration.
- Production deployment or Supabase production cutover.

## 3. Existing Code Facts

Observed implementation baseline:

- `file_assets` already has `deleted_at`, `deleted_by`, and `deleted_reason` columns.
- Active attachment queries already filter `deleted_at IS NULL`.
- Existing part attachment route supports `DELETE /api/parts/[partNumber]/attachments/[attachmentId]`.
- Existing drawing attachment route supports `DELETE /api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]`.
- Existing `POST` on those attachment-id routes is already used for Google Drive sync, so restore must not reuse that route.
- `AsyncMasterAttachmentRepository.softDeleteMasterAttachment` writes `numbering.master_attachment.delete` audit.
- Existing duplicate guard checks same entity, category, revision, filename, and `deleted_at IS NULL`.
- `audit_logs` is append-only and must remain immutable.

## 4. RD Target

After Phase 1, RD should be able to demonstrate:

1. A lifecycle policy service or equivalent domain boundary exists.
2. Master attachments can produce lifecycle policy output.
3. Active attachment delete still works and is presented as `刪除`.
4. Deleted attachment records are visible through a deleted-data surface, not through normal active attachment lists.
5. Deleted attachment restore works when no active duplicate or parent conflict exists.
6. Restore is blocked with a stable reason code when a conflict exists.
7. Delete and restore both write audit events.
8. The shared policy foundation can be extended to draft/temp, formal obsolete, and controlled-history phases without changing the user-facing vocabulary.

## 5. Policy Contract

### 5.1 Entity Type

Initial lifecycle entity type:

```ts
type LifecycleEntityType = "master_attachment";
```

The internal target must preserve enough information to identify both the attachment and parent:

```ts
type MasterAttachmentLifecycleRef = {
  entityType: "master_attachment";
  parentType: "part_number" | "drawing_number";
  parentCode: string;
  attachmentId: string;
};
```

### 5.2 Policy Output

The first slice must return the parent SPEC shape or a directly mappable equivalent:

```ts
type LifecycleActionPolicy = {
  entityType: "master_attachment";
  entityId: string;
  visibleStage: "draft" | "in_review" | "formal" | "history";
  stageLabel: "草稿" | "審核中" | "正式" | "歷史";
  uiSurface: "work_list" | "deleted_data" | "controlled_history";
  traceabilityClass: "working" | "uncontrolled_deleted" | "controlled_history";
  detailTags: Array<"待補" | "已發行" | "可還原" | "不可還原" | "被引用" | "需審核">;
  actions: {
    delete?: { allowed: boolean; reasonCode?: string; message?: string };
    restore?: { allowed: boolean; reasonCode?: string; message?: string };
    obsolete?: { allowed: boolean; requiresApproval: boolean; reasonCode?: string; message?: string };
  };
};
```

### 5.3 Attachment Mapping Rules

| Condition | `visibleStage` / `stageLabel` | `uiSurface` | `traceabilityClass` | Action rule |
|---|---|---|---|---|
| Active attachment on an existing part/drawing | Parent-derived if available; otherwise `formal` / `正式` for current master routes | `work_list` | `working` | `delete.allowed = true` when permission passes |
| Deleted attachment with no conflict | `history` / `歷史` | `deleted_data` | `uncontrolled_deleted` | `restore.allowed = true`; add `可還原` |
| Deleted attachment with active duplicate or invalid parent | `history` / `歷史` | `deleted_data` | `uncontrolled_deleted` | `restore.allowed = false`; add `不可還原` |
| Release evidence, audit log, or approval decision | `history` / `歷史` | `controlled_history` | `controlled_history` | Not supported by this slice |

Important boundary: a formal parent part/drawing does not automatically make the attachment itself a formal controlled record. The Phase 1 attachment slice treats current master attachments as working/uncontrolled attachment records unless they are release evidence or approval/audit records.

## 6. Service Contract

Recommended service names may be adjusted to match local style, but the responsibilities must stay centralized:

```ts
getLifecycleActionPolicy(input, actor)
deleteLifecycleEntity(input, actor)
restoreLifecycleEntity(input, actor)
```

For the attachment vertical slice, the implementation may delegate to existing attachment services:

```ts
getMasterAttachmentLifecyclePolicy(input, actor)
softDeleteMasterAttachment(...)
restoreMasterAttachment(...)
```

Route handlers must not duplicate policy logic. They should call the shared service and translate stable domain errors to HTTP responses.

## 7. Repository Contract

The attachment repository needs these capabilities:

| Capability | Required behavior |
|---|---|
| Select active attachment | Existing behavior can stay: parent match plus `deleted_at IS NULL`. |
| Select deleted attachment | New query must find parent match plus `deleted_at IS NOT NULL`. |
| Select attachment for policy | Query should return active or deleted rows, with parent identity. |
| Restore attachment | Clear `deleted_at`, `deleted_by`, `deleted_reason`, update `updated_at`, and write audit. |
| Duplicate restore guard | Reuse active duplicate semantics: same parent entity, category, revision, filename, active row. |
| Parent guard | Restore fails if parent part/drawing no longer exists or actor cannot access it. |

No schema change is required for Phase 1 unless RD discovers an existing column is insufficient. Restore history may be represented by audit event; a new `restored_at` column is not required for this slice.

## 8. API Contract

Existing `POST` on attachment-id routes is already used for Google Drive sync. Therefore restore should use explicit subresource action routes:

| API | Purpose |
|---|---|
| `GET /api/lifecycle/policy?entityType=master_attachment&parentType=&parentCode=&attachmentId=` | Optional generic policy endpoint for UI and QC. |
| `POST /api/parts/[partNumber]/attachments/[attachmentId]/restore` | Restore deleted part attachment. |
| `POST /api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/restore` | Restore deleted drawing attachment. |
| Existing `DELETE /api/parts/[partNumber]/attachments/[attachmentId]` | Keep as delete action, internally lifecycle-aligned. |
| Existing `DELETE /api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]` | Keep as delete action, internally lifecycle-aligned. |

Response examples:

```json
{ "attachment": { "...": "..." }, "policy": { "...": "..." } }
```

```json
{ "error": "LIFE_ATTACHMENT_DUPLICATE_ACTIVE", "message": "此附件已有同名有效版本，不能還原。" }
```

## 9. Error And Reason Codes

Use stable reason codes so UI, QA, and QC can assert behavior:

| Code | HTTP | Meaning |
|---|---:|---|
| `LIFE_UNSUPPORTED_ENTITY` | 400 | Entity type is not supported in this slice. |
| `LIFE_PERMISSION_DENIED` | 403 | Actor lacks required permission or company scope. |
| `LIFE_ATTACHMENT_NOT_FOUND` | 404 | Attachment or parent is missing. |
| `LIFE_ATTACHMENT_NOT_DELETED` | 409 | Restore requested for an active attachment. |
| `LIFE_ATTACHMENT_DUPLICATE_ACTIVE` | 409 | Active duplicate blocks restore. |
| `LIFE_ATTACHMENT_PARENT_INVALID` | 409 | Parent record is deleted, obsolete, or otherwise invalid for restore. |

## 10. Audit Contract

Required audit actions:

| Event | When |
|---|---|
| `numbering.master_attachment.delete` | Existing event; keep and ensure lifecycle delete path uses it. |
| `numbering.master_attachment.restore` | New event when a deleted attachment is restored. |
| `numbering.lifecycle.policy_blocked` | Optional event for high-risk blocked operations; not required for every disabled button. |

Restore audit detail should include:

- `attachmentId`
- `entityType`
- `entityCode`
- `fileName`
- `reason`
- `conflictCheckResult`

## 11. UI Contract

Minimum UI for this slice:

- Active attachment rows keep the user-facing action `刪除`.
- Deleted attachment records are not shown in the normal active attachment list.
- Deleted attachment records are reachable from a low-weight `已刪除資料` surface.
- Deleted attachment rows show `歷史` as the primary badge.
- Restorable rows show `還原`.
- Non-restorable rows show a disabled reason, not a hidden failure.
- Do not show `soft delete`, `hard delete`, `void`, `recycle`, `archive`, or `purge` as general user buttons.

The `已刪除資料` surface may start as a local attachment-panel section or a simple route, as long as it is clearly separate from `受控歷史`.

## 12. QC Mapping

This implementation contract maps to the focused QA plan as follows:

| Contract area | QA IDs |
|---|---|
| Policy output | `QA-LIFE-001` to `QA-LIFE-006`, `QA-LIFE-019`, `QA-LIFE-021` |
| Attachment delete | `QA-LIFE-007`, `QA-LIFE-008`, `QA-LIFE-009`, `QA-LIFE-018` |
| Attachment restore | `QA-LIFE-010`, `QA-LIFE-011`, `QA-LIFE-018` |
| Vocabulary scan | `QA-LIFE-020` |
| UI viewport sanity | `QA-LIFE-022` |

## 13. RD Stop Conditions

Stop and return to PM/user decision if RD finds:

- Attachment records are actually release evidence or approval artifacts in the target flow.
- Existing permissions cannot distinguish attachment management from formal master-data obsolete permission.
- Restore requires changing schema or migration beyond `file_assets` soft-delete fields.
- The UI requires a global history/search route before attachment restore can be safely exposed.
- The implementation would need production, Supabase production, external storage purge, or retention-policy work.

## 14. Completion Criteria

Phase 1 is complete only when:

- Implementation exists for lifecycle policy foundation plus attachment delete/restore.
- Focused automated or manual QC evidence covers the QA IDs listed above.
- `git diff --check` passes for touched files.
- The work is staged or committed as a scoped Git boundary.
- `dev_task.md` is updated to the correct implementation/QC state for the completed slice.

## 15. Long-Term End-State And Phase Contract

This section records the long-term development skeleton so the system can be designed as a complete PDM lifecycle capability, not as isolated Phase 1 patches. User decision `1A / 2A / 3A` authorizes Phase 1-6 as one local/staging delivery objective, while preserving the phase order, QC gates, stop conditions, and production exclusion.

### 15.1 End-State Architecture

The final lifecycle UI and backend policy must preserve these stable rules:

| Area | End-state rule |
|---|---|
| User-facing action vocabulary | General users see only `刪除`, `還原`, and `申請作廢` for lifecycle removal/recovery actions. |
| Primary lifecycle stages | Daily UI uses only `草稿`, `審核中`, `正式`, and `歷史`. |
| Daily work list | The main list uses `全部`, `草稿`, `審核中`, and `正式`; `全部` excludes deleted, obsolete, archived, old-version, approval-evidence, and release-evidence records. |
| Deleted-data surface | `已刪除資料` is the recovery area for uncontrolled deleted drafts, temp-import data, and working attachments. |
| Controlled-history surface | `受控歷史` is the traceability area for obsolete, superseded, released, reviewed, approval, audit, and release-evidence records. |
| Formal-data rule | Formal part numbers, drawing numbers, released BOM data, and approved/released submissions must not expose general `刪除`; they use `申請作廢` and approval before `已作廢`. |
| Restore rule | Restore is allowed only for uncontrolled deleted records when permission, parent validity, duplicate, reference, and company-scope checks pass. |
| Audit rule | Delete, restore, obsolete request, obsolete approval/rejection, and blocked high-risk lifecycle actions must be auditable at the appropriate severity. |
| Immutable-evidence rule | Audit logs, approval decisions, and release evidence are not deletable or restorable through general lifecycle UI. |

### 15.2 Phase Roadmap

| Phase | Purpose | Main deliverables | Entry condition | Acceptance boundary |
|---:|---|---|---|---|
| 1 | Lifecycle policy foundation plus master attachment delete/restore | Shared lifecycle policy output; attachment restore routes; deleted attachment surface; duplicate/parent/company guards; delete/restore audit | Full-scope RD starts from this contract | `QA-LIFE-001` to `QA-LIFE-011`, `QA-LIFE-018` to `QA-LIFE-022` applicable subset has QC evidence |
| 2 | Draft, temp import, and not-submitted data delete/restore | Lifecycle entity support for part-number drafts, import batches/staging rows, BOM workbench drafts, and other discovered not-submitted working data; restore conflict checks for number reuse, converted records, invalid parent, released/formal boundary, and company scope | Phase 1 policy foundation is stable; target draft/temp tables are confirmed during RD discovery | Uncontrolled draft/temp records use `刪除`/`還原`; records that crossed a controlled boundary cannot be restored as uncontrolled data |
| 3 | Daily UI stage and information-architecture consistency | Daily lists use `全部/草稿/審核中/正式`; `全部` excludes deleted/obsolete/history; each row has one primary stage badge; `狀態 [?]` popover explains stage/detail tags; low-weight `已刪除資料` and `受控歷史` entries stay separate | Phase 1-2 policy output is available to affected UI lists | Users can scan daily lists without seeing raw backend lifecycle terms or historical records as daily work |
| 4 | Formal-data obsolete request and approval | `申請作廢` workflow for formal part/drawing/BOM/submission records; existing review/approval queue pattern with lifecycle obsolete request type; `已作廢` result state; obsolete audit trail | Draft/temp boundary and formal entity mapping are confirmed; approval ownership maps to existing reviewer/admin patterns | Formal records do not expose general delete; obsolete requires approval; approved obsolete records appear in `受控歷史`, not `已刪除資料` |
| 5 | Controlled-history UI and traceability | `受控歷史` entry; traceability filters; reviewer/applicant/time/reason/decision/release evidence display; immutable evidence negative paths | Phase 4 obsolete lifecycle produces reliable controlled-history data | Users can inspect controlled records without restore/delete confusion; audit/release/approval evidence is immutable through general UI |
| 6 | Local/staging release readiness | QC reports, regression suite, schema/migration notes if needed, rollback notes, local/staging smoke evidence, production-exclusion proof, Git boundary | Phase 1-5 implementation and QC pass locally/staging as applicable | No production or Supabase production cutover is included; production remains a separate deployment-release gate |

### 15.3 Later-Phase Contract Minimums

Because Phase 1-6 are now one authorized delivery objective, RD may proceed through later phases under this contract. Before starting each phase implementation, RD must still fill or confirm these details in code comments, task notes, or a focused amendment if discovery changes schema/API/permission contracts:

| Phase | Required additions before RD starts |
|---:|---|
| 2 | Target draft/temp/not-submitted tables, controlled-boundary detection, number-reuse policy, conversion-state policy, restore API shape, conflict reason codes, and `已刪除資料` empty/error states. |
| 3 | Exact daily-list pages, status popover placement, row badge mapping, `全部` exclusion rules, deleted-data/controlled-history entry placement, and viewport expectations. |
| 4 | Approval owner roles, obsolete request schema/API, review queue integration, approval/rejection audit events, and formal-data permission matrix. |
| 5 | Controlled-history source tables, traceability fields, immutable evidence display policy, retention visibility, filters/search, and no-restore/no-delete negative paths. |
| 6 | Local/staging migration scope, environment targets, seed/data parity policy, release-readiness checklist, rollback owner, smoke plan, production-exclusion proof, and Git boundary plan. |

### 15.4 Fixed Decisions Versus Deferred Details

These decisions are fixed unless a new ADR explicitly supersedes this contract:

- UI lifecycle vocabulary remains simple even if backend state names are more complex.
- `已刪除資料` and `受控歷史` remain separate surfaces.
- General delete is only for uncontrolled working data and must be restorable when policy checks pass.
- Formal controlled records use obsolete/approval semantics, not general delete.
- Formal obsolete uses the existing review/approval queue pattern with a lifecycle obsolete request type.
- Audit, approval decisions, and release evidence are immutable controlled-history records.
- Phase 6 excludes production deployment and Supabase production cutover.

These details may stay flexible until the relevant phase contract:

- Exact route names and component placement for the global history/deleted-data surfaces.
- Whether later phases need new schema columns or can reuse existing fields and audit events.
- Exact schema additions required for lifecycle obsolete requests, if existing review tables are insufficient.
- The first release grouping after local implementation: local-only or staging-readiness.

## 16. Full-Scope Implementation Contract Amendment

This amendment is the RD-ready bridge from the Phase 1 vertical slice to the full local/staging lifecycle delivery.

### 16.1 Authorization Boundary

| Area | Decision |
|---|---|
| Delivery scope | Phase 1-6 are authorized as one delivery objective. |
| Internal control | RD must preserve phase gates, QC gates, and stop conditions. |
| Deployment boundary | Production and Supabase production cutover are excluded. |
| Approval mechanism | Formal obsolete uses the existing review/approval queue pattern with a lifecycle obsolete request type. |
| ADR need | No new ADR is required for `1A / 2A / 3A`; these choices refine execution under the existing lifecycle ADR. A new ADR is required only if RD changes the lifecycle model, production gate, approval ownership model, or immutable evidence rule. |

### 16.2 Entity Action Matrix

| Entity group | UI surface | Allowed primary actions | Forbidden actions | Required checks |
|---|---|---|---|---|
| Working attachments | Work list / attachment panel / `已刪除資料` | `刪除`, `還原` | `申請作廢` unless the attachment is release/approval evidence | Permission, company scope, duplicate active file, parent validity |
| Draft part-number records | Work list / `已刪除資料` | `刪除`, `還原`, existing submit/review actions | General restore after controlled boundary crossing | Permission, company scope, number reuse, source draft state |
| Temp import batches and staging rows | Work list / `已刪除資料` | `刪除`, `還原`, existing cancel/retry actions where applicable | Controlled-history traceability before conversion to formal master data | Permission, company scope, conversion status, duplicate target data |
| Not-submitted submissions or working data | Work list / `已刪除資料` | `刪除`, `還原` | `申請作廢` before formal control begins | Permission, company scope, upload/package state, converted target state |
| Formal part numbers and drawing numbers | Work list / `受控歷史` | `申請作廢`; `已作廢` after approval | General `刪除`, direct `還原` | Permission, company scope, references, approval ownership, release/use state |
| Formal BOM / release snapshots | Work list / `受控歷史` | `申請作廢` or lifecycle obsolete through release workflow | General `刪除`, direct `還原` | Permission, company scope, release state, dependent references, approval ownership |
| Approval decisions, audit logs, release evidence | `受控歷史` | View traceability only | `刪除`, `還原`, `申請作廢` as user actions | Immutable evidence rule, company scope, read permission |

### 16.3 State Transition Matrix

| Transition | Allowed for | Required behavior |
|---|---|---|
| Active working data -> deleted | Attachments, drafts, temp imports, not-submitted data | Soft-delete or equivalent state change; remove from daily active list; write audit. |
| Deleted -> restored | Uncontrolled deleted data only | Restore only after permission, duplicate, parent, company, and controlled-boundary checks pass; write audit. |
| Draft/temp -> in review/formal | Existing module workflows | Lifecycle policy must map internal state to `審核中` or `正式`; no new user-facing stage names. |
| In review -> withdrawn/rejected | Existing module workflows | Map terminal non-formal records to `歷史` with correct `uiSurface` based on traceability class. |
| Formal -> obsolete requested | Formal part/drawing/BOM/submission records | Create lifecycle obsolete request through existing approval queue pattern; do not mutate final obsolete state yet. |
| Obsolete requested -> approved | Formal controlled records | Mark as `已作廢`; move to `受控歷史`; write approval and obsolete audit events. |
| Obsolete requested -> rejected | Formal controlled records | Preserve formal active state; keep rejection decision as controlled-history evidence. |
| Controlled history -> restored | Formal obsolete/evidence records | Not supported in this delivery; requires a future formal recovery/re-release spec. |

### 16.4 Service And API Contract

RD may adjust concrete route names to match existing app style, but the domain responsibilities must remain centralized:

| Capability | Required contract |
|---|---|
| Policy | `getLifecycleActionPolicy(input, actor)` returns `visibleStage`, `stageLabel`, `uiSurface`, `traceabilityClass`, `detailTags`, and allowed actions for every supported entity group. |
| Delete | `deleteLifecycleEntity(input, actor)` delegates to entity-specific services and never hard-deletes supported lifecycle records. |
| Restore | `restoreLifecycleEntity(input, actor)` blocks duplicate, parent invalid, company-scope, permission, and controlled-boundary conflicts with stable reason codes. |
| Obsolete request | `requestLifecycleObsolete(input, actor)` creates a lifecycle obsolete review item using the existing review/approval queue pattern. |
| Obsolete decision | `decideLifecycleObsolete(input, actor)` approves/rejects an obsolete request and writes approval/audit evidence. |
| History query | `listDeletedLifecycleEntities(...)` and `listControlledHistoryEntities(...)` or equivalent resource-specific queries must keep `已刪除資料` and `受控歷史` separate. |

Stable new reason-code families:

| Code family | Meaning |
|---|---|
| `LIFE_DRAFT_*` | Draft/temp/not-submitted delete/restore conflicts. |
| `LIFE_OBSOLETE_*` | Formal obsolete request or approval conflicts. |
| `LIFE_HISTORY_*` | Controlled-history read or immutable-evidence conflicts. |
| `LIFE_RELEASE_*` | Local/staging release-readiness or migration gate conflicts. |

### 16.5 Permission And Approval Matrix

| Actor / role pattern | Working delete | Working restore | Formal obsolete request | Formal obsolete approve/reject | Controlled-history read |
|---|---|---|---|---|---|
| Creator / owner with entity permission | Allowed when policy checks pass | Allowed when policy checks pass | Allowed only if existing module policy allows controlled change requests | Not allowed unless also reviewer/admin | Own/company-scoped records if read permission allows |
| Reviewer | Depends on module policy | Depends on module policy | Allowed if reviewer can initiate change requests | Allowed for assigned lifecycle obsolete reviews | Company-scoped records if read permission allows |
| PDM admin | Allowed with audit | Allowed with audit and conflict checks | Allowed | Allowed according to existing review/admin policy | Allowed within company scope |
| System admin | Allowed with audit | Allowed with audit and conflict checks | Allowed | Allowed according to existing review/admin policy | Allowed according to system policy |
| Cross-company actor | Forbidden | Forbidden | Forbidden | Forbidden | Forbidden |

### 16.6 Audit And Evidence Contract

RD must produce audit or evidence for:

- `lifecycle.delete.requested` or entity-specific existing delete event.
- `lifecycle.restore.completed` or entity-specific restore event.
- `lifecycle.restore.blocked` for high-risk blocked restore attempts where useful for QC evidence.
- `lifecycle.obsolete.requested`.
- `lifecycle.obsolete.approved`.
- `lifecycle.obsolete.rejected`.
- `lifecycle.history.viewed` only if existing system policy already audits sensitive reads; otherwise do not add noisy read audit.

Audit details must include actor, company, entity type, entity id/code, previous lifecycle mapping, new lifecycle mapping, reason, request/review id when applicable, and conflict check summary.

### 16.7 Full-Scope Completion Criteria

`DEV-PDM-LIFECYCLE-ACTIONS-001` full scope is complete only when:

- Phase 1-5 implementation exists for all supported entity groups listed in Section 16.2.
- Phase 6 local/staging release-readiness evidence exists; production and Supabase production cutover remain excluded.
- Focused QC evidence covers `QA-LIFE-001` to `QA-LIFE-028` or their latest amended equivalents.
- Source/UI scans prove forbidden backend terms are not exposed as general user main buttons.
- Cross-company negative tests pass for delete, restore, obsolete request, obsolete decision, and history reads.
- Audit/approval/release evidence is immutable through general lifecycle UI.
- `git diff --check` passes for touched files.
- The work is staged or committed as a scoped Git boundary.
- `dev_task.md` and `documentation_map.md` are updated with implementation/QC state.
