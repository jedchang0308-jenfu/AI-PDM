# Production Readiness Industrialization Gate Verification - 2026-05-28

## Scope

- Keep `qc:production-readiness` aligned with the current `dev_task.md` scope after the industrialization backlog was added.
- Specifically ensure `DEV-IND-007` cannot be hidden from production readiness while the live Supabase migration/advisor/RLS gate is still blocked.

## RD Changes

- `scripts/qc-production-readiness-test.mjs` now parses the Industrialization Optimization Backlog `Task Overview` in addition to the P0/P1/P2 task tables.
- `DEV-IND-007` is classified as `external_supabase_shadow` and carries explicit evidence that a disposable AI_PDM Supabase project or branch is still required.
- Added `scripts/qc-production-readiness-industrialization-gate.mjs` to assert the readiness report includes the `DEV-IND-007` blocker.
- Added `qc:production-readiness-industrialization-gate` to `package.json`.
- Added the blocker-coverage check to `qc:industrialization`.

## QA Validation Plan

| Case | Priority | Method | Pass criteria |
|---|---|---|---|
| PR-IND-001 | P0 | Run production readiness in allow-open mode. | Command exits 0 and emits parseable JSON. |
| PR-IND-002 | P0 | Inspect tracked task count. | Industrialization overview tasks are included. |
| PR-IND-003 | P0 | Inspect blockers. | `DEV-IND-007` appears as a blocker while its status is `[!]`. |
| PR-IND-004 | P0 | Inspect blocker category and evidence. | Category is `external_supabase_shadow`; evidence is not ready without a disposable target. |
| PR-IND-005 | P1 | Run industrialization gate. | New readiness blocker coverage step is included and the gate passes. |

## FMEA

| Failure mode | Cause | Effect | Detection | Control |
|---|---|---|---|---|
| Supabase live gate is omitted from production readiness | Readiness parser only reads P0/P1 tables | System can look production-ready while provider-switch validation is blocked | QC asserts `DEV-IND-007` appears in blockers | Parse industrialization Task Overview |
| Wrong category hides required external target | Generic open-task classification | Handoff does not identify disposable Supabase target need | QC checks `external_supabase_shadow` | Dedicated classifier and evidence payload |
| Future parser regression | Refactor drops industrialization overview support | Readiness under-reports blockers again | `qc:production-readiness-industrialization-gate` | Include it in `qc:industrialization` |

## QC Evidence

- `npm.cmd run qc:production-readiness-industrialization-gate`
  - PASS: readiness report includes `DEV-IND-007` as `external_supabase_shadow`.
  - PASS: blocker evidence remains not ready with `missing_disposable_supabase_target`.
- `npm.cmd run qc:production-readiness:report`
  - PASS in allow-open mode.
  - `ready=false`.
  - Tracked tasks include the industrialization overview.
  - Blockers include the four external field/readiness gates plus `DEV-IND-007`.
- `npm.cmd run qc:industrialization`
  - PASS with the new production readiness blocker coverage step.

## Result

PASS. Production readiness now accounts for the blocked Supabase live shadow gate instead of only reporting the field and real-machine evidence blockers.
