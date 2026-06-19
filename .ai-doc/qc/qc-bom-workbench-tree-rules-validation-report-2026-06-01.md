# QC Fact Report: BOM Workbench Tree Rules

## Verdict

Pass.

## Executed Items

- `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- `npm.cmd run qc:bom-workbench-tree-rules` with `PDM_BASE_URL=http://127.0.0.1:3125`
- `npm.cmd run lint`
- `cmd /c npm run build`
- `git diff --check`
- `netstat -ano | findstr :3117`

## Actual Results

| Check | Result | Evidence |
|---|---:|---|
| TypeScript | Pass | exit code 0; build TypeScript phase also completed |
| BOM workbench tree rules QC | Pass | 22/22 passed |
| Lint | Pass | exit code 0 |
| Build | Pass | exit code 0; `/api/bom/drafts/[draftId]/active` included in route manifest |
| Diff whitespace | Pass | exit code 0; CRLF warnings only |
| Dev server cleanup | Pass | port 3117 has no `LISTENING`; only `TIME_WAIT` rows remained |

## Evidence Highlights

- Engineer and manager login both returned HTTP 200.
- Fixture submissions `BOMTREE-CHILD-00316678` and `BOMTREE-PARENT-00316678` were created through the existing submission API.
- First workbench draft creation returned HTTP 201.
- `PATCH /api/bom/drafts/[draftId]` returned HTTP 200 and saved a tree with one group and two item rows.
- Group node `group-fasteners` had `quantity:null`.
- Duplicate child rows under `group-fasteners` merged into one item row with quantity `5`.
- Merged child remained under the group.
- Saved draft and lines were marked `manual`.
- Extra item master fields in the PATCH payload did not change `items.part_name` or force `current_revision` to the payload value.
- 11-level tree save returned HTTP 400 with `BOM_MAX_DEPTH_EXCEEDED`.
- Circular parent relation returned HTTP 400 with `BOM_CYCLE_DETECTED`.
- Second draft was created with `is_active:0`.
- `POST /api/bom/drafts/[draftId]/active` returned HTTP 200 and made the second draft active.
- Workbench summary showed the prior draft with `is_active:0`.
- `bom_edit_events` contained `save_tree` and `set_active`.
- `audit_logs` contained `BomWorkbenchDraftSaved` and `BomWorkbenchDraftActivated`.

## Issues And Blockers

- No blocker in this validation round.
- Build still reports existing Turbopack broad-tracing warnings from `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`; they are unrelated to this BOM tree-rules work and remain non-fatal.

## Cleanup Notes

- The QC script cleans temporary BOM workbench drafts, tree lines, edit events, legacy BOM rows, file references, and submission files.
- The script intentionally preserves audited submissions and audit logs because audit logs are append-only.
