# QA Validation Plan - Approval Matrix

## User-Focused Risks

- A submission releases after only one reviewer even though a role matrix is enabled.
- Engineer users can enable or waive matrix requirements.
- A satisfied role requirement does not update after the matching role approves.
- Waived requirements still block release.
- Existing one/two reviewer approval behavior regresses.

## RD FMEA

| ID | Failure mode | Effect | Control |
| --- | --- | --- | --- |
| MATRIX-FMEA-001 | Matrix table not created | API fails at runtime | Build plus API route tests |
| MATRIX-FMEA-002 | Role count uses total approvals instead of role-specific approvals | Wrong release decision | Manager/Admin role-specific API scenario |
| MATRIX-FMEA-003 | Matrix requirement is skipped | Release before required role approvals | Approval-matrix open-requirement regression tests |
| MATRIX-FMEA-004 | Waive action has weak authorization | Engineer can bypass approval | Engineer forbidden test |
| MATRIX-FMEA-005 | UI load error breaks detail panel | User cannot review submission | UI smoke test |

## QC Cases

- Run lint.
- Run production build.
- Run API QC suite and verify:
  - `MATRIX-001` unauthenticated list is blocked.
  - `MATRIX-002` Engineer cannot initialize matrix.
  - `MATRIX-003` to `MATRIX-005` Manager initializes default two-role matrix.
  - `MATRIX-006` to `MATRIX-009` Manager approval satisfies Manager role but keeps Admin role open.
  - `MATRIX-010` to `MATRIX-011` Admin approval releases the submission.
  - `MATRIX-012` to `MATRIX-015` Manager waiver allows release when Admin role is waived.
- Run UI smoke suite.
- Run file hash integrity check.

## Pass Criteria

- All automated checks pass.
- Approval matrix blocks release until all open requirements are satisfied or waived.
- Existing approval, sandbox, change request, file, and UI tests remain passing; retired PLM phase-gate behavior must stay absent under `DEV-054`.
