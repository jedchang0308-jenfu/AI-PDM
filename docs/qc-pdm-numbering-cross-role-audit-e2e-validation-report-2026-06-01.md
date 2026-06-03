# QC Fact Report: PDM Numbering Cross-Role Audit E2E

## Verdict

Pass.

## Executed Items

- `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- `npm.cmd run qc:pdm-numbering-core`
- `npm.cmd run qc:pdm-numbering-cross-role-audit-e2e` with `PDM_BASE_URL=http://127.0.0.1:3115`
- `npm.cmd run lint`
- `cmd /c npm run build`
- `git diff --check`

## Actual Results

| Check | Result | Evidence |
|---|---:|---|
| TypeScript | Pass | exit code 0; build TypeScript phase also completed |
| Core numbering QC | Pass | 234/234 passed |
| Cross-role audit E2E QC | Pass | 39/39 passed |
| Lint | Pass | exit code 0 |
| Build | Pass | exit code 0; numbering routes still included in route manifest |
| Diff whitespace | Pass | exit code 0; CRLF warnings only |
| Dev server cleanup | Pass | port 3115 no longer has `LISTENING` |

## Evidence Highlights

- Fixture project `QCAUDIT-98832747`, root `QCAUD98832747`, part `P-QCAUD98832747-001`, and drawing `D-QCAUD98832747-MA1` were used for the passing E2E run.
- Manager login and delegated engineer login both returned HTTP 200 with session cookies.
- Manager saw the scoped approval batch and did not receive `delegated_review` marker.
- Manager approval request details included `proxy_submission` and `impact_scope` markers.
- Delegated engineer saw the same scoped batch through active delegation and received `delegated_review` marker.
- Manager saw the `rd_manager` task and notification and did not see PDM admin decoy task/notification.
- Delegated engineer saw the manager-scoped task and notification through delegation and did not see PDM admin decoys.
- Delegated engineer task/notification details included `delegated_review`, `proxy_submission`, and `impact_scope` markers.
- Manager rejected the original batch item; the original item moved to `rejected`.
- Decision audit `numbering.approval_batch.decision` included before/after/diff envelope.
- Delegated engineer resubmitted rejected items only; original item became `resubmitted` and the new item became `pending`.
- Resubmit audit `numbering.approval_batch.resubmit_rejected` recorded actor `user-engineer-demo` and included before/after/diff envelope.
- Resubmitted active batch remained visible to the delegated engineer.
- Resubmitted request retained the `proxy_submission` marker.

## Issues And Blockers

- No blocker in this validation round.
- Build still reports existing Turbopack broad-tracing warnings from `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`; they are unrelated to this cross-role audit E2E work and remain non-fatal.

## Cleanup Notes

- The cross-role audit E2E script deletes temporary delegations, role-scope rules, tasks, notifications, approval rows, roots, parts, and drawings created for the run.
- It intentionally preserves audit logs to maintain append-only audit behavior.
