# QA Validation Plan - Document Manager Evidence Gate

## User-Focused Risks

- Team marks Document Manager integration complete without license or deployment evidence.
- Field tester records incomplete evidence in free-form notes that QC cannot verify.
- Metadata extraction passes but CAD references remain unverified.
- Report tooling blocks progress when no real field evidence exists yet.

## RD FMEA

| ID | Failure mode | Effect | Control |
| --- | --- | --- | --- |
| DMGATE-FMEA-001 | No structured report exists | Cannot prove external P0 completion | `document-manager:report:new` |
| DMGATE-FMEA-002 | QC cannot distinguish ready vs open | P0 may be checked prematurely | strict `qc:document-manager-report` and open `:report` mode |
| DMGATE-FMEA-003 | Native references are omitted | Document Manager integration is incomplete | required `DM-REF-001` and `DM-REF-002` cases |
| DMGATE-FMEA-004 | License secrets are pasted into docs | Security leakage | report instruction forbids secrets |
| DMGATE-FMEA-005 | Scripts drift from repo quality gates | Future field test breaks | lint/build validation |

## QC Cases

- Run TypeScript check.
- Run lint.
- Run production build.
- Run `npm run document-manager:report:new`.
- Run `npm run qc:document-manager-report:report` and verify:
  - command exits successfully in allow-open mode.
  - result is `ready: false` for a blank report.
  - issues include missing environment, signoff, and not-run required cases.
- Confirm `PDM_dev_task.md` remaining Document Manager P0 boxes are not checked.

## Pass Criteria

- Tooling is present and quality gates pass.
- Blank report is explicitly treated as open/incomplete.
- No remaining external Document Manager P0 item is falsely marked complete.
