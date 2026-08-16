# QA-PDM-DRAWING-PART-RELATION-VIEW - Validation Plan

Date: 2026-07-07
Related DEV: `DEV-PDM-DRAWING-PART-RELATION-VIEW-001`
Related SPEC: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`
Status: Executed / local verification passed for Phase 1-3

## Validation Objective

Verify that 圖料工作台 no longer presents root, drawing and part as unrelated flat rows. The UI must show the actual relationship:

```text
主根號 -> 圖號 -> 料號
```

and must support:

- one root to many drawings;
- one drawing to many parts;
- one part to multiple drawings;
- manufacturing versus reference relationships;
- missing or ambiguous relation states with clear next steps.

## Scope

Implemented validation scope:

- Read-only root-grouped relationship tree in 圖料工作台.
- Server/API relation aggregation or equivalent client-safe aggregation.
- Relationship health and next-step labels.
- Root/drawing/part drawer selection behavior.
- Existing search/filter compatibility.
- Desktop, laptop and mobile viewport safety.
- Visible error sweep and Now What state coverage.
- One-root relationship matrix.
- Matrix cell semantics for `製造依據`, `參考`, `缺關聯`, `不適用`.
- Matrix horizontal scroll constrained to matrix container.
- Controlled relationship maintenance actions: `link`, `set_primary`, `set_reference`, `remove`.
- Permission, company/root match, locked-status protection and audit evidence for maintenance writes.

Out of scope for this QA plan:

- Generic relationship write/edit actions outside the controlled maintenance contract.
- Bulk relationship maintenance.
- DB schema migration.
- Production deployment or Supabase live cutover.
- Export/reporting from the matrix.
- BOM/CAD graph visualization.

## Required Fixtures

Use disposable local fixtures unless current seeded demo data already contains equivalent safe records.

| Fixture | Required data |
|---|---|
| `REL-VIEW-ROOT-001` | One root, two manufacturing drawings, one reference drawing, four parts. |
| `REL-VIEW-DRAWING-MULTI-PART` | One `M` drawing linked to at least three parts. |
| `REL-VIEW-PART-MULTI-DRAWING` | One part linked to two drawings, at least one manufacturing and one reference or secondary drawing. |
| `REL-VIEW-REFERENCE-ONLY` | One `R` drawing linked to a part with reference semantics. |
| `REL-VIEW-ORPHAN-PART` | One part under root with no manufacturing drawing relationship. |
| `REL-VIEW-ORPHAN-DRAWING` | One drawing under root with no linked parts. |
| `REL-VIEW-AMBIGUOUS` | Multiple primary drawings or multiple primary parts when downstream readiness requires one. |
| `REL-VIEW-DENSE` | One root with enough drawings/parts to require matrix overflow handling. |

Fixture rules:

- Do not mutate production or staging data.
- Do not create released records unless using disposable local data.
- Cleanup or mark fixtures clearly if they persist locally.

## Acceptance Matrix

### Root-Grouped Tree

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| RELTREE-001 | P0 | Open 圖料工作台 default view | User sees root-grouped relation view, not equal-weight root/drawing/part flat rows |
| RELTREE-002 | P0 | Root has multiple drawings | Root appears once; all drawings appear underneath |
| RELTREE-003 | P0 | One drawing links to multiple parts | Drawing node shows all linked parts without duplicating the root row |
| RELTREE-004 | P0 | One part links to multiple drawings | Part is visible under each valid drawing relationship and drawer shows all linked drawings |
| RELTREE-005 | P0 | Reference drawing linked to part | Relationship is labeled `參考`; it is not counted as manufacturing coverage |
| RELTREE-006 | P0 | Part has no manufacturing drawing | Root or part state shows `缺製造圖` or equivalent blocked/warning state with next step |
| RELTREE-007 | P0 | Drawing has no linked parts | Drawing node shows `未關聯料號` with recovery target |
| RELTREE-008 | P0 | Ambiguous primary drawing/part | UI shows ambiguous blocker and does not choose one silently |
| RELTREE-009 | P1 | Direct search by drawing number | Matching root expands and matching drawing is highlighted |
| RELTREE-010 | P1 | Direct search by part number | Matching root expands and matching part is highlighted |
| RELTREE-011 | P1 | Direct search by root code | Matching root expands and root summary is visible |
| RELTREE-012 | P1 | Large result set | Groups can remain collapsed but counts, blockers and next step remain visible |

### Matrix View

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| RELMATRIX-001 | P1 | Switch to `矩陣` for one root | Rows are parts; columns are drawings |
| RELMATRIX-002 | P0 | Manufacturing link cell | Cell says `製造依據` only for manufacturing relationship |
| RELMATRIX-003 | P0 | Reference link cell | Cell says `參考`, not `製造依據` |
| RELMATRIX-004 | P1 | Missing relation cell | Cell is blank or `缺關聯` according to design contract |
| RELMATRIX-005 | P1 | Dense root | Horizontal scroll stays inside matrix container; page itself has no horizontal overflow |
| RELMATRIX-006 | P1 | Mobile matrix access | Mobile can use stacked relation summary or contained matrix; primary tree remains usable |

### API / Data Consistency

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| RELAPI-001 | P0 | Relation API valid query | Returns grouped roots with drawings, parts and relationship cells |
| RELAPI-002 | P0 | Company-scoped permission | Unauthenticated/unauthorized access is denied without leaking data |
| RELAPI-003 | P0 | v2 compact identities | `00007-M01`, `00007-P01` style values render correctly |
| RELAPI-004 | P0 | v1 historical semantics | Historical `MA/OT` rows, if present, map to manufacturing/reference semantics |
| RELAPI-005 | P0 | Counts sanity | Root drawing/part counts match rendered nodes |
| RELAPI-006 | P0 | No write side effect | Relation view read does not mutate root/drawing/part/link records |

### UX / Visible State

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| RELUX-001 | P0 | 5-second understanding | Reviewer can identify root, drawings, linked parts and next issue from first screen |
| RELUX-002 | P0 | Empty filtered result | First sentence tells user to clear filters or search by root/drawing/part |
| RELUX-003 | P0 | Blocked relationship | First sentence says what cannot be done and next step |
| RELUX-004 | P0 | Reference-only drawing | UI says reference drawing cannot be manufacturing basis |
| RELUX-005 | P0 | Visible error sweep | No raw API, DB, `Internal Server Error`, `Not Found`, stack or route text appears |
| RELUX-006 | P1 | Keyboard navigation | Root/drawing/part rows can be focused and opened without unsafe writes |
| RELUX-007 | P1 | Drawer switching | Clicking another node switches drawer detail without closing/reopening |

### Responsive / Layout

| ID | Priority | Viewport | Expected |
|---|---|---|---|
| RELRWD-001 | P0 | `1440x900` | Tree, toolbar and drawer fit without overlap or page-level horizontal overflow |
| RELRWD-002 | P0 | `1024x768` | Counts, chips and next-step labels remain readable; scroll owner is clear |
| RELRWD-003 | P0 | `390x844` | Root groups stack; drawing/part nodes are readable; no horizontal page scroll |
| RELRWD-004 | P1 | Drawer open desktop | Drawer scroll is contained and does not cause body scroll confusion |
| RELRWD-005 | P1 | Dense chips | Long codes and Chinese names wrap/truncate predictably without breaking row height |

## Now What State Matrix

| State | User likely question | Visible answer first sentence | Next CTA / destination | Detail layer | Result |
|---|---|---|---|---|---|
| empty | 查不到資料時我要怎麼辦？ | `查不到符合條件的圖料關係，請清除篩選或改用主根號、圖號、料號搜尋。` | 清除篩選 / 查詢 | main | Covered by implemented empty state contract |
| missing manufacturing | 這個料能不能製造？ | `這個料號尚未連到製造圖，請先建立圖料關係。` | 開啟關係明細 / 前往圖號或料號 owner page | main/detail | Passed in focused QC |
| reference-only | 這張圖能不能拿來製造？ | `這張圖是參考圖，不可作為製造依據。` | 查看參考關聯 / 選製造圖 | main/detail | Passed in focused QC |
| ambiguous | 系統能不能自動選主圖主料？ | `這個主根號有多個主圖或主料，系統不能判定送審主體。` | 檢查主圖主料設定 | main/detail | Server-side blocker implemented; static QC covered |
| API error | 清單壞了要怎麼辦？ | `圖料關係讀取失敗，請重新整理；若仍失敗請請 Admin 檢查資料。` | 重新整理 | main/detail | Covered by existing error path |

## Required Commands

Minimum RD verification after implementation:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run qc:pdm-numbering-search-ui
npm.cmd run qc:pdm-master-workbench-layout
```

Focused QC to add:

```powershell
npm.cmd run qc:pdm-drawing-part-relation-view
```

Focused QC must verify:

- root appears once in default relation view;
- many drawings under one root render correctly;
- one drawing can show multiple parts;
- one part can appear in multiple drawing relationships;
- reference relationships are not labeled manufacturing;
- relationship counts match rendered nodes;
- empty/blocked/ambiguous states answer Now What;
- no page-level horizontal overflow at `1440x900`, `1024x768`, `390x844`;
- visible error sweep passes.

## Execution Evidence

Executed on 2026-07-07 against disposable SQLite runtime `output/qc-runtime/pdm-relation-20260707-001`:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run qc:pdm-numbering-search-ui      # 30/30
npm.cmd run qc:pdm-master-workbench-layout  # 205/205
npm.cmd run qc:pdm-drawing-part-relation-view # 56/56
```

Focused relation QC verified:

- root appears once in relation tree;
- one root to many drawings;
- one manufacturing drawing to multiple part numbers;
- reference relationship is labeled `參考`;
- missing manufacturing coverage is visible;
- matrix distinguishes `製造依據`, `參考`, `缺關聯`;
- relation API read has no write side effect;
- controlled maintenance creates primary manufacturing link and writes audit;
- no page-level horizontal overflow at `1440x900`, `1024x768`, `390x844`.

## Browser Evidence

Required screenshots:

- `output/playwright/pdm-drawing-part-relation-view/tree-desktop.png`
- `output/playwright/pdm-drawing-part-relation-view/tree-laptop.png`
- `output/playwright/pdm-drawing-part-relation-view/tree-mobile.png`
- `output/playwright/pdm-drawing-part-relation-view/multi-part-drawing.png`
- `output/playwright/pdm-drawing-part-relation-view/reference-only-state.png`
- `output/playwright/pdm-drawing-part-relation-view/matrix-desktop.png`

## Stop Conditions

Stop and return to PM/user if:

- Implementation requires schema migration to represent relationships.
- UI needs relationship write/edit actions to satisfy Phase 1 acceptance.
- Product direction changes so matrix must be default instead of tree.
- RD cannot preserve existing owner-domain rules.
- Phase 1 would require production deploy, Supabase live migration, direct data repair/deletion or provider pointer change.
- The only implementation path is to hide many-to-many relationships instead of displaying them.

## Pass / Fail

Pass:

- All P0 Phase 1 cases pass.
- User can identify root/drawing/part relationships without comparing duplicate flat rows.
- Manufacturing/reference semantics are correct.
- No raw visible errors.
- Responsive evidence covers required viewports.

Conditional pass:

- Matrix view is implemented and verified locally.

Fail:

- Root/drawing/part are still presented as equal-weight duplicate rows by default.
- One drawing with multiple parts requires opening drawer to discover the parts.
- Reference drawings are visually confused with manufacturing basis.
- Relationship health or next step is missing.
- Mobile requires page-level horizontal scroll for the main relation view.
