# QA Validation Plan - CAD Branch / Merge

## User-Focused Risks

- Engineer creates a sandbox branch but cannot see what will be merged.
- Sandbox branch can be released without an explicit merge decision.
- Merge loses traceability between source submission and sandbox submission.
- Merge can be repeated or applied to the wrong branch state.
- Existing approval, release, package, and sandbox workflows regress.

## RD FMEA

| ID | Failure mode | Effect | Control |
| --- | --- | --- | --- |
| CADMERGE-FMEA-001 | Merge preview is inaccessible | User cannot review branch delta | API GET preview test |
| CADMERGE-FMEA-002 | Preview misses sandbox revision delta | Merge is not traceable | Revision field-change test |
| CADMERGE-FMEA-003 | Merge does not record evidence | No audit trail for branch merge | `merged_at` and summary response tests |
| CADMERGE-FMEA-004 | Active sandbox remains blocked after merge | Branch cannot enter release flow | Approval after merge regression |
| CADMERGE-FMEA-005 | Existing sandbox behavior regresses | Prototype workflow breaks | Existing `SANDBOX-001` to `SANDBOX-014` regression |

## QC Cases

- Run TypeScript check.
- Run lint.
- Run production build.
- Run API QC suite and verify:
  - `SANDBOX-015` engineer reads sandbox merge preview.
  - `SANDBOX-016` merge preview is mergeable.
  - `SANDBOX-017` merge preview detects sandbox revision change.
  - `SANDBOX-011` engineer merges own sandbox branch.
  - `SANDBOX-018` merged sandbox branch records `merged_at`.
  - `SANDBOX-019` merged sandbox branch returns summary.
  - `SANDBOX-013` to `SANDBOX-014` merged sandbox can still approve and release.
- Run UI smoke suite.
- Run file hash integrity check.

## Pass Criteria

- All automated checks pass.
- Merge preview and merge action are traceable by API.
- Existing sandbox branch, approval, release package, supplier, procurement, and handoff regressions remain passing.
