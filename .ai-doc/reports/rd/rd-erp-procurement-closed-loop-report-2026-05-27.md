# RD Report - ERP / Inventory / Procurement Closed Loop

## Scope

- Dev task: `P2` 完整 ERP / 庫存 / 採購閉環。
- Goal: move beyond read-only procurement export by adding outbound sync runs and acknowledgement tracking.

## Implementation

- Added `procurement_sync_runs` table.
- Added sync management APIs:
  - `GET /api/integrations/procurement/sync-runs`
  - `POST /api/integrations/procurement/sync-runs`
  - `PATCH /api/integrations/procurement/sync-runs/[runId]`
- Added generic targets:
  - `ERP`
  - `inventory`
  - `procurement`
- Sync creation requires a Released submission with release package.
- Sync payload includes drawing, revision, part, release package, and BOM lines when available.
- Sync run starts as `sent` and can be closed as `acknowledged` or `failed`.
- Dashboard released-detail view can create and acknowledge sync runs.
- Added API regression coverage `ERPSYNC-001` to `ERPSYNC-012`.

## Notes

- This does not hard-code a vendor-specific ERP API.
- The closed loop is represented as PDM-side outbound payload plus external acknowledgement evidence.
