# RD Report - Supplier Portal

## Scope

- Dev task: `P2` 完整供應商入口。
- Goal: extend the existing released-package read-only share into a supplier portal with a minimal two-way review loop.

## Implementation

- Added `supplier_portal_responses` table.
- Added supplier-facing public response API:
  - `POST /api/public/shares/[token]/responses`
- Added internal response management APIs:
  - `GET /api/submissions/[id]/supplier-responses`
  - `PATCH /api/submissions/[id]/supplier-responses/[responseId]`
- Extended public `/share/[token]` page:
  - supplier acknowledgement/question form
  - visible response history for the token
- Extended Dashboard released-share panel:
  - response count and open count per share
  - supplier response list
  - Manager/Admin close action
- Added audit logs for supplier response create/close.
- Added API regression coverage `SUPPLIER-001` to `SUPPLIER-011`.

## Notes

- The portal keeps token-based external access and does not add supplier account management yet.
- Public responses require contact name, valid email, kind, and message.
- Engineer users cannot read or close supplier portal responses.
