# QA Plan - BOM Schema

Date: 2026-05-26

## Objective

Validate the first BOM data foundation for the PDM system without introducing a heavy PLM process.

## Scope

- `bom_headers` and `bom_lines` tables.
- `/api/submissions/[id]/bom`
- Materializing a BOM draft from CAD assembly references.
- Submission detail exposure of materialized BOM data.

## Acceptance Criteria

- Unauthenticated users cannot read or materialize BOM data.
- Engineer users can materialize and read BOM data for their own submissions.
- Engineer users cannot read another engineer's BOM data.
- Manager/Admin users can read BOM data across the team.
- BOM header stores parent submission, parent item, parent revision, status, source, and line count.
- BOM lines store child part number, child revision, quantity, source file, and source reference.
- BOM materialization preserves quantity from `file_references`.
- Existing submission, review, release package, handoff, notification, auth, AI, and file hash flows remain green.

## Required QC Evidence

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:api`
- API regression must include `BOM-001` through `BOM-009`.
