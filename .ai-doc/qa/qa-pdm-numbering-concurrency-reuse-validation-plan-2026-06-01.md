# QA Validation Plan: PDM Numbering Concurrency And Reserved Code Reuse

Scope: concurrent root/part/drawing allocation, and non-reuse of pending, rejected, and obsolete numbering codes.

## Validation Scope

- Verify multiple HTTP create requests allocate unique root codes, part numbers, and drawing numbers.
- Verify allocated numbers keep expected format under concurrent creation.
- Verify exact duplicate check blocks codes already allocated by concurrent creation.
- Verify pending/unapproved approval requests do not release root, part, or drawing codes.
- Verify rejected approval requests do not release root, part, or drawing codes.
- Verify obsolete root, part, and drawing codes remain non-reusable.
- Verify cleanup removes temporary test master data but preserves append-only audit logs.

## User-Critical Flow

1. Multiple RD users submit numbering requests at nearly the same time.
2. PDM assigns unique root codes, part numbers, and MA drawing numbers without collision.
3. A number enters pending approval and remains visible but not reusable.
4. A request is rejected and the allocated number remains reserved for traceability.
5. A number is obsolete and remains blocked from reuse.
6. Duplicate-check returns blocker evidence for exact code reuse attempts.

## FMEA

| Failure Mode | Cause | User Impact | Detection | Priority | Countermeasure / Test |
|---|---|---|---|---|---|
| Concurrent root collision | Sequence read/update not transactional | Two parts share root code | Parallel API create + uniqueness check | High | Fire 12 create requests and assert unique roots |
| Concurrent part collision | Per-root or global sequence collision | BOM and audit ambiguity | Parallel API create + uniqueness check | High | Assert unique part numbers from returned API data |
| Concurrent drawing collision | Drawing sequence collision | CAD/file references become ambiguous | Parallel API create + uniqueness check | High | Assert unique MA drawing numbers |
| Pending approval releases code | Approval request treated as temporary hold | Another RD reuses unapproved code | Duplicate SQL insert and duplicate-check | High | Leave approval pending and assert reuse blocked |
| Rejected approval releases code | Rejection cleanup deletes master row or loosens uniqueness | Historical rejected request cannot be traced | Approval status + duplicate SQL insert + duplicate-check | High | Reject request and assert code remains blocked |
| Obsolete code is reused | Unique constraints scoped only to active rows | Old records collide with new records | Status change + duplicate SQL insert + duplicate-check | High | Mark records obsolete and assert reuse blocked |
| Test cleanup deletes audit | Cleanup removes audit rows for convenience | QC destroys evidence | Script review and audit behavior | Medium | Cleanup excludes `audit_logs` |

## Test Cases

- `TC-CONC-001`: Admin login succeeds.
- `TC-CONC-002`: Send 12 concurrent `POST /api/numbering/records` requests with MA drawing requested.
- `TC-CONC-003`: Assert all 12 requests return `201`.
- `TC-CONC-004`: Assert returned root codes, part numbers, and drawing numbers are all unique and match expected formats.
- `TC-CONC-005`: Run duplicate-check against one concurrently allocated root/part/drawing and expect a blocker.
- `TC-CONC-006`: Create a DVT numbering record, create an approval request, leave it pending, and verify direct duplicate insertion plus duplicate-check both block reuse.
- `TC-CONC-007`: Create another DVT numbering record, create and reject an approval request, and verify direct duplicate insertion plus duplicate-check both block reuse.
- `TC-CONC-008`: Create another DVT numbering record, mark root/part/drawing obsolete as a fixture, and verify direct duplicate insertion plus duplicate-check both block reuse.
- `TC-CONC-009`: TypeScript, lint, build, and core numbering QC remain green.

## Data Requirements

- Demo Admin account.
- Running local Next server with `PDM_BASE_URL`.
- SQLite test database in `data/ai-pdm.sqlite`.
- Temporary numbering records generated with a unique timestamp suffix.

## Pass Criteria

- `npm.cmd run qc:pdm-numbering-concurrency-reuse` passes with zero failed checks.
- `npm.cmd run qc:pdm-numbering-core` passes and exposes the new script.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` exits 0.
- `npm.cmd run lint` exits 0.
- `cmd /c npm run build` exits 0.

## Evidence To Collect

- Concurrency script JSON result including total/pass/fail counts.
- Returned root, part, and drawing code arrays proving uniqueness.
- Duplicate constraint rejection messages for pending, rejected, and obsolete codes.
- Duplicate-check blocker responses.
- Core QC pass count.
