# QA Validation Plan - P2 Supplier/Procurement Read-only Share

Date: 2026-05-27

## Scope

Validate a lightweight read-only sharing flow for released submissions so suppliers or procurement users can review release metadata and download the release package without a PDM login.

## User Scenarios

1. R&D Manager creates a time-limited read-only share for a Released submission that has a release package.
2. External recipient opens the public share URL without authentication and sees only released, read-only package data.
3. External recipient downloads the release package from the public share URL.
4. Manager revokes a share and the public URL stops working.
5. Engineer cannot create or revoke external shares.

## RD FMEA

| Risk | Failure Mode | Validation |
| --- | --- | --- |
| Permission leak | Engineer or unauthenticated user creates shares | API tests require 401/403 for unauthorized create/list/revoke |
| Premature release leak | Pending or Rejected submission can be shared | API test requires non-Released share creation to fail |
| Secret disclosure | Token hash or local file path appears in API/public response | API test verifies these fields are absent |
| Stale access | Revoked or expired token remains usable | API test revokes token and expects public access failure |
| Package path traversal | Public package endpoint reads outside release package directory | Code path reuses release-package root validation |
| Non-read-only behavior | Public page exposes mutation endpoints or internal audit data | Public API returns metadata, files, approvals, BOM summary and package URL only |

## QC Cases

- `SHARE-001` unauthenticated share list returns 401.
- `SHARE-002` Engineer cannot create read-only share.
- `SHARE-003` Manager cannot create share for Pending submission.
- `SHARE-004` Manager creates read-only share for Released submission.
- `SHARE-005` create response returns public URL/token once.
- `SHARE-006` manager list shows created share without token hash.
- `SHARE-007` public share metadata is accessible without auth.
- `SHARE-008` public share response excludes local paths, token hash and audit logs.
- `SHARE-009` public share exposes released drawing and package URL.
- `SHARE-010` public package download returns ZIP.
- `SHARE-011` public package has zip signature.
- `SHARE-012` manager revokes share.
- `SHARE-013` revoked public share metadata returns 404.
- `SHARE-014` revoked public package download returns 404.

## Pass Criteria

- All listed QC cases pass.
- `npm.cmd run lint` passes.
- `npm.cmd run build` passes and includes share routes.
- Existing `qc:api`, `qc:ui`, and `qc:file-hashes` remain green.
