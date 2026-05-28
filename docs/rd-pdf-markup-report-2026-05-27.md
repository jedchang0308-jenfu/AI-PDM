# RD Report - PDF Markup

Date: 2026-05-27

## Scope

Implemented P2 lightweight PDF Markup. This stores page/position text annotations outside the PDF binary, keeping the original file immutable.

## Implementation

- Added `pdf_markups` schema to SQLite and PostgreSQL schema.
- Added `PdfMarkup` type.
- Added DB helpers for listing, creating, reading, and resolving PDF markups.
- Added APIs:
  - `GET /api/submissions/[id]/pdf-markups`
  - `POST /api/submissions/[id]/pdf-markups`
  - `PATCH /api/submissions/[id]/pdf-markups/[markupId]`
- API validates submission read scope, file ownership, PDF-only files, positive page number, coordinate percent range, and body length.
- Added Dashboard `PDF markups` panel with list, page/X/Y/body creation form, and resolve action.
- Added API regression coverage `MARKUP-001` through `MARKUP-012`.

## Validation

Final QC passed on 2026-05-27:

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:api` with `248 passed / 0 failed`
- `npm.cmd run qc:ui` with `26 passed / 0 failed`
- `npm.cmd run qc:file-hashes` with `1424 checked / 1424 ok`

See `docs/qc-pdf-markup-validation-report-2026-05-27.md`.
