# QA Validation Plan: Remaining External Blockers

Date: 2026-05-27
Scope: Unchecked and partial `PDM_dev_task.md` items that require external machine/evidence signoff.

## User Scenarios

- RD confirms whether any remaining task can be completed with local code changes only.
- QA separates executable engineering work from external evidence/signoff blockers.
- QC verifies the current gates and records facts without changing production code.
- QA ensures partial `[ / ]` external gates are not hidden by only scanning unchecked `[ ]` tasks.

## FMEA Checks

| Risk | Impact | Validation |
|---|---|---|
| External blocker is marked complete without evidence | System readiness is overstated | Keep unchecked tasks unchecked unless report/signoff gate proves ready |
| Missing extractor path is accepted | Upload may rely on invalid metadata source | Run probe path gate |
| Draft Document Manager report is treated as complete | Native CAD metadata integration is unverified | Run report QC in allow-open mode and inspect ready/status/issues |
| Field test is treated as done without real evidence | Production handoff is unsafe | Run field-test preflight with `--require-evidence` |
| Partial external gates are ignored | Final readiness is overstated | Run production readiness and dev-task evidence sync gates |

## QC Cases

- `EXTBLK-001` `PDM_dev_task.md` has only external machine/evidence tasks remaining as unchecked or partial.
- `EXTBLK-002` Document Manager probe path gate passes and rejects missing/not-ready paths.
- `EXTBLK-003` Document Manager report QC returns not ready with missing environment/signoff/test cases.
- `EXTBLK-004` Field-test preflight with required evidence returns not ready because evidence reports are incomplete.
- `EXTBLK-005` Production readiness reports the same external blocker categories.
- `EXTBLK-006` Dev-task evidence sync refuses to auto-check target tasks while evidence is open.

## Acceptance

- Remaining unchecked and partial tasks are documented as external blockers, not silently checked.
- `PDM_dev_task.md` includes current factual blocker evidence.
- No production code change is required for this blocker-only round.
