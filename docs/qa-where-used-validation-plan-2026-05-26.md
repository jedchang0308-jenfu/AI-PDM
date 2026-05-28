# QA Plan - Where-used

Date: 2026-05-26

## Objective

Validate a lightweight Where-used capability so engineers can quickly see which assemblies or submissions use a selected child part before changing it.

## Scope

- `GET /api/items/[partNumber]/where-used`
- Single-level reverse lookup from `bom_lines.child_part_number`.
- Dashboard detail Where-used summary for the current submission part number.
- Existing BOM schema, BOM auto-draft, and BOM diff behavior.

## Acceptance Criteria

- Unauthenticated users cannot read Where-used data.
- Engineer users only see parent submissions they are allowed to read.
- Manager/Admin users can see readable team parent submissions.
- A used child part returns parent submission id, parent part number, drawing number, revision, status, quantity, child revision, and BOM status.
- An unused part returns an empty list with HTTP 200.
- Dashboard detail shows a Where-used section for the selected part number.
- Existing submission, review, release package, handoff, notification, auth, AI, file hash, BOM schema, BOM auto-draft, and BOM diff regressions remain green.

## Required QC Evidence

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:api`
- `npm.cmd run qc:ui`
- `npm.cmd run qc:file-hashes`
- API regression must include Where-used tests for unauthorized access, engineer visibility, manager visibility, cross-engineer scoping, and unused part empty results.
