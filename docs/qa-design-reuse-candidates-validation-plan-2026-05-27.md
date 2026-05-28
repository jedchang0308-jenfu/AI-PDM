# QA Validation Plan - Design Reuse Candidates

Date: 2026-05-27

## Scope

Validate P1 design reuse candidate hints. The feature must recommend existing submissions based on metadata and filename similarity before engineers create or revise another design. It must not use geometry comparison in this phase.

## User View

- Engineer opens a submission and sees candidate prior designs that may be reusable.
- Candidate reasons explain why the design matched: part number family, part name keyword, material, surface finish, document type, or file name.
- Engineer visibility remains scoped to their own submissions.
- Manager can see candidates across submissions.

## RD FMEA

| Risk | Failure mode | Validation |
| --- | --- | --- |
| Bad permission scope | Engineer sees another Engineer's candidate | API regression expects scoped empty/exclusion |
| No useful reason | Candidate appears without explanation | API regression checks match reasons |
| Weak matching | Material/surface/name/file similarity not scored | API regression seeds a similar candidate and checks it ranks |
| Self-match noise | Current submission appears as its own candidate | API regression checks current submission is excluded |
| Overclaiming geometry | Feature implies duplicate geometry search | UI/API name is metadata reuse candidate, not geometry duplicate |

## Validation Commands

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:api`
- `npm.cmd run qc:ui`
- `npm.cmd run qc:file-hashes`

## Acceptance

- All validation commands pass.
- `REUSE-001` through `REUSE-010` pass in `scripts/qc-api-test.mjs`.
- `PDM_dev_task.md` marks `P1 建立「設計重用候選」提示` complete only after QC pass.
