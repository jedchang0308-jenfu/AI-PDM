# QA Validation Plan - Document Manager Probe Path Gate

## Risk Focus

- Report is marked pass with only manual text evidence.
- Probe file path is missing, wrong, or points to a failed probe.
- Existing draft reports fail to upgrade to the new required schema.

## Validation Cases

| Case ID | Priority | Validation |
| --- | --- | --- |
| DMPATH-001 | P0 | `document-manager:report:upgrade` upgrades latest report to schema version 3. |
| DMPATH-002 | P0 | Latest report JSON and Markdown include `extractorProbePath`. |
| DMPATH-003 | P0 | `qc:document-manager-probe-path-gate` accepts a completed report only when probe JSON is `ready: true`. |
| DMPATH-004 | P0 | `qc:document-manager-probe-path-gate` blocks missing probe path. |
| DMPATH-005 | P0 | `qc:document-manager-probe-path-gate` blocks probe JSON with `ready: false`. |
| DMPATH-006 | P0 | Field-test handoff fill template includes `--extractor-probe-path`. |
| REG-001 | P0 | TypeScript, lint, and production build pass. |
| TASK-001 | P0 | Remaining external P0/P1 items stay unchecked until real evidence exists. |

## Acceptance Criteria

- Completed reports cannot pass without a ready probe JSON.
- The handoff tells field QC where to place the probe evidence.
- No remaining external task is marked complete from local fixture evidence.
