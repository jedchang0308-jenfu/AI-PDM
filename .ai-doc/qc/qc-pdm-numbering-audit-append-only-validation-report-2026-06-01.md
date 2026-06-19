# QC Fact Report: PDM Numbering Audit Append-Only / Before-After-Diff

## Verdict

Pass.

## Executed Items

- `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- `npm.cmd run lint`
- `cmd /c npm run build`
- `npm.cmd run qc:pdm-numbering-core`
- `npm.cmd run qc:pdm-numbering-approval-review-ui` with `PDM_BASE_URL=http://127.0.0.1:3112`

## Actual Results

| Check | Result | Evidence |
|---|---:|---|
| TypeScript | Pass | exit code 0 |
| Lint | Pass | exit code 0 |
| Build | Pass | exit code 0; numbering routes generated |
| Core numbering QC | Pass | 211/211 passed |
| Approval review UI | Pass | 25/25 passed |
| Dev server cleanup | Pass | port 3112 no longer has `LISTENING`; only `TIME_WAIT` sockets remain |

## Evidence Highlights

- Core QC verified `trg_audit_logs_no_update` exists.
- Core QC verified `trg_audit_logs_no_delete` exists.
- Core QC inserted an audit row with `before`, `after`, and `diff`.
- Core QC rejected `UPDATE audit_logs` with `AUDIT_LOG_APPEND_ONLY`.
- Core QC rejected `DELETE FROM audit_logs` with `AUDIT_LOG_APPEND_ONLY`.
- Core QC verified repository normalization through `normalizeAuditDetail`, `computeAuditDiff`, and marker output.
- Core QC verified repository source does not include post-insert `UPDATE audit_logs` or `DELETE FROM audit_logs`.
- Approval review UI verified delegated engineer approval succeeds, records `approver_id = user-engineer-demo`, records `approver_role = rd_manager`, and keeps proxy / delegated / override / impact markers visible.
- Approval review UI completed the audit-writing approval decision flow after append-only triggers were installed.

## Issues And Blockers

- No blocker in this validation round.
- Build still reports existing Turbopack broad-tracing warnings from `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`; they are unrelated to the audit changes and remain non-fatal.

## Residual Risk

- Existing legacy audit rows created before this normalization may not contain a complete `before` / `after` / `diff` envelope.
- For some non-state-change events, the normalized `after` field stores the event detail rather than a full entity snapshot. This preserves an auditable envelope, but a stricter future requirement for exact entity snapshots would need per-action before/after capture.
