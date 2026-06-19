# QA Plan - AI BOM Impact Summary

Date: 2026-05-26

## Objective

Validate that the read-only AI assistant can summarize submission impact using BOM diff and Where-used data, so reviewers can quickly understand what changed and what may be affected.

## Scope

- AI tool `get_submission_detail`.
- Chat requests with `context.currentSubmissionId`.
- BOM diff summary in AI answer.
- Where-used impact summary in AI answer.
- Source references for submission, files, BOM diff, and Where-used.
- Existing AI guardrails and tool whitelist.

## Acceptance Criteria

- AI remains read-only and cannot approve, reject, delete, revise, release, publish, or mutate PDM records.
- `get_submission_detail` still requires readable submission permission.
- AI answer for a submission with previous BOM includes BOM diff added/removed/changed/unchanged counts.
- AI answer for a submission part used by parent BOMs includes Where-used parent impact count.
- AI answer includes file list and missing handoff file hints.
- AI answer returns traceable sources for the submission, files, BOM diff, and Where-used when available.
- Existing auth, chat conversation, policy RAG, BOM schema, BOM auto-draft, BOM diff, Where-used, UI, and file hash regressions remain green.

## Required QC Evidence

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:api`
- `npm.cmd run qc:ui`
- `npm.cmd run qc:file-hashes`
- API regression must include AI tests proving BOM diff text, Where-used text, and source references are present in contextual submission summaries.
