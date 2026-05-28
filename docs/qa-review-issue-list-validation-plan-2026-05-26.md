# QA Validation Plan - Review Issue List

Date: 2026-05-26

## Scope

Validate the P1 review issue list for submission/file review work. The feature must let reviewers or engineers record actionable issues, optionally bind them to a submitted file, list issues from the submission detail, and close issues with resolution evidence.

## User View

- Reviewer can create a concrete issue while checking a submission without leaving the review detail.
- Reviewer can mark whether the issue is file-specific or applies to the whole submission.
- Reviewer can see open versus resolved issues, owner, creation time, and resolution text.
- Engineer cannot inspect another engineer's submission issues.
- Unauthenticated users cannot read or create issues.

## RD FMEA

| Risk | Failure mode | Validation |
| --- | --- | --- |
| Permission leakage | Engineer reads another engineer's review issues | API regression expects 403 on cross-owner issue list |
| Wrong file binding | Issue references a file from another submission | API regression expects 400 on cross-submission file ID |
| Weak issue data | Empty title/description creates unusable review work | API regression checks title validation and created payload |
| Lost closure evidence | Resolved issue does not keep resolver/time/resolution | API regression checks resolved status and metadata |
| UI unusable in review | Issue list absent from Dashboard detail | Build/UI regression verifies Dashboard still renders and API path is reachable |
| Audit gap | Create/resolve events are not traceable | API path writes `ReviewIssueCreated` and `ReviewIssueResolved` audit logs |

## Validation Commands

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:api`
- `npm.cmd run qc:ui`
- `npm.cmd run qc:file-hashes`

## Acceptance

- All validation commands pass.
- `ISSUE-001` through `ISSUE-013` pass in `scripts/qc-api-test.mjs`.
- `PDM_dev_task.md` marks `P1 建立審核問題清單` complete only after QC pass.
