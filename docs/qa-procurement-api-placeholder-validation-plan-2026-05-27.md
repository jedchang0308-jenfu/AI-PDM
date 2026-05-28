# QA Validation Plan - P2 ERP / Procurement API Placeholder

Date: 2026-05-27

## Scope

Validate a lightweight procurement integration API that exposes released package metadata in a stable machine-readable format without building a full ERP sync.

## User Scenarios

1. Procurement or ERP middleware reads latest Released submissions through an authenticated API.
2. API consumer filters releases by `since` timestamp for incremental polling.
3. API consumer filters by part number when preparing a purchase update.
4. Unauthorized users cannot read procurement integration data.
5. Response includes release package, file hashes, BOM lines and approval trail but excludes local server paths.

## RD FMEA

| Risk | Failure Mode | Validation |
| --- | --- | --- |
| Unauthorized data access | External integration endpoint is public | API test expects 401 without auth and 403 for Engineer |
| Leaking server paths | Response includes `local_path` or internal audit logs | API test string-checks response for sensitive fields |
| Wrong release scope | Pending/Rejected submissions appear | API test verifies returned entries are Released only |
| Bad incremental sync | `since` filter returns older releases | API test verifies response respects timestamp filter |
| Hard ERP coupling | API assumes a specific ERP schema | Response remains generic JSON with stable PDM identifiers |

## QC Cases

- `PROCAPI-001` unauthenticated procurement releases returns 401.
- `PROCAPI-002` Engineer procurement releases returns 403.
- `PROCAPI-003` Manager procurement releases returns 200.
- `PROCAPI-004` response includes released submission and package metadata.
- `PROCAPI-005` response includes file hashes and BOM payload shape.
- `PROCAPI-006` response excludes `local_path`, `token_hash`, and `audit_logs`.
- `PROCAPI-007` `partNumber` filter returns the target release.
- `PROCAPI-008` future `since` filter returns empty result.

## Pass Criteria

- All listed QC cases pass.
- `npm.cmd run lint` passes.
- `npm.cmd run build` passes and includes `/api/integrations/procurement/releases`.
- Existing `qc:api`, `qc:ui`, and `qc:file-hashes` remain green.
