# QA Validation Plan: PDM Numbering Audit Append-Only / Before-After-Diff

Scope: numbering audit logs, audit detail normalization, append-only database protection, attention marker persistence, and targeted UI flows that write audit records.

## Validation Scope

- Verify `audit_logs` is append-only at database level.
- Verify audit detail saved by numbering repository always exposes `before`, `after`, `diff`, and `markers`.
- Verify proxy submission, delegated review, override, and impact-scope marker context is also available in audit detail when actions carry numbering approval payloads.
- Verify existing approval review UI can still write approval decision audit logs after append-only triggers are installed.
- Verify static, type, lint, and production build checks remain green.

## User-Critical Flow

1. RD or Admin creates / modifies numbering data and system writes audit rows.
2. System stores an auditable envelope with old value, new value, computed diff, and warning markers.
3. Reviewer approves a DVT / Release batch, including proxy / delegated / override / impact context.
4. Audit log cannot be edited or deleted after creation.
5. RD, manager, or admin can later inspect the event trail without losing original accountability context.

## FMEA

| Failure Mode | Cause | User Impact | Detection | Priority | Countermeasure / Test |
|---|---|---|---|---|---|
| Audit row can be edited | Missing database trigger | Historical accountability can be rewritten | Core DB constraint test | High | Attempt `UPDATE audit_logs`; expect `AUDIT_LOG_APPEND_ONLY` |
| Audit row can be deleted | Cleanup script or missing trigger | Evidence disappears | Core DB constraint test | High | Attempt `DELETE FROM audit_logs`; expect `AUDIT_LOG_APPEND_ONLY` |
| Detail lacks before/after/diff | Call sites write ad-hoc JSON | Reviewer cannot see what changed | Repository static and DB seed checks | High | Normalize all numbering audit detail through one helper |
| Marker context lost in audit | UI-only marker generation | Audit trail does not match approval/task UI | Repository static check and core seed checks | Medium | Derive markers from same action payload in audit normalization |
| UI tests break because cleanup deletes audit logs | Existing E2E cleanup deletes append-only rows | False failures or trigger aborts | Targeted UI E2E | Medium | Remove audit deletion cleanup and rerun approval review UI |
| Build regression | Type changes leak into repository DTOs | PDM pages fail to compile | `tsc`, lint, build | High | Run full static verification |

## Test Cases

- `TC-AUDIT-001`: Schema includes `trg_audit_logs_no_update`.
- `TC-AUDIT-002`: Schema includes `trg_audit_logs_no_delete`.
- `TC-AUDIT-003`: Seeded audit log stores `before`, `after`, and `diff`.
- `TC-AUDIT-004`: Updating an audit log fails with `AUDIT_LOG_APPEND_ONLY`.
- `TC-AUDIT-005`: Deleting an audit log fails with `AUDIT_LOG_APPEND_ONLY`.
- `TC-AUDIT-006`: Repository source includes `normalizeAuditDetail`, `computeAuditDiff`, and marker normalization.
- `TC-AUDIT-007`: Repository source does not mutate audit logs after insert.
- `TC-AUDIT-008`: Approval review UI completes a delegated batch approval and writes audit without trigger errors.
- `TC-AUDIT-009`: `tsc`, lint, and production build pass.

## Data Requirements

- Numbering audit seed row with known `before` and `after` values.
- Approval review seed data with proxy submission, delegated reviewer, override, and impact-scope action context.
- Active delegation from demo manager to demo engineer.

## Pass Criteria

- `cmd /c node_modules\.bin\tsc.cmd --noEmit` exits 0.
- `npm.cmd run qc:pdm-numbering-core` passes and includes append-only / diff checks.
- `npm.cmd run qc:pdm-numbering-approval-review-ui` passes after append-only triggers.
- `npm.cmd run lint` exits 0.
- `cmd /c npm run build` exits 0.

## Evidence To Collect

- Command outputs and pass counts.
- Error text from rejected audit update/delete attempts.
- Approval review UI pass count proving audit-writing flow still works.
- Build output with no fatal errors.
