# RD Report - Approval Matrix

## Scope

- Dev task: `P2` 複雜多層簽核矩陣。
- Goal: add a lightweight, high-speed configurable approval matrix without replacing the existing one/two reviewer workflow.

## Implementation

- Added `approval_matrix_requirements` table for submission-scoped role requirements.
- Added default matrix requirements:
  - `R&D Manager`: 1 approved reviewer.
  - `Admin`: 1 approved reviewer.
- Added DB helpers to initialize, list, refresh, waive, and block open approval matrix requirements.
- Added API routes:
  - `GET /api/submissions/[id]/approval-matrix`
  - `POST /api/submissions/[id]/approval-matrix`
  - `PATCH /api/submissions/[id]/approval-matrix/[requirementId]`
- Extended approve flow:
  - Existing `approval_required` remains active.
  - Required phase gates still block first.
  - If the approval matrix is enabled, all open role requirements must be satisfied or waived before release.
- Added Dashboard panel for enabling matrix, viewing role status, and waiving open requirements.
- Added QC API coverage `MATRIX-001` to `MATRIX-015`.

## Notes

- This implementation avoids changing the existing `submissions.approval_required` SQLite CHECK constraint.
- The matrix is optional per submission. Existing submissions without matrix requirements keep the current behavior.
