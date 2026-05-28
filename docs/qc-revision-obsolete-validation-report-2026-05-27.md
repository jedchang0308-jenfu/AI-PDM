# QC Validation Report: Revision Release and Obsolete Lifecycle

Date: 2026-05-27
Validation plan: `docs/qa-revision-obsolete-validation-plan-2026-05-27.md`
Dev task scope: DEV-REV-001 to DEV-REV-006

## Result

PASS

## Evidence

- `npm.cmd run lint`: PASS
- `npm.cmd run build`: PASS
- `npm.cmd run qc:revision-lifecycle`: PASS, 20/20
- `npm.cmd run qc:api`: PASS, 391/391
- `npm.cmd run qc:policy-alignment`: PASS, 9/9
- `npm.cmd run qc:ui`: PASS, 26/26

## Scenario Results

| Case | Result |
|---|---|
| `REVOBS-001` Rev A submission returns 201 | PASS |
| `REVOBS-002` Rev A release returns Released | PASS |
| `REVOBS-003` Current item revision is Rev A after Rev A release | PASS |
| `REVOBS-004` Rev B same item and filename submission returns 201 | PASS |
| `REVOBS-005` Rev B Pending does not obsolete Rev A | PASS |
| `REVOBS-006` Current item revision remains Rev A while Rev B is Pending | PASS |
| `REVOBS-007` Manager can create public share for Rev A before Rev B release | PASS |
| `REVOBS-008` Rev B release returns Released and obsoletes Rev A | PASS |
| `REVOBS-009` Rev A status becomes Obsolete and points to Rev B | PASS |
| `REVOBS-010` Current item revision becomes Rev B | PASS |
| `REVOBS-011` Internal Rev A package download still returns 200 | PASS |
| `REVOBS-012` Rev A public share returns 404 after obsolete | PASS |
| `REVOBS-013` Creating a new share for Rev A returns 409 | PASS |
| `REVOBS-014` Procurement sync for Rev A returns 409 | PASS |
| `REVOBS-015` Handoff includes Rev B and excludes Rev A | PASS |
| `REVOBS-016` Procurement releases include Rev B and exclude Rev A | PASS |
| `REVOBS-017` Revision history shows Rev A as Obsolete with Rev B as superseding submission | PASS |
| `REVOBS-018` Search with `status=Obsolete` finds Rev A | PASS |
| `REVOBS-019` Search with `status=Released` finds Rev B and excludes Rev A | PASS |
| `REVOBS-020` Policy RAG data includes Obsolete lifecycle rules | PASS |

## Facts

- New `Obsolete` status is accepted by the database and application types.
- Pending Rev B does not change `items.current_revision`.
- Successful Rev B release updates `items.current_revision` and obsoletes prior Released revisions for the same item.
- Obsolete releases remain internally downloadable through release package API.
- Obsolete releases are excluded from handoff and procurement release APIs.
- Public share access becomes unavailable after the linked submission becomes Obsolete.
- Dashboard revision history can display Obsolete status and superseded-by metadata from the revision API.
- Search can filter Obsolete and Released lifecycle states separately.
- Policy source and generated RAG data include Obsolete lifecycle wording.

## Open Items

- No open defects for DEV-REV-001 to DEV-REV-006.
