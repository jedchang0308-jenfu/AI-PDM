# QA Validation Plan - AI Submission Summary

Date: 2026-05-27

## Scope

Validate the P1 AI submission summary shown when a reviewer opens a submission. The first implementation is deterministic and source-traceable, so it does not depend on an external LLM provider.

## User View

- Reviewer opens a submission and immediately sees a concise summary before digging into files.
- Summary covers change reason, submitted files, revision history, BOM diff, Where-used impact, and missing PDF/DWG handoff files.
- Each summary section exposes traceable sources so reviewers can verify the statement.
- Engineer visibility remains scoped to their own submissions.

## RD FMEA

| Risk | Failure mode | Validation |
| --- | --- | --- |
| Permission leakage | Engineer reads another Engineer's summary | API regression expects 403 |
| Incomplete summary | Required section is omitted | API regression checks all required section keys |
| Weak traceability | Summary text has no source links | API regression checks source count and source types |
| Wrong impact signal | BOM diff or Where-used not included when data exists | API regression seeds BOM diff and parent usage |
| Missing-file blind spot | Missing DWG/PDF not surfaced | API regression checks missing file roles |
| UI hidden | Reviewer cannot see summary in dashboard | Build/UI regression verifies dashboard render path still loads |

## Validation Commands

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:api`
- `npm.cmd run qc:ui`
- `npm.cmd run qc:file-hashes`

## Acceptance

- All validation commands pass.
- `SUMMARY-001` through `SUMMARY-012` pass in `scripts/qc-api-test.mjs`.
- `PDM_dev_task.md` marks `P1 建立 AI 送審摘要` complete only after QC pass.
