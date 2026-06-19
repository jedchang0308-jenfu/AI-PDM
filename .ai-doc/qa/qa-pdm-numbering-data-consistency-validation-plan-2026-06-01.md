# QA Validation Plan: PDM Numbering Data Consistency

Scope: numbering master uniqueness, obsolete/non-reusable codes, override traceability, and main-drawing restore redirect traceability.

## Validation Scope

- Verify root codes remain unique.
- Verify part numbers remain unique even after the old part is obsolete.
- Verify drawing numbers remain unique even after the old MA drawing is obsolete.
- Verify MA drawing invalidation and restore preserve a traceable link change from old primary drawing to replacement primary drawing.
- Verify missing-MA override approval keeps request, decision, audit action code, and override marker evidence.
- Verify temporary test data cleanup does not delete append-only audit logs.

## User-Critical Flow

1. RD creates a numbering record with a primary MA drawing.
2. Admin invalidates the MA drawing and linked parts become impacted.
3. System refuses reuse of the obsolete drawing number.
4. Admin approves a replacement MA drawing restore; old drawing link becomes reference and replacement becomes primary.
5. RD/Admin creates and approves a missing-MA override; audit remains traceable.
6. System refuses reuse of obsolete root and part numbers.

## FMEA

| Failure Mode | Cause | User Impact | Detection | Priority | Countermeasure / Test |
|---|---|---|---|---|---|
| Root code reused after obsolete | Uniqueness scoped only to active rows | Historical records collide | SQLite uniqueness rejection | High | Insert duplicate root after lifecycle change and expect failure |
| Part number reused after obsolete | Uniqueness excludes obsolete rows | BOM / audit references become ambiguous | SQLite uniqueness rejection | High | Mark part obsolete, insert duplicate part, expect failure |
| Drawing number reused after obsolete | Drawing uniqueness excludes obsolete rows | Old released drawing references become ambiguous | SQLite uniqueness rejection | High | Obsolete MA drawing, insert duplicate drawing, expect failure |
| Restore loses old-to-new trace | Restore overwrites link instead of preserving relation | Reviewer cannot see why MA changed | DB link check | High | Assert old drawing link is `reference`, replacement is `primary_manufacturing` |
| Override lacks audit trace | Approval request/decision not linked to audit | Exception cannot be reviewed later | Audit query by approvalRequestId | High | Assert request, decision, actionCode, and override marker |
| Test cleanup violates audit append-only | Script deletes audit evidence | False pass and policy violation | Script review and append-only trigger | Medium | Cleanup excludes `audit_logs` |

## Test Cases

- `TC-DATA-001`: Admin login succeeds.
- `TC-DATA-002`: Create record with MA drawing and invalidate it.
- `TC-DATA-003`: Reusing the obsolete drawing number is rejected by unique constraint.
- `TC-DATA-004`: Insert replacement MA drawing, request restore approval, approve it, and verify old/reference plus replacement/primary links.
- `TC-DATA-005`: Create DVT part without MA drawing, request missing-MA override, approve it, and verify request/decision/audit marker trace.
- `TC-DATA-006`: Mark override root/part obsolete and verify duplicate root/part insertions are rejected.
- `TC-DATA-007`: TypeScript, lint, build, and core QC remain green.

## Data Requirements

- Demo Admin account.
- Temporary root with MA drawing for restore scenario.
- Temporary root without MA drawing for override scenario.
- Replacement MA drawing inserted under the same root.

## Pass Criteria

- `npm.cmd run qc:pdm-numbering-data-consistency` passes.
- `npm.cmd run qc:pdm-numbering-core` passes and exposes the new data consistency script.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` exits 0.
- `npm.cmd run lint` exits 0.
- `cmd /c npm run build` exits 0.

## Evidence To Collect

- Data consistency JSON pass count.
- Unique constraint rejection messages.
- Restore link rows showing old reference and replacement primary.
- Override approval trace actions and marker evidence.
- Core QC pass count and static checks.
