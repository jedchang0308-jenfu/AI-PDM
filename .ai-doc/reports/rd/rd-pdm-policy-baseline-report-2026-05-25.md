# RD Report: PDM Policy Baseline

Date: 2026-05-25  
Scope: P1 PDM management policy baseline and alignment verification

## Summary

Formalized the current implemented PDM rules into a clean UTF-8 policy baseline and added an automated QC check so policy, AI RAG source data, and implemented behavior stay aligned.

This does not replace final management approval. `P0 正式 PDM 管理辦法確認` remains open until the company confirms production rules.

## Changes

- Replaced the corrupted policy draft with `.ai-doc/reference/pdm-management-policy-draft.md`.
- Documented baseline rules for drawing number, part number, revision, file submission, approval, release, duplicate Released filenames, and AI read-only limits.
- Confirmed MVP baseline behavior:
  - `approval_required=2` requires two distinct reviewers.
  - Released duplicate filenames are blocked and returned as an error.
- Added `scripts/qc-policy-alignment-test.mjs`.
- Added `npm.cmd run qc:policy-alignment`.
- Added policy alignment to `npm.cmd run qc:full`.
- Updated QA validation plan and task tracking.

## Verification

Run:

```powershell
npm.cmd run policy:rag:build
npm.cmd run qc:policy-alignment
npm.cmd run qc:full
```

Expected:

- Policy RAG generated data includes the updated baseline policy.
- Policy alignment check passes.
- Full QC remains green.

## Remaining P0

- Management must still approve the final production PDM management policy.
- Company must decide whether long-term Released duplicate filename handling stays blocked or becomes a controlled archive/versioning workflow.
