# QA Validation Plan: Revision Release and Obsolete Lifecycle

Date: 2026-05-27
Scope: DEV-REV-001 to DEV-REV-004

## User Scenarios

- Engineer submits Rev A and manager releases it as the current valid drawing.
- Engineer submits Rev B manually for the same item; Rev A must remain valid while Rev B is Pending.
- Manager releases Rev B; Rev A becomes Obsolete automatically and remains internally traceable.
- Manufacturing handoff, procurement APIs, and public supplier sharing must only expose the effective Released revision.

## FMEA Checks

| Risk | Impact | Validation |
|---|---|---|
| Pending revision overwrites current revision | Manufacturing may use an unreleased version | Check `items.current_revision` stays Rev A while Rev B is Pending |
| Release failure obsoletes old version | No valid released drawing remains | Verify only successful Released transition triggers Obsolete |
| Old release remains visible to external users | Supplier/manufacturing may use obsolete files | Public share and procurement sync reject Obsolete submission |
| Old files are deleted or blocked internally | Audit trail is broken | Internal package download still works for Obsolete submission |
| Same item same filename blocks revision release | Normal revision release cannot proceed | Release Rev B with same filename as Rev A for same item |

## QC Cases

- `REVOBS-001` Rev A submission returns 201.
- `REVOBS-002` Rev A release returns Released.
- `REVOBS-003` Current item revision is Rev A after Rev A release.
- `REVOBS-004` Rev B submission with same item and filename returns 201.
- `REVOBS-005` Rev B Pending does not obsolete Rev A.
- `REVOBS-006` Current item revision remains Rev A while Rev B is Pending.
- `REVOBS-007` Manager can create public share for Rev A before Rev B release.
- `REVOBS-008` Rev B release returns Released and lifecycle obsoletes Rev A.
- `REVOBS-009` Rev A status becomes Obsolete and points to Rev B.
- `REVOBS-010` Current item revision becomes Rev B.
- `REVOBS-011` Internal Rev A release package download still returns 200.
- `REVOBS-012` Rev A public share returns 404 after obsolete.
- `REVOBS-013` Creating a new share for Rev A returns 409.
- `REVOBS-014` Procurement sync for Rev A returns 409.
- `REVOBS-015` Handoff includes Rev B and excludes Rev A.
- `REVOBS-016` Procurement releases include Rev B and exclude Rev A.
- `REVOBS-017` Revision history shows Rev A as Obsolete with Rev B as superseding submission.
- `REVOBS-018` Search with `status=Obsolete` finds Rev A.
- `REVOBS-019` Search with `status=Released` finds Rev B and excludes Rev A.
- `REVOBS-020` Policy RAG data includes Obsolete lifecycle rules.

## Acceptance

- All `REVOBS-*` automated checks pass.
- `npm.cmd run lint` passes.
- `npm.cmd run build` passes.
- If external environment blocks build or server startup, QC records the blocker and RD continues with other executable tasks.
