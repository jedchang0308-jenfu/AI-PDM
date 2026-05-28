# QA Validation Plan - Document Manager Extractor Probe

## Risk Focus

- A deployed extractor command exists but cannot actually run on the field machine.
- Metadata extractor returns incomplete fields.
- Reference extractor returns no assembly/drawing references.
- Field-test handoff omits the probe, so failures are found too late.
- The system falsely marks the external P0 complete without real evidence.

## Validation Cases

| Case ID | Priority | Validation |
| --- | --- | --- |
| DMPROBE-001 | P0 | `qc:document-manager-extractor-probe` exits 0 with mock metadata/reference commands. |
| DMPROBE-002 | P0 | Probe output includes `.sldprt`, `.sldasm`, and `.slddrw` sample coverage. |
| DMPROBE-003 | P0 | Probe output confirms required metadata fields for all samples. |
| DMPROBE-004 | P0 | Probe output confirms at least one assembly/drawing reference. |
| DMPROBE-005 | P0 | `field-test:handoff` includes `document-manager-probe.ps1`. |
| DMPROBE-006 | P0 | Final handoff QC checklist includes `document-manager:extractor:probe -- --latest-report`. |
| DMPROBE-007 | P0 | Strict latest-report probe remains blocked until report environment/sample fields are filled. |
| REG-001 | P0 | TypeScript, lint, build, and field-test preflight remain passing. |
| TASK-001 | P0 | External Document Manager and formal field-test checkboxes remain open until real signed evidence exists. |

## Acceptance Criteria

- Probe is executable and produces machine-readable evidence.
- Handoff package carries the probe.
- Existing gates remain blocking for missing real-world evidence.
