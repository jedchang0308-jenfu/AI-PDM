# QA Validation Plan - AI Risk Hints

Date: 2026-05-27

## Scope

Validate deterministic AI risk hints for a submission. These hints must warn reviewers without approving, rejecting, or modifying data.

## User View

- Reviewer sees risk hints near the AI summary in the submission detail.
- Risk hints cover missing PDF/DWG, newer revision on the same part number, multiple parent assemblies using the part, and Released filename conflicts.
- Each risk provides sources and a suggested next action.
- Engineer visibility remains scoped to their own submissions.

## RD FMEA

| Risk | Failure mode | Validation |
| --- | --- | --- |
| Permission leakage | Engineer reads another Engineer's risks | API regression expects 403 |
| Missing handoff blind spot | Missing PDF/DWG is not detected | API regression checks `missing_handoff_file` |
| Revision blind spot | Older submission does not warn about newer revision | API regression checks `newer_revision_exists` |
| Impact blind spot | Multi-parent Where-used impact is not detected | API regression seeds two parent assemblies |
| Release conflict blind spot | Pending same filename does not warn before approval | API regression checks `released_filename_conflict` |
| Overreach | Risk feature mutates submission status | Regression uses read-only GET and existing approval tests remain pass |

## Validation Commands

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:api`
- `npm.cmd run qc:ui`
- `npm.cmd run qc:file-hashes`

## Acceptance

- All validation commands pass.
- `RISK-001` through `RISK-011` pass in `scripts/qc-api-test.mjs`.
- `PDM_dev_task.md` marks `P1 建立 AI 風險提示` complete only after QC pass.
