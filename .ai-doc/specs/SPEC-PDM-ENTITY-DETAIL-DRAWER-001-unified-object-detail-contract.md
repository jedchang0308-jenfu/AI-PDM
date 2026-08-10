# SPEC-PDM-ENTITY-DETAIL-DRAWER-001 - 圖號 / 料號 / 主根號統一物件詳情抽屜

Status: Phase 1C Unified Drawing Workspace Implemented Locally / Independent QC Passed / Release Not Authorized
Date: 2026-07-09
Owner: Dev PM
Related DEV: `DEV-PDM-ENTITY-DETAIL-DRAWER-001` / `DEV-039`; `DEV-PDM-DRAWING-WORKBENCH-SIMPLIFICATION-001` / `DEV-057`
Related QA: `.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`
Extends: `.ai-doc/specs/SPEC-PDM-DETAIL-DRAWER-001-system-detail-drawer-standard.md`
Extends: `.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md`
Extends: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`
Extends: `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`

## Human Decision Brief

Confirmed decisions from APP feedback and follow-up discussion:

- The same drawing number, part number or root number must not show different object truth depending on the entry page.
- Keep separate entry pages because their primary tasks differ:
  - `/numbering/search` is the root/drawing/part relationship inspection surface.
  - `/numbering/drawings` is the drawing master workbench.
  - `/parts` is the part master workbench.
- Unify the right-side detail drawer contract:
  - click drawing number -> drawing detail;
  - click part number -> part detail;
  - click root number -> root detail.
- Apply the same rule to part numbers, not only drawing numbers.
- Entry context may change the default expanded section or scroll focus, but must not create a second version of the same object's core detail.
- Detail drawers remain overlay-style but non-modal: no dark backdrop, no focus trap or body lock, and the underlying list remains directly clickable for rapid inspection.
- The shared header owns one inline close `X`; entity pages must not add floating, previous/next or duplicate close controls.
- Modal confirmation dialogs remain separate and modal; opening one must prevent its `Escape` event from also closing the underlying detail drawer.

Rejected options:

- Maintain two separate drawing detail modules that show different sections for the same drawing number.
- Maintain two separate part detail modules that show different sections for the same part number.
- Merge `/numbering/search`, `/numbering/drawings` and `/parts` into one huge page. This would reduce task clarity and make scanning worse.
- Keep the relation-tree drawer as root-detail-only when a user clicks a drawing or part.
- Build one giant conditional component that mixes root, drawing and part logic in one render path.

AI assumptions:

- First implementation should use existing local data contracts where possible; no DB schema change is required for Phase 1.
- Existing owner pages and APIs remain authoritative:
  - root detail: `GET /api/numbering/roots/[rootCode]` and relation aggregation data;
  - drawing list/detail: `/numbering/drawings`, drawing attachment/readiness routes and existing same-root part data;
  - part list/detail: `GET /api/parts/[partNumber]`, part attachment/cost/shared-model routes.
- `src/components/numbering-contextual-entrypoints.tsx` remains the shared action surface for root/drawing/part add and obsolete actions.
- Cost amount visibility, attachment permissions, lifecycle policy and company scope must follow existing server-side guards.
- The first RD slice can normalize data in frontend adapters. A backend detail facade is useful later only if duplication persists after the shared UI contract lands.

Re-entry triggers:

- User wants page-specific object details to intentionally diverge.
- User wants to merge the three entry pages into one module.
- Implementation requires schema migration, RLS/policy changes, live Supabase migration, provider pointer change, direct data repair/deletion, production deployment, merge, PR, rollback or release artifacts.
- Existing APIs cannot expose enough drawing or part detail without introducing new product semantics.
- Cost visibility or attachment visibility rules conflict between entry pages.

## Problem

The current UI can open the same drawing number from two places:

- `/numbering/drawings`: the drawer behaves like a drawing-governance detail surface with attachments, submission readiness, same-root parts and operational actions.
- `/numbering/search`: the drawer behaves like a relation/lifecycle summary for the selected target.

This creates a trust problem. A user sees the same object ID but receives different information depending on where they clicked. The mental model should be:

```text
Object code -> object detail
Entry page -> task context
```

The entry page may explain why the user arrived there, but it must not redefine what the object is.

## UX Intent

使用思考習慣: `#目的`, `#批判`, `#效用理論`, `#設計思考`, `#心理成因`, `#內容組織`, `#可驗證性`

- Primary users: RD, RD Manager, QA/QC, manufacturing preparation, purchasing preparation and PDM administrators.
- User mental model: a code represents one object. Clicking that code should open that object's canonical detail.
- Main task: inspect the current object, understand status/readiness/relationships, then continue with the correct next action.
- Success state: from any supported entry page, clicking `A0001-M01`, `A0001-P01` or `A0001` opens the same object type and the same core sections.
- Natural next step:
  - drawing: inspect attachments/readiness/linked parts, then submit, revise, trace or impact-analyze;
  - part: inspect attributes/cost/status/linked drawings, then update part data, cost, shared model or lifecycle action;
  - root: inspect family relationship health, counts and add/obsolete actions.
- Most likely misunderstanding: users think two modules disagree about the same drawing or part record.
- Must not happen: a part click shows root-only details; a drawing click hides drawing attachments/readiness; a source page silently shows stale or reduced data.

## End-State Architecture

Separate entry pages stay. Object detail becomes a shared contract.

```text
Entry page
  /numbering/search        relation-first task context
  /numbering/drawings      drawing-list task context
  /parts                   part-list task context

Shared drawer shell
  EntityDetailDrawerShell

Entity panels
  RootNumberDetailPanel
  Drawing detail family
    DrawingNumberDetailPanel      formal lifecycle
    CandidateDrawingDetailPanel   candidate lifecycle
  PartNumberDetailPanel

Context adapters
  sourceContext controls default section, highlight and return target
```

### Object Identity Rule

| Click target | Required drawer entity type | Forbidden result |
|---|---|---|
| Root code, for example `A0001` | `part_root` | drawing-only or part-only detail |
| Drawing number, for example `A0001-M01` | `drawing_number` | root-only detail |
| Part number, for example `A0001-P01` | `part_number` | root-only or drawing-only detail |

### Source Context Rule

`sourceContext` may affect only emphasis:

| Source context | Allowed default focus | Must remain identical |
|---|---|---|
| `relation_tree` | relationship section expanded, matching root/drawing/part highlighted | identity, status, owner fields, permissions, actions, attachments/cost visibility |
| `drawing_module` | attachment/readiness/same-root part sections near top | drawing identity, linked parts, lifecycle, actions |
| `part_module` | attributes/cost/shared-model sections near top | part identity, linked drawings, lifecycle, actions |
| `request_fallback` | create/append context highlighted | existing object core truth |

Source context must be visible only as a small context hint or default expanded section. It must not produce a different information architecture for the same object type.

## Drawer Information Architecture

### Shared Shell

`EntityDetailDrawerShell` owns only common drawer behavior:

- right-side drawer layout, close button, width clamp and persisted width;
- resize handle;
- outside click and `Escape` close behavior;
- direct row-to-row switching without close/reopen flicker, with detail scroll reset to the top for the newly selected entity;
- loading, not found, restricted and error states;
- source context hint;
- keyboard-safe focus behavior;
- `data-entity-type`, `data-entity-code`, `data-source-context` attributes for QC.

The shell must not contain object-specific business rules except dispatching to the correct panel.

### Root Detail Panel

Required first screen:

| Area | Required content |
|---|---|
| Identity | root code, core name, status, phase |
| Summary | drawing count, part count, manufacturing/reference counts, blockers |
| Relationship health | complete, missing manufacturing drawing, missing part, ambiguous, blocked, draft |
| Primary actions | `新增圖號`, `新增料號`, draft delete or root obsolete action when allowed |
| Relationship view | child drawings, parts, link health and orphan states |

Required sections:

- `關係摘要`: drawings, parts, links, blockers.
- `新增相關資料`: reuse `NumberingContextualEntrypoints` root mode.
- `生命週期`: draft delete, formal obsolete request, pending request state.
- `送審 / 製造可用性`: concise readiness blockers that answer "現在要做什麼".
- `Audit / history`: collapsed or lower priority.

### Drawing Detail Panel

Required first screen:

| Area | Required content |
|---|---|
| Identity | drawing number, root code, purpose `M/R`, core name/title if available |
| State | record status, development phase, lifecycle/readiness state |
| Primary actions | `進版`, `送審` or `檢查送審條件`, `追溯`, `影響分析`, contextual add/obsolete actions |
| Relationship summary | linked parts, same-root parts, manufacturing/reference semantics |
| Attachments | drawing-owned attachment library and deleted/recoverable data state |

Required sections:

- `Object lifecycle`: status, phase, why it can/cannot proceed.
- `圖號附件庫`: current attachments, deleted data section and refresh state.
- `送審檢查`: prerequisite blockers, missing attachment/data states and next CTA.
- `同主根號料號`: linked parts and same-root part cards.
- `關係 / 影響`: traceability and impact analysis entry.
- `新增相關資料`: drawing-context `NumberingContextualEntrypoints`.

The drawing detail panel must be the same whether opened from `/numbering/drawings` or `/numbering/search`. The relation page may default-scroll to `同主根號料號` or `關係 / 影響`, but it cannot omit attachments or readiness sections.

Candidate reservations that contain a drawing are members of the same `drawing_number` detail family, even though their canonical entity metadata remains `candidate_bundle`. Candidate and formal drawing drawers MUST therefore publish `data-detail-family="drawing_number"` and `data-drawing-detail-skeleton="true"`, and render this ordered section contract:

1. `drawing-overview`: purpose, linked-part summary and same-root/content summary;
2. `drawing-revision-files`: candidate first-revision editor or formal controlled revision files;
3. `drawing-preview`: real preview content, or a concise human empty state with the next step;
4. `drawing-pending`: review, missing-data, recovery or no-action guidance;
5. `drawing-more`: reference attachments, relationship/data maintenance, edit/cancel and other secondary actions.

Both lifecycle variants MUST render the same top-level React component, `DrawingWorkspaceDrawer`, and publish `data-component="drawing-workspace-drawer"`. Candidate and formal adapters may provide different data, commands and section content, but they may not own separate drawer bodies or second-layer work pages. The component owns the same header slots: eyebrow (`候選圖號` / `正式圖號`), drawing code, part/product name, one first-layer status, at most one primary action and the shared close/resize controls. A candidate without a reserved drawing code MUST show `尚未產生圖號`; a root code must never substitute for the drawing code.

Candidate drawing preparation is an incomplete-data state inside the workspace, not a navigation destination. Opening a candidate MUST expose the existing first-revision editor, missing requirements and file work area inline. The visible UI MUST NOT render a `準備首版圖面` link/button that jumps to another layer, duplicate that action in header and body, or add a separate `下一步` card. When readiness becomes complete, the existing server-derived submit action becomes available in the same drawer; review, return and controlled states continue in the same component without a route change or drawer replacement.

This is component/view-model convergence, not lifecycle-authority convergence. Candidate mutation stays in `NumberingCandidateRevisionEditor` and candidate review/cancel actions; formal controlled files remain read-only in `MasterAttachmentPanel` and changes continue through the formal revision workflow. Candidate preview data is not invented. No API, schema, permission or lifecycle-authority change is introduced by this contract.

The content layer also has one visual source of truth. Candidate, formal and approval adapters MUST pass a `DrawingDetailContentModel` to the shared `DrawingDetailContent` renderer; they MUST use `DrawingDetailSummary` for first-layer facts and `DrawingDetailSection` for section headings/metadata rather than rebuilding the frame locally. The A0005 formal drawing arrangement is the canonical order and density: summary facts, controlled files/evidence, preview, pending guidance, then secondary details. Adapters may change labels, values, preview availability and mutation controls, but must not create a mode-specific summary grid or a second section-heading pattern. Future visual optimization should therefore be made in the shared content components and CSS first.

Preview content is also a shared contract, not merely a shared shell. Candidate, formal and approval adapters MUST render `DrawingDetailPreview`. It always presents the same two cards—`3D 模型` and `2D 圖面`—in the same order and uses the adapter only for media, file identity, preview state and permitted actions. When a preview is unavailable, pending or missing, the same card remains visible with human-readable state and recovery guidance; a mode-specific preview grid or one-sided empty state is not permitted. Formal media may render directly, while candidate and approval may expose evidence preview/download actions, but the visual component and state vocabulary remain one source of truth.

The canonical `/approvals` reviewer surface follows the same drawer contract. The approval inbox remains the entry list and stays visible beneath the overlay; selecting a request renders `DrawingWorkspaceDrawer` with `entityType="approval_request"` and the same ordered sections. The approval adapter supplies immutable review evidence, preview/download links and decision controls, while mutation authority remains in the existing approval commands. A separate approval detail panel or page-specific drawer body is not permitted; only capability and content adapters may differ.

### Part Detail Panel

Required first screen:

| Area | Required content |
|---|---|
| Identity | part number, root code, part name/core name, item kind |
| State | record status, development phase, lifecycle/readiness state |
| Primary actions | part data update, cost action if permitted, shared model/MA baseline actions if applicable, contextual add/obsolete actions |
| Relationship summary | linked drawings, primary manufacturing drawing, reference-only links |
| Attributes | material, color, surface treatment, variant note |

Required sections:

- `Object lifecycle`: status, phase and action-first next step.
- `料號屬性`: material, color, surface treatment, variant note and missing-data state.
- `圖號關聯`: linked drawings, manufacturing/reference semantics, missing manufacturing blocker.
- `成本狀態`: standard cost status, pending cost request count and permitted amount visibility.
- `附件 / 模型`: part attachments, shared 3D model and MA baseline sections where current system supports them.
- `新增相關資料`: part-context `NumberingContextualEntrypoints`.

The part detail panel must be the same whether opened from `/parts` or `/numbering/search`. The relation page may default-scroll to `圖號關聯`; `/parts` may default-scroll to `料號屬性` or `成本狀態`.

## Data Contract

### Phase 1A-1B Implementation Note

The 2026-07-09 local implementation intentionally lands the user-visible parity first:

- `/numbering/search` keeps its relation-first drawer, but now dispatches by target entity and renders root/drawing/part core sections before the full relation context.
- Drawing targets reuse the existing drawing attachment component and expose drawing readiness / same-root part sections.
- Part targets load the existing part owner detail API for attributes, linked drawings and cost status.
- `/numbering/drawings` and `/parts` keep their owner workbench UI, but publish the same `data-detail-*`, `data-entity-*` and `data-source-context` metadata as the relation drawer.
- Phase 1B extracts `PdmEntityDetailDrawer` over the existing low-level `PdmDetailDrawer`. Drawing, part, relation-search and candidate/reservation details reuse the same non-modal shell, header, close control, width persistence, outside-click rule and entity metadata.
- Object-specific part/root bodies remain domain components. Candidate and formal drawing adapters both render `DrawingWorkspaceDrawer`; lifecycle-specific data and commands stay in adapters/child domain components so the shared workspace does not duplicate mutation authority.
- Human-status filters and drawer-width behavior now have shared sources instead of page-local copies.

### Phase 1 Data Strategy

Use existing APIs and normalize to a shared view model. No DB schema change is required.

```ts
type EntityDetailTarget = {
  entityType: "part_root" | "drawing_number" | "part_number";
  entityCode: string;
  rootCode?: string;
  sourceContext: "relation_tree" | "drawing_module" | "part_module" | "request_fallback";
  defaultSection?: "relationships" | "attachments" | "readiness" | "attributes" | "cost" | "actions";
  relationContext?: {
    drawingNumber?: string;
    partNumber?: string;
    relationType?: "primary_manufacturing" | "reference" | "none";
  };
};

type EntityDetailViewModel = {
  target: EntityDetailTarget;
  identity: {
    entityType: EntityDetailTarget["entityType"];
    entityCode: string;
    rootCode: string;
    displayName: string;
  };
  status: {
    recordStatus: string;
    developmentPhase: string;
    lifecycleMessage: string;
    nextStep: string;
  };
  sections: {
    relationships: boolean;
    attachments: boolean;
    readiness: boolean;
    attributes: boolean;
    cost: boolean;
    actions: boolean;
    audit: boolean;
  };
};
```

Existing sources:

| Entity | Existing source | Notes |
|---|---|---|
| Root | `GET /api/numbering/roots/[rootCode]`, relation view data | Must include drawings, parts, matrix/health where available |
| Drawing | `/numbering/drawings` list payload, drawing attachment/readiness APIs, relation data | Must include same-root parts and readiness sections from drawing module |
| Part | `GET /api/parts/[partNumber]`, part attachment/cost/shared-model APIs, relation data | Must preserve cost redaction rules |

### Phase 2 Optional Data Facade

If Phase 1 leaves too much duplicated fetching, add a read-only facade:

```text
GET /api/numbering/entities/[entityType]/[entityCode]/detail?sourceContext=
```

The facade must:

- be read-only;
- enforce existing page permission and company scope;
- reuse owner-domain services and redaction helpers;
- return no write side effects;
- avoid new identity semantics.

Phase 2 is not required for first implementation unless RD finds Phase 1 duplication unsafe.

## Implementation Contract

### Frontend

1. Create a shared shell component. Recommended path:
   - `src/components/pdm-entity-detail-drawer.tsx`
   - or a small folder under `src/components/entity-detail-drawer/`.
2. Extract object panels without changing product behavior first:
   - `RootNumberDetailPanel`
   - `DrawingNumberDetailPanel`
   - `PartNumberDetailPanel`
3. Move common drawer behavior out of page-local implementations:
   - width clamp and storage;
   - resize;
   - close/backdrop;
   - shell states;
   - QC `data-*` attributes.
4. Update `/numbering/search`:
   - relation-tree root click passes `entityType: "part_root"`;
   - drawing click passes `entityType: "drawing_number"`;
   - part click passes `entityType: "part_number"`;
   - matrix row/column identity clicks follow the same rule.
5. Update `/numbering/drawings`:
   - use the shared shell and `DrawingNumberDetailPanel`;
   - keep drawing-module source context.
6. Update `/parts`:
   - use the shared shell and `PartNumberDetailPanel`;
   - keep part-module source context.
7. Preserve `NumberingContextualEntrypoints` behavior and labels from `DEV-PDM-NUMBERING-004`.
8. Do not place cards inside cards. Drawer sections can use compact panels, rows and lists.
9. Use source context for default expanded section only.

### Backend / API

Phase 1:

- No schema migration.
- No write route required.
- Existing APIs remain owner-domain authority.
- Any new helper must be a read adapter or TypeScript view-model mapper.

Phase 2 optional facade:

- Must be read-only.
- Must not bypass attachment, cost or lifecycle permissions.
- Must use existing redaction helpers such as part cost visibility rules.
- Must return 404/403 states in action-first Traditional Chinese when rendered.

### Permission Contract

| Data | Permission behavior |
|---|---|
| Root/drawing/part core identity | Existing page-level read permission |
| Drawing/part attachments | Existing master attachment permission path |
| Part cost amounts | Existing cost redaction rules; unauthorized users see status only |
| Contextual add/obsolete actions | Existing `numbering.create`, `numbering.link_variant`, lifecycle/approval action guards |
| Future facade | Same or stricter than source APIs |

## Failure And State Handling

| State | First visible answer |
|---|---|
| root not found | `找不到這個主根號，請重新查詢或確認權限。` |
| drawing not found | `找不到這個圖號，請重新查詢或確認是否已切換公司/資料範圍。` |
| part not found | `找不到這個料號，請重新查詢或確認是否已切換公司/資料範圍。` |
| restricted | `目前角色不能查看這項資料，請改用有權限的帳號或聯絡 Admin。` |
| partial relation context missing | `已開啟物件詳情，但來源關係不存在或已變更，請重新整理關係樹。` |
| API error | `明細讀取失敗，請重新整理；若仍失敗請請 Admin 檢查資料。` |

No drawer may show raw SQL, stack trace, `Internal Server Error`, route text, untranslated backend error or JSON payload as the primary visible state.

## Phase Roadmap

| Phase | Status | Purpose | Authorization |
|---|---|---|---|
| Phase 0 - Development documents | Complete | Capture UX decision, architecture, RD contract, QA and PM control entry | Authorized by user request to write development documents |
| Phase 1A - Target-aware parity implementation | Implemented locally / Release Not Authorized | Unify visible root/drawing/part detail behavior across `/numbering/search`, `/numbering/drawings` and `/parts` using existing APIs and drawer metadata | Authorized by user `完成DEV-039開發 /goal`; release not authorized |
| Phase 1B - Shared shell extraction | Implemented locally / Release Not Authorized | Reuse one non-modal shell and shared interaction/metadata contracts while preserving domain-specific panels | Authorized by user instruction on 2026-08-07; release not authorized |
| Phase 2 - Read-only detail facade if needed | RD Contract Ready / Not Authorized | Add optional normalized read API only if Phase 1 duplication becomes unsafe | Requires Phase 1 evidence and explicit authorization |
| Phase 3 - Release / production | Release Authorization Required | Merge/deploy/production smoke/rollback | Requires explicit release authorization and deployment-release-gate |

## RD Handoff Contract

### Phase 1 - Shared Drawer Shell And Canonical Panels

Scope:

- Build shared drawer shell.
- Extract drawing detail panel so `/numbering/drawings` and `/numbering/search` use the same drawing detail information architecture.
- Extract part detail panel so `/parts` and `/numbering/search` use the same part detail information architecture.
- Keep root detail panel as canonical root relationship detail for root clicks.
- Implement `EntityDetailTarget` and source-context default focus.
- Preserve existing drawer width/resize/keyboard behavior.
- Add focused QC for same-object consistency.

Out of scope:

- Merging the three entry pages.
- Changing identity format.
- DB schema migration.
- Permission/RLS changes.
- Production deploy, Supabase live cutover, provider pointer changes.
- Direct data repair/deletion.
- New cost workflow or attachment workflow.

Implementation contract:

- Shared shell must dispatch by `entityType`.
- Page-local code may adapt existing payloads into shared view models.
- Source context must not hide core sections required by the entity panel.
- Drawing panel must include attachment/readiness/same-root part sections even when launched from relation tree.
- Candidate and formal render paths must directly use `DrawingWorkspaceDrawer`, publish `data-component="drawing-workspace-drawer"`, and share the header hierarchy and ordered five-section skeleton while retaining separate lifecycle actions and mutation authority.
- Candidate preparation must render inline; `準備首版圖面` cannot be a visible navigation CTA, duplicated action or second drawer/page.
- Part panel must include attributes/relationships/cost status sections even when launched from relation tree.
- Root panel must include relation health, child counts and contextual add/lifecycle action sections.

Acceptance:

- Clicking `A0001-M01` from `/numbering/drawings` and `/numbering/search` opens `drawing_number` detail with the same identity, lifecycle, attachments/readiness and linked-part sections.
- Clicking `A0001-P01` from `/parts` and `/numbering/search` opens `part_number` detail with the same identity, attributes, drawing links, cost status and action sections.
- Clicking `A0001` opens `part_root` detail, not drawing or part detail.
- Relation matrix row/column clicks preserve entity type.
- Source context changes only default expanded section/highlight.
- Candidate title uses the primary reserved drawing code or `尚未產生圖號`; it never substitutes a root code.
- Candidate and formal drawers expose `drawing-overview → drawing-revision-files → drawing-preview → drawing-pending → drawing-more` in DOM order; preview empty states state a human next step.
- Both candidate and formal paths expose exactly one `data-component="drawing-workspace-drawer"`; candidate first-revision editing is present without an intermediate click.
- The same drawer remains open while readiness/action state changes; each state exposes at most one primary CTA.
- No page-level horizontal overflow or drawer text overlap at desktop/laptop/mobile widths.

Evidence required:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run qc:pdm-numbering-search-ui
npm.cmd run qc:pdm-drawing-part-relation-view
npm.cmd run qc:pdm-system-detail-drawer-ui
npm.cmd run qc:part-number-module
npm.cmd run qc:pdm-entity-detail-drawer
```

Browser evidence:

- `/numbering/search` desktop `1440x900`, laptop `1024x768`, and current supported mobile/default narrow viewport.
- `/numbering/drawings` drawing drawer.
- `/parts` part drawer.
- Same drawing opened from two sources.
- Same part opened from two sources.

### Phase 2 - Optional Read-Only Detail Facade

Scope:

- Add normalized read-only facade only if Phase 1 duplicates fetching or state mapping enough to create maintenance risk.
- Keep existing source APIs authoritative.
- Add facade QC for read-only/no-write-side-effect and redaction parity.

Out of scope:

- Write APIs.
- New data ownership.
- Schema/RLS changes unless separately authorized.

Acceptance:

- Facade response matches source APIs for identity/status/relationship/visibility.
- Unauthorized users do not see more through facade than through owner pages.
- Read call does not mutate audit, sequence, relation, attachment or cost records.

Evidence required:

- API facade no-write-side-effect QC.
- Cost redaction parity QC.
- Attachment permission parity QC.

## QA/QC Gate Summary

Primary QA plan:

- `.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`

Minimum gates:

- 5-second object identity test: reviewer can identify whether drawer is root/drawing/part/candidate, its name, current status and next step.
- Drawing-family consistency test: candidate and formal variants share header/section grammar while candidate-only lifecycle work remains in `drawing-pending` / `drawing-more`.
- Same-object consistency test: same drawing/part opened from two routes has same core sections.
- Source-context test: only focus/highlight differs.
- Visible error sweep.
- Keyboard and close/resize behavior regression.
- Responsive/no-overlap evidence.
- Permission/redaction parity for part cost and attachments.

## Stop Conditions

Stop and return to PM/user if:

- RD cannot make drawing and part details consistent without removing important owner-page sections.
- Implementation needs schema migration, RLS changes, production/Supabase live changes or direct data repair.
- Cost visibility differs between `/parts` and relation-tree entry for the same user.
- Attachment visibility differs between drawing/part owner pages and relation-tree entry for the same user.
- Source context starts changing data truth instead of only default focus.
- Drawer implementation causes nested-card layout, text overlap, critical overflow or unclear scroll ownership.
- RD wants to merge entry pages or remove `/numbering/search`, `/numbering/drawings` or `/parts`.

## Deferred Scope Audit

| Deferred scope | Classification | Handling |
|---|---|---|
| Product implementation | Same Spec Phase 1 / Implemented Locally | Phase 1A parity and Phase 1B shared shell are implemented and locally verified; production release remains gated. |
| Optional read-only detail facade | Same Spec Phase 2 / Not Authorized | Implement only if Phase 1 leaves unsafe duplication. |
| Merging the three modules/pages | No Tracking | Rejected because entry pages serve different user tasks. |
| Schema/RLS migration | Blocked Human Re-entry | Not expected; requires explicit authorization if discovered. |
| Production deploy, merge, PR, rollback, production smoke | Blocked Human Re-entry / Release Authorization Required | No release artifacts are created in this document. |
| Dedicated phone UI beyond current supported surface | No Tracking | Current product guidance uses desktop/default surface; narrow viewport remains a sanity check only unless separately requested. |
| Deep cost workflow redesign | New DEV later | Different product problem from detail-drawer consistency. |
| Bulk relation editing from drawer | New DEV later | Existing controlled relation maintenance remains authoritative. |

## All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 / docs | Authorized | Complete | SPEC, QA, dev_task, documentation_map | product implementation | user asked `寫成開發文件` | files created and indexed | git diff / file review |
| Phase 1 / shared drawer | Authorized locally | Implemented Locally / Release Not Authorized | shared shell, canonical root/drawing/part/candidate panels, source context, QC | schema/RLS, page merge, release | user instruction on 2026-08-07 | same object from multiple entry points shows same core sections and one non-modal interaction contract | tsc, lint, focused QC, authenticated browser evidence |
| Phase 2 / optional detail facade | Not authorized | RD Contract Ready / Not Authorized | read-only normalized facade and parity QC if needed | writes, ownership changes | Phase 1 duplication risk evidence + authorization | facade matches source APIs and redaction | API parity/no-write QC |
| Phase 3 / release | Not authorized | Release Authorization Required | merge/deploy/production smoke/rollback | unapproved production work | explicit release authorization | deployment-release-gate pass | release gate evidence |

## RD Readiness Review

Phase 1 P0/P1 readiness:

- DB schema: no change required.
- Migration: no change required.
- API: existing APIs can support first slice; optional facade deferred with contract.
- Permissions: existing route/action permissions retained.
- Transaction boundary: Phase 1 is read/UI composition only; no write transaction required.
- Failure recovery: drawer has not found/restricted/error states with action-first Traditional Chinese copy.
- State machine: no lifecycle transition change.
- Data mapping: `EntityDetailTarget` and entity view model defined.
- QA/QC: focused plan and commands defined.
- Release: not authorized; release artifacts deferred.

Result: Phase 1A-1B is `Implemented Locally / Release Not Authorized`; post-change convergence is `In sync`.

## Spec Governance

Cross-spec handling:

- Extends `SPEC-PDM-DETAIL-DRAWER-001` for shared drawer behavior.
- Extends `SPEC-PDM-MASTER-WORKBENCH-001` without changing the three-page responsibility split.
- Extends `SPEC-PDM-DRAWING-PART-RELATION-VIEW-001` by tightening click target semantics: root/drawing/part clicks must open matching entity detail.
- Extends `SPEC-PDM-NUMBERING-004` by preserving contextual add/obsolete entrypoints inside canonical object panels.
- Compatible with `SPEC-PDM-PART-COST-001`; part cost remains part-owned and redacted by permission.

ADR decision:

- New ADR is not required for Phase 1 because the decision is UI information architecture and shared component ownership, not identity, schema, lifecycle, audit, permission or release-gate policy.
- If Phase 2 introduces a cross-module backend detail facade that becomes an authoritative API surface, revisit ADR need before implementation.

Current authorization boundary:

- Documentation is complete.
- Product implementation is not authorized.
- Merge, PR, deploy, rollback, production smoke and release reports are deferred until explicit release authorization.

## 2026-08-09 Focused Amendment — DEV-059 QA-QC Reopen

This section supersedes only the previous PASS interpretation for the candidate bundle-submit confirmation layer; it does not repeal the shared `DrawingWorkspaceDrawer`, entity ownership, lifecycle, permission, schema or API contracts above.

- User field evidence on the current `/numbering/drawings` route shows `送交圖料與首版整包審核` cannot be dismissed by the visible `X`, `返回檢查` or re-entry, and the modal blocks the underlying workspace.
- The earlier Phase 1C browser evidence remains a historical baseline, but it does not prove current-route hard reload, back/forward or bfcache restore, runtime interruption, click-through prevention, and each close mechanism as an independent case.
- Parent status is therefore `Local RD Implemented / QA-QC Reopened by DEV-059 / Release Not Authorized` until focused AI real-operation evidence passes.

## 2026-08-10 Product Direction Amendment — A0005 Visual Baseline

The user has selected the A0005 formal drawing detail drawer as the only current visual baseline while the drawer family is redesigned. The candidate and approval detail drawer mounts are intentionally retired from the active UI, and their visible entry paths are paused. This amendment supersedes the active-rendering requirement for those two surfaces only; it does not delete or alter their API, data, lifecycle, permission, approval-command or evidence contracts. A future redevelopment task must explicitly reintroduce and validate the candidate/approval UI before those drawers are considered active again.
- The focused compatible-exception contract is `.ai-doc/specs/SPEC-PDM-CANDIDATE-BUNDLE-SUBMIT-MODAL-RECOVERY-001.md`; the executable validation authority is `.ai-doc/qa/qa-pdm-candidate-bundle-submit-modal-runtime-recovery-validation-plan-2026-08-09.md`.
- `DEV-059` may change local modal state ownership, focus/keyboard handling, navigation/runtime recovery and visible status copy. It may not change lifecycle/API/schema/permission/formal data or release scope without a new Spec Impact Preflight.
- No QA/QC PASS may be restored from static source inspection or old screenshots. The AI must operate the current route in a real browser, execute isolated fault cases and complete disposable mutation/readback/cleanup evidence.

Focused result (2026-08-09): DEV-059 completed the current-route modal recovery portion with AI browser evidence for X, 返回檢查, Escape, physical click, hard reload, back/forward, candidate switching and 1440/1024/390 viewport checks. The parent full PASS remains gated because the shared candidate was intentionally not mutated; isolated flow/integration evidence covers submit/withdraw/fault behavior, while an isolated disposable UI mutation run remains an extended gate.
