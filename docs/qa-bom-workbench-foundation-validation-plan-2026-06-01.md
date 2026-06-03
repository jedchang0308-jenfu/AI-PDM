# QA Validation Plan: BOM Workbench Foundation

Scope: first BOM workbench slice covering schema foundation, assembly-reference draft creation, multi-draft active selection, legacy BOM compatibility, and audit/edit-event evidence.

## Validation Scope

- Verify BOM workbench tables exist for drafts, tree lines, import profiles/jobs, edit events, review requests, and release snapshots.
- Verify schema supports only one active draft per parent item/revision and only one pending review per parent item/revision.
- Verify existing `bom_headers` / `bom_lines` compatibility remains intact.
- Verify `/api/bom/drafts/from-assembly` creates a new workbench draft from assembly references.
- Verify duplicate same-parent child part/revision references are merged by quantity.
- Verify creating a second active draft keeps both drafts but deactivates the prior active draft.
- Verify `/api/bom/workbench` returns parent metadata, all drafts, and the active draft tree.
- Verify `/api/bom/drafts/[draftId]` returns tree-line details.
- Verify draft creation writes `bom_edit_events` and append-only `audit_logs`.

## User-Critical Flow

1. Engineer uploads an assembly with CAD references.
2. Existing submission detail and legacy BOM route continue to work.
3. Manager opens BOM workbench and creates a CAD Auto draft.
4. System merges duplicated child rows into a canonical workbench tree.
5. Manager creates another CAD Auto draft, which becomes active while the prior draft remains traceable.
6. Audit and edit-event evidence show how the workbench draft was created.

## FMEA

| Failure Mode | Cause | User Impact | Detection | Priority | Countermeasure / Test |
|---|---|---|---|---|---|
| New schema breaks existing BOM route | Replacing `bom_headers` / `bom_lines` instead of extending | Dashboard BOM, BOM diff, and where-used regress | Legacy route check | High | Assert `/api/submissions/[id]/bom` still returns legacy BOM |
| Multiple active drafts exist | Missing partial unique guard or active-switch transaction | Team sends wrong draft to review | Workbench summary check | High | Create two active drafts and assert prior draft inactive |
| Duplicate references create duplicate tree rows | No merge rule for same child/revision | Quantity becomes hard to review | Merged quantity check | High | Two duplicate references must become one line with summed quantity |
| Missing schema for future workflows | Only current API tables added | Later XLS/review/release work needs disruptive migration | Schema table checks | Medium | Check import, edit, review, snapshot tables exist |
| No traceability for draft creation | Edit event/audit not written | Cannot explain who created draft from which source | DB evidence check | High | Assert `create_from_assembly` event and `BomWorkbenchDraftCreated` audit |
| Test cleanup violates append-only audit | Deleting audited submissions updates audit FK | QC cleanup fails and hides real audit behavior | Cleanup result | Medium | Preserve audited submissions, clean only fixture BOM tables/files/references |

## Test Cases

- `TC-BOM-WB-001`: Engineer and manager login succeed.
- `TC-BOM-WB-002`: BOM workbench schema tables and critical indexes exist.
- `TC-BOM-WB-003`: Create child and parent submissions through existing upload API.
- `TC-BOM-WB-004`: Existing legacy BOM route returns lines for the parent assembly.
- `TC-BOM-WB-005`: Create workbench draft from assembly references through new API.
- `TC-BOM-WB-006`: Duplicate child references merge into one line and quantity is summed.
- `TC-BOM-WB-007`: Draft detail API returns tree lines.
- `TC-BOM-WB-008`: Second active draft is created while first draft remains but is no longer active.
- `TC-BOM-WB-009`: Workbench summary returns parent metadata, drafts, and current active draft.
- `TC-BOM-WB-010`: Edit event and audit log are written.
- `TC-BOM-WB-011`: TypeScript, lint, build, and diff whitespace checks pass.

## Data Requirements

- Demo Engineer and Manager accounts.
- Running local Next server with `PDM_BASE_URL`.
- SQLite database initialized from `db/schema.sql`.
- Temporary child part submission.
- Temporary parent assembly submission with duplicated assembly references.

## Pass Criteria

- `npm.cmd run qc:bom-workbench-foundation` passes with zero failed checks.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` exits 0 or build TypeScript phase completes.
- `npm.cmd run lint` exits 0.
- `cmd /c npm run build` exits 0 and includes new `/api/bom/*` routes.
- `git diff --check` exits 0 or reports CRLF warnings only.
- Dev server test port is cleaned up after validation.

## Evidence To Collect

- QC script JSON result including total/pass/fail counts.
- New schema table/index existence checks.
- Legacy BOM route response evidence.
- Workbench draft response with merged child quantity.
- Workbench summary with multiple drafts and single active draft.
- Edit event `create_from_assembly`.
- Audit action `BomWorkbenchDraftCreated`.
- Build route manifest including `/api/bom/drafts/[draftId]`, `/api/bom/drafts/from-assembly`, and `/api/bom/workbench`.
