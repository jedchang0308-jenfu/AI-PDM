# QA Validation Plan - ERP / Inventory / Procurement Closed Loop

## User-Focused Risks

- Procurement API can export data but nobody knows whether ERP/inventory received it.
- Pending submissions are synced before release.
- Engineer role can create or close ERP sync records.
- Acknowledgement status can be overwritten.
- Payload misses release package metadata needed by downstream systems.

## RD FMEA

| ID | Failure mode | Effect | Control |
| --- | --- | --- | --- |
| ERPSYNC-FMEA-001 | Unauthenticated or Engineer user can read sync runs | Integration data leak | 401/403 API tests |
| ERPSYNC-FMEA-002 | Pending submission can be synced | Downstream system receives unapproved data | Pending sync 409 test |
| ERPSYNC-FMEA-003 | Sync payload omits package metadata | ERP cannot trace release package | Payload contains package test |
| ERPSYNC-FMEA-004 | Sync run cannot be listed after create | No operational visibility | Manager list test |
| ERPSYNC-FMEA-005 | Acknowledgement can be repeated | Bad state history | Duplicate acknowledgement 409 test |

## QC Cases

- Run lint.
- Run production build.
- Run API QC suite and verify:
  - `ERPSYNC-001` unauthenticated sync runs returns 401.
  - `ERPSYNC-002` Engineer sync runs returns 403.
  - `ERPSYNC-003` Pending submission cannot be synced.
  - `ERPSYNC-004` to `ERPSYNC-006` Manager creates ERP sync run with release package payload.
  - `ERPSYNC-007` to `ERPSYNC-008` Manager can list created sync run.
  - `ERPSYNC-009` to `ERPSYNC-011` Manager acknowledges sync run and external reference is retained.
  - `ERPSYNC-012` duplicate acknowledgement returns 409.
- Run UI smoke suite.
- Run file hash integrity check.

## Pass Criteria

- All automated checks pass.
- Released package handoff has a traceable outbound sync run and acknowledgement status.
- Existing procurement release API, supplier portal, release package, share, handoff, and approval workflows remain passing.
