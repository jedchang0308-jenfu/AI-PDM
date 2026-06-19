# QA Validation Plan: DEV-FIELD-001 Field Issue Intake

Date: 2026-06-02
Scope: field issue JSON intake and conversion into `data/quality/defect-register.json`.

## 驗證範圍

- Validate `field-test:issues:import` can parse a field issue bundle.
- Confirm dry-run reports import candidates without mutating the defect register.
- Confirm `--write` imports or updates defects with owner, evidence, reproduction steps, expected result, actual result, and source metadata.
- Confirm active P0/P1 field defects block `qc:defects-zero`.
- Confirm repeated imports are idempotent.
- Confirm incomplete active blocking issues are rejected before writing.

## FMEA 風險表

| Failure mode | Cause | Effect | Detection | Countermeasure |
|---|---|---|---|---|
| Field issue is lost after testing | No structured intake path | Failed field case disappears from readiness closure | `qc:field-test-issue-intake` | Require `field-issues.json` schema and import command |
| P0/P1 issue is recorded but does not block release | Import bypasses defect-zero gate | Production readiness false pass | `qc:defects-zero` after import | Active P0/P1 defects must remain blocking |
| Re-import duplicates defects | Import is append-only without keying | Defect register becomes noisy | Idempotency fixture | Use `defectId` / issue id as stable merge key |
| Weak issue evidence | Missing owner/evidence/repro for active blocker | RD cannot reproduce or close issue | Invalid fixture | Reject incomplete active blocking issue |

## 測試案例

| ID | Test | Pass criteria |
|---|---|---|
| QA-FIELD-ISSUE-001 | Dry-run valid issue bundle | Command exits 0 and register remains unchanged |
| QA-FIELD-ISSUE-002 | Write valid P1 and P3 field issues | Defects are imported with source metadata |
| QA-FIELD-ISSUE-003 | Run defect-zero after active P1 import | `qc:defects-zero` fails and reports one active P0/P1 |
| QA-FIELD-ISSUE-004 | Re-run same import | Import reports unchanged items, no duplicate defects |
| QA-FIELD-ISSUE-005 | Import invalid active P1 issue | Command exits non-zero and names missing owner/evidence |

## 通過標準

- `npm.cmd run qc:field-test-issue-intake` passes 100%.
- Real `data/quality/defect-register.json` is not mutated by QC fixture execution.
- `DEV-FIELD-001` remains blocked until formal field issues are either absent with signed evidence or imported and closed/verified.

## 證據收集方式

- QC command JSON output.
- Temporary fixture register under `.tmp/qc-field-test-issue-intake`.
- Updated handoff package checklist and manifest.
