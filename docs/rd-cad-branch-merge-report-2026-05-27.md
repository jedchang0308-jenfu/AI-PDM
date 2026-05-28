# RD Report - CAD Branch / Merge

## Scope

- Dev task: `P2` CAD branch / merge.
- Goal: extend the existing sandbox branch workflow into an explicit lightweight CAD branch / merge loop.

## Implemented

- Added merge tracking fields to `sandbox_branches`:
  - `merged_by`
  - `merged_at`
  - `merge_summary_json`
- Added SQLite startup compatibility columns for existing local databases.
- Added Postgres initial schema parity.
- Added `getSandboxMergePreview(branchId)`:
  - compares source vs sandbox metadata fields
  - compares file role/name/hash/size
  - compares CAD references
  - returns `can_merge`, `change_count`, field changes, file diff, and reference diff
- Added explicit sandbox merge operation:
  - `PATCH /api/submissions/[id]/sandbox/[branchId]` with `action: "merge"`
  - only active branches can merge
  - only Pending sandbox submissions can merge
  - records merge summary and audit log
  - marks branch as promoted so existing approval/release flow can continue
- Added `GET /api/submissions/[id]/sandbox/[branchId]` to read branch detail and merge preview.
- Updated dashboard sandbox panel:
  - active branch action now exposes `Merge`
  - merged branches display as `merged`
- Added API regression cases `SANDBOX-015` to `SANDBOX-019`.

## Notes

- This is a high-efficiency CAD branch / merge implementation using the PDM submission graph, metadata, file fingerprints, and CAD references.
- It does not attempt binary SolidWorks geometry merge. True file-level CAD merge remains outside the current Web/API runtime and would require CAD workstation tooling or a vendor API.
