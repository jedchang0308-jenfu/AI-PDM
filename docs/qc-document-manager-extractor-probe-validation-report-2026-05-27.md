# QC Validation Report - Document Manager Extractor Probe

## Scope

- Validation plan: `docs/qa-document-manager-extractor-probe-validation-plan-2026-05-27.md`.
- RD report: `docs/rd-document-manager-extractor-probe-report-2026-05-27.md`.

## Result

PASS for extractor probe tooling and handoff integration.

The remaining external Document Manager / equivalent component tasks stay OPEN because the latest official evidence report still has no real deployed command, sample folder, field execution, or signoff.

## Evidence

| Check | Result |
| --- | --- |
| `cmd /c npm run qc:document-manager-extractor-probe` | PASS, 6/0 |
| Probe output `data/document-manager-probes/qc-contract/probe.json` | PASS, `ready: true` with mock extractor |
| Native sample coverage | PASS, `.sldprt`, `.sldasm`, `.slddrw` covered |
| Required metadata fields | PASS for all mock samples |
| Native reference validation | PASS for assembly/drawing samples |
| `cmd /c npm run document-manager:extractor:probe -- --latest-report` | PASS as negative gate, exits 1 because report command/sample fields are empty |
| `cmd /c npm run field-test:preflight -- --profile document-manager` | PASS, 8 passed, 0 failed |
| `cmd /c npm run field-test:preflight -- --profile all` | PASS, 19 passed, 0 failed, 1 administrator warning |
| `cmd /c npm run field-test:handoff` | PASS, generated `data/field-test-handoffs/20260527-152431` |
| Handoff includes `document-manager-probe.ps1` | PASS |
| Handoff final QC includes `document-manager:extractor:probe -- --latest-report` | PASS |
| `cmd /c node_modules\.bin\tsc.cmd --noEmit` | PASS |
| `cmd /c npm run lint` | PASS |
| `cmd /c npm run build` | PASS |

## QC Decision

Do not check off the remaining Document Manager or formal field-test items. The system now has a repeatable extractor probe, but completion still requires a real licensed/equivalent extractor and signed field evidence.
