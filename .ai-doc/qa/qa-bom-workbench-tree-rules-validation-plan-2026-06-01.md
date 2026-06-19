# QA Validation Plan: BOM Workbench Tree Rules

Scope: BOM workbench draft tree save and active-draft switching rules.

## Validation Scope

- Verify draft tree can be saved through `PATCH /api/bom/drafts/[draftId]`.
- Verify virtual group nodes are accepted and store no quantity.
- Verify item nodes can be placed under group nodes.
- Verify same parent + same part number + same revision item nodes are merged and quantities summed.
- Verify saved tree lines are marked as manual source after a manual save.
- Verify manual save ignores item-master attributes and only changes BOM structure, sorting, quantity, and virtual groups.
- Verify maximum depth over 10 levels is blocked.
- Verify circular parent relations are blocked.
- Verify a draft can be explicitly set as active through `/api/bom/drafts/[draftId]/active`.
- Verify activating one draft deactivates the prior active draft.
- Verify tree save and active switch write edit events and audit logs.

## User-Critical Flow

1. Manager creates a BOM workbench draft from assembly references.
2. Manager adds a virtual group, moves a child under that group, and saves the draft.
3. System merges duplicate sibling child rows into a single quantity.
4. Invalid tree structures are rejected before corrupting the draft.
5. Manager creates another draft and explicitly sets it as Active.
6. Audit and edit events show tree save and active switch history.

## FMEA

| Failure Mode | Cause | User Impact | Detection | Priority | Countermeasure / Test |
|---|---|---|---|---|---|
| Group nodes behave like item nodes | Missing node type validation | Virtual groups pollute quantity/procurement data | Saved group row check | High | Assert group has `quantity:null` and no part number |
| Duplicate sibling items are not merged | Merge rule missing | BOM quantity is split and harder to review | Quantity assertion | High | Save duplicate sibling rows and assert one row with summed quantity |
| Manual save loses source traceability | Source not updated or inconsistent | Later conflict priority cannot be trusted | Saved row source check | Medium | Assert draft and lines become `manual` |
| Manual BOM save mutates item master | API accepts extra fields such as part name/current revision | BOM editor becomes an uncontrolled item master editor | DB item row check after PATCH | High | Send extra fields and assert `items.part_name/current_revision` unchanged |
| Deep tree is accepted | Depth validation missing | UI and release logic can recurse unexpectedly | 11-level fixture | High | Expect `BOM_MAX_DEPTH_EXCEEDED` |
| Cycle is accepted | Parent relation validation missing | Tree rendering and gate checks can loop | Two-node cycle fixture | High | Expect `BOM_CYCLE_DETECTED` |
| Multiple active drafts remain active | Active switch not transactional | Engineer may submit wrong draft | Workbench summary check | High | Activate second draft and assert prior draft inactive |
| Edit history missing | Save/activate skips events | Cannot audit manual BOM changes | DB event/audit checks | High | Assert `save_tree`, `set_active`, and audit actions exist |

## Test Cases

- `TC-BOM-TREE-001`: Engineer and manager login succeed.
- `TC-BOM-TREE-002`: Create child and parent submissions through existing upload API.
- `TC-BOM-TREE-003`: Create first workbench draft from assembly references.
- `TC-BOM-TREE-004`: Save tree with virtual group, child item, duplicate child item, and missing child item.
- `TC-BOM-TREE-005`: Saved tree contains one group and two item rows.
- `TC-BOM-TREE-006`: Duplicate sibling child quantity is summed.
- `TC-BOM-TREE-007`: Extra item master fields in PATCH do not change `items.part_name/current_revision`.
- `TC-BOM-TREE-008`: 11-level group chain returns `BOM_MAX_DEPTH_EXCEEDED`.
- `TC-BOM-TREE-009`: Two-node circular parent relation returns `BOM_CYCLE_DETECTED`.
- `TC-BOM-TREE-010`: Create second non-active draft and activate it.
- `TC-BOM-TREE-011`: Workbench summary shows second draft active and first draft inactive.
- `TC-BOM-TREE-012`: Save/active edit events and audit logs exist.
- `TC-BOM-TREE-013`: TypeScript, lint, build, and diff whitespace checks pass.

## Data Requirements

- Demo Engineer and Manager accounts.
- Running local Next server with `PDM_BASE_URL`.
- SQLite database initialized from `db/schema.sql`.
- Temporary child part submission.
- Temporary parent assembly submission with assembly references.

## Pass Criteria

- `npm.cmd run qc:bom-workbench-tree-rules` passes with zero failed checks.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` exits 0 or build TypeScript phase completes.
- `npm.cmd run lint` exits 0.
- `cmd /c npm run build` exits 0 and includes active draft route.
- `git diff --check` exits 0 or reports CRLF warnings only.
- Dev server test port is cleaned up after validation.

## Evidence To Collect

- QC script JSON result including total/pass/fail counts.
- Saved tree response showing group row, merged child row, and manual source.
- Item master DB row after PATCH showing part name/current revision unchanged.
- HTTP 400 responses for max-depth and cycle cases.
- Workbench summary after active switch.
- Edit events: `save_tree`, `set_active`.
- Audit actions: `BomWorkbenchDraftSaved`, `BomWorkbenchDraftActivated`.
