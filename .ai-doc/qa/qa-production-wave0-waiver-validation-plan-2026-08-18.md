# Production Wave 0 Waiver / Risk Acceptance Record

Status: Draft — Product Owner acceptance pending
Date: 2026-08-18
Scope: The exact production candidate identified by `candidate_revision` and `release_commit`.

## Decision boundary

The release workflow supports two explicit modes:

- `wave0_mode=tested`: 3–5 named Workspace users are recorded and the users complete Wave 0.
- `wave0_mode=waived`: Wave 0 user testing is intentionally not performed. A bound waiver reference is required:
  `WAVE0-WAIVER://<candidate_revision>/<release_commit>/<immutable-id>`.

The waiver is not a test result and does not imply Product Owner approval. It records
an accepted residual risk so the decision is explicit and reviewable.

## Current release decision

| Field | Value |
|---|---|
| Wave 0 test executed | No — explicitly excluded by the current release decision |
| Proposed mode | `waived` |
| Residual risk | Fewer than 3–5 independent Wave 0 users have exercised the candidate |
| Required mitigation | Candidate-bound Level 4 evidence, migration/reconciliation evidence, rollback readiness, and monitoring |
| Product Owner decision | **Pending** |
| Product Owner identity | **Pending** |
| Accepted at | **Pending** |

## Acceptance checklist

Before a waiver reference may be supplied to the promote workflow, the Product Owner
must record:

1. Candidate revision and exact 40-character `main` commit.
2. The candidate-bound Level 4 evidence reference.
3. Confirmation that Wave 0 was not executed and why.
4. Residual risk and rollback/monitoring owner.
5. Explicit decision: `go` or `no-go`.
6. Product Owner stable identity and timestamp.

Only an explicit `go` may proceed to promotion. A `no-go`, missing identity, or
missing waiver reference keeps production traffic on the stable revision.

## Reference example

```text
WAVE0-WAIVER://ai-pdm-prod-<candidate-suffix>-<run-id>/<40-char-main-sha>/wave0-waiver-20260818
```

The example is a format only. It is not an approval and must not be reused as an
actual evidence reference.
