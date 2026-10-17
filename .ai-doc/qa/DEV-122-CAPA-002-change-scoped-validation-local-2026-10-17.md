# DEV-122 / CAPA-002 changed-responsibility validation local checkpoint

Date: 2026-10-17  
Scope: AI-PDM project-wide validation routing and one-PR convergence  
Branch: `codex/dev122-change-scoped-release-routing`  
Executable snapshot validated before this evidence-only update: `6845709c788e8d6c693ad56cdd5af9028bbb5c35`

## Result

`LOCAL_RD_IMPLEMENTED / PROVIDER_REQUIRED_CI_PENDING`

This checkpoint proves the source-controlled planner, affected test runner, shared worker-profile boundary, and workflow routing on the local source snapshot. It is not production release authority, a production RD-account acceptance, or whole DEV-122 acceptance.

## Facts

- The planner classifies documentation, application, authorization, database, preview, recognition, worker, infrastructure, shared release-control, and unknown paths. Shared release-control, unknown paths, and an empty change set fail closed to `FULL`.
- Required GitHub check names remain unchanged. Their jobs always execute the planner contract and route their internal work by changed responsibility.
- Protected owner workflows use the same source-controlled runner. The owner profile always retains release-core checks; a `FULL` plan retains the legacy continuous release suite.
- Historical worker validation is centralized in `scripts/lib/dev122-openswx-profile-context.mjs`. Explicit historical mode remains authoritative even when provider-shape fields match the current profile, and accepted bytes remain bound to the expected profile hash.
- One independently releasable slice uses one active PR. Additional fixes and CI reruns stay on that PR until source convergence; a new corrective PR is required only after merge or for a separate responsibility.

## Local validation

| Validation | Result | Notes |
|---|---:|---|
| Planner and profile focused contracts | PASS | 15/15 before upstream integration; current profile suite 6/6 after explicit-historical correction. |
| Current upstream intersection | PASS | Bootstrap + profile + planner aggregate: 85/87 in sandbox; the only two failures were Windows `EPERM` on realpath/local Git fixture. The exact two cases passed 2/2 outside the sandbox. |
| Shared release/worker contract aggregate | PASS | 425/425 on the executable source before the evidence-only update; upstream changed only the owner historical-mode boundary and its test, which the current intersection rerun covers. |
| Role catalog v7 | PASS | 3/3. |
| Abort/recovery contracts | PASS | 6/6. |
| Database boundary | PASS | 22 governed files; no cross-schema ownership expansion. |
| Application typecheck | PASS | `typecheck:app`. |
| Isolated build | PASS | artifact, primary-data invariant, and cleanup all true after making the existing dependency tree visible to the dedicated worktree. |
| Lint | PASS | Full lint: 0 errors, 8 pre-existing unrelated warnings. Changed executable scripts: 0 errors/warnings. |
| Workflow syntax | PASS | CI and both protected owner workflow YAML files parsed successfully. |
| Planner self-classification | PASS | This shared-control change correctly routes itself to `FULL`; no self-exemption. |

The earlier all-in-one local affected runner stopped at one Windows path-length fixture after 356/357 passed. That fixture was repaired to use a short task-owned system-temp path and then passed; the later 425/425 shared aggregate includes the repaired case. The canonical required checks must still pass on the PR provider runner.

## Boundaries retained

- No production migration, database write, deployment, candidate, traffic, IAM, Secret, worker, Scheduler, or OrgMaster grant mutation was executed.
- Existing branch protection, exact-main proof, immutable capsule, release recovery, and production authorization boundaries are unchanged.
- CAPA-002 changes validation routing and delivery convergence; it does not mark the RD production scenario or any other DEV-122 outcome complete.
- DEV-122 remains `NOT_ACCEPTED`; administrator recognition, PDF preview, supplier, native CAD, and remaining original acceptance groups keep their existing status.

## Pending evidence

1. Both provider-required PR checks on the exact PR merge candidate.
2. Review and merge through the protected-main process.
3. Production release and real RD actor positive/negative acceptance only under their separate production authorization and existing owner workflow.
