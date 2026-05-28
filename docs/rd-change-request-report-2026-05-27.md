# RD Report - P2 ECR / ECO / ECN

Date: 2026-05-27

## Scope

Implemented a lightweight ECR/ECO/ECN workflow for high-efficiency engineering change tracking.

## Changes

- Added `change_requests` schema for ECR/ECO/ECN records.
- Added `/api/submissions/[id]/changes` for list/create.
- Added `/api/submissions/[id]/changes/[changeId]` for Manager/Admin decisions.
- Added dashboard ECR/ECO/ECN panel with create, list, approve, and reject actions.
- Added audit logs for change creation and decisions.
- Added API regression cases `CHANGE-001` through `CHANGE-017`.

## Design Notes

- This is intentionally submission-scoped and lightweight.
- It supports ECR/ECO/ECN tracking, decision metadata, and permission controls without introducing a heavy PLM phase-gate.
- Full enterprise ECO workflows remain out of scope for this high-efficiency implementation.

## Validation

See `docs/qa-change-request-validation-plan-2026-05-27.md` and `docs/qc-change-request-validation-report-2026-05-27.md`.
