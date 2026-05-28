# Document Manager Probe Redaction Verification - 2026-05-28

## Scope

- `DEV-CAD-001`: harden Document Manager or equivalent native extractor evidence before real licensed extractor deployment.
- This closes a local evidence-security gap only. It does not complete the external native CAD extractor gate.

## RD Changes

- `scripts/probe-document-manager-extractor.mjs` now redacts sensitive extractor command arguments before writing `probe.json`.
- Redacted argument names include license, license key, token, password, secret, API key, and client secret variants.
- `scripts/qc-document-manager-probe-redaction.mjs` verifies that probe output never contains simulated secret values while preserving runnable evidence shape.
- `qc:document-manager-probe-redaction` is exposed in `package.json`.
- The redaction gate is included in `qc:industrialization` and `qc:full`.

## QA Validation Plan

| Case | Priority | Method | Pass criteria |
|---|---|---|---|
| DMR-001 | P0 | Run the redaction QC with split and inline secret argument styles. | `probe.json` contains no raw license/token/password values. |
| DMR-002 | P0 | Run the normal extractor probe QC. | Existing Document Manager probe contract still passes. |
| DMR-003 | P0 | Run native CAD extractor Web contract. | `/api/file-metadata/detect` still accepts external metadata/reference extractors. |
| DMR-004 | P1 | Run industrialization acceptance gate. | Redaction gate is executed as part of the gate and all steps pass. |

## FMEA

| Failure mode | Cause | Effect | Detection | Control |
|---|---|---|---|---|
| License key leaks into evidence | Probe records raw extractor args | Field-test package exposes vendor or internal secrets | Redaction QC scans raw `probe.json` | Redact sensitive split args and inline assignments |
| Probe becomes non-actionable | Redaction destroys command structure | Operator cannot understand which extractor was tested | Redaction QC parses redacted args as JSON | Preserve argument names and `{file}` placeholder |
| Regression in upload integration | Probe change breaks extractor execution | Native CAD metadata stops flowing to Web upload | Native extractor contract QC | Redaction only affects persisted evidence, not executed args |
| Gate bypass | Redaction test exists but is not run in acceptance | Secret leak returns later | Industrialization QC | Add redaction gate to `qc:industrialization` and `qc:full` |

## QC Evidence

- `npm.cmd run qc:document-manager-probe-redaction`
  - PASS: 9 passed, 0 failed.
  - Verified simulated values `DM-LICENSE-SECRET-123`, `REF-TOKEN-SECRET-456`, and `INLINE-PASSWORD-SECRET-789` are absent from `probe.json`.
  - Verified `<redacted>` marker is present.
  - Verified redacted args remain machine-readable JSON and keep the `{file}` placeholder.
- `npm.cmd run qc:document-manager-extractor-probe`
  - PASS: 6 passed, 0 failed.
- `npm.cmd run qc:native-cad-extractor-contract`
  - PASS: 8 passed, 0 failed.
- `npm.cmd run qc:industrialization`
  - PASS: 17 steps passed, including `Document Manager probe redaction`.
  - `qc:file-hashes`: 2610 checked, 2610 ok.
  - Existing build warnings remain the known Turbopack dynamic path tracing warnings in `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`; build passed.

## Result

PASS for the local evidence-security hardening. `DEV-CAD-001` remains open until licensed SolidWorks Document Manager or an approved equivalent extractor is deployed and validated against real `.sldprt`, `.sldasm`, and `.slddrw` samples.
