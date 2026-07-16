# SPEC-PDM-NUMBERING-004 - Contextual numbering and lifecycle entrypoints

Status: Implemented / local verification passed for Phase 1-3; Phase 4 release not authorized
Date: 2026-07-08
Owner: Dev PM
Related DEV: `DEV-PDM-NUMBERING-004`
Related QA: `.ai-doc/qa/qa-pdm-numbering-004-contextual-entrypoints-validation-plan-2026-07-08.md`
Extends: `.ai-doc/specs/SPEC-PDM-NUMBERING-003-alphanumeric-root-identity.md`
Extends: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`
Extends: `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-delete-restore-obsolete.md`

## Human Decision Brief

Confirmed decisions from 2026-07-08 guided mode:

- `1B`: First delivery must be an operable local vertical slice, not only UI labels. Adding `M02/R01`, adding `P02`, and formal obsolete request must have UI, API, repository, audit and QA coverage.
- `2B+C`: Root obsolete must be visible as a first-class entry, but it must open an impact preview and approval package. The user may express whole-root batch obsolete intent; the system must still show affected drawings, parts and relationships before request creation.
- `3B`: Primary entrances belong where the user is already inspecting the object: root, drawing and part detail drawers. `/numbering/request` remains a global fallback with an `既有主根號追加` mode, not the only path.

Derived product principles:

- The UI must answer the user's immediate question: `我現在看著這個主根號/圖號/料號，要從這裡追加或作廢。`
- Add operations must keep the root locked to the current context and preview the next generated code before creation.
- The root core name is the single user-editable product name source. Part numbers and drawing numbers must not expose separate editable item-name fields during add flows.
- Formal obsolete must not look like delete. It must show impact, require reason and create approval work.
- Root obsolete is an aggregate governance action. It cannot silently obsolete child records one by one without a package preview and explicit scope.

Rejected options:

- Put all additions only under `/numbering/request`.
- Add button labels without backend support.
- One-click root obsolete from a drawer.
- Treat `M` as proof that a drawing is released or manufacturable.
- Let an `R` drawing become manufacturing basis.
- Use relation maintenance alone as a substitute for creating missing drawing or part numbers.

AI assumptions:

- Current normal identity policy is v3: `A0001`, `A0001-P01`, `A0001-M01`, `A0001-R01`.
- Existing relation view and relation maintenance remain the main surface for understanding `root -> drawing -> part`.
- Existing lifecycle policy and `/api/lifecycle/obsolete-requests` are the correct base for formal part/drawing obsolete requests.
- Root obsolete approval likely needs a new aggregate request type or a compatible extension, because current formal obsolete action codes are `obsolete_part_number` and `obsolete_ma_drawing`.
- Existing action permissions should be reused where possible: `numbering.create`, `numbering.link_variant`, `numbering.approval.request`, `obsolete_part_number`, `obsolete_ma_drawing`. A root obsolete permission/action code should be added only if the existing approval model cannot represent it cleanly.

Re-entry triggers:

- User wants root obsolete to bypass impact preview or approval.
- RD needs production deploy, Supabase live migration, provider pointer change, direct DB mutation, direct data repair/deletion, merge, PR, rollback or release artifacts.
- RD cannot create drawing/part under an existing root atomically.
- RD cannot prevent duplicate sequence allocation under concurrent add actions.
- RD wants to reuse `/numbering/request` as the only path instead of object-context drawers.
- RD wants to treat draft cleanup and formal obsolete as the same operation.

## Problem

The system already has root, drawing, part, relation and lifecycle foundations, but the UI does not expose the continuation actions users naturally expect after they find an existing object.

Current gaps:

- `/numbering/request` creates a new root with an initial part and optional initial drawing. It does not serve the common task `this root already exists; add M02/R01/P02`.
- `/numbering/drawings` drawer exposes actions such as revision, submission, traceability and impact, but not `新增同根圖號`, `新增同圖料號` or `申請圖號作廢` from the inspected drawing.
- `/numbering/search` relation maintenance can link existing parts and drawings, but it cannot create missing M02/R01/P02 records.
- `/parts` detail flow does not provide a clear `新增同根料號` or formal `申請料號作廢` entry from the inspected part.
- Formal obsolete backend support exists for part/drawing approval requests, but the main object drawers do not consistently surface it. Root-level obsolete intent is not a safe, previewed aggregate workflow.

This is not only a missing-button issue. It is an entrypoint and responsibility issue: users are trying to continue from the object they already found, while the system currently pushes creation into a separate root-creation form or relation-only maintenance.

## UX Intent

使用思考習慣: `#目的`, `#設計思考`, `#效用理論`, `#心理成因`, `#內容組織`, `#防呆`

- Primary users: RD, RD Manager, QA/QC, manufacturing-preparation users and numbering administrators.
- User mental model: first find the root/drawing/part, then add the sibling or request obsolete from that object.
- Expected first screen behavior: an existing root drawer immediately shows `新增圖號`, `新增料號`, and when formal, `申請主根作廢`.
- Risk mental model: creating a number is routine but irreversible enough to need preview; obsolete is controlled and must show downstream impact.
- Success state: the user can complete each task without leaving the object context or guessing which module owns it.

## Entry Placement Contract

### Root Detail Drawer

Surface: `/numbering/search` root-grouped relation tree root drawer.

Primary action row:

| Action | Label | Visible when | Opens |
|---|---|---|---|
| Add drawing | `新增圖號` | root exists and `numbering.create` allowed | `新增同根圖號` dialog |
| Add part | `新增料號` | root exists and `numbering.create` allowed | `新增同根料號` dialog |
| Delete draft root | `刪除草稿` | root and all local children are draft/need-info and not submitted/controlled | `刪除草稿` confirmation dialog |
| Root obsolete | `申請主根作廢` | root is formal or has formal children and obsolete policy allows request | `主根作廢影響預覽` wizard |

Secondary detail:

- Root code and core name are locked in all add dialogs.
- The drawer must show current drawing/part counts before creation.
- If root has no manufacturing drawing, the add drawing CTA should be visually primary.
- If root has no part, the add part CTA should be visually primary.
- If root is draft-only, lifecycle policy should show delete/cancel style actions where supported, not formal obsolete wording.
- Optional add actions must be grouped under neutral wording such as `新增相關資料`; do not label them `接續操作`, because that implies the user must continue.
- Draft delete must be reversible before commit at the dialog level: the user can close or cancel without mutating data, and delete requires explicit acknowledgement.
- Adding `P02` must show the inherited root name as locked context. It must not ask the user to type `料號品名`.

### Drawing Detail Drawer

Surfaces: `/numbering/drawings` detail drawer and drawing node drawer opened from `/numbering/search`.

Action row:

| Action | Label | Visible when | Opens |
|---|---|---|---|
| Add sibling drawing | `新增同根圖號` | drawing has root and `numbering.create` allowed | drawing add dialog with root locked |
| Add linked part | `新增同圖料號` | drawing has root and `numbering.create` allowed | part add dialog with drawing preselected |
| Obsolete drawing | `申請圖號作廢` | drawing is formal/released and obsolete policy allows request | drawing obsolete request dialog |

Rules:

- `新增同根圖號` defaults purpose to the last user-selected purpose or a safe default, but must clearly let the user choose `製造圖 M` or `參考圖 R`.
- `新增同圖料號` locks the root and preselects the current drawing relationship. If current drawing is `M`, default relation is `製造依據`; if current drawing is `R`, default relation is `參考` and manufacturing wording is forbidden.
- Drawing obsolete must show linked parts, primary manufacturing-basis impact, active submissions, attachments and release status before request.

### Part Detail Drawer

Surfaces: `/parts` drawer and part node drawer opened from `/numbering/search`.

Action row:

| Action | Label | Visible when | Opens |
|---|---|---|---|
| Add sibling part | `新增同根料號` | part has root and `numbering.create` allowed | part add dialog with root locked |
| Add drawing for root | `新增同根圖號` | part has root and `numbering.create` allowed | drawing add dialog with root locked |
| Obsolete part | `申請料號作廢` | part is formal and obsolete policy allows request | part obsolete request dialog |

Rules:

- If the part has a primary manufacturing drawing, `新增同根料號` may preselect that drawing as the relationship suggestion, but the UI must display the relationship before save.
- Part obsolete must show linked drawings, BOM usage if available, release/submission references and whether the root would remain open after approval.

### Global Numbering Request Page

Surface: `/numbering/request`.

Required mode selector:

```text
新主根號 | 既有主根號追加
```

`新主根號` keeps the existing new-root flow.

`既有主根號追加` is a fallback for users who start from the global creation page. It must require root search/selection first, then let the user choose:

- `新增圖號`
- `新增料號`
- `新增圖號 + 料號並建立關係`

This page must not be the only entrance. It is for global creation intent, not for object-context continuation.

## Add Workflow Contract

### Add M02 or R01 under existing root

Entry points:

- Root drawer `新增圖號`.
- Drawing drawer `新增同根圖號`.
- `/numbering/request` mode `既有主根號追加`.

Dialog fields:

| Field | Behavior |
|---|---|
| Root | locked; shows root code, core name, status |
| Drawing purpose | segmented control: `製造圖 M`, `參考圖 R` |
| Next number preview | generated server-side or preflighted: e.g. `A0001-M02`, `A0001-R01` |
| Drawing title/name | required if current system requires it for drawing master readiness |
| Reason | required when root already has formal/released drawings; optional for draft-only root |
| Relationship suggestion | optional; if launched from a part, allow linking to that part |

Save result:

- Creates a new drawing number under the existing root.
- Does not create a new root.
- Writes audit event with source entrypoint, root, purpose, generated number and actor.
- Refreshes the current drawer/list and highlights the new drawing.

Cancel result:

- Closing or cancelling before save must not allocate a number or mutate relations.
- If the user has edited fields, the UI must ask whether to discard unsaved input.

### Add P02 under existing root

Entry points:

- Root drawer `新增料號`.
- Drawing drawer `新增同圖料號`.
- Part drawer `新增同根料號`.
- `/numbering/request` mode `既有主根號追加`.

Dialog fields:

| Field | Behavior |
|---|---|
| Root | locked; shows root code, core name, status |
| Next number preview | generated server-side or preflighted: e.g. `A0001-P02` |
| Part name | locked; derived from root core name |
| Part metadata | required according to existing part master readiness rules |
| Relationship | optional from root; preselected from drawing; suggested from part if primary drawing exists |
| Relationship type | `製造依據` only for manufacturing drawings; `參考` for reference drawings |
| Reason | required when root already has formal/released part records; optional for draft-only root |

Save result:

- Creates a new part number under the existing root.
- Persists `part_numbers.part_name` from `part_roots.core_name`; ignores any client-supplied part-level name.
- If launched from a drawing and relationship is accepted, creates the relation in the same transaction.
- Does not create a new root.
- Writes audit event with source entrypoint, generated number, relation choice and actor.
- Refreshes the current drawer/list and highlights the new part.

Cancel result:

- Closing or cancelling before save must not allocate a number or mutate relations.
- If the user has edited fields, the UI must ask whether to discard unsaved input.
- Part name changes must happen only by changing the draft root core name. Part/drawing add dialogs cannot rename the product.

### Add drawing and part together

The first implementation may support this only from `/numbering/request` fallback or defer it to Phase 2. If supported:

- The operation must be atomic.
- Relationship must be explicit.
- If drawing purpose is `R`, relationship cannot be manufacturing basis.
- Sequence allocation must reserve both numbers only on successful commit.

## Obsolete Workflow Contract

### Formal part or drawing obsolete

Entry points:

- Drawing drawer `申請圖號作廢`.
- Part drawer `申請料號作廢`.
- Root drawer child action menu for a selected drawing/part may link to the same dialog.

Required behavior:

1. Fetch lifecycle policy for the entity.
2. If obsolete is blocked, show the policy reason in the drawer, not a dead button.
3. If allowed, open request dialog with impact preview.
4. Require reason.
5. Create approval request through existing lifecycle/numbering approval flow.
6. Show request state in the drawer after creation.

Impact preview minimum:

| Entity | Must show |
|---|---|
| Part | linked drawings, manufacturing-basis coverage, root status consequence, active submission/release references, BOM usage if available |
| Drawing | linked parts, whether it is primary manufacturing basis, active submission/release references, attachments/package references |

### Root obsolete with batch intent

Entry points:

- Root drawer `申請主根作廢`.
- `/numbering/request` must not expose root obsolete as a primary add action; it may link to root search first.

Wizard steps:

1. `影響預覽`: show all drawings, parts, relationships, active submissions/release records, BOM/cost/manufacturing baseline references where available.
2. `作廢範圍`: default to `整組主根作廢` when the user selected root obsolete; allow explicit deselection only if the system supports partial obsolete safely.
3. `原因與責任`: require reason, requester, target effective date if supported, and acknowledgement of active references.
4. `建立審核`: create one aggregate approval package or a compatible batch request that preserves root-level intent and child-level targets.

Root state rules:

- Root becomes `已作廢` only after every active formal child that keeps the root usable is approved obsolete, or the approval package explicitly covers the whole root and all relevant active children.
- If only some children are approved obsolete, root remains active/formal with visible `部分作廢` or `有作廢申請` tag.
- Draft-only root cleanup should follow delete/cancel lifecycle rules, not formal obsolete wording.
- Root obsolete approval must be auditable as one root-level intent, even if backend applies child updates individually.

### Draft root cleanup

Entry point:

- Root drawer `刪除草稿`.

Required behavior:

1. Only draft/need-info root bundles that have not entered formal submission, approval, revision, manufacturing baseline, BOM replacement or other controlled downstream flows may be deleted directly.
2. The delete dialog must show affected part and drawing counts before commit.
3. The user must explicitly acknowledge that the record is an unsubmitted draft.
4. The server route must require an explicit confirmation flag; a close/cancel action must not call delete.
5. File assets attached to the draft bundle may be moved to a deleted state instead of physically purged.
6. Formal or submitted records must continue to use `申請作廢`, not `刪除草稿`.

Forbidden behavior:

- No direct root obsolete mutation from the drawer without approval.
- No hidden child obsolete side effects without preview.
- No approval package that loses the root-level reason.
- No root obsolete if unresolved active references are not shown.

## Data / API Contract

RD may adjust route names to match project conventions, but the implementation must provide these capabilities.

### Read / preflight

| Capability | Candidate route |
|---|---|
| Root add policy and next sequences | `GET /api/numbering/roots/[rootCode]/append-policy` |
| Drawing add preflight | `POST /api/numbering/roots/[rootCode]/drawings/preview` |
| Part add preflight | `POST /api/numbering/roots/[rootCode]/parts/preview` |
| Obsolete policy | existing lifecycle policy route or new `GET /api/lifecycle/policy` |
| Obsolete impact | `GET /api/lifecycle/obsolete-impact?entityType=&entityId=` |

### Writes

| Capability | Candidate route | Transaction requirement |
|---|---|---|
| Add drawing under existing root | `POST /api/numbering/roots/[rootCode]/drawings` | allocate sequence, insert drawing, audit |
| Add part under existing root | `POST /api/numbering/roots/[rootCode]/parts` | allocate sequence, insert part, optional relation, audit |
| Add part linked to drawing | `POST /api/numbering/drawings/[drawingNumber]/parts` | validate same root, insert part, insert relation, audit |
| Add relation after creation | existing `POST /api/numbering/relations` | validate same company/root/status, audit |
| Delete draft root bundle | `DELETE /api/numbering/records/[rootCode]/draft` | verify draft-only bundle, block controlled references, mark files deleted, delete draft rows, audit |
| Part/drawing obsolete request | existing `POST /api/lifecycle/obsolete-requests` | create approval request, no direct obsolete |
| Root obsolete request | new compatible route or extended obsolete route | create aggregate approval package, no direct obsolete |

Repository requirements:

- Add async repository methods for creating a drawing or part under an existing root. Do not rely only on sync helpers if the current runtime uses async repositories.
- Reuse existing private sequence/insert logic where possible, but expose it through a safe public domain method with transaction boundary.
- For any existing-root part append, repository writes part name from the root core name, not from request body `partName`.
- If a draft root core name is changed, draft part names under that root must be synchronized to the new root name.
- Allocation must use existing v3/gap-aware sequence integrity rules.
- For drawing-linked part creation, relation creation must be in the same transaction as part creation unless the UI explicitly states that the relation is not being created.
- Audit payload must include `sourceEntrypoint`, `rootCode`, generated number, relation choice, actor and reason where applicable.

Idempotency/concurrency:

- Repeated submit of the same add form must not allocate multiple numbers within the existing duplicate-submit protection window or equivalent idempotency key.
- Parallel requests under the same root/purpose must allocate unique sequences.
- Failed transaction must not leave a reserved visible number without an explicit draft/recovery record.

## Permission Contract

Read:

- Object drawers follow existing page permissions: `/numbering/search`, `/numbering/drawings`, `/parts`.

Add:

- `numbering.create` is required to create drawing or part numbers.
- `numbering.link_variant` is required when the same transaction creates or changes drawing/part relation.

Obsolete:

- Part obsolete uses existing `obsolete_part_number` approval action.
- Drawing obsolete uses existing `obsolete_ma_drawing` approval action or a renamed compatible action if the codebase generalizes beyond MA naming.
- Root obsolete needs either a new root action code or an aggregate package action that can be evaluated by the existing approval queue.
- Draft root delete may reuse the existing draft lifecycle permission when no new permission migration is authorized, but it must still be guarded server-side and audited.

All write routes must also enforce company scope, root match and lifecycle lock rules server-side.

## UI Copy Contract

Allowed action labels:

- `新增圖號`
- `新增同根圖號`
- `新增料號`
- `新增同圖料號`
- `新增同根料號`
- `申請圖號作廢`
- `申請料號作廢`
- `申請主根作廢`
- `刪除草稿`
- `新增相關資料`
- `影響預覽`
- `建立作廢申請`

Forbidden user-facing main labels:

- `soft delete`
- `hard delete`
- `void`
- `recycle`
- `archive`
- `purge`
- `直接作廢`
- `接續操作`

Critical disabled messages:

| Condition | Message intent |
|---|---|
| no permission | Tell user which role/action is needed |
| draft-only object | Tell user this is not formal obsolete; use draft cleanup if available |
| active references | Tell user impact preview is required |
| reference drawing | Tell user `參考圖不可作為製造依據` |
| root partial obsolete | Tell user root will remain active until all active child scope is approved obsolete |

## Phase Roadmap

| Phase | State | Purpose | Authorization boundary |
|---|---|---|---|
| Phase 0 - Development document | Complete | Capture decisions, entry placement, API contract, QA and control-board entry | Authorized by documentation request |
| Phase 1 - Contextual add entrypoints | Implemented / local verification passed | Add root/drawing/part drawer CTAs, existing-root append APIs and local QC | Completed after explicit RD authorization |
| Phase 2 - Obsolete entrypoints and root impact wizard | Implemented / local verification passed | Surface part/drawing obsolete and root aggregate obsolete request with impact preview | Completed after explicit RD authorization |
| Phase 3 - Global fallback append mode | Implemented / local verification passed | Add `/numbering/request` `既有主根號追加` mode | Completed in same local slice |
| Phase 4 - Production release | Release Authorization Required | Production deploy/migration/smoke/rollback | Requires deployment-release gate |

## Acceptance For Current Local Implementation

- Human decisions `1B`, `2B+C`, `3B` are captured.
- Entry placement is specified for root, drawing, part and global fallback surfaces.
- Add workflows for `M02/R01` and `P02` are specified as operational, not UI-only.
- Root obsolete is specified as impact-previewed aggregate approval, not one-click mutation.
- API/repository/permission/QA contracts are documented.
- Local product implementation for Phase 1-3 is complete and verified.
- Production deploy, Supabase live migration/cutover, provider pointer change, direct data repair/deletion, merge, PR, rollback and release artifacts remain not authorized.

## Local Implementation Evidence

Evidence report: `.ai-doc/qc/qc-pdm-numbering-004-contextual-entrypoints-report-2026-07-08.md`.

Implemented code anchors:

- `src/components/numbering-contextual-entrypoints.tsx`
- `src/app/numbering/search/page.tsx`
- `src/app/numbering/drawings/page.tsx`
- `src/app/parts/page.tsx`
- `src/app/numbering/request/page.tsx`
- `src/app/api/numbering/roots/[rootCode]/append-policy/route.ts`
- `src/app/api/numbering/roots/[rootCode]/drawings/route.ts`
- `src/app/api/numbering/roots/[rootCode]/parts/route.ts`
- `src/app/api/numbering/roots/[rootCode]/drawing-part/route.ts`
- `src/app/api/numbering/roots/[rootCode]/obsolete-impact/route.ts`
- `src/app/api/numbering/records/[rootCode]/draft/route.ts`
- `src/app/api/lifecycle/obsolete-requests/route.ts`
- `src/lib/repositories/numbering-async-repository.ts`
- `src/lib/repositories/numbering-repository.ts`
- `src/lib/numbering-async.ts`
- `db/schema.sql`
- `scripts/qc-pdm-numbering-contextual-entrypoints.mjs`

Verification passed:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run qc:pdm-numbering-contextual-entrypoints
```

Additional evidence:

- Isolated API smoke on disposable DB created `A0001-M02`, `A0001-R01`, `A0001-P02`, and combined `A0001-M03 + A0001-P03` with `primary_manufacturing` relation.
- Browser smoke confirmed entrypoints on `/numbering/request`, `/numbering/search`, `/numbering/drawings` and `/parts`.
- APP feedback follow-up on 2026-07-08 confirmed `新增相關資料` wording, cancellable add drawing/part forms, draft root delete dialog, and `DELETE /api/numbering/records/[rootCode]/draft` rejecting requests without explicit `confirmDelete`.

## RD Implementation Handoff

Likely affected surfaces:

- `src/app/numbering/search/page.tsx`
- `src/app/numbering/drawings/page.tsx`
- `src/app/parts/page.tsx`
- `src/app/numbering/request/page.tsx`
- `src/app/api/numbering/records/route.ts`
- new or extended routes under `src/app/api/numbering/roots/[rootCode]/`
- `src/app/api/lifecycle/obsolete-requests/route.ts`
- new or extended obsolete impact route
- `src/lib/numbering-async.ts`
- `src/lib/repositories/numbering-async-repository.ts`
- `src/lib/repositories/numbering-repository.ts`
- `src/lib/pdm-lifecycle-policy.ts`
- `src/lib/numbering-permission-codes.ts`
- focused QC scripts under `scripts/`

Minimum verification after RD implementation:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run qc:pdm-numbering-core
npm.cmd run qc:pdm-numbering-api-regression
npm.cmd run qc:pdm-numbering-search-ui
npm.cmd run qc:pdm-numbering-request-ui
npm.cmd run qc:pdm-drawing-part-relation-view
npm.cmd run qc:pdm-lifecycle-obsolete
npm.cmd run qc:pdm-lifecycle-controlled-history
```

New focused QC should be added:

```powershell
npm.cmd run qc:pdm-numbering-contextual-entrypoints
```

## Stop Conditions

Stop and return to PM/human decision if:

- Adding `M02/R01/P02` requires changing the identity format.
- RD cannot preserve existing root and accidentally creates a new root from contextual add.
- Root obsolete cannot show child impact before request creation.
- Approval workflow cannot represent root-level batch intent with child targets.
- Existing lifecycle policy would show `刪除` for formal drawing/part/root records.
- Any implementation needs production/Supabase live changes, provider pointer switch, direct DB mutation, direct data repair/deletion, merge, PR, rollback or release artifacts.
- UI implementation cannot prevent text overlap or page-level horizontal overflow in affected drawers.

## Deferred Scope Audit

| Scope | Classification | Reason |
|---|---|---|
| Product implementation | Implemented locally for Phase 1-3 | Completed after explicit RD authorization |
| `/numbering/request` fallback mode | Implemented locally | Shipped with contextual drawer entries |
| Root aggregate approval backend | Implemented locally | Added root obsolete impact and aggregate approval request action |
| Bulk import append mode | New DEV later | Separate import workflow |
| Mass obsolete by spreadsheet | New DEV later | Higher risk batch governance |
| Historical data repair/backfill | Blocked Human Re-entry | Requires explicit data policy |
| Production deployment/cutover | Release Authorization Required | Requires deployment-release gate |
| ERP/procurement/BOM deep impact enforcement | New DEV later unless current APIs already expose safe read impact | Broader downstream integration |

## All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 / docs | Authorized | Complete | SPEC, QA, dev_task, documentation_map | product implementation | user answered guided questions | files created and indexed | git diff |
| Phase 1 / contextual add | Authorized and executed | Implemented / local verification passed | drawer CTAs, append APIs, sequence/idempotency, audit, highlight new record | production | explicit RD authorization received | M02/R01/P02 created under existing root without duplicate root | tsc, lint, build, focused QC, isolated API smoke, browser smoke |
| Phase 2 / obsolete entries | Authorized and executed | Implemented / local verification passed | part/drawing obsolete CTAs, root impact wizard, approval request package | one-click obsolete, direct mutation, production | explicit RD authorization received | requests route through lifecycle/approval with impact and reason guard | focused QC, browser smoke |
| Phase 3 / global fallback | Authorized and executed | Implemented / local verification passed | `/numbering/request` existing-root append mode | replacing object drawers | combined with Phase 1-2 implementation | global users can append after root search | focused QC, browser smoke |
| Phase 4 / release | Not authorized | Release Authorization Required | deploy/migration/smoke/rollback | unapproved data mutation | explicit release authorization | release gate pass | deployment-release-gate evidence |
