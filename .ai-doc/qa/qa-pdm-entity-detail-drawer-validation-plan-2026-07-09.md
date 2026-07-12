# QA-PDM-ENTITY-DETAIL-DRAWER - Validation Plan

Date: 2026-07-09
Related DEV: `DEV-PDM-ENTITY-DETAIL-DRAWER-001` / `DEV-039`
Related SPEC: `.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`
Status: Executed Locally for Phase 1A / Release Not Authorized

## Validation Objective

Verify that root, drawing and part detail drawers follow one object-detail contract across entry pages:

```text
click root code -> root detail
click drawing number -> drawing detail
click part number -> part detail
```

The same object opened from different entry pages must show the same core object information. Source context may change default focus only.

## Scope

In scope for Phase 1 validation:

- `/numbering/search` relation tree and matrix click targets.
- `/numbering/drawings` drawing drawer.
- `/parts` part drawer.
- Shared drawer shell behavior: width, close, resize, loading/error states and `data-*` entity attributes.
- Drawing detail consistency across `/numbering/search` and `/numbering/drawings`.
- Part detail consistency across `/numbering/search` and `/parts`.
- Root detail correctness from `/numbering/search`.
- Attachment/cost visibility parity under the same logged-in role.
- RWD/no-overlap evidence for affected drawers.

Out of scope:

- Merging `/numbering/search`, `/numbering/drawings` and `/parts`.
- DB schema migration.
- RLS or permission redesign.
- New cost workflow.
- New attachment workflow.
- Production deployment or release artifacts.

## Required Fixtures

Use disposable local fixtures or stable demo data. Do not mutate production or Supabase live data.

| Fixture | Required data |
|---|---|
| `ENTITY-ROOT-001` | Root with at least one manufacturing drawing, one reference drawing and two parts |
| `ENTITY-DRAWING-M` | Manufacturing drawing linked to at least one part and with attachment/readiness sections available |
| `ENTITY-DRAWING-R` | Reference drawing linked as reference-only |
| `ENTITY-PART-LINKED` | Part linked to manufacturing and/or reference drawings, with material/color fields present or visibly missing |
| `ENTITY-PART-COST` | Part with standard cost status and permission-sensitive amount visibility |
| `ENTITY-NO-PERMISSION` | Actor lacking at least one write/action permission; read should still obey page permission |
| `ENTITY-NOT-FOUND` | Nonexistent root/drawing/part code for error-state checks |

## Acceptance Matrix

### Entity Target Correctness

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ENTITY-TARGET-001 | P0 | Click root `A0001` in relation tree | Drawer has `data-entity-type="part_root"` and root identity/header |
| ENTITY-TARGET-002 | P0 | Click drawing `A0001-M01` in relation tree | Drawer has `data-entity-type="drawing_number"` and drawing identity/header |
| ENTITY-TARGET-003 | P0 | Click part `A0001-P01` in relation tree | Drawer has `data-entity-type="part_number"` and part identity/header |
| ENTITY-TARGET-004 | P0 | Click drawing column/header in matrix | Drawer opens drawing detail, not root detail |
| ENTITY-TARGET-005 | P0 | Click part row/identity in matrix | Drawer opens part detail, not root detail |

### Same-Object Consistency

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ENTITY-CONSIST-001 | P0 | Open same drawing from `/numbering/drawings` and `/numbering/search` | Identity, root, purpose, status, phase, linked parts, attachment/readiness sections and primary actions are present in both |
| ENTITY-CONSIST-002 | P0 | Open same part from `/parts` and `/numbering/search` | Identity, root, status, phase, attributes, linked drawings, cost status and contextual actions are present in both |
| ENTITY-CONSIST-003 | P0 | Source context differs | Only default section/highlight changes; core object fields do not disagree |
| ENTITY-CONSIST-004 | P1 | Refresh data after selecting object | Selected entity type/code persists if still visible |
| ENTITY-CONSIST-005 | P1 | Switch selected object while drawer is open | Drawer updates content without close/reopen flicker or stale root-only detail |
| ENTITY-CONSIST-006 | P0 | Open drawing/part detail from `/numbering/search` | Drawer first screen does not show root aggregate metrics, full-root part list, full-root drawing list, relation maintenance, warnings/impact/audit sections |

### Drawing Detail Requirements

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ENTITY-DRAW-001 | P0 | Manufacturing drawing detail | Shows drawing number, root, purpose, lifecycle, attachment library, readiness/submission check and linked parts |
| ENTITY-DRAW-002 | P0 | Reference drawing detail | Shows reference-only semantics and never labels it manufacturing basis |
| ENTITY-DRAW-003 | P1 | Missing attachments/readiness blockers | First visible sentence tells user the next action |
| ENTITY-DRAW-004 | P1 | Same-root part list | Shows same-root parts or a clear empty/blocked state |

### Part Detail Requirements

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ENTITY-PART-001 | P0 | Linked part detail | Shows part number, root, item kind, attributes, linked drawings and lifecycle |
| ENTITY-PART-002 | P0 | Missing manufacturing drawing | Shows missing manufacturing drawing blocker and next action |
| ENTITY-PART-003 | P0 | Cost status visible to allowed role | Shows standard cost status and amount only if current role may view amounts |
| ENTITY-PART-004 | P0 | Cost status visible to restricted role | Redacts amount while keeping status/action guidance |
| ENTITY-PART-005 | P1 | Shared model / MA baseline sections exist in current part surface | Section is preserved when using shared part panel |

### Root Detail Requirements

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ENTITY-ROOT-001 | P0 | Root detail opened | Shows root code, core name, counts, relationship health, child drawings/parts and contextual actions |
| ENTITY-ROOT-002 | P0 | Draft-only root | Shows draft cleanup action when policy allows and does not show formal obsolete wording as primary action |
| ENTITY-ROOT-003 | P0 | Formal root obsolete candidate | Shows impact-preview/approval style action, not direct mutation |

### Drawer Shell / UI Behavior

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ENTITY-SHELL-001 | P0 | Drawer close | Escape and close button work without mutating data |
| ENTITY-SHELL-002 | P0 | Drawer resize | Width clamps to viewport and persists per drawer type or shared shell policy |
| ENTITY-SHELL-003 | P0 | Loading state | Does not show stale object identity while loading a different entity |
| ENTITY-SHELL-004 | P0 | Error/not found/restricted state | Uses action-first Traditional Chinese, no raw backend text |
| ENTITY-SHELL-005 | P1 | Keyboard focus | Drawer controls are reachable; list keyboard behavior is not broken |

### Responsive / Visual

| ID | Priority | Viewport | Expected |
|---|---|---|---|
| ENTITY-RWD-001 | P0 | `1440x900` | Drawer and list have no overlap, clipped buttons or page-level horizontal overflow |
| ENTITY-RWD-002 | P0 | `1024x768` | Header/actions wrap or compress predictably; scroll ownership is clear |
| ENTITY-RWD-003 | P1 | narrow/current supported mobile sanity | Object identity, close button and primary sections remain usable without horizontal page scroll |

## Now What State Matrix

| State | User likely question | First visible answer | Next CTA |
|---|---|---|---|
| same drawing from two places | 哪邊才是正確圖號資料？ | Same drawing detail appears from both places | Continue in current drawer |
| same part from two places | 料號資料是不是不同步？ | Same part detail appears from both places | Continue in current drawer |
| relation source changed | 為什麼剛剛點的關係不見？ | `已開啟物件詳情，但來源關係不存在或已變更，請重新整理關係樹。` | `重新整理` |
| missing manufacturing drawing | 這個料能不能製造？ | `此料號尚未連到製造圖，請先建立圖料關係。` | open relationship action |
| reference drawing | 這張圖能當製造依據嗎？ | `參考圖不可作為製造依據。` | choose/create manufacturing drawing |
| restricted cost | 為什麼看不到金額？ | `目前角色只能查看成本狀態，不能查看金額。` | request role / contact Admin |

## Required Commands

Minimum gates after Phase 1 RD implementation:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run qc:pdm-numbering-search-ui
npm.cmd run qc:pdm-drawing-part-relation-view
npm.cmd run qc:pdm-system-detail-drawer-ui
npm.cmd run qc:part-number-module
```

Focused QC to add:

```powershell
npm.cmd run qc:pdm-entity-detail-drawer
```

Focused QC must verify:

- root/drawing/part click targets set the correct entity type;
- same drawing opened from `/numbering/search` and `/numbering/drawings` has matching core sections;
- same part opened from `/numbering/search` and `/parts` has matching core sections;
- source context changes only focus/highlight;
- part cost redaction remains identical to `/parts`;
- drawing/part attachments remain permission-gated;
- drawer not found/restricted/error states do not show raw backend text;
- no page-level horizontal overflow or critical overlap at required viewport widths.

## Browser Evidence Required

Recommended screenshot paths:

- `output/playwright/pdm-entity-detail-drawer/search-root-detail-desktop.png`
- `output/playwright/pdm-entity-detail-drawer/search-drawing-detail-desktop.png`
- `output/playwright/pdm-entity-detail-drawer/drawings-drawing-detail-desktop.png`
- `output/playwright/pdm-entity-detail-drawer/search-part-detail-desktop.png`
- `output/playwright/pdm-entity-detail-drawer/parts-part-detail-desktop.png`
- `output/playwright/pdm-entity-detail-drawer/entity-detail-laptop.png`
- `output/playwright/pdm-entity-detail-drawer/entity-detail-narrow.png`

## No-Go Criteria

QC must fail if any occur:

- Clicking a drawing number from relation tree opens root-only detail.
- Clicking a part number from relation tree opens root-only or drawing-only detail.
- Clicking a drawing or part number from relation tree opens target detail but still shows root aggregate metrics, full-root lists, relation maintenance, warnings/impact/audit as first-screen content.
- Same drawing from two entry pages omits core sections in one path.
- Same part from two entry pages omits attributes, drawing links or cost status in one path.
- Source context changes status, permission, cost visibility or object identity.
- A reference drawing is labeled as manufacturing basis.
- A restricted role can see cost amount through relation-tree part detail when `/parts` redacts it.
- Drawer shows raw SQL, stack, route text, `Internal Server Error`, `Not Found` or untranslated backend JSON in normal visible UI.
- Implementation requires production/Supabase live change, direct data repair/deletion, merge, PR, rollback or release artifact without explicit authorization.

## Pass / Fail

Pass:

- All P0 target, consistency, drawing, part, root and shell cases pass.
- Same object from multiple entry points has one visible truth.
- Source context affects focus only.
- No raw visible errors or critical layout failures.

## Execution Evidence - 2026-07-09

Executed local Phase 1A verification:

- `npm.cmd run qc:pdm-entity-detail-drawer`：9/9 passed。
- `npx.cmd tsc --noEmit --pretty false`：passed。
- `npm.cmd run lint -- --quiet`：passed。
- `npm.cmd run qc:pdm-numbering-search-ui`：30/30 passed on isolated copy server `http://127.0.0.1:3110` with disposable SQLite DB.
- `npm.cmd run qc:pdm-drawing-part-relation-view`：62/62 passed on isolated copy server; includes root/drawing/part click target drawer checks.
- `npm.cmd run qc:part-number-module`：83/83 passed.
- `npm.cmd run build`：passed in isolated workspace copy `output/qc-runtime/dev039-entity-drawer-copy-20260709-104336/workspace`.
- `npm.cmd run qc:pdm-system-detail-drawer-ui`：72/72 passed after approval platform redirect contract alignment; this QC now verifies `/numbering/approvals` as a legacy redirect into canonical `/approvals` rather than a stale independent drawer host.
- `npm.cmd run qc:pdm-approval-platform`：106/106 passed.

Follow-up for information-density parity:

- `npm.cmd run qc:pdm-entity-detail-drawer`：12/12 passed；新增非主根號 target 不顯示 root aggregate sections、owner-style action surface、圖號 section order 檢查。
- `npx.cmd eslint src/app/numbering/search/page.tsx scripts/qc-pdm-entity-detail-drawer.mjs --quiet`：passed。
- `npx.cmd tsc --noEmit --pretty false`：passed。
- Browser DOM smoke with a fresh Chrome session reached `/numbering/search` but was not logged in; logged-in screenshot evidence remains pending and should be captured with an authenticated browser/session.

Resolved adjacent governance issue:

- The previous false blocker in `qc:pdm-system-detail-drawer-ui` was resolved under approval platform / system drawer governance. `src/app/numbering/approvals/page.tsx` remains a correct legacy redirect, and the QC validates the `/approvals` workbench detail panel contract plus compatibility message instead of requiring `PdmDetailDrawer` in the legacy page.

Conditional pass:

- Phase 1 may pass without the optional Phase 2 detail facade if frontend adapters are maintainable and parity QC passes.

Fail:

- Entity target correctness fails.
- Core object sections diverge by source page.
- Permission/redaction parity fails.
- Drawer remains root-only for drawing/part clicks.
