# QA-PDM-NUMBERING-004 - Contextual entrypoints validation plan

Date: 2026-07-08
Related DEV: `DEV-PDM-NUMBERING-004`
Related SPEC: `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`
Status: Executed / local verification passed for Phase 1-3

## Validation Objective

Verify that users can continue from the object they are viewing:

- existing root with `M01` can add `M02` or `R01`;
- existing drawing with `P01` can add linked `P02`;
- root, drawing and part formal obsolete requests are reachable from object-context drawers;
- root obsolete uses impact preview and approval package, not one-click mutation.

## Scope

In scope for the first RD implementation:

- Root drawer actions in `/numbering/search`.
- Drawing drawer actions in `/numbering/drawings` and relation-view drawing drawer.
- Part drawer actions in `/parts` and relation-view part drawer.
- Existing-root append APIs for drawing and part creation.
- Optional relation creation when adding a part from a drawing.
- Formal obsolete request CTAs and disabled reasons.
- Root obsolete impact preview wizard and aggregate approval request contract.
- `/numbering/request` `既有主根號追加` fallback mode if included in the same slice.
- Permissions, company scope, root consistency, audit and idempotency.
- RWD and visible-error sweep for affected drawers/dialogs.

Out of scope:

- Production deploy or Supabase live cutover.
- Direct historical data repair.
- Mass spreadsheet append or mass obsolete.
- ERP/procurement/BOM deep integration beyond available impact reads.
- Physical purge or hard delete.

## Required Fixtures

Use disposable local fixtures. Do not mutate production or staging data.

| Fixture | Required data |
|---|---|
| `CTX-ROOT-M01` | One formal or draft root with one manufacturing drawing `M01` and one part `P01` |
| `CTX-ROOT-MULTI` | One root that can safely receive `M02`, `R01` and `P02` |
| `CTX-DRAWING-M` | Manufacturing drawing linked to `P01` |
| `CTX-DRAWING-R` | Reference drawing linked to a part as reference-only |
| `CTX-FORMAL-PART` | Formal part eligible for obsolete request |
| `CTX-FORMAL-DRAWING` | Formal/released drawing eligible for obsolete request |
| `CTX-ROOT-FORMAL` | Root with multiple formal children for impact preview |
| `CTX-NO-PERMISSION` | Actor lacking create or obsolete permission |
| `CTX-CONCURRENCY` | Root used only for duplicate-submit and parallel add tests |

## Acceptance Matrix

### Entry Placement

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| CTX-ENTRY-001 | P0 | Open root drawer from `/numbering/search` | `新增圖號`, `新增料號`, and lifecycle action area are visible when policy allows |
| CTX-ENTRY-002 | P0 | Open drawing drawer from `/numbering/drawings` | User sees `新增同根圖號`, `新增同圖料號`, and `申請圖號作廢` when applicable |
| CTX-ENTRY-003 | P0 | Open part drawer from `/parts` | User sees `新增同根料號`, `新增同根圖號`, and `申請料號作廢` when applicable |
| CTX-ENTRY-004 | P1 | Open `/numbering/request` | Mode selector contains `新主根號` and `既有主根號追加` if Phase 3 is implemented |
| CTX-ENTRY-005 | P0 | No permission actor opens drawer | Write actions are hidden or disabled with human-readable reason; APIs still deny writes |

### Add Drawing

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| CTX-DRAW-001 | P0 | Add manufacturing drawing from root with existing `M01` | Creates `M02` under same root; no new root is created |
| CTX-DRAW-002 | P0 | Add reference drawing from root | Creates `R01` under same root and labels it reference-only |
| CTX-DRAW-003 | P0 | Add sibling drawing from drawing drawer | Root is locked to current drawing root; next number preview matches saved result |
| CTX-DRAW-004 | P0 | Concurrent add drawing requests | Allocates unique sequence numbers; no duplicate `M02`/`R01` |
| CTX-DRAW-005 | P1 | Failed add drawing validation | No visible number is consumed unless a controlled draft/recovery record is created |
| CTX-DRAW-006 | P1 | Add drawing audit | Audit records source entrypoint, root, purpose, generated number, actor and reason if required |

### Add Part

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| CTX-PART-001 | P0 | Add part from root with existing `P01` | Creates `P02` under same root; no new root is created |
| CTX-PART-002 | P0 | Add part from manufacturing drawing | Creates `P02` and manufacturing-basis relation in the same transaction when user confirms relation |
| CTX-PART-003 | P0 | Add part from reference drawing | Relation is `參考`; UI/API do not label it manufacturing basis |
| CTX-PART-004 | P0 | Add sibling part from part drawer | Root is locked and existing primary drawing is only a visible suggestion, not hidden magic |
| CTX-PART-005 | P0 | Duplicate-submit same form | Does not allocate two part numbers for one user retry |
| CTX-PART-006 | P1 | Add part audit | Audit records source entrypoint, generated number, relation choice and actor |

### Obsolete Requests

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| CTX-OBS-001 | P0 | Formal part drawer obsolete | `申請料號作廢` opens impact preview, requires reason and creates approval request |
| CTX-OBS-002 | P0 | Formal drawing drawer obsolete | `申請圖號作廢` shows linked parts/release impact before request |
| CTX-OBS-003 | P0 | Draft part/drawing | Formal obsolete button is absent or disabled with `只有正式資料可申請作廢` style reason |
| CTX-OBS-004 | P0 | Root obsolete action | Opens `主根作廢影響預覽`; no direct mutation occurs |
| CTX-OBS-005 | P0 | Whole-root batch intent | User can confirm whole-root scope; request retains root-level reason and child target list |
| CTX-OBS-006 | P0 | Partial root obsolete | Root remains active/formal with visible partial/request state after only some child scope is selected |
| CTX-OBS-007 | P0 | Existing obsolete request | UI shows pending request state and blocks duplicate obsolete request |
| CTX-OBS-008 | P0 | Approval compatibility | Request appears in existing approval queue or compatible lifecycle approval surface |

### API / Permission / Data Consistency

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| CTX-API-001 | P0 | Unauthorized add drawing/part API call | 401/403 without data leak and without sequence allocation |
| CTX-API-002 | P0 | Cross-company root/drawing/part mismatch | API rejects write; no relation or number is created |
| CTX-API-003 | P0 | Drawing-linked part with different root | API rejects with human-readable domain error |
| CTX-API-004 | P0 | `R` drawing manufacturing relation attempt | API rejects manufacturing-basis relation |
| CTX-API-005 | P0 | Obsolete request without reason | API rejects request |
| CTX-API-006 | P0 | Root obsolete impact fetch | Response lists drawings, parts, relationships and available active references |
| CTX-API-007 | P0 | Transaction failure during linked part create | Part and relation do not split into inconsistent half-state |
| CTX-API-008 | P1 | Existing relation maintenance regression | Existing `/api/numbering/relations` behavior remains intact |

### UX / RWD / Visible Error

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| CTX-UX-001 | P0 | Root drawer first screen | User can identify add and obsolete next actions without scanning unrelated pages |
| CTX-UX-002 | P0 | Dialog text fit | Buttons, labels and generated codes do not overflow at `1440x900`, `1024x768`, `390x844` |
| CTX-UX-003 | P0 | Long root/part/drawing names | Text wraps or truncates predictably; no overlap |
| CTX-UX-004 | P0 | API error | UI shows actionable Chinese; no raw stack, SQL, `Internal Server Error` or route text |
| CTX-UX-005 | P1 | Drawer refresh after add | New drawing/part is visible and highlighted without losing context |
| CTX-UX-006 | P1 | Keyboard access | Dialog controls and confirmation wizard are keyboard reachable |

## Now What State Matrix

| State | User likely question | First visible answer | Next CTA |
|---|---|---|---|
| existing root has M01 | 我要加 M02/R01 從哪裡？ | `可在此主根號新增圖號。` | `新增圖號` |
| existing drawing has P01 | 我要加 P02 從哪裡？ | `可在此圖號下新增同圖料號。` | `新增同圖料號` |
| formal part | 這個料號不用了怎麼辦？ | `正式料號需申請作廢並經審核。` | `申請料號作廢` |
| formal root | 整組都不用了怎麼辦？ | `主根作廢會影響底下圖號與料號，請先檢查影響。` | `影響預覽` |
| draft object | 為什麼不能作廢？ | `草稿不是正式資料，不使用申請作廢流程。` | `刪除草稿` if the draft bundle is not submitted/controlled |
| no permission | 為什麼不能新增？ | `目前角色沒有新增圖料號權限。` | request permission / contact admin |

## Required Commands

Minimum static and regression gates after RD implementation:

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

Focused QC to add:

```powershell
npm.cmd run qc:pdm-numbering-contextual-entrypoints
```

Focused QC must verify:

- root/drawing/part drawer actions exist at the correct surfaces;
- root-level optional add actions are grouped as `新增相關資料`, not `接續操作`;
- add drawing and add part dialogs can be cancelled/closed before save, with discard confirmation after edits;
- add part dialogs and `/numbering/request` must show part name as inherited from the root, not as an editable part-level field;
- `M02`, `R01`, `P02` are created under existing root only;
- created `P02` and combined drawing+part records must persist `part_numbers.part_name = part_roots.core_name`, even if a client submits a different `partName`;
- linked part creation is atomic with relation creation when selected;
- duplicate submit and parallel create do not duplicate sequences;
- part/drawing/root obsolete requests require reason and approval;
- root obsolete shows child impact and preserves aggregate intent;
- draft-only root bundle exposes `刪除草稿`, requires explicit confirmation, and rejects delete without server-side `confirmDelete`;
- no formal record shows `刪除` as the primary action;
- no raw backend errors are visible;
- desktop and mobile layouts have no critical overlap or page-level horizontal overflow.

## No-Go Criteria

QC must fail the slice if any of these occur:

- Adding a drawing or part creates a new root when the user selected existing-root append.
- `R` drawing can become manufacturing basis.
- Root obsolete mutates records directly without approval request.
- Root obsolete hides child drawings/parts before request creation.
- Formal drawing/part/root shows `刪除` instead of `申請作廢`.
- Draft root delete can run from a close/cancel action or without explicit user acknowledgement.
- Add drawing/part cancel allocates a number, creates a relation, or loses edited input without warning.
- Optional add actions are labeled `接續操作` and imply a required workflow step.
- `料號品名`, `品名（系統建議，可微調）`, `套用建議` or equivalent editable part-name controls reappear in add flows.
- Append part APIs reject requests only because `partName` is missing, or persist a client-supplied part name that differs from the root name.
- Duplicate click allocates multiple numbers for one intended creation.
- Write APIs trust frontend root context without server-side company/root validation.
- UI exposes raw SQL, stack, route or untranslated backend error in normal failure states.
- Any test or implementation mutates production/Supabase live data without explicit release authorization.

## Evidence Handoff

RD/QC report should include:

- Implemented route and repository method list.
- Before/after screenshots for root, drawing and part drawers.
- API evidence for `M02`, `R01`, `P02` creation under an existing root.
- Audit samples for add drawing, add part, linked relation and obsolete request.
- Approval request evidence for part/drawing/root obsolete.
- Root obsolete impact response sample.
- Permission and cross-company negative test results.
- Concurrency/idempotency test result.
- Viewport screenshots for `1440x900`, `1024x768`, `390x844`.
- Explicit statement that production deploy, Supabase live cutover, direct data repair/deletion and release artifacts were not performed unless separately authorized.

## Execution Result - 2026-07-08

QC report: `.ai-doc/qc/qc-pdm-numbering-004-contextual-entrypoints-report-2026-07-08.md`.

Passed evidence:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run qc:pdm-numbering-contextual-entrypoints
npm.cmd run dev:local:check
```

Additional local evidence:

- Focused QC: 31/31 passed.
- Isolated API smoke on disposable SQLite DB: 10/10 assertions passed; created `A0001-M02`, `A0001-R01`, `A0001-P02`, and combined `A0001-M03 + A0001-P03` with `primary_manufacturing` relation.
- Browser smoke verified request/root/drawing/part entrypoints and wrote screenshots under `output/playwright/pdm-numbering-contextual-entrypoints/`.

Not performed:

- Production deploy.
- Supabase live migration/cutover.
- Provider pointer switch.
- Direct repair/deletion of runtime data.
- Merge, PR, rollback or release artifact.
