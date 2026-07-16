# QC Fact Report: BOM Workbench Foundation

## Verdict

Pass.

## Executed Items

- `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- `npm.cmd run qc:bom-workbench-foundation` with `PDM_BASE_URL=http://127.0.0.1:3116`
- `npm.cmd run lint`
- `cmd /c npm run build`
- `git diff --check`
- `netstat -ano | findstr :3116`

## Actual Results

| Check | Result | Evidence |
|---|---:|---|
| TypeScript | Pass | exit code 0; build TypeScript phase also completed |
| BOM workbench foundation QC | Pass | 27/27 passed |
| Lint | Pass | exit code 0 |
| Build | Pass | exit code 0; new `/api/bom/*` routes included in route manifest |
| Diff whitespace | Pass | exit code 0; CRLF warnings only |
| Dev server cleanup | Pass | port 3116 has no `LISTENING`; only `TIME_WAIT` rows remained |

## Evidence Highlights

- Schema checks confirmed `bom_drafts`, `bom_lines_tree`, `bom_import_profiles`, `bom_import_jobs`, `bom_edit_events`, `bom_review_requests`, and `bom_release_snapshots`.
- Index checks confirmed `idx_bom_drafts_one_active`, `idx_bom_drafts_one_pending_review`, and `idx_bom_lines_tree_draft_parent`.
- Engineer and manager login both returned HTTP 200.
- Fixture submissions `BOMWB-CHILD-99771054` and `BOMWB-PARENT-99771054` were created through the existing submission API.
- Legacy route `/api/submissions/[id]/bom` still returned HTTP 200 with 3 legacy lines, proving compatibility with existing `bom_headers` / `bom_lines`.
- `POST /api/bom/drafts/from-assembly` returned HTTP 201.
- Workbench draft merged two duplicate child references into one line with quantity `5`.
- Missing child reference remained as a traceable item row with `item_id:null`, supporting later release-gate blocking.
- `GET /api/bom/drafts/[draftId]` returned tree lines.
- Creating a second active draft preserved multiple drafts and made the latest draft active.
- Prior draft was retained with `is_active:0`.
- `bom_edit_events` contained `create_from_assembly`.
- `audit_logs` contained `BomWorkbenchDraftCreated`.

## Issues And Blockers

- No blocker in this validation round.
- Build still reports existing Turbopack broad-tracing warnings from `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`; they are unrelated to this BOM workbench foundation work and remain non-fatal.

## Cleanup Notes

- The QC script cleans temporary BOM workbench drafts, tree lines, edit events, legacy BOM rows, file references, and submission files.
- The script intentionally preserves audited submissions and audit logs because deleting audited submissions would require updating audit foreign keys, which is blocked by the append-only audit trigger.
