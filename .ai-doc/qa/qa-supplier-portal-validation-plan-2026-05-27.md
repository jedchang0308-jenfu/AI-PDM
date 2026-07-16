# QA Validation Plan - Supplier Portal

## User-Focused Risks

- Supplier can download data but cannot confirm receipt or ask questions.
- Invalid or revoked share token still accepts responses.
- Internal users cannot see supplier questions.
- Engineer role can access supplier response management.
- Response close action loses traceability.

## RD FMEA

| ID | Failure mode | Effect | Control |
| --- | --- | --- | --- |
| SUPPLIER-FMEA-001 | Public response accepts invalid token | External data pollution | Invalid-token API test |
| SUPPLIER-FMEA-002 | Bad contact payload accepted | Unusable supplier follow-up | Payload validation test |
| SUPPLIER-FMEA-003 | Supplier response not visible internally | Procurement loop remains manual | Manager list test |
| SUPPLIER-FMEA-004 | Engineer can read/close supplier response | Permission leak | Engineer forbidden test |
| SUPPLIER-FMEA-005 | Closed response can be closed again | Bad workflow state | Duplicate close 409 test |
| SUPPLIER-FMEA-006 | Portal UI breaks public share page | Supplier cannot review package | Build and UI smoke test |

## QC Cases

- Run lint.
- Run production build.
- Run API QC suite and verify:
  - `SUPPLIER-001` invalid public token returns 404.
  - `SUPPLIER-002` invalid payload returns 400.
  - `SUPPLIER-003` to `SUPPLIER-005` supplier can submit and see response in portal.
  - `SUPPLIER-006` Engineer cannot list supplier responses.
  - `SUPPLIER-007` to `SUPPLIER-008` Manager can list supplier responses.
  - `SUPPLIER-009` to `SUPPLIER-011` Manager can close response exactly once.
- Run UI smoke suite.
- Run file hash integrity check.

## Pass Criteria

- All automated checks pass.
- Supplier portal supports package review, response submission, response history, and internal close workflow.
- Existing read-only share, package download, handoff, procurement API, and release workflows remain passing.
