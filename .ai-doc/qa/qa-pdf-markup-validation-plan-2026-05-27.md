# QA Validation Plan - PDF Markup

Date: 2026-05-27

## Scope

Validate lightweight PDF Markup for submitted PDF files. The feature stores review annotations as structured records tied to a PDF file, page number, normalized X/Y coordinates, note text, author, and resolved status. It does not modify the original PDF binary.

## User View

- Reviewer or Engineer can add a note to a visible PDF with page and approximate position.
- Markups stay attached to the submission/file and are visible in the submission detail.
- Open markups can be resolved with resolver and timestamp evidence.
- Engineer visibility remains scoped to their own submissions.

## RD FMEA

| Risk | Failure mode | Validation |
| --- | --- | --- |
| Permission leak | Engineer reads another Engineer's PDF markups | API regression expects 403 |
| Wrong file binding | Markup is created on a file from another submission | API regression expects 400 |
| Non-PDF misuse | Markup is created for non-PDF file | API validation checks file role/extension |
| Bad coordinates | Page or coordinates are invalid | API regression expects 400 |
| Lost closure evidence | Resolved markup lacks resolver/time | API regression checks resolved metadata |
| Binary corruption | Markup alters stored PDF | File hash regression must remain green |

## Validation Commands

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:api`
- `npm.cmd run qc:ui`
- `npm.cmd run qc:file-hashes`

## Acceptance

- All validation commands pass.
- `MARKUP-001` through `MARKUP-012` pass in `scripts/qc-api-test.mjs`.
- Dashboard detail shows PDF markup list and creation controls for PDF files.
- `PDM_dev_task.md` marks `P2 PDF Markup` complete only after QC pass.
