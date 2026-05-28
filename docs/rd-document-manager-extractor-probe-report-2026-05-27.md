# RD Report - Document Manager Extractor Probe

## Scope

- Supports remaining Document Manager / equivalent extractor P0 tasks.
- Adds a machine-readable probe for deployed metadata/reference extractor commands.

## Changes

- Added `scripts/probe-document-manager-extractor.mjs`.
- Added `npm run document-manager:extractor:probe`.
- Added `scripts/qc-document-manager-extractor-probe.mjs`.
- Added `npm run qc:document-manager-extractor-probe`.
- Updated field-test handoff to include:
  - `commands/document-manager-probe.ps1`
  - final QC probe command before `qc:document-manager-report`

## Probe Contract

- Reads command/sample settings from:
  - explicit CLI args, or
  - latest / selected Document Manager evidence report, or
  - extractor environment variables.
- Requires sample coverage for:
  - `.sldprt`
  - `.sldasm`
  - `.slddrw`
- Validates required native metadata fields:
  - `drawing_number`
  - `part_number`
  - `part_name`
  - `revision`
  - `document_type`
- Validates at least one assembly or drawing native reference result.
- Writes evidence to `data/document-manager-probes/<probeId>/probe.json`.

## Limits

- The probe validates the extractor contract and output shape.
- It does not supply a licensed SolidWorks Document Manager component by itself.
- Remaining P0 items still require real deployed component evidence and signed QC report.
