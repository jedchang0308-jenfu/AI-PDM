# QC Validation Report - Document Manager Probe Path Gate

## Scope

- Validation plan: `.ai-doc/qa/qa-document-manager-probe-path-gate-validation-plan-2026-05-27.md`.
- RD report: `.ai-doc/reports/rd/rd-document-manager-probe-path-gate-report-2026-05-27.md`.

## Result

PASS for probe path gate tooling.

The external Document Manager / equivalent component tasks remain OPEN because the official report still has no real deployed extractor command, sample folder, probe path, or signoff.

## Evidence

| Check | Result |
| --- | --- |
| `cmd /c npm run document-manager:report:upgrade` | PASS, latest report upgraded to `schemaVersion: 3` |
| Latest report JSON/Markdown include `extractorProbePath` | PASS |
| `cmd /c npm run qc:document-manager-probe-path-gate` | PASS, 4/0 |
| Valid ready probe path fixture | PASS, completed fixture report is accepted |
| Missing probe path fixture | PASS, blocked with `probe_not_found` |
| Not-ready probe fixture | PASS, blocked with `probe_not_ready` |
| `cmd /c npm run field-test:handoff` | PASS, generated `data/field-test-handoffs/20260527-152719` |
| Handoff fill template includes `--extractor-probe-path` | PASS |

## QC Decision

Do not check off the remaining external tasks. The evidence gate is stronger, but real field evidence is still absent.
