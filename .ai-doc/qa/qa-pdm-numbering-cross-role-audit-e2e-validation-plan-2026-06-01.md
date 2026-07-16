# QA Validation Plan: PDM Numbering Cross-Role Audit E2E

Scope: cross-role consistency for delegated review, proxy submission, rejected-item resubmission, manager scoped visibility, task center visibility, notification visibility, and audit envelopes.

## Validation Scope

- Verify manager scoped visibility can see only allowed approval batches, tasks, and notifications.
- Verify delegated engineer can access the same manager-scoped review target only through active delegation.
- Verify delegated access is explicitly marked as `delegated_review`.
- Verify proxy-submitted approval requests keep `proxy_submission` marker and required reason.
- Verify impact-scope payload keeps `impact_scope` marker across approval page, task center, notification center, and resubmitted request.
- Verify manager rejects one batch item and only rejected items are resubmitted.
- Verify resubmission keeps original batch item as `resubmitted` and creates a new pending item.
- Verify decision and resubmission audit logs preserve before/after/diff envelope and actor identity.

## User-Critical Flow

1. Admin or authorized role proxy-submits a numbering approval with impact-scope information.
2. Manager sees only scoped approval, task, and notification items.
3. Delegated engineer sees the same scoped items during the delegation window and receives clear delegated-review markers.
4. Manager rejects the original batch item.
5. Delegated engineer resubmits only the rejected item.
6. Audit trail shows who rejected, who resubmitted, what changed, and which markers were present.

## FMEA

| Failure Mode | Cause | User Impact | Detection | Priority | Countermeasure / Test |
|---|---|---|---|---|---|
| Delegated engineer sees unscoped items | Delegation bypasses manager project/action scope | Reviewer can access unrelated approval data | Decoy PDM admin task/notification fixture | High | Assert delegated engineer does not see PDM decoy items |
| Delegated access has no marker | DTO marker normalization missing | Reviewer responsibility becomes unclear | Batch/task/notification marker assertions | High | Assert `delegated_review` appears for delegated engineer only |
| Proxy submission marker drops after resubmit | Resubmit payload copy misses marker details | Resubmitted review loses submission accountability | Resubmitted request marker check | High | Assert `proxy_submission` remains after resubmission |
| Impact scope missing in task/notification | Task detail payload not normalized | Manager cannot see affected documents/parts | Task/notification marker checks | High | Assert `impact_scope` in both task and notification details |
| Batch reject/resubmit mutates wrong items | Resubmit logic does not filter rejected items | Approved/pending items could be duplicated | Original/new item status checks | High | Assert original rejected item becomes `resubmitted` and new item is `pending` |
| Audit envelope incomplete | Audit writer omits before/after/diff | Future traceability is weak | Audit log query after decision/resubmit | High | Assert action, actor, before/after/diff exist |

## Test Cases

- `TC-XAUDIT-001`: Manager and delegated engineer login succeed.
- `TC-XAUDIT-002`: Seed one scoped approval batch, one manager task/notification, one active delegation, and one PDM admin decoy task/notification.
- `TC-XAUDIT-003`: Manager sees the scoped batch without `delegated_review` marker.
- `TC-XAUDIT-004`: Manager approval request includes `proxy_submission` and `impact_scope` markers.
- `TC-XAUDIT-005`: Delegated engineer sees the scoped batch with `delegated_review` marker.
- `TC-XAUDIT-006`: Manager sees manager task/notification and does not see PDM admin decoys.
- `TC-XAUDIT-007`: Delegated engineer sees manager task/notification through delegation, with `delegated_review`, `proxy_submission`, and `impact_scope` markers.
- `TC-XAUDIT-008`: Manager rejects original batch item and decision audit records before/after/diff.
- `TC-XAUDIT-009`: Delegated engineer resubmits rejected items only.
- `TC-XAUDIT-010`: Original item becomes `resubmitted`; new item becomes `pending`.
- `TC-XAUDIT-011`: Resubmit audit actor is delegated engineer and includes before/after/diff.
- `TC-XAUDIT-012`: Resubmitted active batch remains visible to delegated engineer.
- `TC-XAUDIT-013`: Resubmitted request retains proxy submission marker.
- `TC-XAUDIT-014`: TypeScript, core QC, lint, build, and diff whitespace checks remain green.

## Data Requirements

- Demo manager, engineer, admin, and PDM admin users.
- Running local Next server with `PDM_BASE_URL`.
- SQLite test database in `data/ai-pdm.sqlite`.
- Unique temporary project/root/part/drawing fixture.
- Active delegation row from manager to engineer limited by project, action, and time window.
- Manager role scope rules limited to fixture project/action.
- PDM admin decoy task and notification to prove visibility isolation.

## Pass Criteria

- `npm.cmd run qc:pdm-numbering-cross-role-audit-e2e` passes with zero failed checks.
- `npm.cmd run qc:pdm-numbering-core` passes and exposes the cross-role audit E2E script.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` or build TypeScript phase exits 0.
- `npm.cmd run lint` exits 0.
- `cmd /c npm run build` exits 0.
- `git diff --check` exits 0 or reports CRLF warnings only.
- Test server port is cleaned up after validation.

## Evidence To Collect

- Cross-role audit E2E script JSON result including total/pass/fail counts.
- Fixture project/root/part/drawing identifiers.
- Manager and delegated engineer batch/task/notification visibility results.
- Marker evidence for `delegated_review`, `proxy_submission`, and `impact_scope`.
- Original and resubmitted approval batch item statuses.
- Decision audit action `numbering.approval_batch.decision`.
- Resubmit audit action `numbering.approval_batch.resubmit_rejected`.
- Build/lint/core/diff command results.
