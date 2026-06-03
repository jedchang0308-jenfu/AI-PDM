# QA Validation Plan - PDM Numbering Approval Rule Evaluator

Date: 2026-06-01
Task: DEV-PDM-NUMBERING-001
Scope: configurable numbering approval-rule evaluator, rule simulator route, default rules, and non-disableable hard limits.

## Validation Scope

- Verify `approval_rules` has default active rules for the current numbering rule version.
- Verify rule templates remain seeded for the three built-in modes.
- Verify repository exposes `evaluateApprovalRules`.
- Verify evaluator accepts action, phase, record status, item kind, and risk flags.
- Verify evaluator returns approval requirement, usage/release blocks, warning/export markers, roles, matched configurable rules, and hard rules.
- Verify hard limits remain in code and cannot be disabled by matrix settings.
- Verify `/api/numbering/rule-simulator` supports the new approval evaluator without breaking the existing DVT/Release MA gate simulator.

## User Critical Flows

- Admin simulates a matrix rule before saving settings.
- RD action such as `update_name` in DVT returns manager/admin review requirements based on configured rules.
- High-similarity risk returns warning-only behavior.
- Duplicate code, multiple primary MA, unrevised released documents, or invalid main drawing return hard blocks independent of configurable rows.
- Missing MA drawing from DVT/Release returns approval requirement and export marker for override visibility.

## FMEA

| Failure Mode | Cause | Effect | Detection | Priority | Countermeasure |
|---|---|---|---|---|---|
| Matrix can disable uniqueness | Configurable rows own all decisions | Duplicate root/part/drawing could be approved | QC source check | High | `DUPLICATE_CODE_HARD_BLOCK` in repository code |
| Rule simulator only handles MA gate | Route not extended | Admin cannot preview matrix behavior | Route source/build check | High | `rule-simulator` dispatches to `evaluateApprovalRules` when `actionCode` exists |
| No default approval rules | Seed missing | Fresh install matrix returns no controls | SQLite QC check | High | Seed approval rules under `numbering-rule-v1` |
| High similarity blocks RD | Risk treated as blocker | RD loses efficiency despite user decision | Hard-rule check | Medium | `HIGH_SIMILARITY_WARNING_ONLY` |
| Override not marked | Evaluator omits marker | Exceptions invisible in UI/export | QC source check | Medium | `OVERRIDE_AUDIT_MARKER_REQUIRED` sets `exportMarker` |
| Route breaks existing gate simulator | Replaced old logic | DVT/Release MA simulation regresses | Build and source check | Medium | Route keeps `evaluateNumberingGate` fallback |

## Test Cases

- `NUM-SCHEMA approval rules seeded`.
- `NUM-SCHEMA rule templates seeded`.
- `NUM-REPO evaluates configurable approval rules`.
- `NUM-REPO keeps hard approval limits outside matrix toggles`.
- `NUM-REPO db.ts re-exports approval rule evaluator`.
- `NUM-API rule simulator route calls gate and approval evaluators`.
- Existing approval, duplicate, restore, and MA gate checks remain passing.

## Pass Criteria

- `npm.cmd run qc:pdm-numbering-core` returns 72/72 passed.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` returns exit code 0.
- `npm.cmd run lint` returns exit code 0.
- `cmd /c npm run build` returns exit code 0 and includes `/api/numbering/rule-simulator`.

## Evidence Collection

- Targeted QC JSON output.
- TypeScript/lint/build exit status.
- Build route list.
- Source checks for hard limits and evaluator exports.
