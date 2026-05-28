# RD Report - Where-used

Date: 2026-05-26

## Scope

Implemented lightweight single-level Where-used lookup for child parts referenced by Engineering BOM lines.

## Completed Work

- Added `WhereUsedEntry` type in `src/lib/types.ts`.
- Added `listWhereUsed` helper in `src/lib/db.ts`.
- Added `GET /api/items/[partNumber]/where-used`.
- Added Dashboard Where-used section for the selected submission part number.
- Added API regression coverage `WHEREUSED-001` through `WHEREUSED-011`.

## Behavior

- Where-used searches `bom_lines.child_part_number`.
- Results include parent submission id, parent part number, drawing number, revision, parent status, BOM status, quantity, child revision, and source filename.
- Engineer users only see parent submissions they are allowed to read.
- Manager/Admin users can see readable team parent submissions.
- Unused parts return HTTP 200 with an empty list.

## RD Fix During QC

Initial QC exposed an unstable default BOM diff comparison when base and target submissions were created within the same timestamp window. The previous BOM lookup now orders by SQLite insertion order as a stable tiebreaker.

## RD Self-Check

- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.
- Build route list includes `/api/items/[partNumber]/where-used`.
